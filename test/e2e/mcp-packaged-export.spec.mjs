import { test, expect, chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { enableMcpEditing } from "./mcp-client.mjs";

test("packaged file:// MCP export with production fuses and local model textures", async () => {
    test.skip(!process.env.MMD_MODOKI_PACKAGED_EXECUTABLE, "Run package first and set MMD_MODOKI_PACKAGED_EXECUTABLE");
    test.setTimeout(240000);
    const temp = await mkdtemp(join(tmpdir(), "mmd-packaged-mcp-"));
    const server = createServer();
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;
    await new Promise(r => server.close(r));
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(ELECTRON_RUN_AS_NODE|MMD_MODOKI_E2E|MMD_MODOKI_SMOKE)/i.test(key)) delete env[key];
    const child = spawn(resolve(process.env.MMD_MODOKI_PACKAGED_EXECUTABLE), [`--remote-debugging-port=${port}`, `--user-data-dir=${join(temp, "profile")}`], { env, windowsHide: false, stdio: "ignore" });
    let browser, page;
    let launchError;
    child.on("error", error => { launchError = error; });
    try {
        await expect.poll(async () => {
            if (launchError) throw launchError;
            try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
        }, { timeout: 45000 }).toBe(true);
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
        page = browser.contexts()[0].pages()[0];
        page.setDefaultTimeout(15000);
        // Static menu markup appears before the asynchronous runtime and UI handlers.
        await page.waitForFunction(() => Boolean(window.mmdModokiDiagnostics), undefined, { timeout: 45000 });
        await expect(page.locator('[data-i18n="menu.tools"]')).toBeVisible();
        expect(page.url()).toMatch(/^file:.*app\.asar/);
        expect(await page.evaluate(() => typeof window.mmdModokiE2e)).toBe("undefined");
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const edit = async (name, args) => {
            const c = await context();
            const input = { target: c.target, expectedEditRevision: c.editRevision, operationId: randomUUID(), ...args };
            const result = await rpc(name, input);
            expect(result.isError, JSON.stringify(result)).not.toBe(true);
            return input;
        };
        const finish = async input => {
            let result;
            await expect.poll(async () => {
                result = (await rpc("mmd_get_operation", { target: input.target, operationId: input.operationId })).structuredContent;
                return result.status;
            }, { timeout: 90000 }).not.toBe("running");
            expect(result.status, JSON.stringify(result)).toBe("completed");
            return result;
        };
        const loaded = await edit("mmd_start_ui_operation", { operation: { kind: "loadAsset", assetKind: "model", filePath: resolve("test/fixtures/external-parent/material-switch.pmx") } });
        await expect(page.locator("#model-comment-notice")).toBeVisible();
        expect((await rpc("mmd_get_operation", { target: loaded.target, operationId: loaded.operationId })).structuredContent).toMatchObject({ phase: "waiting_for_user", userAction: { kind: "model_comment_confirmation" } });
        await page.locator("#model-comment-notice-ok").click();
        await finish(loaded);
        await edit("mmd_select_timeline", { scope: { kind: "camera" } });
        await edit("mmd_set_editor_options", { options: { kind: "output", width: 320, height: 180, qualityScale: 1, fps: 30, transparent: false, includeAudio: false, webmCodec: "vp8", startFrame: 0, endFrame: 2, usePlaybackRange: false } });
        for (const pbr of [false, true]) {
            await finish(await edit("mmd_start_ui_operation", { operation: { kind: "materialMode", pbr } }));
            const c = await context();
            const capture = await rpc("mmd_capture_snapshot", { target: c.target, expectedEditRevision: c.editRevision, label: `packaged-${pbr}` });
            expect(capture.isError, JSON.stringify(capture)).not.toBe(true);
            expect(capture.content.some(item => item.type === "image")).toBe(true);
            const filePath = join(temp, `export-${pbr}.webm`);
            await finish(await edit("mmd_start_ui_operation", { operation: { kind: "exportWebm", filePath, overwrite: false } }));
            const bytes = await readFile(filePath);
            expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
            expect(await page.evaluate(async data => {
                const video = document.createElement("video");
                const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "video/webm" }));
                try {
                    video.src = url;
                    await new Promise((r, reject) => { video.onloadeddata = r; video.onerror = () => reject(new Error("Video decode failed")); });
                    return [video.videoWidth, video.videoHeight];
                } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
            }, [...bytes])).toEqual([320, 180]);
        }
        // Fault injection in the test only: prove the renderer -> main -> MCP diagnostic path.
        await page.context().addInitScript(() => {
            if (new URLSearchParams(location.search).get("mode") === "webm-exporter") Object.defineProperty(window, "VideoEncoder", { value: undefined });
        });
        const failed = await edit("mmd_start_ui_operation", { operation: { kind: "exportWebm", filePath: join(temp, "unavailable.webm"), overwrite: false } });
        let terminal;
        await expect.poll(async () => {
            terminal = (await rpc("mmd_get_operation", { target: failed.target, operationId: failed.operationId })).structuredContent;
            return terminal.status;
        }, { timeout: 30000 }).toBe("failed");
        expect(terminal).toMatchObject({ progress: { totalFrames: 3, capturedFrames: 0 }, diagnostic: { error: { code: "VIDEO_ENCODER_UNAVAILABLE", details: { stage: "initializing", secureContext: true, videoEncoderAvailable: false } } } });
    } finally {
        await page?.close().catch(() => undefined);
        await browser?.close();
        if (child.exitCode === null) {
            await Promise.race([new Promise(r => child.once("exit", r)), new Promise(r => setTimeout(r, 5000))]);
            if (child.exitCode === null) child.kill();
        }
        // mkdtemp created this exact isolated test directory; it never contains user assets.
        await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
});

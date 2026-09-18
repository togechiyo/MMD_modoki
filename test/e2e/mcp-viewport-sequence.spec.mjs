import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { launchMmdModoki } from "./electron-app.mjs";
import { settings, closeSettings, client } from "./mcp-client.mjs";

for (const backend of ["frameGraph", "classic"]) test(`MCP viewport sequence observes playback and revocation (${backend})`, async ({}, testInfo) => {
    test.setTimeout(180000);
    const launched = await launchMmdModoki(resolve(import.meta.dirname, "../.."));
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        if (backend === "classic") {
            await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
            await page.reload();
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        }
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(import.meta.dirname, "../fixtures/external-parent/tofu.pmx"));
        await page.locator("#info-model-select").selectOption("__camera__");
        await page.locator('#bone-controls input[data-control-key="tx"]').fill("1");
        await page.locator('#bone-controls input[data-control-key="tx"]').press("Enter");
        await page.locator("#btn-bone-keyframe").click();
        await page.locator("#current-frame").fill("300");
        await page.locator("#current-frame").press("Enter");
        await page.locator('#bone-controls input[data-control-key="tx"]').fill("30");
        await page.locator('#bone-controls input[data-control-key="tx"]').press("Enter");
        await page.locator("#btn-bone-keyframe").click();
        await page.locator("#current-frame").fill("0");
        await page.locator("#current-frame").press("Enter");
        let dialog = await settings(page);
        await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("参照のみ");
        await dialog.getByRole("button", { name: "接続設定を表示" }).click();
        const config = JSON.parse(await dialog.getByLabel("MCP接続設定").inputValue()).mcpServers.mmd_modoki;
        const rpc = client(config);
        await closeSettings(dialog);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const target = (await context()).target;
        // Observe real capturePage calls to synchronize concurrent requests without sleeps.
        await launched.app.evaluate(({ BrowserWindow }) => {
            const contents = BrowserWindow.getAllWindows()[0].webContents;
            const capture = contents.capturePage.bind(contents);
            globalThis.sequenceCaptureCount = 0;
            contents.capturePage = (...args) => { globalThis.sequenceCaptureCount++; return capture(...args); };
        });
        const count = () => launched.app.evaluate(() => globalThis.sequenceCaptureCount);
        const before = await context();
        const still = await rpc("mmd_capture_viewport_sequence", { target, durationSeconds: 1, fps: 2 });
        expect(still.isError).not.toBe(true);
        expect(still.structuredContent.capturedFrames).toBe(2);
        expect(still.structuredContent.frames.every(frame => frame.frameBefore === before.frame && frame.frameAfter === before.frame)).toBe(true);
        expect((await context()).editRevision).toBe(before.editRevision);

        const reports = [];
        for (const pbr of [false, true]) {
            if (pbr) {
                dialog = await settings(page);
                await dialog.getByLabel("PBRモード", { exact: true }).check();
                await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
                await closeSettings(dialog);
            }
            await page.locator("#current-frame").fill("0");
            await page.locator("#current-frame").press("Enter");
            await page.locator("#viewport-seek-play-toggle").click();
            await expect.poll(async () => (await context()).playing).toBe(true);
            const result = await rpc("mmd_capture_viewport_sequence", pbr ? { target, durationSeconds: 3, fps: 4 } : { target });
            expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true);
            const data = result.structuredContent;
            const images = result.content.filter(item => item.type === "image");
            expect(images.length).toBe(data.capturedFrames);
            expect(images.length).toBeGreaterThanOrEqual(2);
            expect(data.capturedFrames + data.droppedFrames).toBe(pbr ? 12 : 6);
            expect(data.frames.at(-1).frameAfter).toBeGreaterThan(data.frames[0].frameAfter);
            expect(data.frames.every(frame => frame.playingBefore && frame.playingAfter)).toBe(true);
            expect(data.frames.every(frame => frame.backend === backend && frame.materialMode === (pbr ? "pbr-standard" : "mmd-standard"))).toBe(true);
            expect((await context()).playing).toBe(true);
            await page.locator("#viewport-seek-play-toggle").click();
            await expect.poll(async () => (await context()).playing).toBe(false);
            const decoded = await launched.app.evaluate(({ nativeImage }, items) => items.map(item => {
                const picture = nativeImage.createFromBuffer(Buffer.from(item.data, "base64"));
                return { empty: picture.isEmpty(), ...picture.getSize() };
            }), images);
            expect(decoded.every(item => !item.empty && Math.max(item.width, item.height) <= 640)).toBe(true);
            expect(images.every(item => item.mimeType === "image/jpeg")).toBe(true);
            expect(new Set(images.map(item => createHash("sha256").update(item.data).digest("hex"))).size).toBeGreaterThan(1);
            reports.push({ pbr, ...data });
            const imagePath = testInfo.outputPath(`sequence-${pbr ? "pbr" : "normal"}-first.jpg`);
            await writeFile(imagePath, Buffer.from(images[0].data, "base64"));
            await testInfo.attach(`sequence-${pbr ? "pbr" : "normal"}-first`, { path: imagePath, contentType: "image/jpeg" });
        }
        const reportPath = testInfo.outputPath("sequence-timing.json");
        await writeFile(reportPath, JSON.stringify(reports, null, 2));
        await testInfo.attach("sequence-timing", { path: reportPath, contentType: "application/json" });

        const initialCount = await count();
        const pending = rpc("mmd_capture_viewport_sequence", { target, durationSeconds: 5, fps: 2 }).catch(() => null);
        await expect.poll(count).toBeGreaterThan(initialCount);
        const conflict = await rpc("mmd_capture_viewport", { target });
        expect(conflict.structuredContent.error.code).toBe("CAPTURE_BUSY");
        dialog = await settings(page);
        await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("OFF");
        // OFF closes the HTTP transport when this is the last published window.
        const canceled = await pending;
        if (canceled) {
            expect(canceled.isError).toBe(true);
            expect(canceled.content.some(item => item.type === "image")).toBe(false);
        }
        await dialog.getByLabel("MCPを有効にする", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("公開中");
        await closeSettings(dialog);
        const finalCapture = await rpc("mmd_capture_viewport", { target: (await context()).target });
        expect(finalCapture.isError).not.toBe(true);
        expect(finalCapture.content.find(item => item.type === "image").mimeType).toBe("image/png");
    } finally { await launched.close(); }
});

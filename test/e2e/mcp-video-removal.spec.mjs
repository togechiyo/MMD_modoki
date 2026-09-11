import { test, expect } from "@playwright/test";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki } from "./electron-app.mjs";
import { enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const backend of ["frameGraph", "classic"]) test(`MCP video completion cancellation and targeted removal (${backend})`, async () => {
    test.setTimeout(240000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        if (backend === "classic") {
            await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
            await page.reload();
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        }
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const edit = async (name, extra) => {
            const current = await context();
            const input = { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), ...extra };
            const result = await rpc(name, input);
            expect(result.isError, JSON.stringify(result)).not.toBe(true);
            return { input, result: result.structuredContent };
        };
        const start = operation => edit("mmd_start_ui_operation", { operation });
        const finish = async job => {
            let result;
            await expect.poll(async () => {
                const response = await rpc("mmd_get_operation", { target: job.input.target, operationId: job.input.operationId });
                expect(response.isError, JSON.stringify(response)).not.toBe(true);
                result = response.structuredContent;
                return result.status;
            }, { timeout: 120000 }).not.toBe("running");
            return result;
        };
        const complete = async operation => {
            const result = await finish(await start(operation));
            expect(result.status, JSON.stringify(result)).toBe("completed");
            return result;
        };
        const assets = async () => (await rpc("mmd_list_assets", { target: (await context()).target })).structuredContent.assets;
        for (const pbr of [false, true]) {
            await complete({ kind: "materialMode", pbr });
            const modelPath = resolve(root, "test/fixtures/external-parent/material-switch.pmx");
            await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
            await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
            await page.locator("#info-model-select").selectOption("__camera__");
            await edit("mmd_set_editor_options", { options: { kind: "output", width: 320, height: 180, fps: 30, qualityScale: 1,
                transparent: false, includeAudio: false, webmCodec: "vp8", startFrame: 0, endFrame: 2, usePlaybackRange: false } });
            const filePath = join(launched.tempDir, `movie-${pbr}.webm`);
            const exported = await complete({ kind: "exportWebm", filePath, overwrite: false });
            expect(exported.output.byteLength).toBeGreaterThan(100);
            const bytes = await readFile(filePath);
            expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
            const decoded = await page.evaluate(async data => {
                const video = document.createElement("video");
                const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "video/webm" }));
                try {
                    video.src = url;
                    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error("Video decode failed")); });
                    return { width: video.videoWidth, height: video.videoHeight };
                } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
            }, [...bytes]);
            expect(decoded).toEqual({ width: 320, height: 180 });
            const duplicate = await finish(await start({ kind: "exportWebm", filePath, overwrite: false }));
            expect(duplicate).toMatchObject({ status: "failed", diagnostic: { error: { code: "OUTPUT_EXISTS" } } });
            expect(await readFile(filePath)).toEqual(bytes);
            const model = (await assets()).find(asset => asset.kind === "model");
            const wrong = await finish(await start({ kind: "removeAsset", assetId: model.assetId, expectedPath: "wrong" }));
            expect(wrong.diagnostic.error.code).toBe("ASSET_CHANGED");
            expect((await context()).models).toHaveLength(2);
            await complete({ kind: "removeAsset", assetId: model.assetId, expectedPath: model.recordedPath });
            expect((await context()).models).toHaveLength(1);
            await expect(page.locator("#info-model-select")).toHaveValue("__camera__");
            const remaining = (await assets()).find(asset => asset.kind === "model");
            await complete({ kind: "removeAsset", assetId: remaining.assetId, expectedPath: remaining.recordedPath });
            expect((await context()).models).toHaveLength(0);
            expect((await stat(modelPath)).size).toBeGreaterThan(0);
            const accessoryPath = resolve(root, "test/fixtures/accessory/tofu.x");
            for (let i = 0; i < 2; i++) await complete({ kind: "loadAsset", assetKind: "accessory", filePath: accessoryPath });
            const accessory = (await assets()).find(asset => asset.kind === "accessory");
            await complete({ kind: "removeAsset", assetId: accessory.assetId, expectedPath: accessory.recordedPath });
            expect((await assets()).filter(asset => asset.kind === "accessory")).toHaveLength(1);
            const last = (await assets()).find(asset => asset.kind === "accessory");
            await complete({ kind: "removeAsset", assetId: last.assetId, expectedPath: last.recordedPath });
            await expect(page.locator("#info-model-select")).toHaveValue("__camera__");
        }
        const wavePath = join(launched.tempDir, "tone.wav");
        const wave = Buffer.alloc(44 + 1600);
        wave.write("RIFF", 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write("WAVEfmt ", 8);
        wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
        wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
        wave.write("data", 36); wave.writeUInt32LE(1600, 40);
        await writeFile(wavePath, wave);
        for (const [assetKind, kind, filePath] of [
            ["audio", "audio", wavePath],
            ["backgroundImage", "background-image", resolve(root, "test/fixtures/accessory/tofu-uv-mtl.png")],
            ["lut", "lut", resolve(root, "test/fixtures/lut/synthetic-channel-swap.cube")],
        ]) {
            await complete({ kind: "loadAsset", assetKind, filePath });
            const asset = (await assets()).find(item => item.kind === kind);
            expect(asset, kind).toBeTruthy();
            await complete({ kind: "removeAsset", assetId: asset.assetId, expectedPath: asset.recordedPath });
            expect((await assets()).some(item => item.kind === kind)).toBe(false);
            expect((await stat(filePath)).size).toBeGreaterThan(0);
        }
        await edit("mmd_select_timeline", { scope: { kind: "camera" } });
        await edit("mmd_register_keyframes", { scope: { kind: "camera" }, tracks: [{ category: "camera", name: "Camera" }], collision: "replace" });
        const motionPath = join(launched.tempDir, "camera.vmd");
        await complete({ kind: "exportMotion", format: "vmd", scope: { kind: "camera" }, filePath: motionPath, overwrite: false });
        await complete({ kind: "loadAsset", assetKind: "cameraMotion", filePath: motionPath });
        await complete({ kind: "removeAsset", assetId: "camera-motion", expectedPath: motionPath });
        const keys = await rpc("mmd_inspect", { target: (await context()).target, kind: "keyframes" });
        expect(keys.structuredContent.items.filter(item => item.category === "camera")).toHaveLength(0);
        const canceledPath = join(launched.tempDir, "canceled.webm");
        const pending = await start({ kind: "exportWebm", filePath: canceledPath, overwrite: false });
        await edit("mmd_cancel_operation", { jobOperationId: pending.input.operationId });
        const canceled = await finish(pending);
        expect(canceled.status, JSON.stringify(canceled)).toBe("canceled");
        await expect(stat(canceledPath)).rejects.toThrow();
    } finally { await launched.close(); }
});

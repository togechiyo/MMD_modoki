import { test, expect } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki } from "./electron-app.mjs";
import { enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const pbr of [false, true]) test(`MCP PNG sequence completion and cancellation (PBR=${pbr})`, async () => {
    test.setTimeout(240000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const edit = async (name, extra) => {
            const current = await context();
            const input = { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), ...extra };
            const response = await rpc(name, input);
            expect(response.isError, JSON.stringify(response)).not.toBe(true);
            return { input, result: response.structuredContent };
        };
        const start = operation => edit("mmd_start_ui_operation", { operation });
        const getJob = async job => (await rpc("mmd_get_operation", { target: job.input.target, operationId: job.input.operationId })).structuredContent;
        const finish = async job => {
            let result;
            await expect.poll(async () => { result = await getJob(job); return result.status; }, { timeout: 120000 }).not.toBe("running");
            return result;
        };
        expect((await finish(await start({ kind: "materialMode", pbr }))).status).toBe("completed");
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
        await page.locator("#info-model-select").selectOption("__camera__");
        const outputOptions = { kind: "output", width: 320, height: 180, fps: 30, qualityScale: 1,
            transparent: false, includeAudio: false, webmCodec: "auto", startFrame: 0, endFrame: 2, usePlaybackRange: false };
        await edit("mmd_set_editor_options", { options: outputOptions });
        const directory = join(launched.tempDir, "sequence");
        const result = await finish(await start({ kind: "exportPngSequence", outputDirectoryPath: directory }));
        expect(result, JSON.stringify(result)).toMatchObject({ status: "completed", output: { savedFiles: 3, totalFiles: 3, outputDirectoryPath: directory, format: "png-sequence" } });
        const files = (await readdir(directory)).sort();
        expect(files).toEqual(["mmd_seq_320x180_0000.png", "mmd_seq_320x180_0001.png", "mmd_seq_320x180_0002.png"]);
        const images = await Promise.all(files.map(file => readFile(join(directory, file))));
        for (const bytes of images) {
            expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
            expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([320, 180]);
        }
        expect(result.output.byteLength).toBe(images.reduce((sum, bytes) => sum + bytes.length, 0));
        await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/);
        await expect(page.locator("#info-model-select")).toHaveValue("__camera__");
        const duplicate = await finish(await start({ kind: "exportPngSequence", outputDirectoryPath: directory }));
        expect(duplicate).toMatchObject({ status: "failed", diagnostic: { error: { code: "OUTPUT_EXISTS" } } });
        expect(await readFile(join(directory, files[0]))).toEqual(images[0]);

        await edit("mmd_set_editor_options", { options: { ...outputOptions, endFrame: 300 } });
        const canceledDirectory = join(launched.tempDir, "partial");
        const pending = await start({ kind: "exportPngSequence", outputDirectoryPath: canceledDirectory });
        await expect.poll(async () => (await getJob(pending)).progress?.savedFiles ?? 0, { timeout: 120000 }).toBeGreaterThan(0);
        await expect(page.locator("#app")).toHaveClass(/ui-export-lock/);
        await edit("mmd_cancel_operation", { jobOperationId: pending.input.operationId });
        const canceled = await finish(pending);
        expect(canceled, JSON.stringify(canceled)).toMatchObject({ status: "canceled", progress: { partialOutput: true, outputDirectoryPath: canceledDirectory, totalFiles: 301 } });
        const partial = await readdir(canceledDirectory);
        expect(partial.length).toBe(canceled.progress.savedFiles);
        expect(partial.length).toBeGreaterThan(0);
        expect(partial.length).toBeLessThan(301);
        await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/);
        await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled())).toBe(true);
        await edit("mmd_set_editor_options", { options: outputOptions });
        expect((await context()).models).toHaveLength(1);
    } finally { await launched.close(); }
});

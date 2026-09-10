import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki } from "./electron-app.mjs";
import { settings, closeSettings, enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const backend of ["frameGraph", "classic"]) test(`MCP controls and local UI operations (${backend})`, async () => {
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
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const edit = async (tool, args) => {
            const current = await context();
            const input = { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), ...args };
            const response = await rpc(tool, input);
            expect(response.isError, JSON.stringify(response)).not.toBe(true);
            return { input, data: response.structuredContent };
        };
        const start = operation => edit("mmd_start_ui_operation", { operation });
        const finish = async job => {
            let result;
            await expect.poll(async () => {
                const response = await rpc("mmd_get_operation", { target: job.input.target, operationId: job.input.operationId });
                expect(response.isError, JSON.stringify(response)).not.toBe(true);
                result = response.structuredContent;
                return result.status;
            }, { timeout: 90000 }).not.toBe("running");
            return result;
        };
        const loaded = await start({ kind: "loadAsset", assetKind: "model", filePath: resolve(root, "test/fixtures/external-parent/material-switch.pmx") });
        expect(loaded.data.status).toBe("running");
        await expect(page.locator("#model-comment-notice")).toBeVisible();
        const busy = await context();
        expect(busy.status.busyReasons).toContain("ui_operation");
        const blocked = await rpc("mmd_set_control", { target: busy.target, expectedEditRevision: busy.editRevision, operationId: randomUUID(), control: { id: "bloom.weight", value: 0.4 } });
        expect(blocked.structuredContent.error.code).toBe("EDITOR_BUSY");
        const replay = await rpc("mmd_start_ui_operation", loaded.input);
        expect(replay.structuredContent.operationId).toBe(loaded.input.operationId);
        await page.locator("#model-comment-notice-ok").click();
        expect((await finish(loaded)).status).toBe("completed");
        expect((await context()).models).toHaveLength(1);
        await page.locator("#info-model-select").selectOption("0");
        const modelInstanceId = (await context()).models[0].instanceId;
        const bones = await rpc("mmd_inspect", { target: (await context()).target, kind: "bones", modelInstanceId });
        await edit("mmd_select_bones", { modelInstanceId, boneNames: bones.structuredContent.items.slice(0, 2).map(bone => bone.name) });
        const pose = await start({ kind: "exportMotion", format: "vpd", scope: { kind: "model", modelInstanceId }, filePath: join(launched.tempDir, "pose.vpd"), overwrite: false });
        const savedPose = await finish(pose);
        expect(savedPose.status, JSON.stringify(savedPose)).toBe("completed");
        expect((await readFile(join(launched.tempDir, "pose.vpd"))).toString("ascii")).toContain("Vocaloid Pose Data");
        await page.locator("#info-model-select").selectOption("__camera__");
        await edit("mmd_set_editor_options", { options: { kind: "autoKey", enabled: true, scope: "camera" } });
        await expect(page.locator("#btn-auto-key")).toHaveAttribute("aria-pressed", "true");
        await edit("mmd_set_editor_options", { options: { kind: "autoKey", enabled: false, scope: "all" } });
        await edit("mmd_set_editor_options", { options: { kind: "playbackRange", startFrame: 5, endFrame: 25, startEnabled: true, loop: true } });
        const playbackBefore = (await rpc("mmd_get_editor_options", { target: (await context()).target })).structuredContent.playbackRange;
        await edit("mmd_set_editor_options", { options: { kind: "output", width: 320, height: 180, qualityScale: 1, fps: 30,
            transparent: true, includeAudio: false, webmCodec: "vp9", startFrame: 0, endFrame: 30, usePlaybackRange: false } });
        const outputOptions = await rpc("mmd_get_editor_options", { target: (await context()).target });
        expect(outputOptions.structuredContent.output).toMatchObject({ width: 320, height: 180, pngTransparentBackground: true, fps: 30 });
        expect(outputOptions.structuredContent.playbackRange).toEqual(playbackBefore);
        for (const pbr of [false, true]) {
            expect((await finish(await start({ kind: "materialMode", pbr }))).status).toBe("completed");
            expect((await context()).materialMode).toBe(pbr ? "pbr-standard" : "mmd-standard");
            let dialog = await settings(page);
            await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeChecked({ checked: pbr });
            await closeSettings(dialog);
            const subject = { kind: "model", modelInstanceId: (await context()).models[0].instanceId };
            const presets = await rpc("mmd_list_material_presets", { target: (await context()).target, subject });
            expect(presets.structuredContent.pbr).toBe(pbr);
            const presetId = pbr ? "pbr-metal-satin" : "wgsl-debug-white";
            expect(presets.structuredContent.presets.some(preset => preset.id === presetId)).toBe(true);
            const appliedPreset = await edit("mmd_set_material_preset", { subject, materialKey: null, presetId });
            expect(appliedPreset.data.control).toMatchObject({ presetId, affectedMaterialCount: presets.structuredContent.totalCount });
            const afterPreset = await rpc("mmd_inspect", { target: (await context()).target, kind: "materials", modelInstanceId: subject.modelInstanceId });
            expect(afterPreset.structuredContent.items[0][pbr ? "pbrPresetId" : "presetId"]).toBe(presetId);
            const set = await edit("mmd_set_control", { control: { id: "bloom.weight", value: pbr ? 0.65 : 0.35 } });
            expect(set.data.control.applied).toBe(pbr ? 0.65 : 0.35);
            const catalog = await rpc("mmd_list_controls", { target: (await context()).target, query: "bloom" });
            expect(catalog.structuredContent.items.find(item => item.id === "bloom.weight").value).toBe(pbr ? 0.65 : 0.35);
            const weight = page.locator('input[data-postfx="bloom-weight"]').first();
            await expect(weight).toHaveValue(pbr ? "65" : "35");
            await edit("mmd_set_control", { control: { id: "light.intensity", value: 0.8 } });
            const pngPath = join(launched.tempDir, `view-${pbr}.png`);
            const pngResult = await finish(await start({ kind: "exportPng", filePath: pngPath, overwrite: false }));
            expect(pngResult.status, JSON.stringify(pngResult)).toBe("completed");
            const pngBytes = await readFile(pngPath);
            expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
            expect(pngBytes.readUInt32BE(16)).toBe(320);
            expect(pngBytes.readUInt32BE(20)).toBe(180);
            const path = join(launched.tempDir, `scene-${pbr}.mmdproj`);
            const save = await start({ kind: "saveProject", filePath: path, overwrite: false });
            const saved = await finish(save);
            expect(saved.status, JSON.stringify(saved)).toBe("completed");
            const project = JSON.parse(await readFile(path, "utf8"));
            expect(project.effects.bloomWeight).toBe(pbr ? 0.65 : 0.35);
            expect(project.lighting.intensity).toBeCloseTo(0.8);
            const exists = await finish(await start({ kind: "saveProject", filePath: path, overwrite: false }));
            expect(exists).toMatchObject({ status: "failed", diagnostic: { error: { code: "OUTPUT_EXISTS" } } });
            await edit("mmd_set_control", { control: { id: "bloom.weight", value: 0.1 } });
            const restore = await finish(await start({ kind: "loadProject", filePath: path }));
            expect(restore.status, JSON.stringify(restore)).toBe("completed");
            await expect(page.locator('input[data-postfx="bloom-weight"]').first()).toHaveValue(pbr ? "65" : "35");
        }
        await edit("mmd_register_keyframes", { scope: { kind: "camera" }, tracks: [{ category: "camera", name: "Camera" }], collision: "replace" });
        for (const format of ["vmd", "bvmd"]) {
            const filePath = join(launched.tempDir, `camera.${format}`);
            const saved = await finish(await start({ kind: "exportMotion", format, scope: { kind: "camera" }, filePath, overwrite: false }));
            expect(saved.status, JSON.stringify(saved)).toBe("completed");
            expect((await readFile(filePath)).byteLength).toBeGreaterThan(30);
            const loadedMotion = await finish(await start({ kind: "loadAsset", assetKind: "cameraMotion", filePath }));
            expect(loadedMotion.status, JSON.stringify(loadedMotion)).toBe("completed");
        }
        const dialog = await settings(page);
        await dialog.getByLabel("AIからの編集も許可", { exact: true }).click();
        await expect(dialog.locator("[data-mcp-status]")).toContainText("参照のみ");
        await closeSettings(dialog);
        const current = await context();
        const denied = await rpc("mmd_set_control", { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), control: { id: "bloom.weight", value: 0.9 } });
        expect(denied.structuredContent.error.code).toBe("READ_ONLY");
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});

import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki } from "./electron-app.mjs";
import { enableMcpEditing } from "./mcp-client.mjs";
const root = resolve(import.meta.dirname, "../..");
const sourcePath = resolve(root, "test/fixtures/external-parent/body-source.pmx");
const targetPath = resolve(root, "test/fixtures/external-parent/body-target.pmx");
function motionBytes() {
    const bytes = Buffer.alloc(50 + 4 + 111 + 20);
    bytes.write("Vocaloid Motion Data 0002", 0, "ascii");
    bytes.write("Source", 30, "ascii");
    bytes.writeUInt32LE(1, 50);
    Buffer.from([0x83, 0x5a, 0x83, 0x93, 0x83, 0x5e, 0x81, 0x5b]).copy(bytes, 54);
    [1, 2, 3].forEach((v, i) => bytes.writeFloatLE(v, 73 + i * 4));
    bytes.writeFloatLE(1, 97);
    return bytes;
}
for (const pbr of [false, true]) test(`MCP public tools materials and effects (PBR=${pbr})`, async () => {
    test.setTimeout(240000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const edit = async (tool, args) => {
            const current = await context();
            const input = { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), ...args };
            const response = await rpc(tool, input);
            expect(response.isError, JSON.stringify(response)).not.toBe(true);
            return { input, data: response.structuredContent };
        };
        const operation = async value => {
            const job = await edit("mmd_start_ui_operation", { operation: value });
            let result;
            await expect.poll(async () => {
                result = (await rpc("mmd_get_operation", { target: job.input.target, operationId: job.input.operationId })).structuredContent;
                return result.status;
            }, { timeout: 120000 }).not.toBe("running");
            return result;
        };
        const complete = async value => {
            const result = await operation(value);
            expect(result.status, JSON.stringify(result)).toBe("completed");
            return result.output;
        };
        await complete({ kind: "materialMode", pbr });
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), sourcePath);
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), targetPath);
        const models = (await context()).models;
        const sourceId = models[0].instanceId, modelInstanceId = models[1].instanceId;
        const scope = { kind: "model", modelInstanceId };
        await edit("mmd_select_timeline", { scope });
        const sourceMotionPath = join(launched.tempDir, "input.vmd");
        await writeFile(sourceMotionPath, motionBytes());
        const convertedPath = join(launched.tempDir, "converted.vmd");
        const items = [
            { kind: "optimizeModel", sourcePath, filePath: join(launched.tempDir, "model.bpmx"), overwrite: false },
            { kind: "optimizeMotion", sourcePath: sourceMotionPath, filePath: join(launched.tempDir, "motion.bvmd"), overwrite: false },
            { kind: "retargetMotion", sourceModelPath: sourcePath, sourceMotionPath, targetModelPath: targetPath,
                filePath: convertedPath, overwrite: false, options: { retargetRotations: true, correctRootPosition: true, correctFootIkPosition: true } },
        ];
        const batch = await complete({ kind: "fileTools", items, continueOnError: false });
        expect(batch).toMatchObject({ allSucceeded: true, failedItems: 0 });
        expect(batch.results).toHaveLength(3);
        for (const item of items) expect((await readFile(item.filePath)).length).toBeGreaterThan(30);
        expect((await readFile(items[0].filePath)).subarray(0, 4).toString("ascii")).toBe("BPMX");
        expect((await readFile(items[1].filePath)).subarray(0, 4).toString("ascii")).toBe("BVMD");
        const converted = await readFile(convertedPath);
        expect([0, 1, 2].map(i => converted.readFloatLE(73 + i * 4))).toEqual([2, 4, 6]);
        expect(JSON.stringify(batch)).not.toMatch(/restBones|vertices|textureBytes|document":/);
        expect((await context()).models.map(m => m.instanceId)).toEqual(models.map(m => m.instanceId));
        await expect(page.locator("#info-model-select")).toHaveValue("1");
        const partial = await complete({ kind: "fileTools", items: [items[1], { ...items[1], filePath: join(launched.tempDir, "next.bvmd") }], continueOnError: true });
        expect(partial).toMatchObject({ allSucceeded: false, failedItems: 1, results: [{ status: "failed", error: { code: "OUTPUT_EXISTS" } }, { status: "completed" }] });
        expect(await readFile(convertedPath)).toEqual(converted);

        await complete({ kind: "loadAsset", assetKind: "motion", filePath: sourceMotionPath, modelInstanceId });
        await edit("mmd_set_playback", { action: "seek", frame: 1 });
        expect((await rpc("mmd_capture_viewport", { target: (await context()).target })).isError).not.toBe(true);
        await edit("mmd_set_playback", { action: "seek", frame: 0 });
        expect((await rpc("mmd_capture_viewport", { target: (await context()).target })).isError).not.toBe(true);
        await edit("mmd_select_bones", { modelInstanceId, boneNames: ["センター"] });
        const centerX = page.locator("#bone-controls input[data-control-key='tx']");
        await expect.poll(async () => Number(await centerX.inputValue())).toBeCloseTo(1);
        const correction = { modelInstanceId, sourceModelInstanceId: sourceId };
        const dry = await edit("mmd_correct_body_motion", { ...correction, dryRun: true });
        expect(dry.data.plan).toMatchObject({ changedKeyCount: 1, plan: { globalScale: 2 } });
        await expect.poll(async () => Number(await centerX.inputValue())).toBeCloseTo(1);
        const applied = await edit("mmd_correct_body_motion", { ...correction, dryRun: false });
        await expect.poll(async () => Number(await centerX.inputValue())).toBeCloseTo(2);
        await edit("mmd_undo", { editId: applied.data.editId });
        await expect.poll(async () => Number(await centerX.inputValue())).toBeCloseTo(1);
        await edit("mmd_redo", { editId: applied.data.editId });
        await expect.poll(async () => Number(await centerX.inputValue())).toBeCloseTo(2);

        const catalog = async subject => (await rpc("mmd_list_material_presets", { target: (await context()).target, subject })).structuredContent;
        const subject = { kind: "model", modelInstanceId };
        const materials = await catalog(subject);
        const key = materials.materials[0].key;
        const entry = { subject, expectedPath: targetPath, materialKeys: [key], action: { kind: "visibility", visible: false } };
        const preview = await edit("mmd_edit_materials", { entries: [entry], dryRun: true });
        expect(preview.data.control.status).toBe("validated");
        expect((await catalog(subject)).materials[0].visible).toBe(true);
        await edit("mmd_edit_materials", { entries: [entry], dryRun: false });
        expect((await catalog(subject)).materials[0].visible).toBe(false);
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        await expect(page.locator(".shader-material-toggle").first()).not.toBeChecked();
        await edit("mmd_edit_materials", { entries: [{ ...entry, action: { kind: "preset", presetId: pbr ? "pbr-no-shadow" : "wgsl-mmd-standard" } },
            { ...entry, action: { kind: "reset" } }, { ...entry, action: { kind: "visibility", visible: true } }], dryRun: false });
        expect((await catalog(subject)).materials[0]).toMatchObject({ presetId: materials.defaultPresetId, visible: true });
        await expect(page.locator(".shader-material-toggle").first()).toBeChecked();
        const accessoryPath = resolve(root, "test/fixtures/accessory/tofu.x");
        await complete({ kind: "loadAsset", assetKind: "accessory", filePath: accessoryPath });
        const accessory = { kind: "accessory", accessoryIndex: 0 };
        const accessoryMaterials = await catalog(accessory);
        const accessoryEntry = { subject: accessory, expectedPath: accessoryPath, materialKeys: null, action: { kind: "visibility", visible: false } };
        await edit("mmd_edit_materials", { entries: [accessoryEntry], dryRun: false });
        expect((await catalog(accessory)).materials.every(material => !material.visible)).toBe(true);
        await edit("mmd_edit_materials", { entries: [{ ...accessoryEntry, action: { kind: "reset" } },
            { ...accessoryEntry, action: { kind: "visibility", visible: true } }], dryRun: false });
        expect((await catalog(accessory)).materials.every(material => material.presetId === accessoryMaterials.defaultPresetId && material.visible)).toBe(true);
        await edit("mmd_select_timeline", { scope: { kind: "camera" } });
        await page.locator('[data-effect-tab="post"]').click();
        const control = (id, value) => edit("mmd_set_control", { control: { id, value } });
        const readControl = async id => (await rpc("mmd_list_controls", { target: (await context()).target, query: id })).structuredContent.items.find(item => item.id === id).value;
        await control("render.stack", [{ id: "ssgi", enabled: true }, { id: "luminous", enabled: false }, { id: "aerialPerspective", enabled: true }]);
        await control("ssgi.radius", 52);
        await control("luminous.intensity", 0.7);
        await control("aerialPerspective.color", { r: 0.2, g: 0.3, b: 0.4 });
        const extraControls = [["motionBlur.samples", 24], ["offsetShadow.x", 10], ["offsetHighlight.strength", 0.4],
            ["ringParticles.count", 80], ["ringParticles.colorA", { r: 0.2, g: 0.5, b: 0.8 }],
            ["directionalLightShafts.phaseG", 0.3], ["ssr.strength", 1.5], ["ssr.step", 4],
            ["luminous.threshold", 0.8], ["luminous.radius", 48], ["dof.lensSize", 800], ["lut.intensity", 0.6],
            ["motionBlur.strength", 2.5], ["ssgi.strength", 0.45], ["aerialPerspective.strength", 0.2],
            ["aerialPerspective.start", 75], ["aerialPerspective.range", 300], ["directionalLightShafts.strength", 0.05],
            ["offsetShadow.strength", 0.7], ["offsetShadow.y", -8], ["offsetShadow.minDepth", 0.02],
            ["offsetShadow.maxDepth", 0.5], ["offsetShadow.depthScale", 0.4],
            ["offsetHighlight.x", 20], ["offsetHighlight.y", -16], ["offsetHighlight.depthScale", 0.6],
            ["ringParticles.density", 20], ["ringParticles.size", 0.3], ["ringParticles.speed", 0.2], ["ringParticles.intensity", 1.5],
            ...["ringParticles.colorB", "ringParticles.colorC", "directionalLightShafts.lightColor", "directionalLightShafts.shadowColor",
                "offsetShadow.color", "offsetHighlight.color"].map(id => [id, { r: 0.3, g: 0.4, b: 0.6 }])];
        for (const [id, value] of extraControls) await control(id, value);
        for (const [id, value] of extraControls) {
            const actual = await readControl(id);
            if (typeof value === "number") expect(actual, id).toBeCloseTo(value);
            else expect(actual, id).toEqual(value);
        }
        await page.locator('[data-effect-stack-item="ssgi"]').click();
        await expect(page.locator('[data-effect-stack-value="ssgiSampleRadius"]')).toHaveText("52px");
        await control("dof.focusMode", "model-target");
        await control("dof.target", { modelInstanceId, boneName: "センター" });
        expect(await readControl("dof.target")).toEqual({ modelInstanceId, boneName: "センター" });
        const lut = (await rpc("mmd_list_controls", { target: (await context()).target, query: "lut.preset" })).structuredContent.items[0];
        const preset = lut.choices.find(choice => choice.id !== lut.value).id;
        await control("lut.preset", preset);
        const materialPreset = pbr ? "pbr-no-shadow" : "wgsl-autoluminous";
        await edit("mmd_edit_materials", { entries: [{ ...entry, action: { kind: "preset", presetId: materialPreset } }, entry], dryRun: false });
        await complete({ kind: "materialMode", pbr: !pbr });
        await complete({ kind: "materialMode", pbr });
        expect((await catalog(subject)).materials[0]).toMatchObject({ presetId: materialPreset, visible: false });
        const projectPath = join(launched.tempDir, "saved.json");
        await complete({ kind: "saveProject", filePath: projectPath, overwrite: false });
        await control("ssgi.radius", 20);
        await complete({ kind: "loadProject", filePath: projectPath });
        expect(await readControl("ssgi.radius")).toBe(52);
        expect(await readControl("luminous.intensity")).toBeCloseTo(0.7);
        expect(await readControl("aerialPerspective.color")).toEqual({ r: 0.2, g: 0.3, b: 0.4 });
        expect(await readControl("lut.preset")).toBe(preset);
        expect(await readControl("dof.focusMode")).toBe("model-target");
        const restoredId = (await context()).models[1].instanceId;
        expect((await catalog({ kind: "model", modelInstanceId: restoredId })).sourcePath).toBe(targetPath);
        expect(await readControl("dof.target")).toEqual({ modelInstanceId: restoredId, boneName: "センター" });
        expect((await catalog({ kind: "model", modelInstanceId: restoredId })).materials[0]).toMatchObject({ presetId: materialPreset, visible: false });
        for (const [id, value] of extraControls) {
            const actual = await readControl(id);
            if (typeof value === "number") expect(actual, id).toBeCloseTo(value);
            else expect(actual, id).toEqual(value);
        }
    } finally { await launched.close(); }
});

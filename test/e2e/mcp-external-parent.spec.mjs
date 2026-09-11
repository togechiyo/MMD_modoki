import { test, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";
import { enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const pbr of [false, true]) test(`MCP external-parent batches, cycle protection, history and project (${pbr ? "PBR" : "normal"})`, async () => {
    test.setTimeout(240000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const request = async (name, extra) => {
            const current = await context();
            const input = { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), ...extra };
            return { input, response: await rpc(name, input) };
        };
        const edit = async (name, extra) => {
            const result = await request(name, extra);
            expect(result.response.isError, JSON.stringify(result.response)).not.toBe(true);
            return { input: result.input, data: result.response.structuredContent };
        };
        const complete = async operation => {
            const job = await edit("mmd_start_ui_operation", { operation });
            let result;
            await expect.poll(async () => {
                result = (await rpc("mmd_get_operation", { target: job.input.target, operationId: job.input.operationId })).structuredContent;
                return result.status;
            }, { timeout: 120000 }).not.toBe("running");
            expect(result.status, JSON.stringify(result)).toBe("completed");
        };
        await complete({ kind: "materialMode", pbr });
        // Two instances of the same source verify that identity never falls back to the first path match.
        await page.evaluate(async path => { await window.mmdModokiE2e.loadModel(path); await window.mmdModokiE2e.loadModel(path); }, resolve(root, "test/fixtures/external-parent/tofu.pmx"));
        const [a, b] = (await context()).models;
        const scopeA = { kind: "model", modelInstanceId: a.instanceId };
        const scopeB = { kind: "model", modelInstanceId: b.instanceId };
        const subjectA = { ...scopeA, boneName: "センター" };
        const parent = model => ({ modelInstanceId: model.instanceId, boneName: "センター" });
        const set = (frame, value, poseMode = "snap") => ({ action: "set", frame, parent: value, poseMode });
        const query = async scope => (await rpc("mmd_get_external_parent", { target: (await context()).target, scope })).structuredContent;
        const seek = frame => edit("mmd_set_playback", { action: "seek", frame });
        await edit("mmd_select_timeline", { scope: scopeA });
        await selectCenterBone(page);
        const input = { subject: subjectA, operations: [set(0, parent(b)), set(20, null)], collision: "replace" };
        const before = await context();
        const plan = await edit("mmd_edit_external_parent", { ...input, dryRun: true });
        expect(plan.data.status).toBe("validated");
        expect(plan.data.plan.changedKeyCount).toBe(2);
        expect((await query(scopeA)).items).toEqual([]);
        expect((await context()).undoId).toBe(before.undoId);
        const attached = await edit("mmd_edit_external_parent", input);
        await expect(page.locator("#info-external-parent-select")).toHaveValue("1");
        expect((await query(scopeA)).items.map(key => [key.frame, key.parentModelInstanceId])).toEqual([[0, b.instanceId], [20, null]]);
        await edit("mmd_undo", { editId: attached.data.editId });
        expect((await query(scopeA)).items).toEqual([]);
        await edit("mmd_redo", { editId: attached.data.editId });
        await expect(page.locator("#info-external-parent-select")).toHaveValue("1");
        await seek(20);
        await expect(page.locator("#info-external-parent-select")).toHaveValue("");
        await seek(0);
        await edit("mmd_select_timeline", { scope: scopeB });
        await edit("mmd_edit_external_parent", { subject: { ...scopeB, boneName: "センター" }, operations: [set(30, parent(a)), set(40, null)], collision: "replace" });
        await edit("mmd_select_timeline", { scope: scopeA });
        const invalid = await request("mmd_edit_external_parent", { subject: subjectA, operations: [{ action: "delete", frame: 20 }], collision: "replace" });
        expect(invalid.response.structuredContent.error).toMatchObject({ code: "EXTERNAL_PARENT_CYCLE", details: { frame: 30 } });
        expect((await query(scopeA)).items).toHaveLength(2);
        const badBone = await request("mmd_edit_external_parent", { subject: subjectA, operations: [set(0, { ...parent(b), boneName: "missing" })], collision: "replace" });
        expect(badBone.response.structuredContent.error.code).toBe("BONE_NOT_UNIQUE");
        // Ordinary pose editing and key registration remain usable after parenting.
        const keys = (await rpc("mmd_inspect", { target: (await context()).target, kind: "keyframes" })).structuredContent.items;
        const first = keys.find(key => key.frame === 0 && key.name === "センター");
        const moved = await edit("mmd_edit_keyframes", { scope: scopeA, collision: "replace", operations: [{ action: "set", track: { category: first.category, name: first.name }, frame: 0, payload: { ...first.payload, positions: [1, 0, 0] } }] });
        expect((await query(scopeA)).effective.parentModelInstanceId).toBe(b.instanceId);
        await edit("mmd_undo", { editId: moved.data.editId });
        const track = { category: first.category, name: first.name };
        const copied = await edit("mmd_edit_keyframes", { scope: scopeA, collision: "reject", operations: [{ action: "copy", track, frame: 0, toFrame: 5 }] });
        const shifted = await edit("mmd_edit_keyframes", { scope: scopeA, collision: "reject", operations: [{ action: "move", track, frame: 5, toFrame: 10 }] });
        expect((await query(scopeA)).items.map(key => key.frame)).toEqual([0, 10, 20]);
        await edit("mmd_undo", { editId: shifted.data.editId });
        await edit("mmd_undo", { editId: copied.data.editId });
        // A parent offset appears in both parent and child rendered positions.
        await edit("mmd_select_timeline", { scope: scopeB });
        await edit("mmd_set_bone", { modelInstanceId: b.instanceId, boneName: "センター", position: { x: 0, y: 5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, mode: "preview", playbackPolicy: "reject" });
        await expect.poll(() => page.evaluate(() => {
            const child = window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター");
            const parent = window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター");
            return Boolean(child && parent && parent.y > 4.9 && Math.abs(child.y - parent.y) < 0.1);
        })).toBe(true);
        const cameraScope = { kind: "camera" };
        await edit("mmd_select_timeline", { scope: cameraScope });
        const camera = await edit("mmd_edit_external_parent", { subject: cameraScope, operations: [set(0, parent(b)), set(20, null)], collision: "replace" });
        await expect(page.locator("#camera-external-parent-select")).toHaveValue("1");
        await edit("mmd_undo", { editId: camera.data.editId });
        expect((await query(cameraScope)).items).toHaveLength(0);
        await edit("mmd_redo", { editId: camera.data.editId });
        await seek(20);
        await expect(page.locator("#camera-external-parent-select")).toHaveValue("");
        const filePath = join(launched.tempDir, "external-parent.mmdproj");
        await complete({ kind: "saveProject", filePath, overwrite: false });
        await complete({ kind: "loadProject", filePath });
        expect((await query(scopeA)).items.map(key => key.parentModelInstanceId)).toEqual([b.instanceId, null]);
        expect((await query(cameraScope)).items.map(key => key.modelInstanceId)).toEqual([b.instanceId, null]);
        await seek(0);
        await expect(page.locator("#camera-external-parent-select")).toHaveValue("1");
        const assets = (await rpc("mmd_list_assets", { target: (await context()).target })).structuredContent.assets;
        const parentAsset = assets.find(asset => asset.kind === "model" && asset.modelInstanceId === b.instanceId);
        await complete({ kind: "removeAsset", assetId: parentAsset.assetId, expectedPath: parentAsset.recordedPath });
        expect((await query(scopeA)).items.every(key => key.parentModelInstanceId === null)).toBe(true);
        expect((await query(cameraScope)).items.every(key => key.modelInstanceId === null)).toBe(true);
        await expect(page.locator("#camera-external-parent-select")).toHaveValue("");
    } finally { await launched.close(); }
});

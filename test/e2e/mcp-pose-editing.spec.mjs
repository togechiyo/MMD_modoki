import { test, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";
import { enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const pbr of [false, true]) test(`MCP batch pose preview, history and key registration (${pbr ? "PBR" : "normal"})`, async () => {
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
        await page.evaluate(async path => { await window.mmdModokiE2e.loadModel(path); }, resolve(root, "test/fixtures/external-parent/body-source.pmx"));
        const modelInstanceId = (await context()).models[0].instanceId;
        const scope = { kind: "model", modelInstanceId };
        const inspect = async kind => (await rpc("mmd_inspect", { target: (await context()).target, kind, modelInstanceId })).structuredContent.items;
        await edit("mmd_select_timeline", { scope });
        await selectCenterBone(page);
        await edit("mmd_set_playback", { action: "seek", frame: 10 });
        await edit("mmd_set_editor_options", { options: { kind: "autoKey", enabled: true, scope: "all" } });
        const initial = await inspect("bones");
        const names = ["センター", "左足ＩＫ"];
        const poses = names.map((boneName, i) => {
            const bone = initial.find(item => item.name === boneName);
            expect(bone.movable).toBe(true);
            return { boneName, position: { ...bone.transform.position, x: i + 2 }, rotation: { ...bone.transform.rotation, ...(boneName === "センター" ? { y: 15 } : {}) } };
        });
        const args = { modelInstanceId, poses, mode: "preview" };
        const before = await context();
        const beforeKeys = await inspect("keyframes");
        const dryRun = await edit("mmd_set_pose", { ...args, dryRun: true });
        expect(dryRun.data.plan.changedBoneCount).toBe(2);
        expect((await context()).undoId).toBe(before.undoId);
        expect(await inspect("bones")).toEqual(initial);
        const invalid = await request("mmd_set_pose", { ...args, poses: [poses[0], { ...poses[1], boneName: "missing" }] });
        expect(invalid.response.structuredContent.error).toMatchObject({ code: "BONE_NOT_UNIQUE", details: { operationIndex: 1 } });
        expect(await inspect("bones")).toEqual(initial);
        const changed = await edit("mmd_set_pose", args);
        const assertPose = async values => {
            const bones = await inspect("bones");
            for (const value of values) {
                const actual = bones.find(bone => bone.name === value.boneName).transform;
                expect(actual.position.x).toBeCloseTo(value.position.x, 4);
                expect(actual.rotation.y).toBeCloseTo(value.rotation.y, 3);
            }
        };
        await assertPose(poses);
        expect(await inspect("keyframes")).toEqual(beforeKeys);
        expect((await rpc("mmd_get_editor_options", { target: (await context()).target })).structuredContent.selectedBones).toEqual(["センター"]);
        const centerX = page.locator("#bone-controls input[data-control-key='tx']");
        await expect.poll(async () => Number(await centerX.inputValue())).toBeCloseTo(2);
        await expect.poll(async () => Number(await page.locator("#bone-controls input[data-control-key='ry']").inputValue())).toBeCloseTo(15);
        // Replaying an operation ID returns the original result, without another history entry.
        expect((await rpc("mmd_set_pose", changed.input)).structuredContent.editId).toBe(changed.data.editId);
        await edit("mmd_undo", { editId: changed.data.editId });
        await assertPose(names.map(boneName => ({ boneName, ...initial.find(item => item.name === boneName).transform })));
        await edit("mmd_redo", { editId: changed.data.editId });
        await assertPose(poses);
        await page.keyboard.press("Control+z");
        await assertPose(names.map(boneName => ({ boneName, ...initial.find(item => item.name === boneName).transform })));
        await page.keyboard.press("Control+y");
        await assertPose(poses);
        await expect.poll(async () => Number(await centerX.inputValue())).toBeCloseTo(2);
        await edit("mmd_select_timeline", { scope: { kind: "camera" } });
        const wrongTarget = await request("mmd_undo", { editId: changed.data.editId });
        expect(wrongTarget.response.isError).toBe(true);
        await edit("mmd_select_timeline", { scope });
        await selectCenterBone(page);
        const tracks = (await inspect("tracks")).filter(track => names.includes(track.name)).map(({ category, name }) => ({ category, name }));
        expect(tracks).toHaveLength(2);
        await edit("mmd_register_keyframes", { scope, tracks, collision: "replace" });
        const keys = await inspect("keyframes");
        for (const pose of poses) expect(keys.find(key => key.name === pose.boneName && key.frame === 10).payload.positions[0]).toBeCloseTo(pose.position.x);
        await edit("mmd_set_playback", { action: "seek", frame: 0 });
        await edit("mmd_set_playback", { action: "seek", frame: 10 });
        await assertPose(poses);
        await complete({ kind: "materialMode", pbr: !pbr });
        await assertPose(poses);
        const filePath = join(launched.tempDir, "pose.mmdproj");
        await complete({ kind: "saveProject", filePath, overwrite: false });
        await complete({ kind: "loadProject", filePath });
        await edit("mmd_select_timeline", { scope });
        await edit("mmd_set_playback", { action: "seek", frame: 10 });
        await assertPose(poses);
        await selectCenterBone(page);
        await expect.poll(async () => Number(await centerX.inputValue())).toBeCloseTo(2);
        const noChange = await edit("mmd_set_pose", args);
        expect(noChange.data.status).toBe("no-change");
    } finally { await launched.close(); }
});

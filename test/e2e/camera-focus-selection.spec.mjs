import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";
import { enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
const closeVector = (actual, expected) => {
    for (const axis of ["x", "y", "z"]) expect(actual[axis]).toBeCloseTo(expected[axis], 3);
};
for (const backend of ["frameGraph", "classic"]) test(`focus selected bones via menu, shortcut and MCP (${backend})`, async ({}, testInfo) => {
    test.setTimeout(180000);
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
        page.on("pageerror", e => errors.push(e.message));
        const menu = async () => page.locator('[data-i18n="menu.view"]').click();
        const focusItem = page.locator('[data-menu-command="view.focusSelectedBones"]');
        await menu();
        await expect(focusItem).toBeDisabled();
        await page.keyboard.press("Escape");
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const edit = async (tool, args) => {
            const current = await context();
            const result = await rpc(tool, { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), ...args });
            expect(result.isError, JSON.stringify(result)).not.toBe(true);
            return result.structuredContent;
        };
        const pose = () => page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose());
        const roundTrip = async fileName => {
            const filePath = resolve(launched.tempDir, fileName);
            for (const operation of [{ kind: "saveProject", filePath, overwrite: false }, { kind: "loadProject", filePath }]) {
                const target = (await context()).target;
                const job = await edit("mmd_start_ui_operation", { operation });
                let result;
                await expect.poll(async () => {
                    result = (await rpc("mmd_get_operation", { target, operationId: job.operationId })).structuredContent;
                    return result.status;
                }, { timeout: 60000 }).not.toBe("running");
                expect(result.status, JSON.stringify(result)).toBe("completed");
            }
        };
        const bonePosition = name => page.evaluate(name => window.mmdModokiE2e.getModelBoneRenderedPosition(0, name), name);
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/body-source.pmx"));
        await selectCenterBone(page);
        const modelInstanceId = (await context()).models[0].instanceId;
        await edit("mmd_set_setting", { setting: { id: "runtime.physics", value: false } });
        await edit("mmd_set_bone", { modelInstanceId, boneName: "センター", mode: "preview", playbackPolicy: "reject", position: { x: 4, y: 2, z: 3 }, rotation: { x: 0, y: 25, z: 0 } });
        await expect.poll(async () => (await bonePosition("センター")).x).toBeCloseTo(4, 3);
        await edit("mmd_set_camera", { mode: "preview", playbackPolicy: "reject", camera: { target: { x: 0, y: 10, z: 0 }, rotation: { x: 15, y: 30, z: 5 }, distance: 45, fov: 40 } });
        const before = await pose();
        const center = await bonePosition("センター");
        await edit("mmd_set_editor_options", { options: { kind: "autoKey", enabled: true, scope: "all" } });
        const cameraKeysBefore = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes.cameraAnimation);
        await menu();
        await expect(focusItem).toBeEnabled();
        await focusItem.click();
        closeVector((await pose()).target, center);
        closeVector((await pose()).rotation, before.rotation);
        expect((await pose()).distance).toBeCloseTo(before.distance, 3);
        expect((await pose()).fov).toBeCloseTo(before.fov, 3);
        expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes.cameraAnimation)).toEqual(cameraKeysBefore);
        await page.keyboard.press("Control+z");
        closeVector((await pose()).target, before.target);
        await page.keyboard.press("f");
        closeVector((await pose()).target, center);
        await page.screenshot({ path: testInfo.outputPath("focus-selected-bone.png") });
        await page.keyboard.press("Control+z");
        const input = page.locator("#bone-controls input[data-control-key='tx']");
        await input.focus();
        await input.press("f");
        closeVector((await pose()).target, before.target);
        await input.press("Escape");
        await edit("mmd_select_bones", { modelInstanceId, boneNames: ["センター", "左足ＩＫ"] });
        const other = await bonePosition("左足ＩＫ");
        const average = Object.fromEntries(["x", "y", "z"].map(axis => [axis, (center[axis] + other[axis]) / 2]));
        const focused = await edit("mmd_execute_menu_action", { scope: (await context()).timelineScope, action: { kind: "focusSelectedBones" } });
        expect(focused.editId).toMatch(/^ai:/);
        closeVector((await pose()).target, average);
        await edit("mmd_undo", { editId: focused.editId });
        closeVector((await pose()).target, before.target);
        await edit("mmd_redo", { editId: focused.editId });
        closeVector((await pose()).target, average);
        await roundTrip("focused-camera.json");
        closeVector((await pose()).target, average);
        // External-parent camera must keep the same parent and use its local coordinate system.
        await page.locator("#info-model-select").selectOption("__camera__");
        await page.locator("#camera-external-parent-select").selectOption("0");
        await page.locator("#camera-parent-bone-select").selectOption({ label: "センター" });
        await page.locator('[data-testid="camera-external-parent-register"]').click();
        const parent = await page.evaluate(() => window.mmdModokiE2e.getCameraExternalParent());
        await page.locator("#info-model-select").selectOption("0");
        await selectCenterBone(page);
        const parentCenter = await bonePosition("センター");
        await menu();
        await focusItem.click();
        closeVector(await page.evaluate(() => window.mmdModokiE2e.getCameraTarget()), parentCenter);
        expect(await page.evaluate(() => window.mmdModokiE2e.getCameraExternalParent())).toEqual(parent);
        const savedPose = await pose();
        await edit("mmd_select_timeline", { scope: { kind: "camera" } });
        await edit("mmd_register_keyframes", { scope: { kind: "camera" }, tracks: [{ category: "camera", name: "Camera" }], collision: "replace" });
        await roundTrip("focused-parent-camera.json");
        closeVector((await pose()).target, savedPose.target);
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});

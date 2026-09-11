import { test, expect } from "@playwright/test";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki } from "./electron-app.mjs";
import { enableMcpEditing } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const pbr of [false, true]) test(`MCP object preview, IK, accessory parent and persistence (${pbr ? "PBR" : "normal"})`, async () => {
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
        const query = async subject => (await rpc("mmd_get_object_state", { target: (await context()).target, subject })).structuredContent;
        const inspect = async kind => (await rpc("mmd_inspect", { target: (await context()).target, kind })).structuredContent.items;
        const select = scope => edit("mmd_select_timeline", { scope });
        const set = (subject, patch, dryRun = false) => edit("mmd_set_object_state", { subject, patch, mode: "preview", dryRun });
        const register = async (scope, category) => {
            const track = (await inspect("tracks")).find(item => item.category === category);
            expect(track).toBeTruthy();
            await edit("mmd_register_keyframes", { scope, tracks: [{ category: track.category, name: track.name }], collision: "replace" });
        };
        await complete({ kind: "materialMode", pbr });
        await page.evaluate(async path => { await window.mmdModokiE2e.loadModel(path); }, resolve(root, "test/fixtures/external-parent/body-source.pmx"));
        const model = (await context()).models[0];
        const modelSubject = { kind: "model", modelInstanceId: model.instanceId };
        const accessoryPath = resolve(root, "test/fixtures/accessory/simple-triangle.x");
        await page.evaluate(async path => { await window.mmdModokiE2e.loadAccessory(path); await window.mmdModokiE2e.loadAccessory(path); }, accessoryPath);
        const subject = { kind: "accessory", accessoryIndex: 0, expectedPath: accessoryPath };
        const scope = { kind: "accessory", accessoryIndex: 0 };
        const selectedBeforeQuery = (await context()).timelineScope;
        const modelState = (await query(modelSubject)).state;
        expect(modelState.ikStates.length).toBeGreaterThanOrEqual(2);
        expect((await context()).timelineScope).toEqual(selectedBeforeQuery);
        await select(scope);
        await edit("mmd_set_editor_options", { options: { kind: "autoKey", enabled: true, scope: "all" } });
        const beforeKeys = await inspect("keyframes");
        const original = (await query(subject)).state;
        const patch = { kind: "accessory", parent: { modelInstanceId: model.instanceId, boneName: "センター" },
            transform: { position: { x: 2, y: 3, z: 4 }, rotationDeg: { x: 10, y: 20, z: 30 }, scale: 1.5 }, visible: false, castsShadow: false };
        const dryRun = await set(subject, patch, true);
        expect(dryRun.data.status).toBe("validated");
        expect((await query(subject)).state).toEqual(original);
        const changed = await set(subject, patch);
        await expect(page.locator("#accessory-parent-model")).toHaveValue("0");
        await expect(page.locator("#accessory-parent-bone")).toHaveValue("センター");
        await expect(page.locator("#accessory-pos-x")).toHaveValue(/^2(?:\.0+)?$/);
        await expect(page.locator("#accessory-scale")).toHaveValue(/^1\.50*$/);
        await expect(page.locator("#chk-accessory-visibility")).not.toBeChecked();
        await expect(page.locator("#chk-accessory-shadow")).not.toBeChecked();
        expect(await inspect("keyframes")).toEqual(beforeKeys);
        expect((await query({ ...subject, accessoryIndex: 1 })).state).toEqual(original);
        await edit("mmd_undo", { editId: changed.data.editId });
        await expect(page.locator("#accessory-pos-x")).toHaveValue(/^0(?:\.0+)?$/);
        await edit("mmd_redo", { editId: changed.data.editId });
        await expect(page.locator("#accessory-pos-x")).toHaveValue(/^2(?:\.0+)?$/);
        // GUI changes to a field owned by the command must not be silently overwritten by Undo.
        await page.locator("#chk-accessory-shadow").check();
        const conflict = await request("mmd_undo", { editId: changed.data.editId });
        expect(conflict.response.isError).toBe(true);
        await expect(page.locator("#chk-accessory-shadow")).toBeChecked();
        await page.locator("#chk-accessory-shadow").uncheck();
        const invalid = await request("mmd_set_object_state", { subject, patch: { kind: "accessory", visible: true, parent: { modelInstanceId: model.instanceId, boneName: "missing" } }, mode: "preview" });
        expect(invalid.response.structuredContent.error.code).toBe("BONE_NOT_UNIQUE");
        await expect(page.locator("#chk-accessory-visibility")).not.toBeChecked();
        const wrongPath = await request("mmd_set_object_state", { subject: { ...subject, expectedPath: "wrong" }, patch: { kind: "accessory", visible: true }, mode: "preview" });
        expect(wrongPath.response.structuredContent.error.code).toBe("ASSET_CHANGED");
        await register(scope, "accessory");

        await select(modelSubject);
        const ikStates = modelState.ikStates.slice(0, 2).map(item => ({ ...item, enabled: !item.enabled }));
        const modelChanged = await set(modelSubject, { kind: "model", visible: false, castsShadow: false, ikStates });
        await expect(page.locator("#chk-model-visibility")).not.toBeChecked();
        await expect(page.locator("#chk-model-shadow")).not.toBeChecked();
        for (const ik of ikStates) await expect(page.locator(`[data-ik-bone-name="${ik.boneName}"]`)).toBeChecked({ checked: ik.enabled });
        await edit("mmd_undo", { editId: modelChanged.data.editId });
        await expect(page.locator("#chk-model-visibility")).toBeChecked();
        await edit("mmd_redo", { editId: modelChanged.data.editId });
        await register(modelSubject, "property");
        const property = (await inspect("keyframes")).find(item => item.category === "property" && item.frame === 0);
        expect(property.payload.visible).toBe(false);
        for (const ik of ikStates) expect(property.payload.ikStates).toContainEqual(ik);
        await edit("mmd_set_editor_options", { options: { kind: "physicsKeyInput", enabled: false } });
        await expect(page.locator(".timeline-edit-btn--physics-toggle")).toHaveAttribute("aria-pressed", "false");
        const bone = (await inspect("tracks")).find(item => item.payloadKind === "movableBone");
        await edit("mmd_register_keyframes", { scope: modelSubject, tracks: [{ category: bone.category, name: bone.name }], collision: "replace" });
        expect((await inspect("keyframes")).find(item => item.name === bone.name && item.frame === 0).payload.physicsToggles).toEqual([0]);
        for (const [id, value] of [["physics.floorCollision", false], ["viewport.physicsBones", true]]) {
            await edit("mmd_set_control", { control: { id, value } });
            const controls = (await rpc("mmd_list_controls", { target: (await context()).target, query: id })).structuredContent.items;
            expect(controls.find(item => item.id === id).value).toBe(value);
        }
        await page.locator('.app-menu-trigger[data-i18n="menu.physics"]').click();
        await expect(page.locator('[data-menu-command="physics.toggleFloorCollision"]')).toHaveAttribute("aria-checked", "false");
        await page.keyboard.press("Escape");
        await page.locator('.app-menu-trigger[data-i18n="menu.view"]').click();
        await expect(page.locator('[data-menu-command="view.togglePhysicsBones"]')).toHaveAttribute("aria-checked", "true");
        await page.keyboard.press("Escape");
        await complete({ kind: "materialMode", pbr: !pbr });
        await expect(page.locator("#chk-model-visibility")).not.toBeChecked();
        for (const ik of ikStates) await expect(page.locator(`[data-ik-bone-name="${ik.boneName}"]`)).toBeChecked({ checked: ik.enabled });
        await select(scope);
        await expect(page.locator("#accessory-pos-x")).toHaveValue(/^2(?:\.0+)?$/);
        await expect(page.locator("#accessory-parent-bone")).toHaveValue("センター");
        await complete({ kind: "materialMode", pbr });
        const filePath = join(launched.tempDir, "objects.mmdproj");
        await complete({ kind: "saveProject", filePath, overwrite: false });
        await complete({ kind: "loadProject", filePath });
        await page.locator('.app-menu-trigger[data-i18n="menu.physics"]').click();
        await expect(page.locator('[data-menu-command="physics.toggleFloorCollision"]')).toHaveAttribute("aria-checked", "false");
        await page.keyboard.press("Escape");
        await select(scope);
        await expect(page.locator("#accessory-parent-model")).toHaveValue("0");
        await expect(page.locator("#accessory-parent-bone")).toHaveValue("センター");
        await expect(page.locator("#accessory-pos-x")).toHaveValue(/^2(?:\.0+)?$/);
        await expect(page.locator("#chk-accessory-visibility")).not.toBeChecked();
        await expect(page.locator("#chk-accessory-shadow")).not.toBeChecked();
        await select(modelSubject);
        await expect(page.locator("#chk-model-visibility")).not.toBeChecked();
        await expect(page.locator("#chk-model-shadow")).not.toBeChecked();
        for (const ik of ikStates) await expect(page.locator(`[data-ik-bone-name="${ik.boneName}"]`)).toBeChecked({ checked: ik.enabled });
    } finally { await launched.close(); }
});

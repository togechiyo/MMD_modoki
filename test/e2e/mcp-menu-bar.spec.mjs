import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";
import { enableMcpEditing, settings, closeSettings } from "./mcp-client.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const backend of ["frameGraph", "classic"]) test(`MCP menu actions and settings (${backend})`, async ({}, testInfo) => {
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
        page.on("pageerror", error => errors.push(error.message));
        const rpc = await enableMcpEditing(page);
        const context = async () => (await rpc("mmd_get_context")).structuredContent;
        const request = async (tool, args) => {
            const current = await context();
            const input = { target: current.target, expectedEditRevision: current.editRevision, operationId: randomUUID(), ...args };
            return { input, response: await rpc(tool, input) };
        };
        const edit = async (tool, args) => {
            const result = await request(tool, args);
            expect(result.response.isError, JSON.stringify(result.response)).not.toBe(true);
            return { input: result.input, data: result.response.structuredContent };
        };
        const action = async value => edit("mmd_execute_menu_action", { scope: (await context()).timelineScope, action: value });
        const set = (id, value) => edit("mmd_set_control", { control: { id, value } });
        const controls = async query => (await rpc("mmd_list_controls", { target: (await context()).target, query })).structuredContent.items;
        const complete = async operation => {
            const job = await edit("mmd_start_ui_operation", { operation });
            let result;
            await expect.poll(async () => {
                result = (await rpc("mmd_get_operation", { target: job.input.target, operationId: job.input.operationId })).structuredContent;
                return result.status;
            }, { timeout: 60000 }).not.toBe("running");
            expect(result.status, JSON.stringify(result)).toBe("completed");
            return result.output;
        };
        const listing = (await rpc("mmd_list_menu_items", { target: (await context()).target })).structuredContent;
        const visible = await page.locator('#app-menu-bar [data-menu-command]:not([hidden])').evaluateAll(elements => [...new Set(elements.map(element => element.dataset.menuCommand))].sort());
        expect(listing.items.map(item => item.command).sort()).toEqual(visible);

        await set("viewport.backgroundMode", "black");
        await set("runtime.fpsLimit", 30);
        await page.locator('[data-i18n="menu.background"]').click();
        await expect(page.locator('[data-menu-command="background.toggleBlack"]')).toHaveAttribute("aria-checked", "true");
        await page.keyboard.press("Escape");
        await page.locator('[data-i18n="menu.view"]').click();
        await expect(page.locator('[data-menu-command="view.fps30"]')).toHaveAttribute("aria-checked", "true");
        await page.keyboard.press("Escape");
        await set("mirror.shape", "circle");
        await set("mirror.reflectance", 0.62);
        await set("mirror.size", 75);
        await set("mirror.height", 1.25);
        await set("mirror.resolution", 512);
        await set("mirror.enabled", true);
        await page.locator('[data-i18n="menu.view"]').click();
        await page.locator('[data-menu-command="view.mirrorFloorSettings"]').click();
        const mirror = page.locator('[data-popup-id="mirror-floor-settings"]');
        await expect(mirror.getByRole("combobox").first()).toHaveValue("circle");
        await expect(mirror.locator('input[type="range"]').first()).toHaveValue("62");
        await mirror.screenshot({ path: testInfo.outputPath("mirror-settings.png") });
        await mirror.locator(".app-menu-dialog-close").click();
        await set("mirror.enabled", false);
        const sky = { mode: "gradient", topColor: { r: 0.2, g: 0.3, b: 0.4 }, bottomColor: { r: 0.6, g: 0.5, b: 0.4 }, brightness: 1.25 };
        await set("viewport.skyStyle", sky);
        await set("physics.gravityAcceleration", 42);
        await set("physics.gravityDirection", { x: 0, y: -2, z: 1 });
        await set("render.coplanarCorrection", 2);
        await set("render.modelOrderMode", "mmd-fixed");
        const projectPath = resolve(launched.tempDir, "menu-settings.json");
        await complete({ kind: "saveProject", filePath: projectPath, overwrite: false });
        await set("viewport.skyStyle", { ...sky, brightness: 0.5 });
        await complete({ kind: "loadProject", filePath: projectPath });
        expect((await controls("viewport.skyStyle"))[0].value).toEqual(sky);
        expect((await controls("physics.gravityAcceleration"))[0].value).toBe(42);
        await action({ kind: "resetSky" });
        expect((await controls("viewport.skyStyle"))[0].value.mode).toBe("solid");

        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
        const models = (await context()).models;
        const rejected = await request("mmd_set_control", { control: { id: "render.modelOrderMode", value: "evaluated" } });
        expect(rejected.response.structuredContent.error.code).toBe("SETTING_UNAVAILABLE");
        await action({ kind: "moveModelRenderOrder", modelInstanceId: models[1].instanceId, direction: -1 });
        await page.locator('[data-i18n="menu.view"]').click();
        await page.locator('[data-menu-command="view.renderOrderSettings"]').click();
        await expect(page.locator("#mmd-render-order-mode")).toBeDisabled();
        await expect(page.locator(".render-order-row")).toHaveCount(2);
        await page.locator('[data-popup-id="render-order-settings"] .app-menu-dialog-close').click();

        const scope = { kind: "model", modelInstanceId: models[0].instanceId };
        await edit("mmd_select_timeline", { scope });
        await selectCenterBone(page);
        const track = { category: "root", name: "センター" };
        for (const frame of [0, 10]) {
            await edit("mmd_set_playback", { action: "seek", frame });
            await edit("mmd_register_keyframes", { scope, tracks: [track], collision: "replace" });
        }
        await action({ kind: "adjacentKey", direction: -1 });
        expect((await context()).frame).toBe(0);
        await action({ kind: "adjacentKey", direction: 1 });
        expect((await context()).frame).toBe(10);
        const selection = await action({ kind: "selectAllKeys", category: "bone" });
        expect(selection.data.control.selectedKeyCount).toBeGreaterThanOrEqual(2);
        const dryRun = await action({ kind: "clearModelMotion", modelInstanceId: scope.modelInstanceId });
        expect(dryRun.data.control).toMatchObject({ dryRun: true, wouldChange: true });
        const cleared = await action({ kind: "clearModelMotion", modelInstanceId: scope.modelInstanceId, dryRun: false });
        expect(cleared.data.editId).toMatch(/^ai:/);
        await page.locator('[data-i18n="menu.edit"]').click();
        await expect(page.locator('[data-menu-command="edit.clearModelMotion"]')).toBeDisabled();
        await page.keyboard.press("Escape");
        await edit("mmd_undo", { editId: cleared.data.editId });
        await edit("mmd_redo", { editId: cleared.data.editId });
        await edit("mmd_select_timeline", { scope: { kind: "model", modelInstanceId: models[1].instanceId } });
        const wrongUndo = await request("mmd_undo", { editId: cleared.data.editId });
        expect(wrongUndo.response.structuredContent.error.code).toBe("UNDO_CONFLICT");
        await edit("mmd_select_timeline", { scope });
        await edit("mmd_undo", { editId: cleared.data.editId });
        for (const view of ["front", "back", "left", "right", "top", "bottom"]) {
            const changed = await action({ kind: "cameraView", view });
            const pose = await page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose());
            expect(pose.rotation).toEqual(changed.data.control.camera.rotation);
            expect(changed.data.control.keyframesRegistered).toBe(false);
        }
        const newWindow = launched.app.waitForEvent("window");
        const output = await complete({ kind: "newProjectWindow" });
        expect(output).toMatchObject({ mcpEnabled: false });
        const child = await newWindow;
        await child.waitForFunction(() => Boolean(window.mmdModokiE2e));
        expect(await child.evaluate(() => window.electronAPI.automation.getState())).toMatchObject({ enabled: false });
        await child.close();

        const dialog = await settings(page);
        await dialog.getByLabel("AIからの編集も許可", { exact: true }).uncheck();
        await closeSettings(dialog);
        const readOnly = await rpc("mmd_list_menu_items", { target: (await context()).target, query: "正面" });
        expect(readOnly.isError).not.toBe(true);
        const denied = await request("mmd_execute_menu_action", { scope: (await context()).timelineScope, action: { kind: "cameraView", view: "front" } });
        expect(denied.response.structuredContent.error.code).toBe("READ_ONLY");
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});

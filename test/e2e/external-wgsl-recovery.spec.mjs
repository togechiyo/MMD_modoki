import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";
import { wgslFixtureEditor } from "./external-wgsl-fixture-editor.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test.setTimeout(150000);
for (const backend of ["classic", "frameGraph"]) test(`external WGSL ${backend}: timeout and native recovery`, async ({}, testInfo) => {
    const app = await launchMmdModoki(root);
    let recoveredBrowser;
    try {
        let page = await app.app.firstWindow();
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload();
        const ready = async () => {
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
            await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
        };
        await ready();
        await page.evaluate(file => window.mmdModokiE2e.loadModel(file), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
        let settings = page.locator('[data-popup-id="experimental-settings"]');
        let permission = settings.getByLabel("外部WGSL材質を有効にする", { exact: true });
        const openSettings = async () => {
            await page.locator('[data-i18n="menu.tools"]').click();
            await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        };
        const enable = async () => {
            await openSettings(); await permission.check(); await expect(permission).toBeEnabled({ timeout: 25000 });
            await settings.locator(".app-menu-dialog-close").click();
        };
        await enable();
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        const editor = wgslFixtureEditor(app.app, page, testInfo, root);
        await editor.load("moonstone-schiller");
        const before = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        const marker = resolve(app.tempDir, "user-data/external-wgsl-active");
        expect(existsSync(marker)).toBe(true);
        let alert = page.locator("#viewport-runtime-status-host [role=alert]");
        for (const boundary of ["getCompilationInfo", "popErrorScope"]) {
            await editor.importFile(resolve(root, "wgsl/prismatic-fire.wgsl"));
            // Fault injection at the native async boundary; never submit an infinite GPU loop.
            await page.evaluate(method => {
                const prototype = method === "getCompilationInfo" ? GPUShaderModule.prototype : GPUDevice.prototype;
                const original = prototype[method];
                const pending = [];
                prototype[method] = function (...args) {
                    // Pop the real scope even while simulating a response that never arrives.
                    const result = original.apply(this, args);
                    result.catch(() => undefined);
                    return new Promise(resolve => pending.push(() => resolve(method === "getCompilationInfo" ? { messages: [] } : null)));
                };
                window.finishWgslFault = () => { prototype[method] = original; pending.forEach(finish => finish()); };
            }, boundary);
            await page.locator("#btn-shader-apply-all").click();
            await expect(alert).toContainText("timed out", { timeout: 25000 });
            await expect(page.locator("#external-wgsl-load")).toBeHidden();
            await expect.poll(() => page.evaluate(() => window.electronAPI.wgslRecovery.state())).toEqual({ blocked: true });
            await page.evaluate(() => window.finishWgslFault());
            expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].materialShaders).toEqual(before.scene.models[0].materialShaders);
            await alert.locator(".viewport-runtime-status__action--quiet").click();
            await openSettings(); await expect(permission).not.toBeChecked();
            await expect(settings).toContainText("GPUの停止");
            await settings.locator(".app-menu-dialog-close").click();
            // Disabled assignments can still be saved, and explicit re-enable recompiles the original shader.
            await enable();
            await expect(alert).toHaveCount(0);
        }
        const projectPath = testInfo.outputPath("recovery.mmdproj");
        await app.app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, projectPath);
        await page.locator('[data-i18n="menu.file"]').click();
        await page.locator('[data-menu-command="file.saveProject"]').click();
        await expect.poll(() => existsSync(projectPath)).toBe(true);
        expect(JSON.parse(readFileSync(projectPath, "utf8")).externalEffects.length).toBeGreaterThan(0);
        // Native dialog runs in main even if renderer JS cannot answer. Only simulate the event, not a real hang.
        await app.app.evaluate(({ BrowserWindow, dialog }) => {
            dialog.showMessageBox = async (_window, options) => {
                globalThis.wgslRecoveryDialog = options;
                return { response: 1, checkboxChecked: false };
            };
            BrowserWindow.getAllWindows()[0].emit("unresponsive");
        });
        await expect(alert).toContainText("無効");
        const native = await app.app.evaluate(() => globalThis.wgslRecoveryDialog);
        expect(native.buttons[0]).toMatch(/WGSL/);
        expect(native.detail).toMatch(/未保存|unsaved/);
        expect(native.defaultId).toBe(1);
        // Exercise the reload action through the main handler. This intentionally replaces the renderer process.
        const reloadResult = await app.app.evaluate(async ({ BrowserWindow, dialog }) => {
            const events = [];
            dialog.showMessageBox = async () => { events.push("dialog"); return { response: 0, checkboxChecked: false }; };
            const window = BrowserWindow.getAllWindows()[0];
            for (const event of ["render-process-gone", "did-start-loading", "did-stop-loading", "did-fail-load"]) window.webContents.on(event, () => events.push(event));
            return await new Promise(resolve => {
                const timer = setTimeout(() => resolve({ loaded: false, events, crashed: window.webContents.isCrashed(), loading: window.webContents.isLoading() }), 15000);
                window.webContents.once("did-finish-load", () => { clearTimeout(timer); resolve({ loaded: true }); });
                window.emit("unresponsive");
            });
        });
        expect(reloadResult).toEqual({ loaded: true });
        // Playwright retains its crashed execution context. Reconnect to the recovered GUI without another reload.
        const port = readFileSync(resolve(app.tempDir, "user-data/DevToolsActivePort"), "utf8").split(/\r?\n/)[0];
        recoveredBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        page = recoveredBrowser.contexts()[0].pages().find(candidate => candidate.url().includes("e2e=1"));
        expect(page).toBeTruthy();
        page.on("pageerror", error => errors.push(error.message));
        settings = page.locator('[data-popup-id="experimental-settings"]');
        permission = settings.getByLabel("外部WGSL材質を有効にする", { exact: true });
        alert = page.locator("#viewport-runtime-status-host [role=alert]");
        await ready();
        await expect(alert).toContainText("無効");
        await alert.locator(".viewport-runtime-status__action--quiet").click();
        await app.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, projectPath);
        await page.locator('[data-i18n="menu.file"]').click();
        await page.locator('[data-menu-command="file.loadProject"]').click();
        await expect.poll(async () => (await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models.length).toBe(1);
        await openSettings(); await expect(permission).not.toBeChecked();
        await settings.locator(".app-menu-dialog-close").click();
        expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].materialShaders).toEqual(before.scene.models[0].materialShaders);
        await page.screenshot({ path: testInfo.outputPath("wgsl-recovery.png") });
        await enable();
        expect(await page.evaluate(() => window.electronAPI.wgslRecovery.state())).toEqual({ blocked: false });
        expect(errors).toEqual([]);
    } finally { await recoveredBrowser?.close(); await app.close(); }
});

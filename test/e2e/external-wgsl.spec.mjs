import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";
import { editWgslParameter, wgslFixtureEditor } from "./external-wgsl-fixture-editor.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test.setTimeout(150000);
for (const backend of ["classic", "frameGraph"]) test(`external WGSL ${backend}: shared preset list, buttons, errors and project`, async ({}, testInfo) => {
    const app = await launchMmdModoki(root);
    try {
        const page = await app.app.firstWindow();
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
        const openSettings = async () => {
            await page.locator('[data-i18n="menu.tools"]').click();
            await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        };
        const dialog = page.locator('[data-popup-id="experimental-settings"]');
        const permission = dialog.getByLabel("外部WGSL材質を有効にする", { exact: true });
        await openSettings(); await permission.check(); await expect(permission).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        const editor = wgslFixtureEditor(app.app, page, testInfo, root);
        const folder = testInfo.outputPath("effect");
        cpSync(resolve(root, "docs/examples/external-material-effect-v1"), folder, { recursive: true });
        const sourcePath = resolve(folder, "effect.wgsl");
        const originalSource = readFileSync(sourcePath, "utf8");
        const select = page.locator("#shader-preset-select");
        const state = async () => {
            let snapshot;
            await expect.poll(async () => {
                try { snapshot = await page.evaluate(() => window.mmdModokiE2e.exportProjectState()); return true; }
                catch (error) { if (!String(error).includes("Wait for WGSL compilation")) throw error; return false; }
            }).toBe(true);
            return snapshot;
        };
        const externalCount = async () => (await state()).scene.models[0]?.materialShaders?.filter(item => item.externalEffect).length ?? 0;
        const id = await editor.importFile(sourcePath);
        expect(id).toMatch(/^external-effect::/);
        await expect(select.locator("option:checked")).toContainText("タイムライン連動の色調整");
        await expect(page.locator("#external-wgsl-panel, [data-wgsl-parameter], [data-wgsl-color], [data-wgsl-range]")).toHaveCount(0);
        await expect(page.locator('[id^="external-wgsl-"]')).toHaveCount(1);
        expect(await externalCount()).toBe(0);
        await editor.apply();
        await page.locator(".shader-material-item").first().click();
        await expect(select).toHaveValue(id);
        const saved = await state(); expect(await externalCount()).toBe(2);

        const errorHost = page.locator("#viewport-runtime-status-host");
        const errorCard = errorHost.getByRole("alert");
        writeFileSync(sourcePath, originalSource.replace("return surface.color * gain;", "return missingValue;"));
        expect(await editor.importFile(sourcePath)).toBe(id);
        await page.locator("#btn-shader-apply-selected").click();
        await expect(errorCard).toBeVisible({ timeout: 25000 });
        await expect(errorCard).toContainText("missingValue");
        expect((await state()).scene.models[0].materialShaders).toEqual(saved.scene.models[0].materialShaders);
        await page.screenshot({ path: testInfo.outputPath("wgsl-compile-error-overlay.png") });
        await errorCard.locator(".viewport-runtime-status__action--quiet").click();
        writeFileSync(sourcePath, originalSource + "\nvar<uniform> forbidden: f32;");
        await editor.importFile(sourcePath);
        await expect(errorCard).toContainText("effect.wgsl");
        await errorCard.locator(".viewport-runtime-status__action--quiet").click();
        writeFileSync(sourcePath, "/* @modoki\n{broken}\n*/\n");
        await editor.importFile(sourcePath);
        await expect(errorCard).toContainText("metadata JSON");
        expect((await state()).scene.models[0].materialShaders).toEqual(saved.scene.models[0].materialShaders);
        await errorCard.locator(".viewport-runtime-status__action--quiet").click();
        const oldPath = resolve(folder, "effect.modoki.json");
        writeFileSync(oldPath, "{}");
        await editor.importFile(oldPath);
        await expect(errorCard).toContainText("JSON import is no longer supported");
        await errorCard.locator(".viewport-runtime-status__action--quiet").click();
        writeFileSync(sourcePath, originalSource);
        await editor.importFile(sourcePath); await editor.apply(false);
        await expect(select.locator('option[value^="external-effect::"]')).toHaveCount(1);

        editWgslParameter(sourcePath, "Strength", 0.7);
        await editor.importFile(sourcePath); await editor.apply(false);
        expect((await state()).scene.models[0].materialShaders.some(item => item.externalEffect?.parameters.Strength === 0.7)).toBe(true);
        await select.selectOption("wgsl-mmd-standard"); await page.locator("#btn-shader-apply-selected").click();
        await expect.poll(externalCount).toBe(1);
        await expect(page.locator(".shader-material-item.active .shader-material-preset")).not.toContainText("WGSL:");
        await page.keyboard.press("Control+Z"); await expect.poll(externalCount).toBe(2);
        await expect(select).toHaveValue(id);

        await app.app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); });
        await page.locator("#external-wgsl-load").click();
        await expect(page.locator("#external-wgsl-load")).toBeEnabled(); await expect(errorHost).toBeHidden();
        const projectPath = testInfo.outputPath("wgsl.mmdproj");
        await app.app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, projectPath);
        await page.locator('[data-i18n="menu.file"]').click(); await page.locator('[data-menu-command="file.saveProject"]').click();
        await expect.poll(() => { try { return JSON.parse(readFileSync(projectPath, "utf8")).externalEffects?.length; } catch { return 0; } }).toBe(2);
        expect(JSON.parse(readFileSync(projectPath, "utf8")).externalEffects[0].path).toContain(".assets/effects/");
        await openSettings(); await permission.uncheck(); await expect(permission).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await expect(page.locator("#external-wgsl-load")).toBeHidden();
        await expect(page.locator("#btn-shader-apply-selected")).toBeDisabled();
        await select.selectOption("wgsl-mmd-standard"); await page.locator("#btn-shader-apply-all").click();
        await expect.poll(externalCount).toBe(0);
        // Rebuild from project assets without session imports or the author's original file.
        unlinkSync(sourcePath);
        await page.reload(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
        await app.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, projectPath);
        await page.locator('[data-i18n="menu.file"]').click(); await page.locator('[data-menu-command="file.loadProject"]').click();
        await expect.poll(externalCount).toBe(2);
        if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        await openSettings(); await permission.check(); await expect(permission).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await expect(select.locator('option[value^="external-effect::"]')).not.toHaveCount(0);
        expect((await state()).scene.models[0].materialShaders.some(item => item.externalEffect?.parameters.Strength === 0.7)).toBe(true);
        await openSettings(); await dialog.getByLabel("PBRモード", { exact: true }).check();
        await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled({ timeout: 25000 });
        expect((await state()).scene.models[0].materialShaders.every(item => !item.externalEffect)).toBe(true);
        await dialog.locator(".app-menu-dialog-close").click();
        await expect(select.locator('option[value^="external-effect::"]')).toHaveCount(0);
        await expect(page.locator("#external-wgsl-load")).toBeDisabled();
        await openSettings(); await dialog.getByLabel("PBRモード", { exact: true }).uncheck();
        await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled({ timeout: 25000 });
        await dialog.locator(".app-menu-dialog-close").click(); await expect.poll(externalCount).toBe(2);
        const capture = testInfo.outputPath("capture"); mkdirSync(capture, { recursive: true });
        await page.evaluate(folder => window.mmdModokiE2e.captureSinglePngSurfaceToPath(folder, 640, 360), capture);
        expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).messages).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath("external-wgsl-shared-list.png") });
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
        expect(((await state()).scene.models[1].materialShaders ?? []).some(item => item.externalEffect)).toBe(false);
        expect(errors).toEqual([]);
    } finally { await app.close(); }
});

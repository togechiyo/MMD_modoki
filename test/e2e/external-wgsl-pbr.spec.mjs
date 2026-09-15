import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";
import { wgslFixtureEditor } from "./external-wgsl-fixture-editor.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test.setTimeout(180000);
for (const backend of ["classic", "frameGraph"]) test(`PBR external WGSL ${backend}: surface, gems, rollback and mode-aware undo`, async ({}, testInfo) => {
    const app = await launchMmdModoki(root);
    try {
        const page = await app.app.firstWindow();
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
        await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0.4, y: 2, z: -7 }, { x: 0, y: 1.5, z: 0 }));
        const dialog = page.locator('[data-popup-id="experimental-settings"]');
        const open = async () => {
            await page.locator('[data-i18n="menu.window"]').click();
            await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        };
        const mode = async enabled => {
            await open(); const pbr = dialog.getByLabel("PBRモード", { exact: true });
            await pbr.setChecked(enabled); await expect(pbr).toBeEnabled({ timeout: 25000 });
            await dialog.locator(".app-menu-dialog-close").click();
        };
        await mode(true); await open();
        const permission = dialog.getByLabel("外部WGSL材質を有効にする", { exact: true });
        await permission.check(); await expect(permission).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        const select = page.locator("#shader-preset-select");
        await select.selectOption("pbr-base"); await page.locator("#btn-shader-apply-all").click();
        const editor = wgslFixtureEditor(app.app, page, testInfo, root);
        const state = async () => {
            let snapshot;
            await expect.poll(async () => {
                try { snapshot = await page.evaluate(() => window.mmdModokiE2e.exportProjectState()); return true; }
                catch (error) { if (!String(error).includes("Wait for WGSL compilation")) throw error; return false; }
            }).toBe(true);
            return snapshot;
        };
        const count = async () => (await state()).scene.models[0].materialShaders?.filter(item => item.externalEffect).length ?? 0;
        const capture = async label => {
            const folder = testInfo.outputPath(label); mkdirSync(folder, { recursive: true });
            return (await page.evaluate(folder => window.mmdModokiE2e.captureSinglePngSurfaceToPath(folder, 640, 360), folder)).path;
        };
        const changed = async (before, after) => app.app.evaluate(({ nativeImage }, paths) => {
            const a = nativeImage.createFromPath(paths[0]).toBitmap(); const b = nativeImage.createFromPath(paths[1]).toBitmap();
            if (!a.length || a.length !== b.length) throw new Error("Invalid captures");
            let count = 0;
            for (let i = 0; i < a.length; i += 4) if (Math.max(...[0, 1, 2].map(c => Math.abs(a[i + c] - b[i + c]))) > 8) count++;
            return count;
        }, [before, after]);
        const baseline = await capture("pbr-original");
        await editor.load("template");
        expect(await changed(baseline, await capture("pbr-identity"))).toBeLessThan(100);
        for (const name of ["moonstone-schiller", "black-opal", "prismatic-fire", "aurora-opal"]) {
            await editor.load(name);
            expect(await changed(baseline, await capture(name))).toBeGreaterThan(1000);
        }
        // Verify a surface hook, Geometry DIFFUSE, and finalColor in the same PBR shader.
        const file = testInfo.outputPath("surface.wgsl");
        const source = `/* @modoki
{"apiVersion":1,"kind":"mmd-material","name":"PBR Surface Test","hooks":{"surface":"surfaceTest","finalColor":"finishTest"},"inputs":{"Tint":{"type":"vec4f","semantic":"DIFFUSE","annotations":{"Object":"Geometry"}}}}
*/
fn surfaceTest(s: ModokiSurface) -> ModokiSurfaceOutput {
    return ModokiSurfaceOutput(vec3f(0.05, 0.9, 0.15), vec3f(1.0), normalize(s.normalWS + vec3f(0.3, 0.0, 0.0)));
}
fn finishTest(s: ModokiFinalColor) -> vec3f { return s.color * (vec3f(0.8) + modokiInputs.Tint.rgb * 0.2); }
`;
        writeFileSync(file, source); await editor.importFile(file); await editor.apply();
        expect(await changed(baseline, await capture("surface-and-final"))).toBeGreaterThan(1000);
        const beforeFailure = (await state()).scene.models[0].materialShaders;
        writeFileSync(file, source.replace("return s.color", "return missingColor"));
        await editor.importFile(file); await page.locator("#btn-shader-apply-all").click();
        const alert = page.locator("#viewport-runtime-status-host [role=alert]");
        await expect(alert).toContainText("missingColor", { timeout: 25000 });
        expect((await state()).scene.models[0].materialShaders).toEqual(beforeFailure);
        await alert.locator(".viewport-runtime-status__action--quiet").click();
        await editor.importFile(resolve(root, "wgsl/mme-light-material.wgsl"));
        await page.locator("#btn-shader-apply-all").click();
        await expect(alert).toContainText("PBR does not support Phong input");
        expect((await state()).scene.models[0].materialShaders).toEqual(beforeFailure);
        await alert.locator(".viewport-runtime-status__action--quiet").click();
        // PBR history must update its bank while MMD is displayed, then restore on return.
        await mode(false); expect(await count()).toBe(0);
        await page.keyboard.press("Control+z");
        await mode(true); await expect.poll(count).toBe(2);
        expect((await state()).scene.models[0].materialShaders).not.toEqual(beforeFailure);
        await mode(false); await page.keyboard.press("Control+y");
        await mode(true); await expect.poll(count).toBe(2);
        expect((await state()).scene.models[0].materialShaders).toEqual(beforeFailure);
        // Built-in selection clears the overlay; undo brings the external assignment back.
        await select.selectOption("pbr-base"); await page.locator("#btn-shader-apply-all").click();
        await expect.poll(count).toBe(0);
        await page.keyboard.press("Control+z"); await expect.poll(count).toBe(2);
        const saved = await state();
        await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
        await expect.poll(count).toBe(2);
        await page.screenshot({ path: testInfo.outputPath("pbr-external-wgsl.png") });
        expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).messages).toEqual([]);
        expect(errors).toEqual([]);
    } finally { await app.close(); }
});

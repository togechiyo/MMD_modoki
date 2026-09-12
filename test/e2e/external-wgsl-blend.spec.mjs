import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { editWgslParameter, wgslFixtureEditor } from "./external-wgsl-fixture-editor.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test.setTimeout(150000);

async function difference(app, first, second) {
    return app.evaluate(({ nativeImage }, paths) => {
        const a = nativeImage.createFromPath(paths[0]).toBitmap();
        const b = nativeImage.createFromPath(paths[1]).toBitmap();
        if (!a.length || a.length !== b.length) throw new Error("Capture dimensions differ or PNG is empty");
        let changed = 0;
        for (let i = 0; i < a.length; i += 4) {
            if (Math.max(...[0, 1, 2].map(c => Math.abs(a[i + c] - b[i + c]))) > 5) changed++;
        }
        return changed;
    }, [first, second]);
}

for (const backend of ["classic", "frameGraph"]) test(`WGSL blend modes ${backend}: original colour, neutral layers and distinct modes`, async ({}, testInfo) => {
    const app = await launchMmdModoki(root);
    try {
        const page = await app.app.firstWindow();
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
        await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0.4, y: 2, z: -7 }, { x: 0, y: 1.5, z: 0 }));
        await page.locator('[data-i18n="menu.tools"]').click();
        await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        const dialog = page.locator('[data-popup-id="experimental-settings"]');
        await dialog.getByLabel("外部WGSL材質を有効にする", { exact: true }).check();
        await expect(dialog.getByLabel("外部WGSL材質を有効にする", { exact: true })).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        const capture = async name => {
            const folder = testInfo.outputPath(name); mkdirSync(folder, { recursive: true });
            const result = await page.evaluate(folder => window.mmdModokiE2e.captureSinglePngSurfaceToPath(folder, 640, 360), folder);
            await testInfo.attach(name, { path: result.path, contentType: "image/png" });
            return result.path;
        };
        const original = await capture("original");
        const editor = wgslFixtureEditor(app.app, page, testInfo, root);
        await editor.load("blend-modes");
        const file = testInfo.outputPath("shaders", "blend-modes.wgsl");
        const setLayer = async (mode, color, opacity) => {
            editWgslParameter(file, "BlendMode", mode);
            editWgslParameter(file, "LayerColor", color);
            editWgslParameter(file, "Opacity", opacity);
            await editor.importFile(file); await editor.apply();
        };
        const results = [];
        const names = ["normal", "add", "multiply", "screen", "overlay"];
        const neutral = [null, [0, 0, 0], [1, 1, 1], [0, 0, 0], [0.5, 0.5, 0.5]];
        for (let mode = 0; mode < names.length; mode++) {
            await setLayer(mode, [0.75, 0.2, 0.4], 0);
            expect(await difference(app.app, original, await capture(`${names[mode]}-zero`))).toBeLessThan(50);
            await setLayer(mode, [0.75, 0.2, 0.4], 0.65);
            const image = await capture(names[mode]); results.push(image);
            expect(await difference(app.app, original, image)).toBeGreaterThan(500);
            if (neutral[mode]) {
                await setLayer(mode, neutral[mode], 1);
                expect(await difference(app.app, original, await capture(`${names[mode]}-neutral`))).toBeLessThan(50);
            }
        }
        for (let i = 0; i < results.length; i++) for (let j = i + 1; j < results.length; j++) {
            expect(await difference(app.app, results[i], results[j])).toBeGreaterThan(100);
        }
        expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).messages).toEqual([]);
        expect(errors).toEqual([]);
    } finally { await app.close(); }
});

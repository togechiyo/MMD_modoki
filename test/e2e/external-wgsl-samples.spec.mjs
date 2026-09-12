import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";
import { wgslFixtureEditor } from "./external-wgsl-fixture-editor.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test.setTimeout(120000);

// Compare decoded RGB, not PNG metadata or timestamps. Captures use a static fixture.
async function changedPixels(app, before, after) {
    return app.evaluate(({ nativeImage }, paths) => {
        const a = nativeImage.createFromPath(paths[0]).toBitmap();
        const b = nativeImage.createFromPath(paths[1]).toBitmap();
        if (a.length !== b.length || !a.length) throw new Error("Capture dimensions differ or PNG is empty");
        let changed = 0;
        for (let i = 0; i < a.length; i += 4) {
            if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 8) changed++;
        }
        return changed;
    }, [before, after]);
}

for (const backend of ["classic", "frameGraph"]) test(`WGSL samples ${backend}: compile packages and render animated and angular gems`, async ({}, testInfo) => {
    const app = await launchMmdModoki(root);
    try {
        const page = await app.app.firstWindow();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
        await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0.4, y: 2, z: -7 }, { x: 0, y: 1.5, z: 0 }));
        await page.locator('[data-i18n="menu.tools"]').click();
        await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        const dialog = page.locator('[data-popup-id="experimental-settings"]');
        const permission = dialog.getByLabel("外部WGSL材質を有効にする", { exact: true });
        await permission.check(); await expect(permission).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        await page.locator(".shader-material-item").first().click();
        const capture = async label => {
            const folder = testInfo.outputPath(label); mkdirSync(folder, { recursive: true });
            const result = await page.evaluate(folder => window.mmdModokiE2e.captureSinglePngSurfaceToPath(folder, 960, 640), folder);
            await testInfo.attach(label, { path: result.path, contentType: "image/png" });
            return result.path;
        };
        const original = await capture("original");
        const standardRowHeight = await page.locator(".shader-material-item").first().evaluate(element => element.getBoundingClientRect().height);
        const angularSamples = ["moonstone-schiller", "black-opal", "prismatic-fire"];
        const editor = wgslFixtureEditor(app.app, page, testInfo, root);
        for (const sample of ["template", "soft-pastel", ...angularSamples, "aurora-opal"]) {
            await editor.load(sample);
            const layout = await page.locator(".shader-material-item").first().evaluate(element => {
                const name = element.querySelector(".shader-material-name").getBoundingClientRect();
                const preset = element.querySelector(".shader-material-preset").getBoundingClientRect();
                return { height: element.getBoundingClientRect().height, nameWidth: name.width,
                    alignment: Math.abs(name.y + name.height / 2 - preset.y - preset.height / 2) };
            });
            expect(Math.abs(layout.height - standardRowHeight)).toBeLessThan(1);
            expect(layout.alignment).toBeLessThan(1);
            expect(layout.nameWidth).toBeGreaterThan(20);
            const image = await capture(sample);
            if (sample === "prismatic-fire") {
                const panel = page.locator('[data-effect-tab-view="materials"]');
                await expect(page.locator('[id^="external-wgsl-"]')).toHaveCount(1);
                await expect(page.locator('[data-wgsl-parameter]')).toHaveCount(0);
                await expect(page.locator(".shader-material-list")).toBeVisible();
                expect(await page.locator(".shader-material-name").first().evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(20);
                const bounds = await panel.evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth, height: element.getBoundingClientRect().height }));
                expect(bounds.content).toBeLessThanOrEqual(bounds.width + 1);
                await page.screenshot({ path: testInfo.outputPath("prismatic-shared-panel.png") });
                const area = await panel.boundingBox();
                const lastRow = await page.locator(".shader-material-item").last().boundingBox();
                await page.screenshot({ path: testInfo.outputPath("prismatic-controls.png"), clip: { ...area, height: lastRow.y + lastRow.height - area.y + 8 } });
            }
            if (sample === "template") expect(await changedPixels(app.app, original, image)).toBeLessThan(100);
            else expect(await changedPixels(app.app, original, image)).toBeGreaterThan(1000);
            if (angularSamples.includes(sample)) {
                const frame = page.locator("#viewport-seek-current-frame");
                await frame.fill("90"); await frame.press("Enter");
                const repeat = await capture(`${sample}-frame90`);
                // Test time in isolation before moving the camera for visual inspection.
                // setCameraPose preserves the editor's rotation state; it is not an exact restore.
                expect(await changedPixels(app.app, image, repeat)).toBeLessThan(100);
                await frame.fill("0"); await frame.press("Enter");
                const parameter = { "moonstone-schiller": "SheenStrength", "black-opal": "ColorStrength", "prismatic-fire": "FireStrength" }[sample];
                const defaultStrength = editor.parameterValue(parameter);
                await editor.parameter(parameter, 0);
                const without = await capture(`${sample}-feature-zero-selected`);
                expect(await changedPixels(app.app, image, without)).toBeGreaterThan(100);
                await editor.parameter(parameter, defaultStrength);
                await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 2.4, y: 2.5, z: -6.5 }, { x: 0, y: 1.5, z: 0 }));
                await capture(`${sample}-side`);
                await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0.4, y: 2, z: -7 }, { x: 0, y: 1.5, z: 0 }));
            }
        }
        const frame0 = await capture("opal-frame-0");
        const frameInput = page.locator("#viewport-seek-current-frame");
        await frameInput.fill("90"); await frameInput.press("Enter");
        await expect(frameInput).toHaveValue("90");
        const frame90 = await capture("opal-frame-90");
        expect(await changedPixels(app.app, frame0, frame90)).toBeGreaterThan(1000);
        await frameInput.fill("0"); await frameInput.press("Enter");
        const frame0Again = await capture("opal-frame-0-repeat");
        expect(await changedPixels(app.app, frame0, frame0Again)).toBeLessThan(100);
        await editor.parameter("Coating", 0);
        const reduced = await capture("opal-coating-zero-selected");
        expect(await changedPixels(app.app, frame0, reduced)).toBeGreaterThan(1000);
        expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).messages).toEqual([]);
        expect(errors).toEqual([]);
    } finally { await app.close(); }
});

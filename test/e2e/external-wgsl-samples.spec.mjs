import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";

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
        const angularSamples = ["moonstone-schiller", "black-opal", "prismatic-fire"];
        for (const sample of ["template", "soft-pastel", ...angularSamples, "aurora-opal"]) {
            await app.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, resolve(root, "wgsl", sample, "effect.modoki.json"));
            await page.locator("#external-wgsl-load").click();
            await expect(page.locator("#external-wgsl-status")).toContainText("読込済み");
            await page.locator("#external-wgsl-apply-all").click();
            await expect(page.locator("#external-wgsl-apply-all")).toBeEnabled({ timeout: 25000 });
            await expect(page.locator("#external-wgsl-diagnostic")).not.toContainText("操作に失敗");
            await expect(page.locator("#external-wgsl-status")).toHaveAttribute("data-state", "ready");
            const image = await capture(sample);
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
                const control = page.locator(`[data-wgsl-parameter="${parameter}"]`);
                const defaultStrength = await control.inputValue();
                await control.fill("0"); await control.press("Tab");
                await expect(page.locator("#external-wgsl-load")).toBeEnabled();
                const without = await capture(`${sample}-feature-zero-selected`);
                expect(await changedPixels(app.app, image, without)).toBeGreaterThan(100);
                await control.fill(defaultStrength); await control.press("Tab");
                await expect(page.locator("#external-wgsl-load")).toBeEnabled();
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
        await page.locator('[data-wgsl-parameter="Coating"]').fill("0");
        await page.locator('[data-wgsl-parameter="Coating"]').press("Tab");
        await expect(page.locator("#external-wgsl-load")).toBeEnabled();
        const reduced = await capture("opal-coating-zero-selected");
        expect(await changedPixels(app.app, frame0, reduced)).toBeGreaterThan(1000);
        expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).messages).toEqual([]);
        expect(errors).toEqual([]);
    } finally { await app.close(); }
});

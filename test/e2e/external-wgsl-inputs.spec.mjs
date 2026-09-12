import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test.setTimeout(120000);

async function changedPixels(app, paths) {
    return app.evaluate(({ nativeImage }, paths) => {
        const a = nativeImage.createFromPath(paths[0]).toBitmap();
        const b = nativeImage.createFromPath(paths[1]).toBitmap();
        if (!a.length || a.length !== b.length) throw new Error("Image dimensions differ or capture is empty");
        let count = 0;
        for (let i = 0; i < a.length; i += 4) {
            if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 8) count++;
        }
        return count;
    }, paths);
}

async function screenGridSpacing(app, path) {
    return app.evaluate(({ nativeImage }, path) => {
        const image = nativeImage.createFromPath(path);
        const { width, height } = image.getSize();
        const pixels = image.toBitmap();
        const gaps = [];
        // The fixture's central material is cyan with orange vertical grid lines.
        // Sample several rows, skipping horizontal lines and silhouette boundaries.
        for (let y = Math.floor(height * 0.4); y < height * 0.5; y++) {
            const centres = [];
            let start = -1;
            for (let x = Math.floor(width * 0.4); x < width * 0.6; x++) {
                const offset = (y * width + x) * 4;
                const orange = pixels[offset + 2] > 25;
                if (orange && start < 0) start = x;
                if (!orange && start >= 0) {
                    if (x - start <= 5) centres.push((start + x - 1) / 2);
                    start = -1;
                }
            }
            if (centres.length >= 3) for (let i = 1; i < centres.length; i++) gaps.push(centres[i] - centres[i - 1]);
        }
        if (!gaps.length) throw new Error("No measurable screen grid in capture");
        gaps.sort((a, b) => a - b);
        return gaps[Math.floor(gaps.length / 2)];
    }, path);
}

for (const backend of ["classic", "frameGraph"]) test(`MME-style WGSL inputs ${backend}: live light, projected grid and clocks`, async ({}, testInfo) => {
    const app = await launchMmdModoki(root);
    try {
        const page = await app.app.firstWindow();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") console.log(message.text().slice(0, 1000)); });
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
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
        const load = async name => {
            await app.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, resolve(root, "wgsl", name, "effect.modoki.json"));
            await page.locator("#external-wgsl-load").click();
            await expect(page.locator("#external-wgsl-status")).toContainText("読込済み");
            await page.locator("#external-wgsl-apply-all").click();
            await expect(page.locator("#external-wgsl-apply-all")).toBeEnabled({ timeout: 25000 });
            await expect(page.locator("#external-wgsl-diagnostic")).not.toContainText("操作に失敗");
            await expect(page.locator("#external-wgsl-status")).toHaveAttribute("data-state", "ready");
        };
        const parameter = async (name, value) => {
            const control = page.locator(`[data-wgsl-parameter="${name}"]`);
            await control.fill(String(value)); await control.press("Enter");
            await expect(page.locator("#external-wgsl-load")).toBeEnabled();
        };
        const frame = async value => {
            const control = page.locator("#viewport-seek-current-frame");
            await control.fill(String(value)); await control.press("Enter");
            await expect(control).toHaveValue(String(value));
        };
        const capture = async (name, width = 960, height = 640) => {
            const folder = testInfo.outputPath(name); mkdirSync(folder, { recursive: true });
            const result = await page.evaluate(({ folder, width, height }) => window.mmdModokiE2e.captureSinglePngSurfaceToPath(folder, width, height), { folder, width, height });
            expect(result).toMatchObject({ width, height, surfaceReleased: true });
            await testInfo.attach(name, { path: result.path, contentType: "image/png" });
            return result.path;
        };

        await load("mme-light-material");
        const lighting = await capture("lighting");
        const modelSelection = await page.locator("#info-model-select").inputValue();
        const previousDirectionX = await page.locator("#light-direction-x").inputValue();
        // Lighting controls are visible in the camera layout, not the model layout.
        await page.locator("#info-model-select").selectOption("__camera__");
        await page.locator("#light-direction-x + .range-number-input").fill("-0.7");
        await page.locator("#light-direction-x + .range-number-input").press("Enter");
        await expect(page.locator("#light-direction-x")).not.toHaveValue(previousDirectionX);
        await page.locator("#info-model-select").selectOption(modelSelection);
        expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models).toHaveLength(1);
        // Reopen materials after changing the editor layout; clicking an active row deselects it.
        if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        if (!(await page.locator(".shader-material-item").first().getAttribute("class"))?.split(" ").includes("active")) await page.locator(".shader-material-item").first().click();
        await expect(page.locator("#external-wgsl-status")).toHaveAttribute("data-state", "ready");
        const rotatedLight = await capture("light-direction-changed");
        expect(await changedPixels(app.app, [lighting, rotatedLight])).toBeGreaterThan(500);
        await parameter("DisplayMode", 1);
        const material = await capture("material-diffuse");
        await parameter("DisplayMode", 2);
        const light = await capture("light-diffuse");
        expect(await changedPixels(app.app, [material, light])).toBeGreaterThan(500);
        await page.locator("#info-model-select").selectOption("__camera__");
        await page.locator("#light-color-r + .range-number-input").fill("0");
        await page.locator("#light-color-r + .range-number-input").press("Enter");
        await expect(page.locator("#light-color-r")).toHaveValue("0");
        await page.locator("#info-model-select").selectOption(modelSelection);
        if (await page.locator("#btn-toggle-shader-panel").getAttribute("aria-pressed") !== "true") await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        if (!(await page.locator(".shader-material-item").first().getAttribute("class"))?.split(" ").includes("active")) await page.locator(".shader-material-item").first().click();
        const colouredLight = await capture("light-diffuse-red-zero");
        expect(await changedPixels(app.app, [light, colouredLight])).toBeGreaterThan(500);

        await load("mme-space-grid");
        await capture("grid-comparison");
        await parameter("DisplayMode", 0);
        const objectGrid = await capture("grid-object");
        await parameter("DisplayMode", 1);
        const screenGrid = await capture("grid-screen");
        expect(await changedPixels(app.app, [objectGrid, screenGrid])).toBeGreaterThan(500);
        const smallGrid = await capture("grid-screen-640", 640, 360);
        for (const path of [screenGrid, smallGrid]) {
            const spacing = await screenGridSpacing(app.app, path);
            expect(spacing).toBeGreaterThanOrEqual(31);
            expect(spacing).toBeLessThanOrEqual(33);
        }

        await load("mme-time-scan");
        const zero = await capture("timeline-zero");
        await frame(15);
        const halfSecond = await capture("timeline-half-second");
        expect(await changedPixels(app.app, [zero, halfSecond])).toBeGreaterThan(500);
        await frame(0);
        const zeroAgain = await capture("timeline-zero-repeat");
        expect(await changedPixels(app.app, [zero, zeroAgain])).toBeLessThan(100);
        await parameter("Clock", 1);
        const liveExport = await capture("live-clock-export");
        expect(await changedPixels(app.app, [zero, liveExport])).toBeLessThan(100);
        // PNG export freezes both clocks. Inspect the actual viewport for running preview time.
        const before = testInfo.outputPath("live-preview-before.png");
        const after = testInfo.outputPath("live-preview-after.png");
        await page.locator("#render-canvas").screenshot({ path: before });
        await expect.poll(async () => {
            await page.locator("#render-canvas").screenshot({ path: after });
            return changedPixels(app.app, [before, after]);
        }).toBeGreaterThan(500);
        await expect(page.locator("#viewport-seek-current-frame")).toHaveValue("0");
        await parameter("DisplayMode", 1);
        await capture("elapsed-export-zero");
        await parameter("DisplayMode", 2);
        const frameStripe = await capture("frame-stripe-zero");
        await frame(15);
        const frameStripe15 = await capture("frame-stripe-15");
        expect(await changedPixels(app.app, [frameStripe, frameStripe15])).toBeGreaterThan(500);
        expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).messages).toEqual([]);
        expect(errors).toEqual([]);
    } finally { await app.close(); }
});

import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { wgslFixtureEditor } from "./external-wgsl-fixture-editor.mjs";

const root = resolve(import.meta.dirname, "../..");
const fields = ["TIME: f32", "CAMERA_POSITION: vec3f", "WORLD: mat4x4f", "VIEWPORTPIXELSIZE: vec2f", "TIME_UNSYNCED: f32"];
const shader = (order, clock = 0, fixedTime = null) => `const MODOKI_API_VERSION: u32 = 2u;
struct EffectInputs { ${order.join(", ")}, }
var<uniform> effectInputs: EffectInputs;
fn effectFinalColor(s: ModokiFinalColor) -> vec3f {
    let time = ${fixedTime === null ? (clock ? "effectInputs.TIME_UNSYNCED" : "effectInputs.TIME") : String(fixedTime)};
    let point = (effectInputs.WORLD * vec4f(0.2, 0.3, 0.4, 1.0)).xyz;
    let view = effectInputs.CAMERA_POSITION * 0.01;
    let pixel = effectInputs.VIEWPORTPIXELSIZE.x / 320.0;
    return vec3f(0.3 + 0.25 * sin(time * 3.0), 0.3 + point.y * 0.1, 0.35 + view.z * 0.1) * pixel;
}
`;

async function difference(page, a, b, video = false) {
    const result = await page.evaluate(async ({ a, b, video }) => {
        const drawables = [];
        try {
            for (const [path, isVideo] of [[a, false], [b, video]]) {
                const bytes = await window.electronAPI.readBinaryFile(path);
                const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: isVideo ? "video/webm" : "image/png" }));
                const media = document.createElement(isVideo ? "video" : "img");
                drawables.push({ media, url });
                const ready = new Promise((done, fail) => {
                    media.addEventListener(isVideo ? "loadeddata" : "load", done, { once: true });
                    media.addEventListener("error", () => fail(new Error("Decode failed: " + path)), { once: true });
                });
                media.src = url; await ready;
                if (isVideo) {
                    const seeked = new Promise(done => media.addEventListener("seeked", done, { once: true }));
                    media.currentTime = 0.001; await seeked;
                }
            }
            const previews = [];
            const pixels = drawables.map(({ media }) => {
                const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
                const context = canvas.getContext("2d"); context.drawImage(media, 0, 0, 320, 180);
                previews.push(canvas.toDataURL("image/png"));
                return context.getImageData(0, 0, 320, 180).data;
            });
            let sum = 0;
            for (let i = 0; i < pixels[0].length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(pixels[0][i + c] - pixels[1][i + c]);
            return { mean: sum / (320 * 180 * 3), previews };
        } finally { for (const { media, url } of drawables) { media.removeAttribute("src"); URL.revokeObjectURL(url); } }
    }, { a, b, video });
    if (video) writeFileSync(b + ".png", Buffer.from(result.previews[1].split(",")[1], "base64"));
    return result.mean;
}

test.setTimeout(240000);
for (const backend of ["classic", "frameGraph"]) test(`WGSL v2 ${backend}: ordered buffers, WebM clocks and legacy project isolation`, async ({}, testInfo) => {
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        const errors = []; page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
        await page.reload(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
        await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 0.4, y: 2, z: -7 }, { x: 0, y: 1.5, z: 0 }));
        await page.locator('[data-i18n="menu.window"]').click();
        await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        const dialog = page.locator('[data-popup-id="experimental-settings"]');
        await dialog.getByLabel("外部WGSL材質を有効にする", { exact: true }).check();
        await expect(dialog.getByLabel("外部WGSL材質を有効にする", { exact: true })).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        const editor = wgslFixtureEditor(launched.app, page, testInfo, root);
        const file = testInfo.outputPath("layout.wgsl"); mkdirSync(testInfo.outputPath(), { recursive: true });
        const apply = async source => { writeFileSync(file, source); await editor.importFile(file); await editor.apply(); };
        const frame = page.locator("#viewport-seek-current-frame"); await frame.fill("15"); await frame.press("Enter");
        const capture = async name => {
            const directory = testInfo.outputPath(name); mkdirSync(directory, { recursive: true });
            const result = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 320, 180), directory);
            return result.path;
        };
        const original = await capture("original");
        await apply(shader(fields)); const first = await capture("first-layout");
        expect(await difference(page, original, first)).toBeGreaterThan(1);
        const reverse = [...fields].reverse().map(field => field.replace("vec3f", "vec3<f32>").replace("mat4x4f", "mat4x4<f32>"));
        await apply(shader(reverse)); const second = await capture("reversed-layout");
        expect(await difference(page, first, second)).toBeLessThan(0.05);
        // Independent fixed-time oracle: exported TIME must be frame/30, including UNSYNCED.
        await apply(shader(reverse, 0, 0.5)); const fixedViewport = await capture("fixed-half-second");
        expect(await difference(page, first, fixedViewport)).toBeLessThan(0.05);
        // Both export windows restore the saved MMD camera. The model-edit viewport can use a different camera.
        const expected = testInfo.outputPath("fixed_0015.png");
        // E2E save-target hook places the GUI output in the isolated userData directory.
        const userData = await launched.app.evaluate(({ app }) => app.getPath("userData"));
        await page.locator('[data-i18n="menu.file"]').click();
        await page.locator('[data-menu-command="file.exportPng"]').click();
        const pngDialog = page.locator('[data-popup-id="png-export"]');
        await pngDialog.locator("#png-output-width").fill("320");
        await pngDialog.locator("#png-output-width").press("Enter");
        await pngDialog.locator("#png-output-height").fill("180");
        await pngDialog.locator("#png-output-height").press("Enter");
        await pngDialog.locator(".popup-form-button-primary").click();
        let pngPath;
        await expect.poll(() => {
            const name = readdirSync(userData).find(name => /^mmd_capture_320x180_.*\.png$/.test(name));
            pngPath = name && resolve(userData, name);
            return Boolean(pngPath && statSync(pngPath).size > 100);
        }).toBe(true);
        await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
        copyFileSync(pngPath, expected);
        for (const clock of [0, 1]) {
            await apply(shader(reverse, clock));
            for (const fps of [30, 60]) {
                const output = testInfo.outputPath(`clock-${clock}-${fps}.webm`);
                await page.evaluate(async ({ output, fps }) => {
                    const api = window.electronAPI;
                    let remove;
                    const finished = new Promise(done => { remove = api.onWebmExportResult(done); });
                    try {
                        const job = await api.startWebmExportWindow({
                            project: window.mmdModokiE2e.exportProjectState(), outputFilePath: output,
                            startFrame: 15, endFrame: 16, fps, outputWidth: 320, outputHeight: 180,
                            includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface",
                        });
                        if (!job?.jobId) throw new Error("WebM did not start");
                        const result = await finished;
                        if (result.status !== "completed") throw new Error(JSON.stringify(result));
                    } finally { remove(); }
                }, { output, fps });
                await expect.poll(() => existsSync(output) && statSync(output).size > 100).toBe(true);
                await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
                expect(await difference(page, expected, output, true)).toBeLessThan(3);
            }
        }
        // An old shader must not prevent the model, camera, or other project state from loading/saving.
        const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        for (const asset of project.externalEffects) asset.manifest.apiVersion = 1;
        for (const model of project.scene.models) {
            const states = [...model.materialShaders ?? [], ...Object.values(model.materialSettingsByMode ?? {}).flatMap(bank => bank.materials)];
            for (const state of states) if (state.externalEffect) state.externalEffect.parameters = { OldValue: 0.7 };
        }
        const projectPath = testInfo.outputPath("old-wgsl.mmdproj");
        writeFileSync(projectPath, JSON.stringify(project));
        await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, projectPath);
        await page.locator('[data-i18n="menu.file"]').click();
        await page.locator('[data-menu-command="file.loadProject"]').click();
        await expect.poll(async () => {
            try {
                const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
                return state.scene.models.length === 1 && !state.externalEffects?.length &&
                    !state.scene.models[0].materialShaders?.some(row => row.externalEffect);
            } catch { return false; }
        }).toBe(true);
        await expect(page.locator(".shader-material-preset").first()).not.toContainText("WGSL:");
        expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).messages).toEqual([]);
        expect(errors).toEqual([]);
    } finally { await launched.close(); }
});

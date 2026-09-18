import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const model = resolve(root, "local-references/model/Alicia/MMD/Alicia_solid.pmx");
const output = resolve(root, "local-references/sss-alicia-backlight-2026-09-18", process.env.MMD_SSS_CAPTURE_LABEL ?? "baseline");
test.skip(process.env.MMD_MODOKI_SSS_ALICIA !== "1" || !existsSync(model), "Owner-authorized local Alicia comparison is opt-in");

test("Alicia maximum backlight: separate transmission and surface lighting", async () => {
    test.setTimeout(180000);
    mkdirSync(output, { recursive: true });
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), model);
        await page.locator("#info-model-select").selectOption("__camera__");
        for (const [key, value] of Object.entries({ tx: 0, ty: 16.5, tz: 0, rx: 0, ry: -12, rz: 0, camDistance: 12 })) {
            const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
            await field.fill(String(value)); await field.press("Enter");
        }
        const slider = async (id, value) => {
            const field = page.locator(`#${id} + .range-number-input`);
            await field.fill(String(value)); await field.press("Enter");
            await expect(page.locator(`#${id}`)).toHaveValue(String(value));
        };
        await page.locator("#btn-toggle-shader-panel").click();
        const capture = async name => {
            await page.waitForFunction(async () => (await import("/src/render/owned-sss.ts")).isOwnedSssReady());
            await page.evaluate(async () => { for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame); });
            const directory = resolve(output, name); mkdirSync(directory, { recursive: true });
            const result = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 1152, 648), directory);
            copyFileSync(result.path, resolve(output, `${name}.png`));
        };
        const apply = async preset => {
            await page.locator("#info-model-select").selectOption("0");
            await page.locator('[data-effect-tab="materials"]').click();
            for (const name of ["body", "hand", "face"]) {
                await page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: new RegExp(`^${name}$`) }) }).click();
                await page.locator("#shader-preset-select").selectOption(preset);
                await page.locator("#btn-shader-apply-selected").click();
                await expect(page.locator("#shader-preset-select")).toHaveValue(preset);
            }
        };
        for (const pbr of [false, true]) {
            if (process.env.MMD_SSS_PBR_ONLY === "1" && !pbr) continue;
            if (pbr) {
                await page.locator('[data-i18n="menu.window"]').click();
                await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
                const dialog = page.locator('[data-popup-id="experimental-settings"]');
                await dialog.getByLabel("PBRモード", { exact: true }).check();
                await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
                await dialog.locator(".app-menu-dialog-close").click();
                await expect(dialog).toBeHidden();
            }
            const mode = pbr ? "pbr" : "mmd";
            for (const [angle, direction] of [["back", [0.56, -0.74, -0.65]], ["direct-back", [0, 0, -1]], ["front", [0.3, -0.3, 0.9]], ["high-back", [0.2, -1, -0.37]]]) {
                for (const [level, rgb, intensity] of [["normal", 128, 100], ["maximum", 255, 200]]) {
                    await page.locator("#info-model-select").selectOption("__camera__");
                    for (const [axis, value] of direction.entries()) await slider(`light-direction-${["x", "y", "z"][axis]}`, value);
                    for (const channel of ["r", "g", "b"]) await slider(`light-color-${channel}`, rgb);
                    await slider("light-intensity", intensity);
                    for (const [kind, preset] of [["standard", pbr ? "pbr-mmd-like" : "wgsl-mmd-standard"], ["skin", pbr ? "pbr-skin" : "wgsl-owned-sss-skin"]]) {
                        await apply(preset);
                        const name = `${mode}-${angle}-${level}-${kind}`;
                        await capture(name);
                        if (kind !== "skin") continue;
                        const diagnostics = await page.evaluate(async () => {
                            const { inspectBacklight } = await import("/test/e2e/helpers/owned-sss-backlight-probe.mjs");
                            return inspectBacklight();
                        });
                        writeFileSync(resolve(output, `${name}.json`), JSON.stringify(diagnostics, null, 2));
                        if (pbr && angle === "direct-back" && level === "maximum") {
                            const shader = await page.evaluate(async () => (await import("/test/e2e/helpers/owned-sss-pbr-shader-probe.mjs")).readPbrShader());
                            writeFileSync(resolve(output, "skin.wgsl"), shader);
                        }
                        if (pbr && angle === "back" && level === "maximum") {
                            await page.evaluate(async () => (await import("/test/e2e/helpers/owned-sss-backlight-probe.mjs")).isolatePbrDiffuse(true, "environment-quarter"));
                            try { await capture(`${name}-environment-quarter`); }
                            finally { await page.evaluate(async () => (await import("/test/e2e/helpers/owned-sss-backlight-probe.mjs")).isolatePbrDiffuse(false)); }
                        }
                        await page.evaluate(async () => (await import("/test/e2e/helpers/owned-sss-backlight-probe.mjs")).setTransmissionCapture(false));
                        try {
                            await capture(`${name}-no-transmission`);
                            if (pbr && angle === "back") {
                                for (const component of ["specular", "environment", "both"]) {
                                    await page.evaluate(async component => (await import("/test/e2e/helpers/owned-sss-backlight-probe.mjs")).isolatePbrDiffuse(true, component), component);
                                    try { await capture(`${name}-without-${component}`); }
                                    finally { await page.evaluate(async () => (await import("/test/e2e/helpers/owned-sss-backlight-probe.mjs")).isolatePbrDiffuse(false)); }
                                }
                            }
                        }
                        finally { await page.evaluate(async () => (await import("/test/e2e/helpers/owned-sss-backlight-probe.mjs")).setTransmissionCapture(true)); }
                    }
                }
            }
        }
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    } finally { await launched.close(); }
});

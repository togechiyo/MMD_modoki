import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const phase = process.env.MMD_SSS_COMPARISON_PHASE;
const comparisonRoot = resolve(root, "local-references/sss-transmission-2026-09-18");

for (const backend of ["frameGraph", "classic"]) test(`SSS transmission at normal and maximum lighting (${backend})`, async ({}, testInfo) => {
    test.setTimeout(180000);
    const launched = await launchMmdModoki(root);
    try {
        const page = await launched.app.firstWindow();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        if (backend === "classic") {
            await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
            await page.reload();
            await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
        }
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
        await page.locator("#info-model-select").selectOption("__camera__");
        for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: 0, ry: 0, rz: 0, camDistance: 12 })) {
            const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
            await field.fill(String(value)); await field.press("Enter");
        }
        await page.locator("#btn-toggle-shader-panel").click();
        const report = [];
        for (const pbr of [false, true]) {
            if (pbr) {
                await page.locator('[data-i18n="menu.window"]').click();
                await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
                const dialog = page.locator('[data-popup-id="experimental-settings"]');
                await dialog.getByLabel("PBRモード", { exact: true }).check();
                await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
                await dialog.locator(".app-menu-dialog-close").click();
            }
            for (const profile of pbr && !phase ? ["skin", "skin-face", "wax"] : ["skin", "wax"]) {
                await page.locator("#info-model-select").selectOption("0");
                await page.locator('[data-effect-tab="materials"]').click();
                const preset = pbr ? (profile.startsWith("skin") ? `pbr-${profile}` : "pbr-sss-wax") : `wgsl-owned-sss-${profile}`;
                await page.locator("#shader-preset-select").selectOption(preset);
                await page.locator("#btn-shader-apply-all").click();
                await page.locator("#info-model-select").selectOption("__camera__");
                for (const [direction, z] of [["front", 1], ["back", -1]]) {
                    for (const [axis, value] of [["x", 0], ["y", 0], ["z", z]]) {
                        const field = page.locator(`#light-direction-${axis} + .range-number-input`);
                        await field.fill(String(value)); await field.press("Enter");
                    }
                    for (const [level, intensity, color] of [["normal", 100, 128], ["maximum", 200, 255]]) {
                        for (const [id, value] of [["light-intensity", intensity], ...["r", "g", "b"].map(channel => [`light-color-${channel}`, color])]) {
                            const field = page.locator(`#${id} + .range-number-input`);
                            await field.fill(String(value)); await field.press("Enter");
                        }
                        await page.waitForFunction(async () => (await import("/src/render/owned-sss.ts")).isOwnedSssReady());
                        await page.evaluate(async () => { for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame); });
                        const name = `${pbr ? "pbr" : "mmd"}-${profile}-${direction}-${level}`;
                        const directory = testInfo.outputPath(name);
                        mkdirSync(directory, { recursive: true });
                        const result = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 1152, 648), directory);
                        const png = PNG.sync.read(readFileSync(result.path));
                        expect(png.width).toBe(1152);
                        if (profile === "skin-face" && direction === "back" && level === "maximum") {
                            const transmission = await page.evaluate(async () => (await import("/test/e2e/helpers/owned-sss-backlight-probe.mjs")).probeTransmissionByMaterial());
                            expect(transmission["耳"].pixels).toBeGreaterThan(100);
                            expect(transmission["耳"].mean).toBeGreaterThan(0.02);
                            expect(transmission["耳"].mean).toBeGreaterThan(transmission["頭"].mean * 5);
                            console.log(JSON.stringify({ backend, faceTransmission: transmission }));
                        }
                        if (phase) {
                            const target = resolve(comparisonRoot, phase, backend);
                            mkdirSync(target, { recursive: true });
                            copyFileSync(result.path, resolve(target, `${name}.png`));
                            if (phase === "after") {
                                const before = PNG.sync.read(readFileSync(resolve(comparisonRoot, "before", backend, `${name}.png`)));
                                let darker = 0, brighter = 0, maxDifference = 0, totalDifference = 0;
                                for (let i = 0; i < png.data.length; i += 4) {
                                    // Red alone is often clipped in warm Skin at maximum light.
                                    const delta = (png.data[i] + png.data[i + 1] + png.data[i + 2]
                                        - before.data[i] - before.data[i + 1] - before.data[i + 2]) / 3;
                                    if (delta < -2) darker++;
                                    if (delta > 2) brighter++;
                                    maxDifference = Math.max(maxDifference, Math.abs(delta));
                                    totalDifference += delta;
                                }
                                report.push({ name, darker, brighter, maxDifference, totalDifference });
                                if (direction === "back") {
                                    expect(darker).toBeGreaterThan(100);
                                    expect(totalDifference).toBeLessThan(0);
                                    // Allow sparse shadow-edge noise between independent GPU launches.
                                    expect(brighter / darker).toBeLessThan(0.01);
                                } else expect(maxDifference).toBeLessThanOrEqual(2);
                            }
                        }
                    }
                }
            }
        }
        if (phase === "after") {
            writeFileSync(resolve(comparisonRoot, phase, backend, "comparison.json"), JSON.stringify(report, null, 2));
            console.log(JSON.stringify(report));
        }
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    } finally {
        await launched.close();
    }
});

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test.setTimeout(150000);
for (const backend of ["classic", "frameGraph"]) test(`PBR owned SSS ${backend}`, async ({}, testInfo) => {
  const app = await launchMmdModoki(root);
  try {
    const page = await app.app.firstWindow();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", msg => { if (msg.type() === "error") console.log(msg.text().slice(0, 700)); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(backend => localStorage.setItem("mmd_modoki.postEffectBackend", backend), backend);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/sss-reference.pmx"));
    const open = async () => {
      await page.locator('[data-i18n="menu.tools"]').click();
      await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    };
    await open();
    const dialog = page.locator('[data-popup-id="experimental-settings"]');
    await dialog.getByLabel("PBRモード", { exact: true }).check();
    await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
    await dialog.locator(".app-menu-dialog-close").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({tx:0, ty:1.5, tz:0, rx:0, ry:0, rz:0, camDistance:12})) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator("#info-model-select").selectOption("0");
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    expect(await page.locator('#shader-preset-select option[value="pbr-skin-sss"]').count()).toBe(0);
    await expect(page.locator("#shader-preset-select")).toHaveValue("pbr-mmd-like");
    await expect(page.locator("#shader-preset-select option").last()).toHaveAttribute("value", "pbr-base");
    const initial = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(initial.scene.models[0].materialShaders.every(entry => entry.presetId === "pbr-mmd-like")).toBe(true);
    const settle = async () => {
      await page.waitForFunction(async () => (await import("/src/render/owned-sss.ts")).isOwnedSssReady());
      await page.evaluate(async () => { for (let i=0;i<12;i++) await new Promise(r => requestAnimationFrame(r)); });
    };
    const inspect = () => page.evaluate(async () => (await import("/src/render/owned-sss.ts")).inspectOwnedSss());
    for (const preset of ["pbr-metal-polished", "pbr-metal-satin", "pbr-plastic-glossy", "pbr-clay-white", "pbr-cotton", "pbr-satin", "pbr-velvet", "pbr-leather"]) {
      await page.locator("#shader-preset-select").selectOption(preset);
      await page.locator("#btn-shader-apply-all").click();
      await settle();
      const output = testInfo.outputPath(preset); mkdirSync(output, {recursive:true});
      await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output,1152,648), output);
      const savedSurface = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(savedSurface.scene.models[0].materialShaders.every(entry => entry.presetId === preset)).toBe(true);
      await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), savedSurface);
      await expect(page.locator("#shader-preset-select")).toHaveValue(preset);
    }
    // The linked-sheen regression nearly removed the fixture's diffuse color.
    // Compare only the head center so the bright background cannot hide it.
    const headBrightness = preset => {
      const png = PNG.sync.read(readFileSync(testInfo.outputPath(preset, "single_rgba_surface_e2e.png")));
      let sum = 0;
      for (let y = 280; y < 380; y++) for (let x = 530; x < 620; x++) {
        const i = (y * png.width + x) * 4;
        sum += png.data[i] + png.data[i + 1] + png.data[i + 2];
      }
      return sum;
    };
    expect(headBrightness("pbr-velvet")).toBeGreaterThan(headBrightness("pbr-cotton") * 0.75);
    for (const preset of ["pbr-base", "pbr-mmd-like", "pbr-skin", "pbr-skin-face", "pbr-sss-wax"]) {
      await page.locator("#shader-preset-select").selectOption(preset);
      await page.locator("#btn-shader-apply-all").click();
      await settle();
      const state = await inspect();
      expect(state.materialCount).toBe(preset.startsWith("pbr-skin") || preset === "pbr-sss-wax" ? 2 : 0);
      if (state.materialCount) {
        expect(state.targetCount).toBe(4);
        expect(state.probes.length).toBeGreaterThan(0);
      }
      const output = testInfo.outputPath(preset); mkdirSync(output, {recursive:true});
      await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output,1152,648), output);
    }
    // Isolate backlight transmission from the environment fill.
    await open();
    await dialog.locator('[data-experimental-lighting] input[type="checkbox"]').nth(1).uncheck();
    await dialog.locator(".app-menu-dialog-close").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [axis, value] of [["x",0.3],["y",-0.2],["z",-0.9]]) {
      await page.locator(`#light-direction-${axis}`).fill(String(value));
      await page.locator(`#light-direction-${axis}`).dispatchEvent("input");
    }
    await page.locator("#info-model-select").selectOption("0");
    const captures = [];
    await page.locator('[data-effect-tab="materials"]').click();
    for (const preset of ["pbr-base", "pbr-skin", "pbr-sss-wax"]) {
      await page.locator("#shader-preset-select").selectOption(preset);
      await page.locator("#btn-shader-apply-all").click(); await settle();
      const output = testInfo.outputPath(`back-${preset}`); mkdirSync(output,{recursive:true});
      const result = await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output,1152,648),output);
      captures.push(PNG.sync.read(readFileSync(result.path)).data);
      if (preset === "pbr-skin") {
        const shader = await page.evaluate(async () => (await import("/test/e2e/helpers/owned-sss-pbr-shader-probe.mjs")).readPbrShader());
        writeFileSync(testInfo.outputPath("skin.wgsl"), shader);
      }
    }
    let brighter = 0;
    for (let i=0;i<captures[0].length;i+=4) if (captures[1][i] > captures[0][i]+8) brighter++;
    expect(brighter).toBeGreaterThan(100);
    let skinDifference = 0;
    for (let i=0;i<captures[1].length;i+=4) if (Math.abs(captures[1][i] - captures[2][i]) > 8) skinDifference++;
    expect(skinDifference).toBeGreaterThan(100);
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    await open();
    await dialog.getByLabel("PBRモード", { exact: true }).uncheck();
    await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
    await settle();
    expect((await inspect()).targetCount).toBe(0);
    await dialog.getByLabel("PBRモード", { exact: true }).check();
    await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
    await dialog.locator(".app-menu-dialog-close").click();
    await settle();
    expect((await inspect()).materialCount).toBe(2);
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    await settle();
    expect((await inspect()).materialCount).toBe(2);
    const legacy = JSON.parse(JSON.stringify(saved));
    for (const model of legacy.scene.models) {
      for (const entry of model.materialShaders ?? []) entry.presetId = "pbr-skin-sss";
      for (const entry of model.materialSettingsByMode?.["pbr-standard"]?.materials ?? []) entry.presetId = "pbr-skin-sss";
    }
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), legacy);
    await settle();
    const migrated = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(migrated.scene.models[0].materialShaders.every(entry => entry.presetId === "pbr-skin")).toBe(true);
    await page.locator("#shader-preset-select").selectOption("pbr-base");
    await page.locator("#btn-shader-apply-all").click();
    const standard = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(standard.scene.models[0].materialShaders.every(entry => entry.presetId === "pbr-base")).toBe(true);
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), standard);
    await expect(page.locator("#shader-preset-select")).toHaveValue("pbr-base");
    expect(errors).toEqual([]);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally { await app.close(); }
});

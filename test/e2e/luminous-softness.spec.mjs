import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { ensureLuminousRadianceInstance, luminousInstanceControl, setLuminousInstancePosition } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), output = resolve(root, "artifacts/e2e/luminous-softness");
test("RC softness smooths ring-light patterns, preserves the OFF image and survives save/load and backends", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root), errors = [], report = {};
  mkdirSync(output, { recursive: true });
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") console.log(message.text().slice(0, 800)); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      state.lighting.intensity = 0; state.lighting.ambientIntensity = 0;
      await window.mmdModokiE2e.importProjectState(state);
      await import("/test/e2e/helpers/luminous-softness-probe.mjs");
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => {
      await (await import("/test/e2e/helpers/luminous-softness-probe.mjs")).createLuminousSoftnessProbe();
      window.mmdModokiE2e.setCameraPose({ x: 4, y: 0.2, z: -6 }, { x: 0, y: 2.8, z: 0 });
    });
    await page.locator('[data-effect-tab="post"]').click(); await ensureLuminousRadianceInstance(page);
    await luminousInstanceControl(page, "luminousRadianceEnabled").check();
    await setLuminousInstancePosition(page, "luminousRadianceStrength", 75);
    await setLuminousInstancePosition(page, "luminousRadianceRange", 3);
    const softness = () => luminousInstanceControl(page, "luminousRadianceSoftness");
    await expect(softness()).toHaveValue("0");
    const capture = async name => {
      report.runtime = await page.evaluate(() => ({ state: window.mmdModokiE2e.getFrameGraphPostEffectsState(), validation: window.mmdModokiE2e.getWebGpuValidationDiagnostics() }));
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      report[name] = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-softness-probe.mjs")).readLuminousSoftnessProbe());
      await expect(page.locator(".toast")).toHaveCount(0);
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) });
      writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2));
    };
    await capture("sharp");
    await setLuminousInstancePosition(page, "luminousRadianceSoftness", 65); await capture("soft");
    expect(report.soft.samples).toBeGreaterThan(100); expect(report.soft.filtering).toBe(true);
    expect(report.soft.mean).toBeGreaterThan(report.sharp.mean * 0.6);
    expect(report.soft.detail).toBeLessThan(report.sharp.detail * 0.6);
    expect(report.soft.backgroundMax).toBe(0);
    await setLuminousInstancePosition(page, "luminousRadianceSoftness", 100); await capture("softer");
    // Half-float rounding can perturb a tiny second derivative; the broad gradient should still soften.
    expect(report.softer.roughness).toBeLessThan(report.soft.roughness);
    await setLuminousInstancePosition(page, "luminousRadianceSoftness", 0); await capture("restored");
    expect(readFileSync(resolve(output, "restored.png"))).toEqual(readFileSync(resolve(output, "sharp.png")));
    expect(report.restored.filtering).toBe(false);
    await setLuminousInstancePosition(page, "luminousRadianceSoftness", 65);
    const menu = async command => { await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator(`[data-menu-command="${command}"]`).click(); };
    const saved = testInfo.outputPath("project.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
    await menu("file.saveProject"); await expect.poll(() => existsSync(saved)).toBe(true);
    const setting = JSON.parse(readFileSync(saved, "utf8")).effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance;
    expect(setting.softness).toBe(0.65);
    await setLuminousInstancePosition(page, "luminousRadianceSoftness", 0);
    await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, saved);
    await menu("file.loadProject"); await expect(softness()).toHaveValue("65");
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
      await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance.softness)).toBe(0.65);
    }
    await expect(softness()).toHaveValue("65");
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2)); await launched.close(); }
});

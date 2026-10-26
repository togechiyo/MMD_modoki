import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { ensureLuminousRadianceInstance, luminousInstanceControl, luminousRadianceInstanceRow, setLuminousInstancePosition } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), output = resolve(root, "artifacts/e2e/luminous-distance-softness");
test("distance softness preserves near light, smooths far light and restores GUI state", async ({}, testInfo) => {
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
      await import("/test/e2e/helpers/luminous-distance-softness-probe.mjs");
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => {
      await (await import("/test/e2e/helpers/luminous-softness-probe.mjs")).createLuminousSoftnessProbe({ nearReceiver: true });
      window.mmdModokiE2e.setCameraPose({ x: 4, y: 0.2, z: -6 }, { x: 0, y: 2.8, z: 0 });
    });
    await page.locator('[data-effect-tab="post"]').click(); await ensureLuminousRadianceInstance(page);
    await luminousInstanceControl(page, "luminousRadianceEnabled").check();
    await setLuminousInstancePosition(page, "luminousRadianceStrength", 75);
    await setLuminousInstancePosition(page, "luminousRadianceRange", 3);
    const toggle = () => luminousRadianceInstanceRow(page).locator('[data-instance-fixed-toggle="radianceDistanceSoftness"]');
    const capture = async name => {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      report[name] = await page.evaluate(async name => (await import("/test/e2e/helpers/luminous-distance-softness-probe.mjs")).captureDistanceSoftness(name), name);
      await expect(page.locator(".toast")).toHaveCount(0);
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) });
      writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2));
    };
    await expect(toggle()).not.toBeChecked(); await capture("sharp");
    await toggle().check(); await capture("zero-distance");
    expect(readFileSync(resolve(output, "zero-distance.png")).equals(readFileSync(resolve(output, "sharp.png")))).toBe(true);
    await toggle().uncheck(); await setLuminousInstancePosition(page, "luminousRadianceSoftness", 65); await capture("fixed");
    await toggle().check(); await capture("distance");
    report.comparison = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-distance-softness-probe.mjs")).compareDistanceSoftness("fixed", "distance"));
    expect(report.comparison.rawDifference).toBe(0);
    expect(report.comparison.near.samples).toBeGreaterThan(30);
    expect(report.comparison.near.distanceError).toBeLessThan(report.comparison.near.fixedError * 0.7);
    expect(report.comparison.far.samples).toBeGreaterThan(100);
    expect(report.comparison.far.difference).toBeLessThan(0.05);
    expect(report.distance.backgroundMax).toBe(0); expect(report.distance.cascadesCached).toBe(true); expect(report.distance.reused).toBeGreaterThan(100);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click(); await expect(toggle()).not.toBeChecked();
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click(); await expect(toggle()).toBeChecked();
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-distance-softness-probe.mjs")).shiftSoftnessRing(0.05));
    await capture("moved-cached");
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).forceRadianceReceiverFull(true));
    await capture("moved-full");
    expect(readFileSync(resolve(output, "moved-cached.png")).equals(readFileSync(resolve(output, "moved-full.png")))).toBe(true);
    expect(report["moved-cached"].nearEnergy).not.toBe(report.distance.nearEnergy);
    await page.evaluate(async () => {
      (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).forceRadianceReceiverFull(false);
      (await import("/test/e2e/helpers/luminous-distance-softness-probe.mjs")).shiftSoftnessRing(0);
    });
    report.completionMs = [];
    for (const enabled of [false, true, false, true]) {
      await toggle().setChecked(enabled); await capture(enabled ? "distance" : "fixed");
      const times = await page.evaluate(async () => {
        const probe = await import("/test/e2e/helpers/luminous-distance-softness-probe.mjs");
        return { cached: await probe.profileDistanceSoftnessCompletion(), recomputed: await probe.profileDistanceSoftnessCompletion(true) };
      });
      report.completionMs.push({ enabled, ...times });
    }
    await toggle().uncheck(); await capture("restored-fixed");
    expect(readFileSync(resolve(output, "restored-fixed.png")).equals(readFileSync(resolve(output, "fixed.png")))).toBe(true);
    await toggle().check(); await setLuminousInstancePosition(page, "luminousRadianceSoftness", 30);
    const menu = async command => { await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator(`[data-menu-command="${command}"]`).click(); };
    const saved = testInfo.outputPath("project.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
    await menu("file.saveProject"); await expect.poll(() => existsSync(saved)).toBe(true);
    expect(JSON.parse(readFileSync(saved, "utf8")).effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance).toMatchObject({ distanceSoftness: true, softness: 0.3 });
    await toggle().uncheck();
    await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, saved);
    await menu("file.loadProject"); await expect(toggle()).toBeChecked();
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
      await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance.distanceSoftness)).toBe(true);
    }
    await expect(toggle()).toBeChecked(); await expect(luminousInstanceControl(page, "luminousRadianceSoftness")).toHaveValue("30");
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2)); await launched.close(); }
});

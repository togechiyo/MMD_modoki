import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { ensureLuminousRadianceInstance, luminousInstanceControl, setLuminousInstancePosition } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), output = resolve(root, "artifacts/e2e/luminous-distance-softness-retired");
test("shelved RC distance softness stays OFF and hidden after legacy load, undo and backend changes", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root), errors = [], report = {};
  mkdirSync(output, { recursive: true });
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      await window.mmdModokiE2e.importProjectState(state);
      await import("/test/e2e/helpers/luminous-radiance-probe.mjs");
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.locator('[data-effect-tab="post"]').click(); await ensureLuminousRadianceInstance(page);
    await luminousInstanceControl(page, "luminousRadianceEnabled").check();
    await setLuminousInstancePosition(page, "luminousRadianceStrength", 75);
    await setLuminousInstancePosition(page, "luminousRadianceRange", 3);
    await setLuminousInstancePosition(page, "luminousRadianceSoftness", 38);
    const hiddenToggle = page.locator('[data-instance-fixed-toggle="radianceDistanceSoftness"]');
    const capture = async name => {
      await expect(hiddenToggle).toHaveCount(0);
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      report[name] = await page.evaluate(async () => {
        const { radianceTask } = await import("/test/e2e/helpers/luminous-radiance-probe.mjs");
        for (let frame = 0; frame < 8; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
        const uniform = radianceTask("luminousRadianceReceiver").getUniformBuffer("params");
        // Read actual UBO fields by their runtime offsets instead of inspecting WGSL text.
        const preserveNear = uniform.getData()[uniform._uniformLocations.outputSize + 3];
        const filters = [0, 1, 2, 3, 4].map(index => {
          const task = radianceTask("luminousRadianceSoften" + index), params = task.getUniformBuffer("params");
          return Array.from(params.getData().slice(params._uniformLocations.softening + 2, params._uniformLocations.softening + 4));
        });
        const state = window.mmdModokiE2e.exportProjectState();
        return { preserveNear, filters, legacy: state.effects.luminousRadiance,
          settings: state.effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance };
      });
      expect(report[name]).toMatchObject({ preserveNear: 0, filters: Array(5).fill([0, 0]), legacy: { distanceSoftness: false },
        settings: { enabled: true, strength: 6, softness: 0.38, distanceSoftness: false } });
      expect(report[name].settings.range).toBeCloseTo(3.97);
      await expect(luminousInstanceControl(page, "luminousRadianceSoftness")).toHaveValue("38");
      await expect(page.locator(".toast")).toHaveCount(0);
      await page.screenshot({ path: resolve(output, name + ".png") });
    };
    await capture("initial");
    const menu = async command => { await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click(); await page.locator('[data-menu-command="' + command + '"]').click(); };
    const oldPath = testInfo.outputPath("old-distance-on.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, oldPath);
    await menu("file.saveProject"); await expect.poll(() => existsSync(oldPath)).toBe(true);
    const old = JSON.parse(readFileSync(oldPath, "utf8"));
    old.effects.luminousRadiance.distanceSoftness = true;
    old.effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance.distanceSoftness = true;
    writeFileSync(oldPath, JSON.stringify(old));
    await setLuminousInstancePosition(page, "luminousRadianceSoftness", 65);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    await expect(luminousInstanceControl(page, "luminousRadianceSoftness")).toHaveValue("38");
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    await expect(luminousInstanceControl(page, "luminousRadianceSoftness")).toHaveValue("65");
    await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, oldPath);
    await menu("file.loadProject"); await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await capture("old-on-restored-off");
    const saved = testInfo.outputPath("normalized.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
    await menu("file.saveProject"); await expect.poll(() => existsSync(saved)).toBe(true);
    const normalized = JSON.parse(readFileSync(saved, "utf8"));
    expect(normalized.effects.luminousRadiance.distanceSoftness).toBe(false);
    expect(normalized.effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance).toEqual(report.initial.settings);
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
      await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
      await expect(hiddenToggle).toHaveCount(0);
      const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(state.effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance).toEqual(report.initial.settings);
    }
    await capture("backend-restored");
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2)); await launched.close(); }
});

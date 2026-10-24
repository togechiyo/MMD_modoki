import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { luminousInstanceRow, luminousInstanceControl, setLuminousInstancePosition, getLuminousInstanceRuntime } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("RC reconstructs smooth illumination on curved MMD receivers", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root), report = {}, errors = [];
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(2600, 1600));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      state.lighting.intensity = 0; state.lighting.ambientIntensity = 0;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => { const probe = await import("/test/e2e/helpers/luminous-radiance-probe.mjs");
      await probe.createRadianceProbe(); await probe.createRadianceQualityProbe(); });
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: 0, ry: 0, rz: 0, camDistance: 9 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`); await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    if (!await luminousInstanceRow(page).count()) {
      await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click();
    }
    const control = key => luminousInstanceControl(page, key);
    for (const [key, value] of [["luminousIntensity", 0], ["luminousRadianceStrength", 100], ["luminousRadianceRange", 3]]) {
      await setLuminousInstancePosition(page, key, value);
    }
    async function capture(name) {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      const points = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceQualityProbeState());
      const path = testInfo.outputPath(`${name}.png`); await expect(page.locator(".toast")).toHaveCount(0);
      await page.locator("#render-canvas").screenshot({ path });
      const png = PNG.sync.read(readFileSync(path)), y = Math.round(points.left[1] * png.height), row = [];
      for (let x = Math.round(points.left[0] * png.width); x <= Math.round(points.right[0] * png.width); x++) row.push(png.data[(y * png.width + x) * 4]);
      report[name] = { points, row, maxStep: Math.max(...row.slice(1).map((value, i) => Math.abs(value - row[i]))) };
      writeFileSync(testInfo.outputPath("quality-report.json"), JSON.stringify(report, null, 2)); return report[name];
    }
    const off = await capture("rc-off");
    await control("luminousRadianceEnabled").check(); const on = await capture("rc-on");
    expect(Math.max(...off.row)).toBeLessThan(3); expect(Math.max(...on.row)).toBeGreaterThan(50);
    expect(on.maxStep).toBeLessThan(4);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { await launched.close(); }
});

import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { ensureLuminousRadianceInstance, luminousInstanceRow, luminousRadianceInstanceRow, setLuminousInstancePosition } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), output = resolve(root, "artifacts/e2e/luminous-color-reference");
test("RC source hue matches the actual 2D luminous mask including textures and chroma-preserving sources", async () => {
  const launched = await launchMmdModoki(root), errors = [], report = {};
  mkdirSync(output, { recursive: true });
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createRadianceProbe({ preserveChroma: false }));
    for (const id of ["light-intensity", "light-ambient"]) await page.locator(`#${id}`).evaluate(input => {
      input.value = "0"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 4, y: 5, z: -11 }, { x: 0, y: 1.5, z: 0 }));
    await page.locator('[data-effect-tab="post"]').click();
    if (!await luminousInstanceRow(page).count()) {
      await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click();
    }
    await luminousInstanceRow(page).locator('[data-instance-field="enabled"]').check();
    await ensureLuminousRadianceInstance(page); await setLuminousInstancePosition(page, "luminousRadianceRange", 3);
    await luminousRadianceInstanceRow(page).locator('[data-instance-field="enabled"]').check();
    await expect(page.locator(".toast")).toHaveCount(0);
    const read = () => page.evaluate(async () => (await import("/test/e2e/helpers/luminous-color-reference.mjs")).readLuminousColorReference());
    const normalize = values => values.map(value => value / Math.max(...values));
    for (const [name, options] of [
      ["white-core-red", { color: [1, 0.08, 0.03] }],
      ["dim-cyan", { color: [0.03, 0.09, 0.12] }],
      ["texture-tint", { color: [1, 0.08, 0.03], textureColor: [80, 210, 120] }],
      ["preserved-green", { color: [0.24, 1, 0.32], preserveChroma: true }],
    ]) {
      await page.evaluate(async options => (await import("/test/e2e/helpers/luminous-color-reference.mjs")).setLuminousColorReference(options), options);
      report[name] = await read(); writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
      const a = normalize(report[name].emission), b = normalize(report[name].linearMask);
      expect(Math.max(...a.map((value, channel) => Math.abs(value - b[channel]))), name).toBeLessThan(0.04);
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) });
    }
    const before = await read(); await luminousInstanceRow(page).locator('[data-instance-field="enabled"]').uncheck();
    const after = await read(); expect(after.emission).toEqual(before.emission);
    await expect(luminousInstanceRow(page).locator('[data-instance-field="enabled"]')).not.toBeChecked();
    await expect(luminousRadianceInstanceRow(page).locator('[data-instance-field="enabled"]')).toBeChecked();
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    expect(errors).toEqual([]);
  } finally { writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2)); await launched.close(); }
});

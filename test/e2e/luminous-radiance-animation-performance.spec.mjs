import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { PNG } from "playwright-core/lib/utilsBundle";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("RC updates only moving geometry during continuous bone and morph animation", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root), report = {}, errors = [];
  const active = process.env.MMD_RC_ANIMATION_MODE !== "off";
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => { const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state); });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    report.fixture = await page.evaluate(async () => { const probe = await import("/test/e2e/helpers/luminous-radiance-probe.mjs");
      await probe.createRadianceProbe(); return probe.createAnimatedRadianceProbe(); });
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: -25, ry: 0, rz: 0, camDistance: 11 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`); await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    if (!await page.locator('[data-effect-stack-row="luminous"]').count()) {
      await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click();
    }
    const control = key => page.locator(`[data-effect-stack-control="${key}"]`);
    report.mode = active ? "on" : "off";
    for (const [key, value] of [["luminousIntensity", 2], ["luminousRadianceStrength", 100], ["luminousRadianceRange", 3]]) {
      await control(key).evaluate((input, value) => { input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }, value);
    }
    await control("luminousRadianceEnabled").selectOption("1");
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    if (!active) await control("luminousRadianceEnabled").selectOption("0");
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState());
    // Warm shader and pose paths first; measured frames continuously change both bones and a morph.
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceProbe(15, "continuous"));
    report.animation = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceProbe(60, "continuous"));
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState());
    report.stationary = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceProbe(20));
    await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath("animation-restored.png") });
    writeFileSync(testInfo.outputPath("animation-performance-report.json"), JSON.stringify(report, null, 2));
    console.log(`RC animation profile: ${JSON.stringify(report)}`);
    const moving = report.animation;
    if (active) { expect(moving.positionCalls).toBeGreaterThanOrEqual(55); expect(moving.geometryUpdates).toBeGreaterThanOrEqual(55); }
    else { expect(moving.positionCalls).toBe(0); expect(moving.geometryUpdates).toBe(0); }
    expect(moving.counts.cascades).toBe(moving.geometryUpdates * 4);
    if (process.env.MMD_RC_PROFILE_ONLY !== "1") {
      expect(moving.refittedTriangles).toBe(moving.geometryUpdates * report.fixture.movingTriangles);
      if (active) expect(moving.uploadedBytes / moving.geometryUpdates).toBeLessThan(report.fixture.staticTriangles * 96 / 10);
      if (active && process.env.MMD_RC_ANIMATION_BASELINE_PNG) {
        const baseline = PNG.sync.read(readFileSync(process.env.MMD_RC_ANIMATION_BASELINE_PNG));
        const current = PNG.sync.read(readFileSync(testInfo.outputPath("animation-restored.png")));
        expect([current.width, current.height]).toEqual([baseline.width, baseline.height]);
        expect(current.data).toEqual(baseline.data);
      }
    }
    expect(report.stationary.counts.cascades).toBe(0); expect(report.stationary.uploadedBytes).toBe(0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { await launched.close(); }
});

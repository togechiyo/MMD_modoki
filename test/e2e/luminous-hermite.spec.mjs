import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { ensureLuminousRadianceInstance, luminousInstanceControl, setLuminousInstancePosition } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), output = resolve(root, "artifacts/e2e/luminous-hermite");
test("Hermite receiver interpolation smooths probe crossings without changing the cascade field", async () => {
  const launched = await launchMmdModoki(root), report = {}, errors = [];
  mkdirSync(output, { recursive: true });
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") console.log(message.text().slice(0, 700)); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      state.lighting.intensity = 0; state.lighting.ambientIntensity = 0;
      await window.mmdModokiE2e.importProjectState(state);
      await import("/test/e2e/helpers/luminous-hermite-probe.mjs");
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
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    report.contract = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-hermite-probe.mjs")).measureHermiteProbeContract());
    expect(report.contract.constantMaxError).toBeLessThan(0.000002);
    for (const [axis, result] of report.contract.axes.entries()) {
      expect(result.hermiteSlopeJump).toBeLessThan(result.linearSlopeJump * 0.05);
      for (const sample of result.samples) {
        expect(sample.hermite).toBeGreaterThanOrEqual(0.25 * [1, 2, 0.5][axis] - 0.000001);
        expect(sample.hermite).toBeLessThanOrEqual(4 * [1, 2, 0.5][axis] + 0.000001);
        expect(sample.alpha).toBeCloseTo(1, 6);
        if (Number.isInteger(sample.coordinate) || sample.coordinate === 0.5 || sample.coordinate === 1.5) expect(sample.hermite).toBeCloseTo(sample.linear, 6);
      }
    }
    const capture = async name => {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      report[name] = await page.evaluate(async () => ({
        light: await (await import("/test/e2e/helpers/luminous-softness-probe.mjs")).readLuminousSoftnessProbe(),
        field: await (await import("/test/e2e/helpers/luminous-hermite-probe.mjs")).radianceFieldFingerprint(),
      }));
      await expect(page.locator(".toast")).toHaveCount(0);
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) });
      writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2));
    };
    await capture("hermite");
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-hermite-probe.mjs")).useLinearReceiverBaseline(true));
    await capture("linear");
    expect(report.linear.field).toEqual(report.hermite.field);
    expect(Math.abs(report.hermite.light.mean / report.linear.light.mean - 1)).toBeLessThan(0.1);
    expect(report.hermite.light.backgroundMax).toBe(0);
    report.completionMs = [];
    for (const linear of [true, false, true, false]) {
      const ms = await page.evaluate(async linear => {
        await (await import("/test/e2e/helpers/luminous-hermite-probe.mjs")).useLinearReceiverBaseline(linear);
        return await (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceReceiverCompletion(20);
      }, linear);
      report.completionMs.push({ linear, ms });
    }
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-hermite-probe.mjs")).restoreHermiteReceiver());
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 4.15, y: 0.2, z: -6 }, { x: 0.15, y: 2.8, z: 0 }));
    await capture("camera-moved");
    expect(report["camera-moved"].field).toEqual(report.hermite.field);
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).forceRadianceReceiverFull(true));
    await capture("camera-moved-full");
    expect(readFileSync(resolve(output, "camera-moved-full.png")).equals(readFileSync(resolve(output, "camera-moved.png")))).toBe(true);
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 4, y: 0.2, z: -6 }, { x: 0, y: 2.8, z: 0 }));
    await capture("returned");
    // ArcRotateCamera position/target round trips can differ by subpixel float rounding.
    expect(report.returned.light.samples).toBe(report.hermite.light.samples);
    expect(report.returned.light.mean).toBeCloseTo(report.hermite.light.mean, 6);
    expect(report.returned.field).toEqual(report.hermite.field);
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-hermite-probe.mjs")).restoreHermiteReceiver());
    await capture("cached");
    expect(readFileSync(resolve(output, "cached.png")).equals(readFileSync(resolve(output, "returned.png")))).toBe(true);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2)); await launched.close(); }
});

import { test, expect } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { camera, initialState, numberControl, seek } from "./helpers/rc-diffuse-gi-controls.mjs";
import { openPostEffects, openRcLighting, closeRcLighting, rcLightingInput, rcLightingStatus } from "./helpers/rc-lighting-controls.mjs";
import { ensureLuminousRadianceInstance, luminousInstanceControl, setLuminousInstancePosition, getLuminousInstanceRuntime } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), fixture = resolve(root, "test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx");
const output = process.env.MMD_RC_COMBINED_OUTPUT ? resolve(process.env.MMD_RC_COMBINED_OUTPUT) : null;
const baseline = process.env.MMD_RC_COMBINED_BASELINE ? resolve(process.env.MMD_RC_COMBINED_BASELINE) : null;
const filter = process.env.MMD_RC_COMBINED_CASES ? new RegExp(process.env.MMD_RC_COMBINED_CASES) : null;
const probeUrl = "/test/e2e/helpers/rc-combined-performance-probe.mjs";
const invoke = (page, name, value) => page.evaluate(async ({ name, value, probeUrl }) => (await import(probeUrl))[name](value), { name, value, probeUrl });
function imageDifference(before, after) {
  expect([after.width, after.height]).toEqual([before.width, before.height]);
  let total = 0, maximum = 0, changed = 0;
  for (let i = 0; i < after.data.length; i += 4) {
    let pixel = 0; for (let channel = 0; channel < 3; channel++) { const value = Math.abs(after.data[i + channel] - before.data[i + channel]); total += value; pixel = Math.max(pixel, value); }
    maximum = Math.max(maximum, pixel); if (pixel > 0) changed++;
  }
  return { mae: total / (after.width * after.height * 3), maximum, changedFraction: changed / (after.width * after.height) };
}
for (const geometry of ["pmx", "dense"]) for (const mode of ["all", "luminous", "sky", "gi"]) for (const moving of [false, true]) {
  const id = `${geometry}-${mode}-${moving ? "moving" : "static"}`;
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
  test(`RC combined performance: ${id}`, async ({}, testInfo) => {
    test.skip(filter && !filter.test(id), "Selected cases only"); test.setTimeout(240000);
    const launched = await launchMmdModoki(root), report = { id, geometry, mode, moving, size: [1280, 720], errors: [], consoleErrors: [], captures: {}, comparisons: {},
      interpretation: "Independent warmed diagnostic device per case. Same original PMX, material, light, fixed volume and camera. CPU columns overlap; do not add them. GPU pass sums exclude queue gaps; completion wall includes CPU/submission/wait. Tiny fixtures are not a device FPS guarantee." }; let page;
    try {
      page = await launched.app.firstWindow();
      await page.addInitScript(() => { const adapterClass = window.GPUAdapter; if (!adapterClass) return; const request = adapterClass.prototype.requestDevice;
        adapterClass.prototype.requestDevice = function (descriptor = {}) { const features = new Set(descriptor.requiredFeatures ?? []);
          if (this.features.has("timestamp-query")) features.add("timestamp-query"); return request.call(this, { ...descriptor, requiredFeatures: [...features] }); }; });
      await page.reload(); page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
      page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      // Import first; opening GI later supplies the actual manager to this test-only observer.
      await page.evaluate(url => import(url).then(() => true), probeUrl);
      await initialState(page);
      await page.evaluate(async () => { const state = window.mmdModokiE2e.exportProjectState();
        state.lighting.rcSkyOcclusion = { enabled: false, strength: .75, minimum: .2, volume: { min: [-8, -2, -8], size: 16 } };
        await window.mmdModokiE2e.importProjectState(state); });
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
      await page.locator("#info-model-select").selectOption("0");
      const category = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "光遮蔽板")?.category);
      expect(category).toBeTruthy();
      for (const [frame, x] of [[0, 0], [60, -20]]) { await seek(page, frame); await selectTimelineTrack(page, category, "光遮蔽板");
        await numberControl(page, "tx", x); await page.locator("#btn-bone-keyframe").click(); }
      await seek(page, 0); await openPostEffects(page); await page.locator('[data-effect-tab="materials"]').click();
      await page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: "GI Source" }) }).click();
      await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-selected").click();
      await openRcLighting(page, "rcDiffuseGi");
      if (geometry === "dense") report.dense = await invoke(page, "createCombinedDenseFixture", { subdivisions: 96 });
      report.camera = await camera(page); await openPostEffects(page); await ensureLuminousRadianceInstance(page);
      for (const [key, value] of [["luminousRadianceRange", 3], ["luminousRadianceStrength", 25], ["luminousRadianceSoftness", 0]]) await setLuminousInstancePosition(page, key, value);
      await luminousInstanceControl(page, "luminousRadianceEnabled").setChecked(mode === "all" || mode === "luminous");
      for (const [effect, active] of [["rcSkyOcclusion", mode === "all" || mode === "sky"], ["rcDiffuseGi", mode === "all" || mode === "gi"]]) {
        await openRcLighting(page, effect); await rcLightingInput(page, effect, "Enabled").setChecked(active);
        await expect(rcLightingStatus(page, effect)).toHaveAttribute("data-state", active ? "ready" : "off", { timeout: 60000 });
      }
      await closeRcLighting(page);
      if (mode === "all" || mode === "luminous") await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.emitters ?? 0).toBeGreaterThan(0);
      report.settings = await page.evaluate(() => { const state = window.mmdModokiE2e.exportProjectState(); return { lighting: state.lighting, effects: state.effects, camera: state.camera }; });
      report.prepared = await invoke(page, "prepareCombinedPerformance", { width: 1280, height: 720 });
      expect(report.prepared.size).toEqual([1280, 720]);
      report.measurement = await invoke(page, "measureCombinedPerformance", { moving, warmFrames: 12, frames: 40, completionFrames: 12 });
      for (const [phase, count] of [["realtime", 40], ["completion", 12]]) {
        const value = report.measurement[phase]; expect(value.frames).toBe(count); expect(value.state.size).toEqual([1280, 720]);
        expect(value.validation.count).toBe(0);
        if (value.state.deviceTimestampQuery) expect(value.gpu.completeFrames).toBe(count);
        if (moving) { expect(value.counts.sourceUpdates ?? 0).toBeGreaterThanOrEqual(count); expect(value.counts.computeDispatches ?? 0).toBeGreaterThan(0); }
        else { expect(value.counts.sourceUpdates ?? 0).toBe(0); expect(value.counts.poseDeformations ?? 0).toBe(0); }
      }
      expect(report.measurement.validationAfterCleanup.count).toBe(0);
      for (const frame of [0, 30]) {
        await invoke(page, "setCombinedReferencePose", frame); const directory = testInfo.outputPath(`frame-${frame}`); mkdirSync(directory, { recursive: true });
        const image = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 1280, 720), directory);
        report.captures[frame] = image; expect(image.surfaceReleased).toBe(true);
        const fileName = `${id}-frame${frame}.png`;
        if (output) { mkdirSync(output, { recursive: true }); copyFileSync(image.path, resolve(output, fileName)); }
        if (baseline) {
          const beforePath = resolve(baseline, fileName); expect(existsSync(beforePath), "Explicit before/after comparison requires the same case PNG").toBe(true);
          report.comparisons[frame] = imageDifference(PNG.sync.read(readFileSync(beforePath)), PNG.sync.read(readFileSync(image.path)));
          expect(report.comparisons[frame].mae, `${fileName}: unchanged illumination`).toBeLessThan(.1);
        }
      }
      report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
    } finally {
      if (page && !page.isClosed()) await invoke(page, "disposeCombinedPerformanceProbe").catch(error => { report.cleanupError = String(error); });
      mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
      if (output) { mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, `${id}.json`), JSON.stringify(report, null, 2)); }
      await launched.close();
    }
  });
}

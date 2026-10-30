import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { closeRcLighting, openRcLighting, rcLightingRow } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const label = process.env.MMD_RC_SKY_PERF_LABEL ?? "current";
const output = process.env.MMD_RC_SKY_PERF_OUTPUT ? resolve(process.env.MMD_RC_SKY_PERF_OUTPUT) : null;
const baseline = process.env.MMD_RC_SKY_PERF_BASELINE ? resolve(process.env.MMD_RC_SKY_PERF_BASELINE) : null;
const timestamps = process.env.MMD_RC_SKY_PERF_TIMESTAMPS !== "0";
const invoke = (page, name, value) => page.evaluate(async ({ name, value }) =>
  (await import("/test/e2e/helpers/rc-sky-occlusion-performance-probe.mjs"))[name](value), { name, value });
const configurations = [[640, 360], [1280, 720]].flatMap(([width, height]) => [false, true].flatMap(moving =>
  [false, true].map(enabled => ({ width, height, moving, enabled, id: `${width}x${height}-${moving ? "moving" : "static"}-${enabled ? "on" : "off"}` }))));
const reports = new Map();
function delta(active, off) {
  const value = report => ({ intervalMs: report.measurement.realtime.metrics.intervalMs?.median,
    controllerCpuMs: report.measurement.realtime.metrics.controllerCpuMs?.median,
    sourceCpuMs: report.measurement.realtime.metrics.sourceCpuMs?.median,
    gpuPassSumMs: report.measurement.realtime.gpu.passSumMs?.median,
    gpuRenderMs: report.measurement.realtime.gpu.renderPassMs?.median,
    gpuComputeMs: report.measurement.realtime.gpu.computePassMs?.median,
    completionWallMs: report.measurement.completion.metrics.completionWallMs?.median });
  const a = value(active), b = value(off);
  return Object.fromEntries(Object.keys(a).map(key => [key, Number.isFinite(a[key]) && Number.isFinite(b[key]) ? a[key] - b[key] : null]));
}

// Each resolution/state gets its own process; timings are diagnostic, not a CI speed threshold.
for (const configuration of configurations) test(`RC sky realtime performance: ${configuration.id}`, async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), report = { label, configuration, errors: [], consoleErrors: [], timestampRequest: timestamps,
    revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    interpretation: "Independent warmed process. Static ON-OFF includes fragment query and source checks; moving ON-OFF adds source deformation/BVH/field updates. GPU pass sums exclude submission gaps; completion wall includes CPU and GPU wait. Small original fixture, not large-PMX or low-end-device FPS." };
  let page;
  try {
    page = await launched.app.firstWindow();
    // Request timestamps on this diagnostic device before initialization, without changing app code.
    if (timestamps) {
      await page.addInitScript(() => {
        if (typeof GPUAdapter === "undefined") return;
        const requestDevice = GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice = function (descriptor = {}) {
          const requiredFeatures = new Set(descriptor.requiredFeatures ?? []);
          if (this.features.has("timestamp-query")) requiredFeatures.add("timestamp-query");
          return requestDevice.call(this, { ...descriptor, requiredFeatures: [...requiredFeatures] });
        };
      });
      await page.reload();
    }
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await invoke(page, "rcSkyPerformanceState").catch(() => null); // Installs the getter hook before project import.
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState(); project.physics.enabled = false; project.lighting.shadowEnabled = false;
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      project.lighting.rcSkyOcclusion = { enabled: false, strength: 0.75, minimum: 0.2, volume: { min: [-12, -8, -12], size: 32 } };
      await window.mmdModokiE2e.importProjectState(project);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    const number = async (key, value) => { const field = page.locator(`#bone-controls input[data-control-key='${key}']`); await field.fill(String(value)); await field.press("Enter"); };
    await page.locator("#info-model-select").selectOption("0");
    const category = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "庇移動")?.category);
    expect(category).toBeTruthy();
    for (const [frame, x] of [[0, 0], [60, 16]]) {
      await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter");
      await selectTimelineTrack(page, category, "庇移動"); await number("tx", x); await page.locator("#btn-bone-keyframe").click();
    }
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -20, ry: -38, rz: 0, camDistance: 31 })) await number(key, value);
    await page.locator("#current-frame").fill("0"); await page.locator("#current-frame").press("Enter");
    await openRcLighting(page, "rcSkyOcclusion");
    const section = rcLightingRow(page, "rcSkyOcclusion");
    await section.locator('[name="rcSkyOcclusionEnabled"]').setChecked(configuration.enabled);
    await expect(section.locator("[data-rc-sky-occlusion-status]")).toHaveAttribute("data-state", configuration.enabled ? "ready" : "off", { timeout: 45000 });
    await closeRcLighting(page);
    report.prepared = await invoke(page, "prepareRcSkyPerformance", configuration);
    expect(report.prepared.size).toEqual([configuration.width, configuration.height]);
    report.validationBeforeMeasurement = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validationBeforeMeasurement.count).toBe(0);
    report.measurement = await invoke(page, "measureRcSkyPerformance", { moving: configuration.moving });
    for (const measurement of [report.measurement.realtime, report.measurement.completion]) {
      expect(measurement.state.size).toEqual([configuration.width, configuration.height]);
      expect(measurement.frames).toBe(measurement === report.measurement.realtime ? 60 : 24);
      expect(measurement.validation.count).toBe(0);
      if (!configuration.enabled || !configuration.moving) expect(measurement.counts.fieldUpdates).toBe(0);
      else { expect(measurement.counts.fieldUpdates).toBeGreaterThan(0); expect(measurement.counts.computeDispatches).toBeGreaterThan(0); }
      if (configuration.enabled) expect(measurement.state.diagnostics.triangleCount).toBeGreaterThan(0);
      if (measurement.state.deviceTimestampQuery) expect(measurement.gpu.completeFrames).toBeGreaterThan(0);
    }
    expect(report.measurement.validationAfterCleanup.count).toBe(0);
    // Evidence image is outside both timing windows and uses one fixed authored pose.
    await page.evaluate(() => window.mmdModokiE2e.seekTo(0));
    const imageDirectory = testInfo.outputPath("reference-png"); mkdirSync(imageDirectory, { recursive: true });
    report.referencePng = await page.evaluate(({ path, width, height }) =>
      window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, width, height),
    { path: imageDirectory, width: configuration.width, height: configuration.height });
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]);
    reports.set(configuration.id, report);
    const off = reports.get(configuration.id.replace(/-on$/, "-off"));
    if (configuration.enabled && off) report.onMinusOff = delta(report, off);
    if (baseline) { const before = JSON.parse(readFileSync(resolve(baseline, `${configuration.id}.json`), "utf8")); report.afterMinusBaseline = delta(report, before); }
  } finally {
    if (page && !page.isClosed()) await invoke(page, "disposeRcSkyPerformanceProbe").catch(() => undefined);
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    if (output) { mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, `${configuration.id}.json`), JSON.stringify(report, null, 2)); }
    await launched.close();
  }
});

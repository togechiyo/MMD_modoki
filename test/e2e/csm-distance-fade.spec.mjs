import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const pose = { position: { x: 80, y: 80, z: -100 }, target: { x: -114, y: 80, z: 350 },
  direction: { x: -1, y: -.2, z: 1 }, roof: true };
const probe = (page, args) => page.evaluate(async args =>
  (await import("/test/e2e/helpers/csm-wall-band-probe.mjs")).inspectCsmWallBand(args), args);
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function setShadowDistance(page, distance) {
  await page.locator("#info-model-select").selectOption("__camera__");
  const panel = page.locator(".bottom-panel-inner");
  if (await panel.getAttribute("data-bottom-panel-mode") !== "camera") await page.locator("#btn-toolbar-mode-toggle").click();
  await expect(panel).toHaveAttribute("data-bottom-panel-mode", "camera");
  const slider = page.locator("#light-shadow-max-z");
  await expect(page.locator("#shadow-section")).toBeVisible();
  await expect(slider).toBeVisible();
  await expect(slider).toBeEnabled();
  await slider.focus(); await slider.press("Home");
  await expect(slider).toHaveValue("500");
  for (let value = 500; value < distance; value += 500) await slider.press("ArrowRight");
  await expect(slider).toHaveValue(String(distance));
  expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting.shadowMaxZ)).toBe(distance);
}

async function exportFrame(page, directory, state) {
  mkdirSync(directory, { recursive: true });
  const saved = await page.evaluate(({ directory, width, height }) =>
    window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, width, height),
  { directory, width: state.width, height: state.height });
  expect(saved).toMatchObject({ width: state.width, height: state.height, surfaceReleased: true });
  expect(saved.path).toBeTruthy();
  return PNG.sync.read(readFileSync(saved.path));
}

function measureFade(actual, clear, state) {
  expect([clear.width, clear.height]).toEqual([actual.width, actual.height]);
  const gray = (image, x, y) => {
    const index = (y * image.width + x) * 4;
    return (image.data[index] + image.data[index + 1] + image.data[index + 2]) / 3;
  };
  const end = state.splits.at(-1), rows = [];
  for (const sample of state.samples) {
    const x = Math.round(sample.x * actual.width / state.width), y = Math.round(sample.y * actual.height / state.height);
    if (x < 0 || y < 0 || x >= actual.width || y >= actual.height) continue;
    const reference = gray(clear, x, y);
    if (reference < 20) continue;
    rows.push({ height: sample.height, z: sample.z, depth: sample.depth, pixel: [x, y],
      ratio: gray(actual, x, y) / reference });
  }
  const near = rows.filter(row => row.depth >= end * .3 && row.depth <= end * .6);
  const tail = rows.filter(row => row.depth >= end * .7 && row.depth <= end + 50);
  const beyond = rows.filter(row => row.depth >= end + 20 && row.depth <= end + 100);
  const previousByHeight = new Map(), steps = [];
  for (const row of tail) {
    const previous = previousByHeight.get(row.height);
    if (previous && row.z - previous.z === 5
      && (row.pixel[0] !== previous.pixel[0] || row.pixel[1] !== previous.pixel[1])) {
      const delta = row.ratio - previous.ratio;
      steps.push({ height: row.height, fromDepth: previous.depth, toDepth: row.depth,
        delta, magnitude: Math.abs(delta) });
    }
    previousByHeight.set(row.height, row);
  }
  const nearRatio = near.length ? median(near.map(row => row.ratio)) : null;
  const transition = tail.filter(row => row.depth < end && row.ratio > nearRatio + .04 && row.ratio < .97);
  return { end, nearSamples: near.length, nearRatio, beyondSamples: beyond.length,
    beyondRatioRange: beyond.length ? [Math.min(...beyond.map(row => row.ratio)), Math.max(...beyond.map(row => row.ratio))] : null,
    tailSamples: tail.length, stepCount: steps.length,
    maxStep: steps.reduce((largest, step) => !largest || step.magnitude > largest.magnitude ? step : largest, null),
    minimumDelta: steps.length ? Math.min(...steps.map(step => step.delta)) : null,
    transitionPixels: new Set(transition.map(row => row.pixel.join(","))).size,
    transitionDepths: new Set(transition.map(row => row.z)).size,
    rows };
}

function expectSmoothFade(measurement, label) {
  expect(measurement.nearSamples, `${label}: near shadow coverage`).toBeGreaterThan(100);
  // The fully shaded reference wall is about 0.804 at this fixture light angle.
  // Preserve substantial nearby shadow instead of passing by disabling all shadows.
  expect(measurement.nearRatio, `${label}: retain near shadow`).toBeGreaterThan(.7);
  expect(measurement.nearRatio, `${label}: retain near shadow`).toBeLessThan(.9);
  expect(measurement.beyondSamples, `${label}: beyond-distance coverage`).toBeGreaterThan(25);
  expect(measurement.beyondRatioRange[0], `${label}: fully unshadowed beyond distance`).toBeGreaterThan(.98);
  expect(measurement.beyondRatioRange[1], `${label}: no brightness overshoot`).toBeLessThan(1.02);
  expect(measurement.stepCount, `${label}: independent tail steps`).toBeGreaterThan(20);
  // Baseline 3d6af55 had about 0.123/0.143 maximum steps at distance 1000/1500.
  // Evaluate each height separately: averaging wall rows could hide a remaining band.
  expect(measurement.maxStep.magnitude, `${label}: no abrupt final-distance step`).toBeLessThan(.04);
  expect(measurement.minimumDelta, `${label}: no dark band inside the fade`).toBeGreaterThan(-.02);
  expect(measurement.transitionPixels, `${label}: gradual transition pixels`).toBeGreaterThan(10);
  expect(measurement.transitionDepths, `${label}: gradual transition depths`).toBeGreaterThan(3);
}

function compareCaptureProfiles(viewport, exported) {
  const lookup = new Map(exported.rows.map(row => [`${row.height}:${row.z}`, row]));
  const differences = viewport.rows.filter(row => row.depth >= viewport.end * .7 && row.depth <= viewport.end + 50)
    .flatMap(row => {
      const other = lookup.get(`${row.height}:${row.z}`);
      return other ? [Math.abs(row.ratio - other.ratio)] : [];
    });
  expect(differences.length).toBeGreaterThan(100);
  return { samples: differences.length, mean: differences.reduce((sum, difference) => sum + difference, 0) / differences.length,
    maximum: Math.max(...differences) };
}

for (const backend of ["classic", "frameGraph"]) for (const penumbra of [false, true]) {
  test(`CSM final-distance fade preserves near shadows and PNG output: ${backend}, penumbra=${penumbra}`, async ({}, testInfo) => {
    test.setTimeout(240000);
    const report = { backend, penumbra, errors: [], consoleErrors: [], distances: [],
      interpretation: "Repository PMX wall plus a test-only roof. Compare identical shadow ON/OFF pixels at the same pose. Distances are authored through the GUI; diagnostic probe verifies effective values. Thresholds apply only to this fixture/light angle." };
    const launched = await launchMmdModoki(root);
    try {
      const page = await launched.app.firstWindow();
      page.on("pageerror", error => report.errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(async penumbra => {
        const state = window.mmdModokiE2e.exportProjectState();
        state.physics.enabled = false;
        Object.assign(state.lighting, { shadowEnabled: true, shadowMode: "cascaded", shadowPenumbraEnabled: penumbra,
          shadowMaxZ: 1000, shadowDistanceMultiplier: 1 });
        await window.mmdModokiE2e.importProjectState(state);
      }, penumbra);
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/shadow-stage/shadow-stage-wide.pmx"));
      await page.locator("#info-model-select").selectOption("__camera__");
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
      expect(await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics())).toMatchObject({
        engine: "WebGPU", effectiveMode: "cascaded", filter: penumbra ? "pcss" : "none",
      });
      const canvas = page.locator("#render-canvas");
      for (const distance of [1000, 1500]) {
        await setShadowDistance(page, distance);
        const args = { ...pose, overrides: { shadowMaxZ: distance } };
        const state = await probe(page, args);
        expect(state.settings.shadowMaxZ).toBe(distance);
        expect(state.splits.at(-1)).toBeCloseTo(distance, 4);
        expect(state.settings.frustumEdgeFalloff).toBe(0);
        const actual = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath(`${distance}-viewport-shadow.png`) }));
        const exported = await exportFrame(page, testInfo.outputPath(`${distance}-export-shadow`), state);
        const reference = await probe(page, { ...args, shadowEnabled: false });
        expect(reference.shadowEnabled).toBe(false);
        const clear = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath(`${distance}-viewport-clear.png`) }));
        const exportClear = await exportFrame(page, testInfo.outputPath(`${distance}-export-clear`), reference);
        const viewport = measureFade(actual, clear, state), png = measureFade(exported, exportClear, state);
        const comparison = compareCaptureProfiles(viewport, png);
        report.distances.push({ distance, state, reference, viewport, png, comparison });
        expectSmoothFade(viewport, `${distance} viewport`);
        expectSmoothFade(png, `${distance} PNG`);
        expect(comparison.mean, `${distance}: viewport/PNG transition agreement`).toBeLessThan(.02);
        expect(comparison.maximum, `${distance}: viewport/PNG largest ratio difference`).toBeLessThan(.06);
      }
      await page.evaluate(async () => (await import("/test/e2e/helpers/csm-wall-band-probe.mjs")).restoreCsmWallBandBaseline());
      report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(report.validation.count).toBe(0);
      expect(report.errors).toEqual([]);
      expect(report.consoleErrors).toEqual([]);
    } finally {
      mkdirSync(testInfo.outputDir, { recursive: true });
      writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
      await launched.close();
    }
  });
}

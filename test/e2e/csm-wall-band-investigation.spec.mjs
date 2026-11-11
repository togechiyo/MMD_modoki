import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const run = Date.now().toString();
const overrides = JSON.parse(process.env.MMD_CSM_WALL_OVERRIDES ?? "{}");
const roof = process.env.MMD_CSM_WALL_ROOF === "1";
const views = [
  { id: "near", position: { x: 80, y: 80, z: -100 }, target: { x: -114, y: 80, z: 350 } },
  { id: "mid", position: { x: 240, y: 120, z: 300 }, target: { x: -114, y: 80, z: 1000 } },
];
const lights = [
  { id: "downward", direction: { x: -1, y: -2, z: 0 } },
  { id: "grazing", direction: { x: -.15, y: -1, z: .8 } },
  { id: "shallow", direction: { x: -1, y: -.2, z: 1 } },
];
const invoke = (page, name, args) => page.evaluate(async ({ name, args }) =>
  (await import("/test/e2e/helpers/csm-wall-band-probe.mjs"))[name](args), { name, args });
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function profile(actual, clear, state) {
  const gray = (image, x, y) => {
    const i = (y * image.width + x) * 4;
    return (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
  };
  const grouped = new Map(), pixels = new Map(), measured = [];
  for (const sample of state.samples) {
    const x = Math.round(sample.x * actual.width / state.width), y = Math.round(sample.y * actual.height / state.height);
    if (x < 0 || y < 0 || x >= actual.width || y >= actual.height) continue;
    const reference = gray(clear, x, y), shadow = gray(actual, x, y);
    // Exclude nearly black reference pixels whose ratio would amplify rounding.
    if (reference < 20) continue;
    const row = { ...sample, pixel: [x, y], shadow, reference, ratio: shadow / reference };
    measured.push(row); pixels.set(`${x},${y}`, row);
    const rows = grouped.get(sample.z) ?? [];
    rows.push(row); grouped.set(sample.z, rows);
  }
  const perZ = [...grouped].map(([z, rows]) => ({ z, samples: rows.length,
    ratio: median(rows.map(row => row.ratio)), depth: median(rows.map(row => row.depth)),
    splitDistance: median(rows.map(row => row.splitDistance)),
    ratioBelow094: rows.filter(row => row.ratio < .94).length / rows.length,
    // Legacy alias: this threshold does not establish whether a surface is shadowed.
    darkPixelRatio: rows.filter(row => row.ratio < .94).length / rows.length }));
  const steps = perZ.slice(1).flatMap((row, i) => row.z - perZ[i].z === 5 ? [{
    fromZ: perZ[i].z, toZ: row.z, delta: row.ratio - perZ[i].ratio,
    fromDepth: perZ[i].depth, toDepth: row.depth,
    magnitude: Math.abs(row.ratio - perZ[i].ratio), splitDistance: Math.min(row.splitDistance, perZ[i].splitDistance),
  }] : []);
  const maximum = values => values.reduce((best, row) => !best || row.magnitude > best.magnitude ? row : best, null);
  const unique = [...pixels.values()];
  // Keep heights separate: a median across heights can hide a band on one wall row.
  // Repeated projections onto the same pixel do not provide another step measurement.
  const previousByHeight = new Map(), heightSteps = [];
  for (const row of [...measured].sort((a, b) => a.z - b.z)) {
    const previous = previousByHeight.get(row.height);
    if (previous && row.z - previous.z === 5
      && (previous.pixel[0] !== row.pixel[0] || previous.pixel[1] !== row.pixel[1])) {
      const delta = row.ratio - previous.ratio;
      heightSteps.push({ height: row.height, fromZ: previous.z, toZ: row.z,
        fromDepth: previous.depth, toDepth: row.depth, delta, magnitude: Math.abs(delta) });
    }
    previousByHeight.set(row.height, row);
  }
  const summarize = predicate => {
    const rows = measured.filter(row => predicate(row.depth));
    const regionPixels = new Map(rows.map(row => [row.pixel.join(","), row]));
    const distinct = [...regionPixels.values()];
    const selectedSteps = heightSteps.filter(step => predicate(step.fromDepth) && predicate(step.toDepth));
    return { samples: rows.length, uniquePixels: regionPixels.size,
      heights: [...new Set(rows.map(row => row.height))],
      depthRange: rows.length ? [Math.min(...rows.map(row => row.depth)), Math.max(...rows.map(row => row.depth))] : null,
      ratioRange: distinct.length ? [Math.min(...distinct.map(row => row.ratio)), Math.max(...distinct.map(row => row.ratio))] : null,
      ratioBelow094: distinct.length ? distinct.filter(row => row.ratio < .94).length / distinct.length : null,
      stepCount: selectedSteps.length, maxStep: maximum(selectedSteps) };
  };
  const crossing = split => {
    const selected = heightSteps.filter(step => Math.min(step.fromDepth, step.toDepth) <= split
      && Math.max(step.fromDepth, step.toDepth) > split);
    return { stepCount: selected.length, maxStep: maximum(selected) };
  };
  const finalSplit = state.splits.at(-1), terminalHalfWidth = 10;
  const distanceRegions = Number.isFinite(finalSplit) ? {
    configuredShadowMaxZ: state.settings.shadowMaxZ, finalSplit, terminalHalfWidth,
    meaning: "Disjoint view-depth regions. The final split, not configured shadowMaxZ, determines the sampled shadow limit. The +/-10 terminal band includes pixel-rounding/AA steps immediately before the split.",
    inside: summarize(depth => depth < finalSplit - terminalHalfWidth),
    finalBoundary: { ...summarize(depth => Math.abs(depth - finalSplit) <= terminalHalfWidth), crossing: crossing(finalSplit) },
    outside: summarize(depth => depth > finalSplit + terminalHalfWidth),
  } : null;
  const intermediateBlends = state.splits.slice(0, -1).map((split, index) => {
    const length = state.lengths[index], width = length * state.settings.cascadeBlendPercentage;
    const start = split - width;
    return { cascadeIndex: index, split, length, blendWidth: width, interval: [start, split],
      // Zero-width or invisible blend regions have zero coverage and null statistics.
      ...summarize(depth => width > 0 && depth >= start && depth <= split),
      crossing: crossing(split) };
  });
  return { meaning: "Same-pixel RGB mean ON/OFF ratio. ratioBelow094 is the fraction below 0.94, a diagnostic threshold dependent on material/light direction, not a shadow-presence or quality test. darkPixelRatio remains a legacy alias. Legacy maxStep/maxBoundaryStep use per-z medians across all distances and +/-40 around intermediate splits. New region/blend steps compare adjacent z samples at the same height with distinct pixels; both endpoints must lie in the region. Crossing steps are reported separately. Zero samples or steps mean unmeasured, not absence of banding.",
    samples: measured.length, uniquePixels: pixels.size,
    boundarySamples: measured.filter(row => row.splitDistance !== null && row.splitDistance <= 40).length,
    ratioBelow094: unique.length ? unique.filter(row => row.ratio < .94).length / unique.length : null,
    darkPixelRatio: unique.length ? unique.filter(row => row.ratio < .94).length / unique.length : null,
    maxStep: maximum(steps), maxBoundaryStep: maximum(steps.filter(row => row.splitDistance !== null && row.splitDistance <= 40)),
    distanceRegions, intermediateBlends, perZ, measured };
}

for (const penumbra of [false, true]) test(`Investigates CSM bands on the PMX wall: frameGraph penumbra=${penumbra}`, async () => {
  test.skip(process.env.MMD_CSM_WALL_INVESTIGATION !== "1", "Opt-in wall-band diagnostic image capture");
  test.setTimeout(240000);
  const output = resolve(root, "artifacts/e2e/csm-wall-band", run, penumbra ? "frameGraph-pcss" : "frameGraph-none");
  mkdirSync(output, { recursive: true });
  const report = { profileVersion: 2, penumbra, overrides, roof, errors: [], consoleErrors: [], cases: [],
    interpretation: "Repository-authored PMX loaded normally; positive-X wall face. Shadow OFF is a comparison reference. Runtime overrides are test-only and restored before each phase. This investigation records banding, not an assertion of visual correctness." };
  const launched = await launchMmdModoki(root);
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "frameGraph"));
    await page.reload();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    // Saved fixture settings choose the existing application None/PCSS routes.
    await page.evaluate(async penumbra => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      state.lighting.shadowEnabled = true;
      state.lighting.shadowMode = "cascaded";
      state.lighting.shadowPenumbraEnabled = penumbra;
      await window.mmdModokiE2e.importProjectState(state);
    }, penumbra);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/shadow-stage/shadow-stage-wide.pmx"));
    await page.locator("#info-model-select").selectOption("__camera__");
    report.runtime = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
    expect(report.runtime).toMatchObject({ engine: "WebGPU", effectiveMode: "cascaded", filter: penumbra ? "pcss" : "none" });
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe("frameGraph");
    const canvas = page.locator("#render-canvas");
    for (const view of views) for (const light of lights) {
      const id = `${view.id}-${light.id}`, args = { position: view.position, target: view.target, direction: light.direction, overrides, roof };
      const state = await invoke(page, "inspectCsmWallBand", args);
      expect(state.samples.length).toBeGreaterThan(0);
      const actual = PNG.sync.read(await canvas.screenshot({ path: resolve(output, `${id}-actual.png`) }));
      const reference = await invoke(page, "inspectCsmWallBand", { ...args, shadowEnabled: false });
      const clear = PNG.sync.read(await canvas.screenshot({ path: resolve(output, `${id}-unshadowed.png`) }));
      expect([clear.width, clear.height]).toEqual([actual.width, actual.height]);
      const measurement = profile(actual, clear, state);
      report.cases.push({ id, view, light, state, reference, measurement });
      expect(measurement.samples).toBeGreaterThan(0);
    }
    await invoke(page, "restoreCsmWallBandBaseline");
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.consoleErrors).toEqual([]);
  } finally {
    writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

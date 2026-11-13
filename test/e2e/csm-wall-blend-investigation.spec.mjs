import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../.."), run = Date.now().toString();
const overrides = JSON.parse(process.env.MMD_CSM_BLEND_OVERRIDES ?? "{}");
const blends = JSON.parse(process.env.MMD_CSM_BLEND_VALUES ?? "[0,0.02,0.05,0.1,0.2,0.3]");
const occluder = process.env.MMD_CSM_BLEND_OCCLUDER ?? "none";
const variants = process.env.MMD_CSM_BLEND_VARIANTS === "1";
if (!Array.isArray(blends) || !blends.length || blends.some(value => !Number.isFinite(value) || value < 0 || value > .3)) {
  throw new Error("Diagnostic blends must be a nonempty array within 0..0.3");
}
if ("bias" in overrides || "normalBias" in overrides) throw new Error("Owner requires bias and normalBias to remain fixed");
const invoke = (page, name, args) => page.evaluate(async ({ name, args }) =>
  (await import("/test/e2e/helpers/csm-wall-blend-probe.mjs"))[name](args), { name, args });
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function profile(actual, clear, state) {
  const gray = (image, x, y) => {
    const offset = (y * image.width + x) * 4;
    return (image.data[offset] + image.data[offset + 1] + image.data[offset + 2]) / 3;
  };
  const rows = state.samples.flatMap(sample => {
    const x = Math.round(sample.x * actual.width / state.width), y = Math.round(sample.y * actual.height / state.height);
    if (x < 0 || y < 0 || x >= actual.width || y >= actual.height) return [];
    const reference = gray(clear, x, y);
    return reference < 20 ? [] : [{ ...sample, pixel: [x, y], reference,
      shadow: gray(actual, x, y), ratio: gray(actual, x, y) / reference }];
  });
  const summarize = selected => {
    const unique = [...new Map(selected.map(row => [row.pixel.join(","), row])).values()];
    const values = unique.map(row => row.ratio);
    return { samples: selected.length, uniquePixels: unique.length,
      ratioRange: values.length ? [Math.min(...values), Math.max(...values)] : null,
      median: values.length ? median(values) : null,
      medianDrop: unique.length ? median(unique.map(row => row.reference - row.shadow)) : null,
      // Diagnostic threshold only: do not call this shadow presence or image quality.
      fractionBelow0995: values.length ? values.filter(value => value < .995).length / values.length : null,
      nextUvOutside: unique.filter(row => !row.next.uvInside).length,
      nextDepthOutside: unique.filter(row => !row.next.depthInside).length };
  };
  const boundaries = state.boundaries.map(boundary => {
    const selected = rows.filter(row => row.boundary === boundary.index), previous = new Map(), steps = [];
    for (const row of selected) {
      const last = previous.get(row.height);
      if (last?.pixel.join(",") === row.pixel.join(",")) continue;
      if (last) {
        steps.push({ height: row.height, fromDepth: last.depth, toDepth: row.depth,
          delta: row.ratio - last.ratio, magnitude: Math.abs(row.ratio - last.ratio) });
      }
      previous.set(row.height, row);
    }
    const bins = new Map();
    for (const row of selected) {
      const bin = Math.floor(row.depth / 2) * 2;
      const values = bins.get(bin) ?? []; values.push(row); bins.set(bin, values);
    }
    const heights = [...new Set(selected.map(row => row.height))].map(height => {
      const atHeight = selected.filter(row => row.height === height);
      const crossing = steps.find(step => step.height === height && step.fromDepth <= boundary.split && step.toDepth > boundary.split);
      return { height, ...summarize(atHeight), crossingStep: crossing ?? null };
    });
    return { ...boundary, windowSummary: summarize(selected), heights,
      // With the authored beam, height 75 is well inside the known shadow;
      // 30/125 are outside, and 50/100 are closer to the geometric shadow edges.
      coreSummary: state.occluder === "beam" ? summarize(selected.filter(row => row.height === 75)) : null,
      blendSummary: summarize(selected.filter(row => row.inBlend)),
      beforeSummary: summarize(selected.filter(row => row.depth < boundary.blendStart)),
      afterSummary: summarize(selected.filter(row => row.depth > boundary.split)),
      maxStep: steps.reduce((best, step) => !best || step.magnitude > best.magnitude ? step : best, null),
      stepCount: steps.length, bins: [...bins].map(([depth, values]) => ({ depth, ...summarize(values) })) };
  });
  return { rows, boundaries,
    interpretation: "Same-pixel shadow ON/OFF RGB ratios at five wall heights and 0.5 world-Z increments. Material modes change shading, not geometry. Boundary windows cover both sides; zero coverage is unmeasured. Projection coverage uses receiver world coordinates without caster normal-bias displacement. Beam core at height 75 separates missing shadow from the legitimate shadow edges. Max step alone is not an image-quality criterion." };
}

for (const penumbra of [false, true]) test(`Investigates CSM wall self-shadow and blend: penumbra=${penumbra}`, async () => {
  test.skip(process.env.MMD_CSM_BLEND_INVESTIGATION !== "1", "Opt-in wall self-shadow/blend diagnostic");
  test.setTimeout(300000);
  const output = resolve(root, "artifacts/e2e/csm-wall-blend", run, penumbra ? "pcss" : "none");
  mkdirSync(output, { recursive: true });
  const report = { penumbra, overrides, blends, occluder, variants, errors: [], consoleErrors: [], cases: [],
    interpretation: "Repository PMX, roof OFF, near-downward pose, optional authored beam. Compare MMD and Standard at specified blends and optional single-property controls. Bias/normalBias are fixed at baseline. RC and other effects stay at empty-project defaults. Production shadow settings are unchanged." };
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "frameGraph"));
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
    await expect(page.locator(".viewport-empty-state")).not.toBeVisible();
    report.runtime = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
    expect(report.runtime).toMatchObject({ engine: "WebGPU", effectiveMode: "cascaded", filter: penumbra ? "pcss" : "none" });
    const canvas = page.locator("#render-canvas");
    const defaultBlend = penumbra ? .2 : .1;
    const baseline = await invoke(page, "inspectCsmWallBlend", { materialMode: "mmd", blend: defaultBlend, occluder });
    report.baseline = baseline;
    expect(baseline.casterCount).toBe(occluder === "beam" ? 12 : 11);
    const plan = [{ label: "baseline", blend: defaultBlend, overrides: {} },
      ...[...new Set(blends)].map(blend => ({ label: `blend-${blend}`, blend, overrides })),
      ...(!penumbra && variants ? [
        { label: "depth-clamp-off", blend: defaultBlend, overrides: { depthClamp: false } },
        { label: "stabilize-off", blend: defaultBlend, overrides: { stabilizeCascades: false } },
      ] : []),
      { label: "baseline-repeat", blend: defaultBlend, overrides: {} }];
    for (const materialMode of ["mmd", "standard"]) for (const candidate of plan) {
      const { blend } = candidate;
      const id = `${materialMode}-${candidate.label}`, args = { materialMode, blend, overrides: candidate.overrides, occluder };
      const state = await invoke(page, "inspectCsmWallBlend", args);
      expect(state.settings.cascadeBlendPercentage).toBe(blend);
      expect(state.settings.shadowMaxZ).toBe(1000);
      for (const [field, value] of Object.entries(candidate.overrides)) expect(state.settings[field]).toBe(value);
      for (const [field, value] of Object.entries(baseline.settings)) {
        if (field !== "cascadeBlendPercentage" && !(field in candidate.overrides)) expect(state.settings[field], field).toBe(value);
      }
      expect([state.settings.bias, state.settings.normalBias]).toEqual([baseline.settings.bias, baseline.settings.normalBias]);
      expect(state.casterCount).toBe(baseline.casterCount);
      for (const field of ["lightDirection", "position", "target"]) {
        state[field].forEach((value, axis) => expect(value, `${field}[${axis}]`).toBeCloseTo(baseline[field][axis], 8));
      }
      expect(state.splits).toEqual(baseline.splits);
      expect(state.shadowMap.internalTextureType).toBe(baseline.shadowMap.internalTextureType);
      expect(state.material.mode).toBe(materialMode);
      expect(state.material.replacedMaterialCount).toBeGreaterThan(0);
      const actual = PNG.sync.read(await canvas.screenshot({ path: resolve(output, `${id}-shadow.png`) }));
      const reference = await invoke(page, "inspectCsmWallBlend", { ...args, shadowEnabled: false });
      expect(reference.shadowEnabled).toBe(false);
      expect(reference.settings).toEqual(state.settings);
      expect(reference.splits).toEqual(state.splits);
      expect(reference.casterCount).toBe(state.casterCount);
      expect([reference.settings.bias, reference.settings.normalBias]).toEqual([baseline.settings.bias, baseline.settings.normalBias]);
      const clear = PNG.sync.read(await canvas.screenshot({ path: resolve(output, `${id}-clear.png`) }));
      expect([clear.width, clear.height]).toEqual([actual.width, actual.height]);
      const measurement = profile(actual, clear, state);
      report.cases.push({ id, state, reference, measurement });
      expect(measurement.boundaries.some(boundary => boundary.windowSummary.uniquePixels > 20),
        "At least one intermediate boundary must be sampled; invisible boundaries remain explicitly unmeasured").toBe(true);
      if (occluder === "beam" && candidate.label === "baseline") {
        expect(measurement.boundaries.some(boundary => boundary.coreSummary.uniquePixels > 20 && boundary.coreSummary.medianDrop > 2),
          "Baseline must contain a measurable cast shadow on the wall, not only a lit surface").toBe(true);
      }
    }
    await invoke(page, "restoreCsmWallBlend");
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.consoleErrors).toEqual([]);
  } finally {
    writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

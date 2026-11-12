import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../.."), run = Date.now().toString();
const overrides = JSON.parse(process.env.MMD_CSM_BLEND_OVERRIDES ?? "{}");
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
      // Diagnostic threshold only: do not call this shadow presence or image quality.
      fractionBelow0995: values.length ? values.filter(value => value < .995).length / values.length : null,
      nextUvOutside: unique.filter(row => !row.next.uvInside).length };
  };
  const boundaries = state.boundaries.map(boundary => {
    const selected = rows.filter(row => row.boundary === boundary.index), previous = new Map(), steps = [];
    for (const row of selected) {
      const last = previous.get(row.height);
      if (last && last.pixel.join(",") !== row.pixel.join(",")) {
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
    return { ...boundary, windowSummary: summarize(selected),
      blendSummary: summarize(selected.filter(row => row.inBlend)),
      beforeSummary: summarize(selected.filter(row => row.depth < boundary.blendStart)),
      afterSummary: summarize(selected.filter(row => row.depth > boundary.split)),
      maxStep: steps.reduce((best, step) => !best || step.magnitude > best.magnitude ? step : best, null),
      stepCount: steps.length, bins: [...bins].map(([depth, values]) => ({ depth, ...summarize(values) })) };
  });
  return { rows, boundaries,
    interpretation: "Same-pixel shadow ON/OFF RGB ratios at five wall heights and 0.5 world-Z increments. Material modes change shading, not geometry. Boundary windows cover both sides; zero coverage is unmeasured. UV coverage uses receiver world coordinates without caster normal-bias displacement. No image-quality pass threshold is imposed." };
}

for (const penumbra of [false, true]) test(`Investigates CSM wall self-shadow and blend: penumbra=${penumbra}`, async () => {
  test.skip(process.env.MMD_CSM_BLEND_INVESTIGATION !== "1", "Opt-in wall self-shadow/blend diagnostic");
  test.setTimeout(300000);
  const output = resolve(root, "artifacts/e2e/csm-wall-blend", run, penumbra ? "pcss" : "none");
  mkdirSync(output, { recursive: true });
  const report = { penumbra, overrides, errors: [], consoleErrors: [], cases: [],
    interpretation: "Repository PMX, roof OFF, near-downward pose. Compare MMD and equivalent Standard colors at blend 0/.1/.2. RC and other effects stay at empty-project defaults. Production shadow settings are unchanged." };
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
    const baseline = await invoke(page, "inspectCsmWallBlend", { materialMode: "mmd", blend: .1 });
    report.baseline = baseline;
    expect(baseline.casterCount).toBe(11);
    for (const materialMode of ["mmd", "standard"]) for (const blend of [0, .1, .2]) {
      const id = `${materialMode}-${blend}`, args = { materialMode, blend, overrides };
      const state = await invoke(page, "inspectCsmWallBlend", args);
      expect(state.settings.cascadeBlendPercentage).toBe(blend);
      expect(state.settings.shadowMaxZ).toBe(1000);
      for (const [field, value] of Object.entries(overrides)) expect(state.settings[field]).toBe(value);
      expect(state.casterCount).toBe(baseline.casterCount);
      expect(state.splits).toEqual(baseline.splits);
      expect(state.shadowMap.internalTextureType).toBe(baseline.shadowMap.internalTextureType);
      expect(state.material.mode).toBe(materialMode);
      expect(state.material.replacedMaterialCount).toBeGreaterThan(0);
      const actual = PNG.sync.read(await canvas.screenshot({ path: resolve(output, `${id}-shadow.png`) }));
      const reference = await invoke(page, "inspectCsmWallBlend", { ...args, shadowEnabled: false });
      expect(reference.shadowEnabled).toBe(false);
      const clear = PNG.sync.read(await canvas.screenshot({ path: resolve(output, `${id}-clear.png`) }));
      expect([clear.width, clear.height]).toEqual([actual.width, actual.height]);
      const measurement = profile(actual, clear, state);
      report.cases.push({ id, state, reference, measurement });
      expect(measurement.boundaries.some(boundary => boundary.windowSummary.uniquePixels > 20),
        "At least one intermediate boundary must be sampled; invisible boundaries remain explicitly unmeasured").toBe(true);
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

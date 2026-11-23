import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, projectPoints } from "./helpers/rc-diffuse-gi-controls.mjs";
import { changeDirection, directions, makeCourtyard, measureRegion, regions } from "./helpers/rc-moire-courtyard.mjs";

const root = resolve(import.meta.dirname, "../..");
const additionalLightZ = [.53, .56, .59, .65, .68, .70];
const wallRegions = {
  ...regions,
  underCanopy: [[-26,99,128],[-20,99,128],[-20,106,128],[-26,106,128]],
  openCanopy: [[5,99,128],[11,99,128],[11,106,128],[5,106,128]],
};
const invoke = (page, method, arg) => page.evaluate(async ({ method, arg }) => {
  // eslint-disable-next-line import/no-unresolved -- Imported in the local test renderer.
  const probe = await import("/test/e2e/helpers/rc-moire-shadow-precision-probe.mjs");
  return probe[method](arg);
}, { method, arg });

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("compares CSM precision on walls under moving light with a shared Toon ramp", async ({}, testInfo) => {
  test.skip(process.env.MMD_CSM_SHADOW_PRECISION !== "1", "Opt-in full-resolution shadow target comparison");
  test.setTimeout(360000);
  const launched = await launchMmdModoki(root);
  const report = { cases: {}, frameCompletion: {}, errors: [] };
  const page = await launched.app.firstWindow();
  let baseline;
  try {
    page.on("pageerror", e => report.errors.push(e.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black", antialiasEnabled: true });
      Object.assign(state.lighting, { shadowEnabled: true, iblShadowsEnabled: false, characterContactShadowEnabled: false,
        rcDiffuseGi: { enabled: true, quality: "standard", rangeScale: .5, volume: null, strength: .5 } });
      state.effects.rcSceneEffectsInStack = true;
      state.effects.frameGraphPostStack = [{ id: "rcDiffuseGi", enabled: true }];
      if (state.effects.frameGraphInstances) state.effects.frameGraphInstances.order = ["rcDiffuseGi"];
      await window.mmdModokiE2e.importProjectState(state);
      // eslint-disable-next-line import/no-unresolved -- Imported in the local test renderer.
      window.roomProbe = await import("/test/e2e/helpers/rc-window-room-probe.mjs");
    });
    const model = resolve(launched.tempDir, "shadow-precision-courtyard.pmx");
    writeFileSync(model, makeCourtyard({ noToon: false, gray: .4, white: .7 }));
    expect(await page.evaluate(p => window.mmdModokiE2e.loadModel(p), model)).not.toBeNull();
    report.view = await camera(page, { tx: -1.96, ty: 89.52, tz: 100, rx: 2.4, ry: 5.5, camDistance: 98.4, camFov: 32.3 });
    const projected = Object.fromEntries(Object.entries(wallRegions).map(([id, world]) => [id, projectPoints(report.view, world)]));
    await expect.poll(() => page.evaluate(() => window.roomProbe.roomState().gi.view), { timeout: 45000 }).toBe(true);
    baseline = await invoke(page, "inspectShadowPrecision");
    test.skip(!baseline.renderableFloat32 || baseline.maxTextureSize < 8192, "Comparing the full-size historical 8192 targets requires 8K float RTTs");
    expect(baseline).toMatchObject({ depthClamp: false, filter: 0, colorFormat: "r32float", size: [6144,6144], layers: 3, enabled: true });
    expect(baseline.casterIds).toHaveLength(6);
    // Exercise the actual default before any test-only texture substitutions.
    report.default = { state: baseline, grayBack: [] };
    for (const z of [...directions.map(v => v[2]), .62, ...additionalLightZ]) {
      await changeDirection(page, [-.2, -.65, z]);
      await page.evaluate(async () => {
        // eslint-disable-next-line import/no-unresolved -- Renderer-side Vite module.
        await (await import("/test/e2e/helpers/csm-boundary-probe.mjs")).waitForShadowFrames();
      });
      const png = PNG.sync.read(await page.locator("#render-canvas").screenshot());
      const { pixels, darkCount } = measureRegion(png, projected.grayBack).stats;
      report.default.grayBack.push({ z, pixels, darkCount });
      expect(pixels).toBeGreaterThan(10000);
      expect(darkCount / pixels, `default flat gray wall at Z=${z}`).toBeLessThan(.0005);
    }
    const sweepOnly = process.env.MMD_CSM_SHADOW_SWEEP_ONLY === "1";
    const variants = sweepOnly ? [] : ["clear", "hard-baseline", "hard-clamp-on", "hard-float32", "pcss"];
    for (const variant of variants) {
      const surfaces = report.cases[variant] = {};
      const requestedSize = /^hard-float32-(\d+)$/.exec(variant);
      const expectedSize = requestedSize ? Number(requestedSize[1]) : variant === "clear" ? baseline.size[0] : 8192;
      for (const values of [...directions, [-.2,-.65,.62]]) {
        await changeDirection(page, values);
        const state = await invoke(page, "setShadowPrecisionVariant", variant);
        expect(state).toMatchObject({
          casterIds: baseline.casterIds, numCascades: baseline.numCascades, layers: baseline.layers,
          bias: baseline.bias, normalBias: baseline.normalBias, shadowMaxZ: baseline.shadowMaxZ,
          size: [expectedSize,expectedSize],
          depthClamp: variant === "hard-clamp-on", colorFormat: variant === "clear" || variant.startsWith("hard-float32") ? "r32float" : "r16float",
          enabled: variant !== "clear", filter: variant === "pcss" ? 7 : 0,
        });
        if (variant !== "pcss") expect(state).toMatchObject({ stabilizeCascades: baseline.stabilizeCascades,
          lambda: baseline.lambda, cascadeBlendPercentage: baseline.cascadeBlendPercentage, autoCalcDepthBounds: baseline.autoCalcDepthBounds });
        const image = PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(variant + "-z" + values[2] + ".png") }));
        const measured = Object.fromEntries(Object.entries(projected).map(([id, p]) => [id, measureRegion(image, p).stats]));
        const transforms = await invoke(page, "inspectShadowTransforms");
        surfaces[values[2]] = { state, transforms, regions: measured };
        if (variant === "hard-float32") {
          const reference = report.cases["hard-baseline"][values[2]].transforms;
          expect(reference.matrices).toHaveLength(baseline.numCascades);
          expect(reference.splits).toHaveLength(baseline.numCascades);
          expect(transforms).toEqual(reference);
        }
        if (variant !== "clear") {
          const reference = report.cases.clear[values[2]].regions;
          expect(reference.underCanopy.mean - measured.underCanopy.mean, "projected canopy shadow").toBeGreaterThan(10);
        }
      }
      if (variant !== "clear") report.frameCompletion[variant] = await invoke(page, "measureShadowFrameCompletion");
      // Try the cheaper texture only if full precision demonstrably improves both original views.
      if (variant === "hard-float32" && directions.every(dir => surfaces[dir[2]].regions.grayBack.darkCount
        < report.cases["hard-baseline"][dir[2]].regions.grayBack.darkCount * .5)) {
        variants.push("hard-float32-4096", "hard-float32-6144");
      }
      if (variant === "hard-float32-6144" && Object.values(surfaces).some(surface => surface.regions.grayBack.darkCount > 0)) {
        variants.push("hard-float32-7040");
      }
    }
    // These intermediate light directions were held out while choosing a map size.
    // Keep the camera fixed and measure the flat unoccluded gray wall at each one.
    report.additionalLightDirections = {};
    const sweepVariants = [
      ["hard-baseline", 8192, "r16float"],
      ["hard-float32-6144", 6144, "r32float"],
      ["hard-float32", 8192, "r32float"],
    ];
    for (const [variant,size,format] of sweepVariants) {
      const results = [];
      for (const z of additionalLightZ) {
        await changeDirection(page, [-.2, -.65, z]);
        const state = await invoke(page, "setShadowPrecisionVariant", variant);
        expect(state).toMatchObject({ size: [size,size], colorFormat: format, enabled: true, filter: variant === "pcss" ? 7 : 0,
          depthClamp: false, casterIds: baseline.casterIds, bias: baseline.bias, normalBias: baseline.normalBias,
          numCascades: baseline.numCascades, shadowMaxZ: baseline.shadowMaxZ });
        const png = PNG.sync.read(await page.locator("#render-canvas").screenshot());
        const { pixels, darkCount } = measureRegion(png, projected.grayBack).stats;
        results.push({ z, pixels, darkCount });
      }
      report.additionalLightDirections[variant] = { results,
        worst: results.reduce((max, value) => value.darkCount > max.darkCount ? value : max) };
      if (variant === "hard-float32" && report.additionalLightDirections["hard-float32-6144"].worst.darkCount > 0) {
        sweepVariants.push(["pcss", 8192, "r16float"]);
      }
    }
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.errors).toEqual([]);
    expect(report.validation.count).toBe(0);
  } finally {
    try {
      if (baseline) {
        report.restored = await invoke(page, "restoreShadowPrecision");
        expect(report.restored).toEqual(baseline);
      }
    } finally {
      mkdirSync(testInfo.outputDir, { recursive: true });
      writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
      await launched.close();
    }
  }
});

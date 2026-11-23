import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { projectPoints } from "./helpers/rc-diffuse-gi-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const precisionProbe = "/test/e2e/helpers/rc-moire-shadow-precision-probe.mjs";
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

// Tofu base: x = 2, y = 0. With light (0.3, -1, 0), its 3-unit height
// projects the far shadow edge 0.9 units past the base. Every sample is
// inside the plate's flat, unmarked inner disk (radius 3.4, y = 0).
function contactProfile(view, reference, actual) {
  expect([actual.width, actual.height]).toEqual([reference.width, reference.height]);
  const points = Array.from({ length: 125 }, (_, i) => (i + 1) / 100);
  const levels = [];
  const pixelAt = (point) => {
    const [[x, y, depth]] = projectPoints(view, [point]);
    const px = Math.floor(x * actual.width / 640), py = Math.floor(y * actual.height / 360);
    if (depth <= 0 || px < 0 || px >= actual.width || py < 0 || py >= actual.height) throw new Error("Contact probe outside viewport");
    return (py * actual.width + px) * 4;
  };
  for (const distance of points) {
    const samples = [];
    for (let row = -6; row <= 6; row++) {
      const i = pixelAt([2 + distance, 0, row * .09]);
      const delta = [0, 1, 2].reduce((sum, ch) => sum + reference.data[i + ch] - actual.data[i + ch], 0);
      samples.push(delta / 3);
    }
    levels.push(median(samples));
  }
  const band = (min, max) => median(levels.filter((_, i) => points[i] >= min && points[i] <= max));
  const inner = band(.25, .60), lit = band(1.1, 1.25);
  const plateau = inner - lit;
  const crossing = (fraction, descending) => points.find((d, i) => descending
    ? d >= .6 && levels[i] <= lit + plateau * fraction
    : d < .6 && levels[i] >= lit + plateau * fraction) ?? null;
  const edge90 = crossing(.9, true), edge10 = crossing(.1, true);
  const first = projectPoints(view, [[2, 0, 0], [2.1, 0, 0]]);
  const pixelsPerUnit = Math.hypot((first[1][0] - first[0][0]) * actual.width / 640,
    (first[1][1] - first[0][1]) * actual.height / 360) / .1;
  return { profile: levels, pixelsPerUnit, near: band(.06, .15), inner, lit, plateau,
    gapTo20Pct: plateau > 3 ? crossing(.2, false) : null,
    edge50: plateau > 3 ? crossing(.5, true) : null,
    edgeWidth90To10: plateau > 3 && edge10 !== null && edge90 !== null ? edge10 - edge90 : null };
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("measures cast shadow contact on touching PMX fixtures across CSM precision variants", async ({}, testInfo) => {
  test.skip(process.env.MMD_CSM_SHADOW_PRECISION !== "1", "Opt-in WebGPU shadow precision comparison");
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root);
  const report = { variants: {}, pageErrors: [] };
  mkdirSync(testInfo.outputDir, { recursive: true });
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", e => report.pageErrors.push(e.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const api = window.mmdModokiE2e;
      const state = api.exportProjectState();
      state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      Object.assign(state.lighting, { shadowEnabled: true, characterContactShadowEnabled: false, iblShadowsEnabled: false });
      await api.importProjectState(state);
      api.setAutoRenderEnabled(true);
    });
    for (const file of ["plate.pmx", "tofu.pmx"]) {
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent", file))).not.toBeNull();
    }
    const select = page.locator("#info-model-select");
    await select.selectOption("1");
    const casts = page.locator("#chk-model-shadow");
    await casts.uncheck();
    await select.selectOption("__camera__");
    await page.evaluate(() => {
      const api = window.mmdModokiE2e;
      api.setLightDirection({ x: .3, y: -1, z: 0 });
      api.setCameraPose({ x: 6.5, y: 5.5, z: -6.5 }, { x: 2.1, y: .55, z: 0 });
    });
    const capture = async name => {
      await page.evaluate(async () => {
        // eslint-disable-next-line import/no-unresolved -- Renderer-side Vite module.
        const { waitForShadowFrames } = await import("/test/e2e/helpers/csm-boundary-probe.mjs");
        await waitForShadowFrames();
      });
      return PNG.sync.read(await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(name + ".png") }));
    };
    const casterOff = await capture("tofu-caster-off");
    const cameraPose = () => page.evaluate(() => ({ fov: window.mmdModokiE2e.exportProjectState().camera.fov,
      position: window.mmdModokiE2e.getCameraPosition(), target: window.mmdModokiE2e.getCameraTarget() }));
    report.view = await cameraPose();
    await select.selectOption("1");
    await casts.check();
    await select.selectOption("__camera__");
    const set = variant => page.evaluate(async ([path, id]) => (await import(path)).setShadowPrecisionVariant(id), [precisionProbe, variant]);
    const baseline = await page.evaluate(async path => (await import(path)).inspectShadowPrecision(), precisionProbe);
    const variants = ["hard-baseline", "hard-clamp-on", "hard-float32", "pcss", "hard-float32-4096", "hard-float32-6144"];
    try {
      expect((await set("clear")).enabled).toBe(false);
      const clear = await capture("shadow-off");
      expect(await cameraPose()).toEqual(report.view);
      for (const variant of variants) {
        const settings = await set(variant);
        const resolution = Number(variant.match(/-(\d+)$/)?.[1]) || baseline.size[0];
        expect(settings).toMatchObject({ enabled: true, size: [resolution, resolution], casterIds: baseline.casterIds,
          numCascades: baseline.numCascades, bias: baseline.bias, normalBias: baseline.normalBias, shadowMaxZ: baseline.shadowMaxZ });
        const image = await capture(variant);
        report.variants[variant] = { settings, ...contactProfile(report.view, clear, image) };
        expect(report.variants[variant].plateau, variant + " cast shadow on the plate").toBeGreaterThan(5);
        if (variant === "hard-baseline") report.casterOnly = contactProfile(report.view, casterOff, image);
      }
    } finally {
      expect(await page.evaluate(async path => (await import(path)).restoreShadowPrecision(), precisionProbe)).toEqual(baseline);
    }
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    // The positive control compares the same visible objects, with only the
    // tofu's caster flag toggled. It isolates its cast shadow from plate acne.
    expect(report.casterOnly.plateau).toBeGreaterThan(5);
    expect(report.casterOnly.edge50).toBeGreaterThan(.65);
    expect(report.casterOnly.edge50).toBeLessThan(1.05);
    expect(report.validation.count).toBe(0);
    expect(report.pageErrors).toEqual([]);
  } finally {
    writeFileSync(testInfo.outputPath("contact.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

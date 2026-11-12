import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const inspect = (page, args) => page.evaluate(async args =>
  (await import("/test/e2e/helpers/csm-viewport-edge-probe.mjs")).inspectCsmViewportEdge(args), args);
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function captureSurface(page, directory, state) {
  mkdirSync(directory, { recursive: true });
  const saved = await page.evaluate(({ directory, width, height }) =>
    window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, width, height),
  { directory, width: state.width, height: state.height });
  expect(saved).toMatchObject({ width: state.width, height: state.height, surfaceReleased: true });
  return { saved, image: PNG.sync.read(readFileSync(saved.path)) };
}

function expectUniformShadow(profile, label, materialPath) {
  // tofu uses shared toon01 (dark texel 205/255): MMD intentionally retains a
  // brighter shadow than Standard. Keep the edge-versus-middle limit identical.
  const presenceLimit = materialPath === "mmd" ? .9 : .8;
  expect(profile.upper.count, `${label}: upper floor coverage`).toBeGreaterThan(20);
  expect(profile.middle.count, `${label}: middle floor coverage`).toBeGreaterThan(20);
  expect(profile.upper.maximumDepth, `${label}: floor well before configured fade`).toBeLessThan(500);
  expect(profile.middle.median, `${label}: retain the roof shadow`).toBeLessThan(presenceLimit);
  expect(profile.upper.median, `${label}: upper floor retains its shadow`).toBeLessThan(presenceLimit);
  expect(profile.upper.maximum - profile.middle.median, `${label}: no fade tied to the viewport edge`).toBeLessThan(.04);
}

function compareFloor(actual, clear, state) {
  expect([actual.width, actual.height]).toEqual([clear.width, clear.height]);
  const gray = (image, x, y) => {
    const index = (y * image.width + x) * 4;
    return (image.data[index] + image.data[index + 1] + image.data[index + 2]) / 3;
  };
  const seen = new Set(), rows = [];
  for (const sample of state.samples) {
    const x = Math.round(sample.x * actual.width / state.width), y = Math.round(sample.y * actual.height / state.height);
    const pixel = `${x},${y}`;
    if (seen.has(pixel) || x < 0 || y < 0 || x >= actual.width || y >= actual.height) continue;
    seen.add(pixel);
    const reference = gray(clear, x, y);
    if (reference < 20) continue;
    rows.push({ ...sample, pixel: [x, y], ratio: gray(actual, x, y) / reference });
  }
  const region = name => {
    const selected = rows.filter(row => row.region === name);
    return { count: selected.length, median: selected.length ? median(selected.map(row => row.ratio)) : null,
      maximum: selected.length ? Math.max(...selected.map(row => row.ratio)) : null,
      maximumDepth: selected.length ? Math.max(...selected.map(row => row.depth)) : null };
  };
  return { upper: region("upper"), middle: region("middle"), rows };
}

for (const backend of ["classic", "frameGraph"]) for (const materialPath of ["standard", "mmd"]) {
test(`CSM automatic depth bounds preserve shadows at the viewport upper edge: ${backend}, ${materialPath}`, async ({}, testInfo) => {
  test.setTimeout(180000);
  const report = { backend, materialPath, errors: [], consoleErrors: [], pitches: [],
    interpretation: "Self-authored floor with StandardMaterial or the normally loaded tofu PMX material, and an overhead offscreen roof under vertical light. Shadow distance stays 1000 and auto depth bounds stay enabled; no diagnostic min/max override. Every sampled floor point is uniformly occluded, well before the configured fade distance. Compare shadow ON/OFF pixels at viewport upper and middle regions; also compare PNG surface capture at pitch35." };
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundBlack: true,
        backgroundDisplayMode: "black" });
      Object.assign(project.lighting, { shadowEnabled: true, shadowMode: "cascaded", shadowPenumbraEnabled: false,
        shadowMaxZ: 1000, shadowDistanceMultiplier: 1, intensity: 1, ambientIntensity: .2 });
      await window.mmdModokiE2e.importProjectState(project);
    });
    // The PMX supplies the normal loaded-model UI state only; the probe disables its
    // rendering before creating the floor/roof, so it cannot contribute visible depth.
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path),
      resolve(root, "test/fixtures/external-parent/tofu.pmx"))).not.toBeNull();
    await expect(page.locator(".viewport-empty-state")).not.toBeVisible();
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
    const canvas = page.locator("#render-canvas");
    // Collect every pitch before asserting so a failing baseline still records the entire comparison.
    for (const pitch of [25, 35, 45]) {
      const state = await inspect(page, { pitch, materialPath });
      const actual = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath(`${pitch}-shadow.png`) }));
      const exported = pitch === 35 ? await captureSurface(page, testInfo.outputPath("35-surface-shadow"), state) : null;
      const reference = await inspect(page, { pitch, materialPath, shadowEnabled: false });
      const clear = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath(`${pitch}-clear.png`) }));
      const exportClear = pitch === 35 ? await captureSurface(page, testInfo.outputPath("35-surface-clear"), reference) : null;
      const profile = compareFloor(actual, clear, state);
      const png = exported && exportClear ? { shadow: exported.saved, clear: exportClear.saved,
        profile: compareFloor(exported.image, exportClear.image, state) } : null;
      if (png) {
        const byWorld = new Map(png.profile.rows.map(row => [row.world.join(","), row.ratio]));
        const differences = profile.rows.filter(row => row.region !== "other" && byWorld.has(row.world.join(",")))
          .map(row => Math.abs(row.ratio - byWorld.get(row.world.join(","))));
        png.comparison = { count: differences.length, maximum: Math.max(...differences),
          mean: differences.reduce((sum, value) => sum + value, 0) / differences.length };
      }
      report.pitches.push({ pitch, state, reference, profile, png });
    }
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.consoleErrors).toEqual([]);
    for (const { pitch, state, reference, profile, png } of report.pitches) {
      expect(state.settings).toMatchObject({ shadowMaxZ: 1000, autoCalcDepthBounds: true, filter: 0 });
      expect(state.roofIsCaster).toBe(true);
      expect(state.shadowEnabled).toBe(true);
      expect(reference.shadowEnabled).toBe(false);
      expect(state.material).toMatchObject({ path: materialPath, mmd: materialPath === "mmd" });
      expect(state.splits.at(-1), `${pitch}: genuinely short automatically fitted range`).toBeLessThan(500);
      expectUniformShadow(profile, `${pitch} viewport`, materialPath);
      if (png) {
        expectUniformShadow(png.profile, `${pitch} PNG surface`, materialPath);
        expect(png.comparison.count).toBeGreaterThan(40);
        expect(png.comparison.mean).toBeLessThan(.02);
        expect(png.comparison.maximum).toBeLessThan(.04);
      }
    }
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
}

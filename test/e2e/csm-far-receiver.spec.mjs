import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const invoke = (page, name, args) => page.evaluate(async ({ name, args }) =>
  (await import("/test/e2e/helpers/csm-far-receiver-probe.mjs"))[name](args), { name, args });
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function compareWall(actual, clear, state) {
  expect([actual.width, actual.height]).toEqual([clear.width, clear.height]);
  const gray = (image, x, y) => {
    const offset = (y * image.width + x) * 4;
    return (image.data[offset] + image.data[offset + 1] + image.data[offset + 2]) / 3;
  };
  const unique = new Map();
  for (const sample of state.samples) {
    const x = Math.round(sample.x * actual.width / state.width), y = Math.round(sample.y * actual.height / state.height);
    if (x < 0 || y < 0 || x >= actual.width || y >= actual.height) continue;
    const reference = gray(clear, x, y);
    if (reference < 20) continue;
    unique.set(`${x},${y}`, { ...sample, pixel: [x, y], reference, shadow: gray(actual, x, y),
      ratio: gray(actual, x, y) / reference });
  }
  const rows = [...unique.values()], ratios = rows.map(row => row.ratio);
  return { count: rows.length, median: ratios.length ? median(ratios) : null,
    minimum: ratios.length ? Math.min(...ratios) : null, maximum: ratios.length ? Math.max(...ratios) : null,
    depthRange: rows.length ? [Math.min(...rows.map(row => row.depth)), Math.max(...rows.map(row => row.depth))] : null,
    beyondLastSplit: rows.filter(row => state.splits.length && row.depth > state.splits.at(-1)).length, rows };
}

for (const backend of ["classic", "frameGraph"]) for (const shadowMode of ["cascaded", "standard"]) {
test(`Far wall retains its roof shadow with the default camera range: ${backend}, ${shadowMode}`, async ({}, testInfo) => {
  test.setTimeout(180000);
  const report = { backend, shadowMode, errors: [], consoleErrors: [], cases: [],
    interpretation: "Authored opaque wall at view depth about 450, a near box, and an offscreen roof. Every sampled wall point is occluded. Default near=.15/far=100000 and small tilts expose underestimation of the last receiver by automatic depth bounds. Standard shadow control has explicit fixture bounds. Legacy automatic fitting is diagnostic only; no private asset is used." };
  const launched = await launchMmdModoki(root);
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async shadowMode => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false,
        backgroundBlack: true, backgroundDisplayMode: "black" });
      Object.assign(project.lighting, { shadowEnabled: true, shadowMode, shadowPenumbraEnabled: false,
        shadowBlurKernel: 0, shadowMaxZ: 1000, shadowDistanceMultiplier: 1, intensity: 1, ambientIntensity: .2 });
      await window.mmdModokiE2e.importProjectState(project);
    }, shadowMode);
    // The normal repository fixture load dismisses the UI overlay; its meshes are
    // disabled by the probe before any measurement of our authored geometry.
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path),
      resolve(root, "test/fixtures/external-parent/tofu.pmx"))).not.toBeNull();
    await expect(page.locator(".viewport-empty-state")).not.toBeVisible();
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend)).toBe(backend);
    const canvas = page.locator("#render-canvas");
    const plan = [-2, 0, 2].map(pitch => ({ pitch, legacyAutoBounds: false }));
    if (shadowMode === "cascaded" && process.env.MMD_CSM_FAR_RECEIVER_DIAGNOSTIC === "1") {
      plan.push({ pitch: 0, legacyAutoBounds: true }, { pitch: 2, legacyAutoBounds: true });
    }
    for (const candidate of plan) {
      const id = `${candidate.pitch}-${candidate.legacyAutoBounds ? "legacy-auto" : "configured"}`;
      const state = await invoke(page, "inspectCsmFarReceiver", candidate);
      const actual = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath(`${id}-shadow.png`) }));
      const reference = await invoke(page, "inspectCsmFarReceiver", { ...candidate, shadowEnabled: false });
      const clear = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath(`${id}-clear.png`) }));
      report.cases.push({ id, state, reference, profile: compareWall(actual, clear, state) });
    }
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
    for (const { id, state, reference, profile } of report.cases) {
      expect(state.reverseDepth).toBe(true);
      expect(state.camera).toMatchObject({ minZ: .15, maxZ: 100000 });
      expect(state.settings).toMatchObject({ mode: shadowMode, bias: .0005, normalBias: .01 });
      expect(state.roofIsCaster).toBe(true); expect(state.casterCount).toBe(1);
      expect(state.shadowEnabled).toBe(true); expect(reference.shadowEnabled).toBe(false);
      expect(reference.settings).toEqual(state.settings);
      expect(profile.count, `${id}: far wall measurement coverage`).toBeGreaterThan(100);
      if (state.legacyAutoBounds) continue;
      if (shadowMode === "cascaded") {
        expect(state.settings).toMatchObject({ autoCalcDepthBounds: false, shadowMaxZ: 1000, filter: 0 });
        expect(profile.beyondLastSplit, `${id}: all receivers included in CSM sampling range`).toBe(0);
      }
      expect(profile.depthRange[1], `${id}: receiver before configured distance fade`).toBeLessThan(500);
      expect(profile.maximum, `${id}: every measured point retains roof shadow`).toBeLessThan(.85);
      expect(profile.maximum - profile.minimum, `${id}: no bright band on the flat wall`).toBeLessThan(.04);
    }
  } finally {
    if (page) await invoke(page, "restoreCsmFarReceiver").catch(error => { report.cleanupError = String(error); });
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});
}

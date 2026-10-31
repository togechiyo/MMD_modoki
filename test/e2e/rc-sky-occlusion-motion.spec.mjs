import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { closeRcLighting, openRcLighting, rcLightingRow } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const section = page => rcLightingRow(page, "rcSkyOcclusion");
const enabled = page => section(page).locator('[name="rcSkyOcclusionEnabled"]');
const invoke = (page, name) => page.evaluate(async name =>
  // Browser-only helper served from the repository root by Vite.
  // eslint-disable-next-line import/no-unresolved
  (await import("/test/e2e/helpers/rc-sky-occlusion-motion-probe.mjs"))[name](), name);
async function open(page) {
  await openRcLighting(page, "rcSkyOcclusion");
}
const close = closeRcLighting;
async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter");
  await expect(page.locator("#current-frame")).toHaveValue(String(frame));
}
function difference(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  return sum / (a.width * a.height * 3);
}
// Exclude pixels whose normal-shader geometry/lighting changed when the roof moved.
// A change on the remaining receivers must come from RC rather than roof silhouettes.
function stationaryReceiverChange(off0, off10, on0, on10) {
  let pixels = 0, sum = 0;
  for (let i = 0; i < off0.data.length; i += 4) {
    if (off0.data[i + 3] < 250 || Math.max(...off0.data.subarray(i, i + 3)) < 30
      || [0, 1, 2].some(c => Math.abs(off0.data[i + c] - off10.data[i + c]) > 2)) continue;
    pixels++;
    for (let c = 0; c < 3; c++) sum += Math.abs((off0.data[i + c] - on0.data[i + c]) - (off10.data[i + c] - on10.data[i + c]));
  }
  return { pixels, difference: pixels ? sum / (pixels * 3) : 0 };
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires its fixture argument to be destructured.
test("RC sky occlusion follows GUI bone/morph keys on the first direct PNG after manual seeks", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), report = { errors: [], captures: {}, traces: [], normalPose: {}, comparisons: {} };
  let page;
  try {
    page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState(); project.physics.enabled = false;
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      await window.mmdModokiE2e.importProjectState(project);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 18, y: 12, z: -23 }, { x: 0, y: 1.5, z: 0 }));
    await invoke(page, "rcSkyMotionState"); // Install read-only instrumentation before enabling.
    await open(page); await enabled(page).check();
    await expect(section(page).locator("[data-rc-sky-occlusion-status]")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await close(page); await page.locator("#info-model-select").selectOption("0");
    const category = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "庇移動")?.category);
    expect(category).toBeTruthy();
    for (const [frame, boneX, morphWeight] of [[0, 0, 0], [10, 16, 0], [20, 0, 1]]) {
      await seek(page, frame); await selectTimelineTrack(page, category, "庇移動");
      const x = page.locator('#bone-controls input[data-control-key="tx"]');
      await x.fill(String(boneX)); await x.press("Enter"); await page.locator("#btn-bone-keyframe").click();
      const morphKey = page.getByRole("button", { name: "庇移動モーフ keyframe", exact: true });
      const morph = page.locator("#morph-controls .morph-slider-row").filter({ has: morphKey }).locator('input[type="range"]');
      await morph.focus(); await morph.press(morphWeight ? "End" : "Home");
      await expect(morph).toHaveValue(String(morphWeight)); await morphKey.click();
    }
    report.tracks = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().filter(track => ["庇移動", "庇移動モーフ"].includes(track.name)));
    for (const name of ["庇移動", "庇移動モーフ"]) expect(report.tracks.find(track => track.name === name)?.frames).toEqual([0, 10, 20]);
    await page.locator("#info-model-select").selectOption("__camera__");
    const capture = async name => {
      const directory = testInfo.outputPath(name); mkdirSync(directory, { recursive: true });
      const output = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360), directory);
      report.captures[name] = output; expect(output.surfaceReleased).toBe(true);
      const image = PNG.sync.read(readFileSync(output.path)); expect([image.width, image.height]).toEqual([640, 360]);
      return image;
    };

    await open(page); await enabled(page).uncheck(); await close(page);
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    const normal = [];
    for (const frame of [0, 10, 20, 0]) {
      await seek(page, frame); normal.push(await capture(`normal-${frame}-${normal.length}`));
      const normalState = await invoke(page, "rcSkyMotionState");
      report.normalPose[`${frame}-${normal.length}`] = normalState;
      expect(normalState.diagnostics.status).toBe("off");
      expect(normalState.providerReady).toBe(false);
    }
    expect(difference(normal[0], normal[1])).toBeGreaterThan(0.5);
    expect(difference(normal[1], normal[2])).toBeLessThan(0.15);
    expect(difference(normal[0], normal[3])).toBeLessThan(0.15);
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(true));
    await open(page); await enabled(page).check();
    await expect(section(page).locator("[data-rc-sky-occlusion-status]")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await close(page); await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    const images = [];
    for (const frame of [0, 10, 20, 0]) {
      await seek(page, frame); await invoke(page, "beginRcSkyMotionTrace");
      // No viewport frame or producer-ready wait is allowed between seek and this PNG.
      images.push(await capture(`rc-${frame}-${images.length}`));
      const trace = await invoke(page, "endRcSkyMotionTrace"), state = await invoke(page, "rcSkyMotionState");
      report.traces.push({ frame, state, trace });
      const drawIndex = trace.findIndex(event => event.kind === "material-draw"); expect(drawIndex).toBeGreaterThan(0);
      const draw = trace[drawIndex], prepared = trace.slice(0, drawIndex).filter(event => event.kind === "prepare-end").at(-1);
      expect(prepared.sceneFrameId).toBe(draw.sceneFrameId); expect(prepared.diagnostics.status).toBe("ready");
      expect(draw.providerReady).toBe(true); expect(draw.preparedSourceRevision).toBe(draw.sourceRevision);
      expect(draw.diagnostics.fieldRevision).toBe(prepared.diagnostics.fieldRevision);
      // The MMD Bezier evaluator approaches the first endpoints (~0.00023 at X=0).
      // RC must use the exact same evaluated pose as the ordinary shader path.
      expect(draw.boneX).toBe(report.normalPose[`${frame}-${images.length}`].boneX);
      expect(draw.boneX).toBeCloseTo(frame === 10 ? 16 : 0, 3);
      expect(draw.morphWeights.length).toBeGreaterThan(0);
      for (const weight of draw.morphWeights) expect(weight).toBeCloseTo(frame === 20 ? 1 : 0, 5);
      expect(await page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled())).toBe(false);
    }
    report.comparisons = { bone: difference(images[0], images[1]), equivalentMorph: difference(images[1], images[2]),
      reverseSeek: difference(images[0], images[3]), receivers: stationaryReceiverChange(normal[0], normal[1], images[0], images[1]) };
    expect(report.comparisons.bone).toBeGreaterThan(0.5); expect(report.comparisons.equivalentMorph).toBeLessThan(0.15);
    expect(report.comparisons.reverseSeek).toBeLessThan(0.15);
    expect(report.comparisons.receivers.pixels).toBeGreaterThan(1000); expect(report.comparisons.receivers.difference).toBeGreaterThan(0.1);
    expect(report.traces[1].state.diagnostics.fieldRevision).toBeGreaterThan(report.traces[0].state.diagnostics.fieldRevision);
    expect(report.traces[3].state.diagnostics.fieldRevision).toBeGreaterThan(report.traces[2].state.diagnostics.fieldRevision);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]);
  } finally {
    if (page && !page.isClosed()) await invoke(page, "disposeRcSkyMotionProbe").catch(() => undefined);
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

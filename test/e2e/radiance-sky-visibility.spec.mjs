import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const invoke = (page, name, value) => page.evaluate(async ({ name, value }) =>
  (await import("/test/e2e/helpers/radiance-sky-visibility-probe.mjs"))[name](value), { name, value });
const dialog = page => page.locator('[data-popup-id="experimental-settings"]');
const enabled = page => dialog(page).locator('[name="radianceSkyEnabled"]');
const mode = page => dialog(page).locator('[name="radianceSkyMode"]');
async function open(page) {
  await page.locator('.app-menu-group:has([data-menu-command="tools.experimentalSettings"]) > .app-menu-trigger').click();
  await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
  await expect(enabled(page)).toBeVisible();
}
async function close(page) { await dialog(page).locator(".app-menu-dialog-close").click(); }
async function ready(page, afterRevision = -1) {
  await expect.poll(async () => {
    const state = await invoke(page, "skyState");
    return state.diagnostics?.status === "ready" && state.diagnostics.fieldRevision > afterRevision;
  }, { timeout: 45000 }).toBe(true);
}
async function setup(page) {
  await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
  await page.evaluate(async () => {
    const project = window.mmdModokiE2e.exportProjectState();
    project.physics.enabled = false; project.lighting.shadowEnabled = false;
    Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
    await window.mmdModokiE2e.importProjectState(project);
  });
  await invoke(page, "createSkyVisibilityProbe");
}
async function savedEffectSettings(page) {
  return page.evaluate(() => {
    const effects = window.mmdModokiE2e.exportProjectState().effects;
    // The fixture changes camera FOV/distance. These three values are recalculated from that
    // camera even with DoF disabled; compare all remaining persisted effect settings.
    delete effects.dofFocalLength;
    delete effects.dofFocusDistanceMm;
    delete effects.dofLensDistortion;
    return effects;
  });
}
function imageDifference(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) sum += Math.abs(a.data[i + c] - b.data[i + c]);
  return sum / (a.width * a.height * 3);
}
// Independent CPU ray/rectangle oracle for the upper 16 diagnostic directions and a known flat roof.
function roofVisibility({ x = 0.125, z = 0.125, half = 2, bottom = 2 } = {}) {
  let visible = 0, total = 0;
  for (const y of [0.75, 0.25]) for (let u = 0; u < 8; u++) {
    const phi = (u + 0.5) * Math.PI / 4, distance = (bottom - 0.05) / y;
    const radius = Math.sqrt(1 - y * y);
    const hitX = x + radius * Math.cos(phi) * distance, hitZ = z + radius * Math.sin(phi) * distance;
    total += y;
    if (Math.abs(hitX) > half || Math.abs(hitZ) > half) visible += y;
  }
  return visible / total;
}
function assertDiagnostic(value) {
  expect(value).not.toBeNull(); expect(value.pixels).toBe(4096);
  expect(value.nonFinite).toBe(0); expect(value.invalid).toBe(0);
}
async function assertClean(page, report) {
  report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
  report.final = await invoke(page, "skyState");
  expect(report.validation.count).toBe(0); expect(report.final.gpuErrors).toEqual([]); expect(report.errors).toEqual([]);
}
async function finish(launched, testInfo, report) {
  const page = launched.app.windows()[0];
  if (page && !page.isClosed()) {
    report.lastState = await invoke(page, "skyState").catch(error => String(error));
    report.lastValidation = await page.evaluate(() => window.mmdModokiE2e?.getWebGpuValidationDiagnostics()).catch(error => String(error));
    report.lastPostEffects = await page.evaluate(() => window.mmdModokiDiagnostics?.dumpPerformanceSnapshot().frameGraphPostEffects).catch(error => String(error));
  }
  mkdirSync(testInfo.outputDir, { recursive: true });
  writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
  await launched.close();
}

test("sky visibility lab: no emission, offscreen and distant occlusion, modes and resource lifetime", async ({}, testInfo) => {
  test.setTimeout(150000);
  const launched = await launchMmdModoki(root, { radianceLightingLab: true });
  const report = { errors: [], states: {}, diagnostics: {} };
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.message));
    await setup(page);
    const savedEffects = await savedEffectSettings(page);
    await open(page); await expect(enabled(page)).not.toBeChecked();
    await expect(dialog(page).locator("[data-radiance-sky-status]")).toHaveAttribute("data-state", "off");
    await enabled(page).check(); await ready(page); await close(page);
    const capture = async name => {
      await ready(page);
      report.states[name] = await invoke(page, "skyState");
      expect(report.states[name].diagnostics.emitterTriangles).toBe(0);
      expect(report.states[name].gpuErrors).toEqual([]);
      expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
      const value = report.diagnostics[name] = await invoke(page, "skyDiagnostic"); assertDiagnostic(value);
      const path = testInfo.outputPath(`${name}.png`); await page.locator("#render-canvas").screenshot({ path });
      return PNG.sync.read(readFileSync(path));
    };
    const outdoor = await capture("outdoor");
    expect(report.diagnostics.outdoor.rc).toBeCloseTo(1, 5); expect(report.diagnostics.outdoor.direct).toBeCloseTo(1, 5);
    await ready(page, await invoke(page, "skyFixture", "covered")); await capture("covered");
    expect(report.diagnostics.covered.direct).toBeLessThan(0.001);
    // The endpoint reconstruction fixes the old 0.125 residual for this low roof. The separate
    // comparison suite retains the legacy candidate and tests higher roofs/openings as well.
    expect(report.diagnostics.covered.rc).toBeLessThan(0.001);
    expect(report.diagnostics.covered.difference).toBeLessThan(0.001);
    await ready(page, await invoke(page, "skyFixture", "distant")); await capture("distant-roof");
    expect(report.states["distant-roof"].diagnostics.sceneBounds.max[1]).toBeGreaterThan(100);
    expect(report.diagnostics["distant-roof"].rc).toBeLessThan(0.001);
    expect(report.diagnostics["distant-roof"].direct).toBeLessThan(0.001);
    await ready(page, await invoke(page, "skyFixture", "roof")); const roofImage = await capture("finite-roof");
    report.roofOracle = roofVisibility();
    expect(report.diagnostics["finite-roof"].center[1]).toBeCloseTo(report.roofOracle, 5);
    expect(report.diagnostics["finite-roof"].center[0]).toBeLessThan(0.9);
    expect(imageDifference(outdoor, roofImage)).toBeGreaterThan(1);
    await invoke(page, "skyCamera", "low"); await capture("offscreen-roof");
    expect(report.states["offscreen-roof"].roofFrustum.outsidePlane).toBeGreaterThanOrEqual(0);
    expect(report.diagnostics["offscreen-roof"]).toEqual(report.diagnostics["finite-roof"]);
    await invoke(page, "skyCamera", "overview");
    await open(page); await mode(page).selectOption("reference"); await close(page); const reference = await capture("reference");
    await open(page); await expect(mode(page)).toHaveValue("reference");
    await mode(page).selectOption("difference"); await close(page); const difference = await capture("difference");
    expect(imageDifference(reference, difference)).toBeGreaterThan(1);
    // The early scene-RTT path is explicitly gated; camera RTTs remain supported.
    await invoke(page, "skyRenderTarget", "scene");
    await expect.poll(async () => (await invoke(page, "skyState")).diagnostics.status).toBe("unsupported");
    report.unsupported = await invoke(page, "skyState"); expect(report.unsupported.diagnostics.reason).toContain("custom render targets");
    await invoke(page, "skyRenderTarget", "none"); await ready(page);
    await invoke(page, "skyRenderTarget", "camera"); await ready(page, await invoke(page, "skyFixture", "open"));
    await capture("camera-rtt"); expect(report.diagnostics["camera-rtt"].rc).toBeCloseTo(1, 5);
    await invoke(page, "skyRenderTarget", "none");
    await open(page); await enabled(page).uncheck();
    await expect(dialog(page).locator("[data-radiance-sky-status]")).toHaveAttribute("data-resources-allocated", "false");
    const off = await invoke(page, "skyState"); expect(off.receiverCount).toBe(0);
    await expect.poll(async () => (await invoke(page, "skyState")).sceneFrameId).toBeGreaterThan(off.sceneFrameId + 2);
    expect((await invoke(page, "skyState")).diagnostics.prepareCount).toBe(off.diagnostics.prepareCount);
    await enabled(page).check(); await ready(page); await expect(mode(page)).toHaveValue("difference");
    await enabled(page).uncheck(); await close(page);
    expect(await savedEffectSettings(page)).toEqual(savedEffects);
    await open(page); await mode(page).selectOption("cascade"); await enabled(page).check(); await ready(page); await close(page);
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="ssao"]').click();
    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      // GUI additions are instances, while state.stack lists the legacy singleton stack.
      const controller = window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects.controller;
      return state.ready && state.executedFrameCount > 2 && controller?.instances.some(item => item.type === "ssao");
    });
    const geometryImage = await capture("ssao-geometry-compatible");
    report.geometryBrightPixels = 0;
    for (let i = 0; i < geometryImage.data.length; i += 4) {
      if (Math.min(geometryImage.data[i], geometryImage.data[i + 1], geometryImage.data[i + 2]) > 80) report.geometryBrightPixels++;
    }
    expect(report.geometryBrightPixels).toBeGreaterThan(300);
    await open(page); await enabled(page).uncheck(); await close(page);
    await assertClean(page, report);
  } finally { await finish(launched, testInfo, report); }
});

test("sky visibility producer precedes same-frame pose draws and direct PNG after seeks", async ({}, testInfo) => {
  test.setTimeout(150000);
  const launched = await launchMmdModoki(root, { radianceLightingLab: true });
  const report = { errors: [], captures: [], backendStates: [] };
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.message));
    await setup(page); await open(page); await enabled(page).check(); await ready(page); await close(page);
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    await invoke(page, "skyAnimateRoof");
    const captures = [];
    for (const frame of [0, 10, 20, 0]) {
      await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter");
      await invoke(page, "beginSkyTrace");
      const directory = testInfo.outputPath(`frame-${frame}-${captures.length}`); mkdirSync(directory, { recursive: true });
      const png = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360), directory);
      expect(png.surfaceReleased).toBe(true); expect([png.width, png.height]).toEqual([640, 360]);
      const trace = await invoke(page, "endSkyTrace"), state = await invoke(page, "skyState"), diagnostic = await invoke(page, "skyDiagnostic");
      const data = { frame, png, trace, state, diagnostic }; report.captures.push(data);
      data.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(data.validation.count).toBe(0); expect(state.gpuErrors).toEqual([]);
      assertDiagnostic(diagnostic); expect(state.diagnostics.status).toBe("ready");
      const drawIndex = trace.findIndex(entry => entry.kind === "receiver-draw"); expect(drawIndex).toBeGreaterThan(0);
      const draw = trace[drawIndex], beforeDraw = trace.slice(0, drawIndex);
      expect(beforeDraw.some(entry => entry.kind === "pose" && entry.sceneFrameId === draw.sceneFrameId)).toBe(true);
      const prepared = beforeDraw.filter(entry => entry.kind === "prepare-end").at(-1);
      expect(prepared.diagnostics.status).toBe("ready"); expect(prepared.sceneFrameId).toBe(draw.sceneFrameId);
      expect(draw.diagnostics.lastPreparedSceneFrameId).toBe(draw.sceneFrameId);
      expect(draw.diagnostics.fieldRevision).toBe(prepared.diagnostics.fieldRevision);
      expect(draw.diagnostics.sourceRevision).toBe(prepared.diagnostics.sourceRevision);
      expect(draw.boneX).toBe(frame === 10 ? 16 : 0); expect(draw.morph).toBe(frame === 20 ? 1 : 0);
      expect(trace.filter(entry => entry.kind === "prepare-end" && entry.sceneFrameId === draw.sceneFrameId)).toHaveLength(1);
      const image = PNG.sync.read(readFileSync(png.path)); captures.push(image);
      if (frame === 0) expect(diagnostic.center[1]).toBeCloseTo(roofVisibility(), 5);
      else expect(diagnostic.center[1]).toBeCloseTo(1, 5);
    }
    report.boneDifference = imageDifference(captures[0], captures[1]); expect(report.boneDifference).toBeGreaterThan(1);
    report.morphDifference = imageDifference(captures[1], captures[2]); expect(report.morphDifference).toBeLessThan(0.1);
    report.reverseSeekDifference = imageDifference(captures[0], captures[3]); expect(report.reverseSeekDifference).toBeLessThan(0.1);
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(true));
    // A real GUI backend reload recreates the session-only lab in OFF state.
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="post"]').click();
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(backend => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === backend, backend);
      await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
      await setup(page); await open(page); await expect(enabled(page)).not.toBeChecked();
      await enabled(page).check(); await ready(page); await close(page);
      const state = await invoke(page, "skyState"), diagnostic = await invoke(page, "skyDiagnostic");
      report.backendStates.push({ backend, state, diagnostic }); assertDiagnostic(diagnostic);
      expect(state.gpuErrors).toEqual([]);
      expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
      expect(diagnostic.rc).toBeCloseTo(1, 5); expect(state.receiverCount).toBe(1);
      await open(page); await enabled(page).uncheck(); await close(page);
      if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
      await page.locator('[data-effect-tab="post"]').click();
    }
    await assertClean(page, report);
  } finally { await finish(launched, testInfo, report); }
});

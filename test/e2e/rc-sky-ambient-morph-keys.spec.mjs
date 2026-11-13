import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRcSkyStage } from "../../scripts/generate-rc-sky-stage.mjs";
import { writePmx } from "../../scripts/generate-external-parent-test-models.mjs";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { camera, capture, difference, initialState, seek } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, closeRcLighting, openRcLighting, rcLightingInput, rcLightingStatus } from "./helpers/rc-lighting-controls.mjs";
import { measureSkyAmbientRegions, skyAmbientRegions } from "./helpers/rc-sky-ambient-regions.mjs";

const root = resolve(import.meta.dirname, "../.."), id = "rcSkyAmbient", roof = "庇移動モーフ", material = "材質テスト";
const probe = (page, name = "skyMorphState") => page.evaluate(async name =>
  (await import("/test/e2e/helpers/rc-sky-ambient-morph-probe.mjs"))[name](), name);
const key = (page, name) => page.getByRole("button", { name: `${name} keyframe`, exact: true });
const slider = (page, name) => page.locator("#morph-controls .morph-slider-row")
  .filter({ has: key(page, name) }).locator('input[type="range"]');
const history = (page, operation) => page.locator(`.app-menu-quick-button[data-menu-command="edit.${operation}"]`).click();
const frames = async (page, name) => (await probe(page))?.morphTracks.find(track => track.name === name)?.frames ?? [];

async function setMorph(page, name, value) {
  const control = slider(page, name);
  await control.focus(); await control.press(value === 0 ? "Home" : "End");
  await expect(control).toHaveValue(String(value));
  await expect.poll(async () => (await probe(page))?.weights[name]).toBe(value);
}
async function ready(page, triangles) {
  await openRcLighting(page, id);
  await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
  await expect.poll(async () => {
    const state = await probe(page);
    return { triangles: state?.diagnostics.triangleCount, ready: state?.providerReady };
  }, { timeout: 45000 }).toEqual({ triangles, ready: true });
  await closeRcLighting(page);
}
async function noReceivers(page) {
  await openRcLighting(page, id);
  await expect(rcLightingInput(page, id, "Enabled")).toBeChecked();
  await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
  await expect.poll(async () => {
    const state = await probe(page);
    return { receivers: state?.receiverCount, materials: state?.diagnostics.supportedMaterialCount,
      providerReady: state?.providerReady };
  }, { timeout: 45000 }).toEqual({ receivers: 0, materials: 0, providerReady: false });
  // The field is retained for Undo, so its cached triangle count is not active geometry.
  await closeRcLighting(page);
}
async function skyEnabled(page, enabled) {
  await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(enabled);
  await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", enabled ? "ready" : "off", { timeout: 45000 });
  await closeRcLighting(page);
}
async function fileMenu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("Sky Ambient retains stage occluders through GUI morph keys, undo and project restore", async ({}, testInfo) => {
  test.setTimeout(240000);
  const launched = await launchMmdModoki(root);
  const report = { errors: [], consoleErrors: [], shaderResponses: [], shaderRequestFailures: [], captures: {}, states: {}, comparisons: {} };
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    const shaderRequest = url => /\.(?:vertex|fragment)\.fx(?:[?#]|$)/i.test(url);
    page.on("response", response => {
      if (shaderRequest(response.url())) report.shaderResponses.push({ url: response.url(), status: response.status(),
        contentType: response.headers()["content-type"] ?? "" });
    });
    page.on("requestfailed", request => {
      if (shaderRequest(request.url())) report.shaderRequestFailures.push({ url: request.url(), error: request.failure()?.errorText });
    });
    await initialState(page, { fixed: false });
    await page.evaluate(async () => {
      await import("/test/e2e/helpers/rc-sky-ambient-morph-probe.mjs");
      const state = window.mmdModokiE2e.exportProjectState();
      // Authored fixture settings isolate sky shading and keep this regression small.
      Object.assign(state.lighting.rcSkyAmbient, { enabled: false, strength: 1, skyBrightness: 0,
        opacity: 1, quality: "standard", rangeScale: 1 });
      await window.mmdModokiE2e.importProjectState(state);
    });
    const auto = page.locator("#btn-auto-key");
    if (await auto.getAttribute("aria-pressed") === "true") await auto.click();
    const model = createRcSkyStage();
    model.materialSwitchMorph = true; // First material: alpha 1 -> 0.6, while the roof/walls stay opaque.
    const fullTriangles = model.materialGroups.reduce((count, group) => count + group.indices.length / 3, 0);
    const partialTriangles = fullTriangles - model.materialGroups[0].indices.length / 3;
    const modelPath = join(launched.tempDir, "sky-morph-stage.pmx");
    writeFileSync(modelPath, writePmx(model));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
    const view = await camera(page, { tx: 0, ty: 1.5, tz: 0, rx: -20, ry: -38, rz: 0, camDistance: 31 });
    await page.locator("#info-model-select").selectOption("0");
    const take = name => capture(page, testInfo, report, name);
    const regions = skyAmbientRegions(view);
    const neutral = await take("neutral");
    await addRcLighting(page, id); await ready(page, fullTriangles);
    const before = await take("before-morph-registration");
    report.comparisons.skyBefore = difference(neutral, before);
    expect(report.comparisons.skyBefore).toBeGreaterThan(.15);
    report.states.before = await probe(page);
    expect(report.states.before.runtimeAnimations).toBe(0);

    // Registering an unchanged zero value still creates the first runtime animation.
    await key(page, roof).click();
    await expect.poll(() => frames(page, roof)).toEqual([0]);
    await ready(page, fullTriangles);
    report.states.registered = await probe(page);
    expect(report.states.registered.runtimeAnimations).toBeGreaterThan(0);
    expect(report.states.registered.boneKeyCount).toBe(0);
    report.comparisons.registered = difference(before, await take("first-zero-key"));
    expect(report.comparisons.registered).toBeLessThan(.15);

    await history(page, "undo");
    await expect.poll(() => frames(page, roof)).toEqual([]);
    await ready(page, fullTriangles);
    report.comparisons.undo = difference(before, await take("undo-first-key"));
    expect(report.comparisons.undo).toBeLessThan(.15);
    await history(page, "redo");
    await expect.poll(() => frames(page, roof)).toEqual([0]);
    await ready(page, fullTriangles);

    await seek(page, 30); await setMorph(page, roof, 1); await key(page, roof).click();
    await expect.poll(() => frames(page, roof)).toEqual([0, 30]);
    await ready(page, fullTriangles);
    const moved = await take("roof-morph-key-30");
    report.states.moved = await probe(page);
    report.comparisons.canopy = { before: measureSkyAmbientRegions(before, regions).canopy.mean,
      moved: measureSkyAmbientRegions(moved, regions).canopy.mean };
    expect(report.comparisons.canopy.moved - report.comparisons.canopy.before).toBeGreaterThan(2);
    expect(report.states.moved.diagnostics.fieldRevision).toBeGreaterThan(report.states.registered.diagnostics.fieldRevision);
    await seek(page, 0); await ready(page, fullTriangles);
    await expect(slider(page, roof)).toHaveValue("0");
    report.comparisons.seekBack = difference(before, await take("seek-zero"));
    expect(report.comparisons.seekBack).toBeLessThan(.15);

    // A material visibility morph removes its own surfaces, not every stage surface.
    await key(page, material).click();
    await seek(page, 30); await setMorph(page, material, 1); await key(page, material).click();
    await expect.poll(() => frames(page, material)).toEqual([0, 30]);
    await ready(page, partialTriangles);
    report.states.partial = await probe(page);
    await take("partial-material-morph");
    await seek(page, 0); await ready(page, fullTriangles);
    await expect(slider(page, material)).toHaveValue("0");
    const savedTracks = (await probe(page)).morphTracks;
    const projectPath = join(launched.tempDir, "sky-morph-keys.json");
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, projectPath);
    await fileMenu(page, "file.saveProject");
    await expect.poll(() => {
      try { JSON.parse(readFileSync(projectPath, "utf8")); return true; }
      catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return false; throw error; }
    }).toBe(true);
    await seek(page, 30); await ready(page, partialTriangles);
    await fileMenu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await page.locator("#info-model-select").selectOption("0");
    await expect.poll(async () => (await probe(page))?.morphTracks).toEqual(savedTracks);
    await seek(page, 0); await ready(page, fullTriangles);
    report.comparisons.restored = difference(before, await take("restored-zero"));
    expect(report.comparisons.restored).toBeLessThan(.15);
    await seek(page, 30); await ready(page, partialTriangles);
    await expect(slider(page, roof)).toHaveValue("1");
    await expect(slider(page, material)).toHaveValue("1");
    report.states.restored = await probe(page);
    await take("restored-morph-key-30");
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.shaderResponses.filter(response => /text\/html/i.test(response.contentType))).toEqual([]);
    expect(report.shaderRequestFailures).toEqual([]);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    if (page && !page.isClosed()) await probe(page, "disposeSkyMorphProbe").catch(() => undefined);
    await launched.close();
  }
});

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("Sky Ambient retains placement keys and bypasses moving models as both casters and receivers", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root);
  const report = { errors: [], consoleErrors: [], captures: {}, states: {}, comparisons: {} };
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page, { fixed: false });
    await page.evaluate(async () => {
      await import("/test/e2e/helpers/rc-sky-ambient-morph-probe.mjs");
      const state = window.mmdModokiE2e.exportProjectState();
      Object.assign(state.lighting.rcSkyAmbient, { enabled: false, strength: 1, skyBrightness: 0,
        opacity: 1, quality: "standard", rangeScale: 1 });
      await window.mmdModokiE2e.importProjectState(state);
    });
    const auto = page.locator("#btn-auto-key");
    if (await auto.getAttribute("aria-pressed") === "true") await auto.click();
    const model = createRcSkyStage();
    const fullTriangles = model.materialGroups.reduce((count, group) => count + group.indices.length / 3, 0);
    const modelPath = join(launched.tempDir, "sky-bone-placement-stage.pmx");
    writeFileSync(modelPath, writePmx(model));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath);
    await camera(page, { tx: 0, ty: 1.5, tz: 0, rx: -20, ry: -38, rz: 0, camDistance: 31 });
    await page.locator("#info-model-select").selectOption("0");
    await addRcLighting(page, id); await ready(page, fullTriangles);
    const take = name => capture(page, testInfo, report, name);
    const boneFrames = async name => (await probe(page))?.boneTracks.find(track => track.name === name)?.frames ?? [];
    const setBoneX = async (name, value) => {
      const category = await page.evaluate(name => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === name)?.category, name);
      expect(category).toBeTruthy();
      await selectTimelineTrack(page, category, name);
      const x = page.locator('#bone-controls input[data-control-key="tx"]');
      await x.fill(String(value)); await x.press("Enter");
      await expect.poll(async () => Number(await x.inputValue())).toBe(value);
    };
    const registerBone = async () => page.locator("#btn-bone-keyframe").click();
    // The key need not be at frame zero: a single-key track has one constant pose.
    await seek(page, 12); await setBoneX("庇移動", 3); await ready(page, fullTriangles);
    const roofPreview = await take("roof-placement-preview");
    await registerBone();
    await expect.poll(() => boneFrames("庇移動")).toEqual([12]);
    await ready(page, fullTriangles);
    report.states.oneBone = await probe(page);
    expect(report.states.oneBone.runtimeAnimations).toBeGreaterThan(0);
    expect(report.states.oneBone.boneKeyCount).toBe(1);
    report.comparisons.roofRegistered = difference(roofPreview, await take("roof-placement-key"));
    expect(report.comparisons.roofRegistered).toBeLessThan(.15);

    // The budget is per track, not a single bone key across the whole model.
    await setBoneX("センター", 1); await ready(page, fullTriangles);
    const centerPreview = await take("center-placement-preview");
    await registerBone();
    await expect.poll(() => boneFrames("センター")).toEqual([12]);
    await ready(page, fullTriangles);
    report.states.twoBones = await probe(page);
    expect(report.states.twoBones.boneKeyCount).toBe(2);
    expect(report.states.twoBones.boneTracks.filter(track => track.frames.length > 0)).toHaveLength(2);
    const placement = await take("two-placement-keys");
    report.comparisons.centerRegistered = difference(centerPreview, placement);
    expect(report.comparisons.centerRegistered).toBeLessThan(.15);
    for (const frame of [0, 30, 12]) {
      await seek(page, frame); await ready(page, fullTriangles);
      report.comparisons[`constantPose${frame}`] = difference(placement, await take(`constant-pose-${frame}`));
      expect(report.comparisons[`constantPose${frame}`]).toBeLessThan(.15);
    }

    await seek(page, 30); await setBoneX("庇移動", 6); await registerBone();
    await expect.poll(() => boneFrames("庇移動")).toEqual([12, 30]);
    await noReceivers(page);
    report.states.animated = await probe(page);
    await take("second-bone-key-excludes-moving-model");
    await history(page, "undo");
    await expect.poll(() => boneFrames("庇移動")).toEqual([12]);
    await ready(page, fullTriangles);
    report.states.undo = await probe(page);
    expect(report.states.undo.receiverCount).toBeGreaterThan(0);
    expect(report.states.undo.diagnostics.supportedMaterialCount).toBeGreaterThan(0);
    await seek(page, 0); await ready(page, fullTriangles);
    const undoRecovered = await take("undo-second-key");
    report.comparisons.undo = difference(placement, undoRecovered);
    // Restoring receiver membership can refit the automatic volume. Verify the
    // recovered contribution at that same pose/grid rather than exact old samples.
    await skyEnabled(page, false);
    report.comparisons.undoSkyContribution = difference(undoRecovered, await take("undo-second-key-sky-off"));
    expect(report.comparisons.undoSkyContribution).toBeGreaterThan(1);
    await skyEnabled(page, true); await ready(page, fullTriangles);

    const savedTracks = (await probe(page)).boneTracks;
    const projectPath = join(launched.tempDir, "sky-bone-placement.json");
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, projectPath);
    await fileMenu(page, "file.saveProject");
    await expect.poll(() => {
      try { JSON.parse(readFileSync(projectPath, "utf8")); return true; }
      catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return false; throw error; }
    }).toBe(true);
    await seek(page, 30); await setBoneX("庇移動", 6); await registerBone();
    await noReceivers(page);
    // A strong optional sky-light addition must also be bypassed for moving models.
    await openRcLighting(page, id);
    const brightness = rcLightingInput(page, id, "SkyBrightness");
    await brightness.focus(); await brightness.press("End");
    await expect(brightness).toHaveValue("100");
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting.rcSkyAmbient.skyBrightness)).toBe(2);
    await noReceivers(page);
    const movingSkyOn = await take("moving-model-sky-on-with-added-light");
    await skyEnabled(page, false);
    report.comparisons.movingSkyBypass = difference(movingSkyOn, await take("moving-model-sky-off"));
    expect(report.comparisons.movingSkyBypass).toBeLessThan(.1);
    await skyEnabled(page, true); await noReceivers(page);
    await fileMenu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await page.locator("#info-model-select").selectOption("0");
    await expect.poll(async () => (await probe(page))?.boneTracks).toEqual(savedTracks);
    await ready(page, fullTriangles);
    report.states.restored = await probe(page);
    const restored = await take("restored-placement");
    report.comparisons.restored = difference(placement, restored);
    // Auto bounds stay fixed during pose editing, but refit on project load.
    // The center translation therefore changes the probe grid origin. Compare
    // sky ON/OFF at the restored pose instead of requiring identical grid samples.
    await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(false);
    await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", "off");
    await closeRcLighting(page);
    report.comparisons.restoredSkyContribution = difference(restored, await take("restored-placement-sky-off"));
    expect(report.comparisons.restoredSkyContribution).toBeGreaterThan(1);
    await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(true);
    await ready(page, fullTriangles);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    if (page && !page.isClosed()) await probe(page, "disposeSkyMorphProbe").catch(() => undefined);
    await launched.close();
  }
});

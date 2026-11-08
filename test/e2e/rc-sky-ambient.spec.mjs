import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, difference, initialState, seek } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, closeRcLighting, openPostEffects, openRcLighting, rcLightingInput, rcLightingRow,
  rcLightingStatus, registerRcLighting } from "./helpers/rc-lighting-controls.mjs";
import { measureSkyAmbientGiRetention, measureSkyAmbientRegions, skyAmbientRegions } from "./helpers/rc-sky-ambient-regions.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const withWebm = process.env.MMD_RC_SKY_AMBIENT_WEBM === "1";
const id = "rcSkyAmbient";
const row = page => rcLightingRow(page, id);
const input = (page, field) => rcLightingInput(page, id, field);
const status = page => row(page).locator("[data-rc-sky-ambient-status]");
const advancedDetails = page => row(page).locator(`[data-rc-volume-controls="${id}"]`);
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const settings = async page => (await project(page)).lighting[id];
const keys = state => state.keyframes?.effectAnimations?.tracks.find(track => track.effectId === id)?.keys ?? [];
const snapshot = state => ({ settings: state.lighting[id], keys: keys(state),
  stack: state.effects.frameGraphPostStack?.filter(entry => entry.id === id) ?? [],
  order: (state.effects.frameGraphInstances?.order ?? state.effects.frameGraphPostStack?.map(entry => entry.id) ?? []).filter(entry => entry === id) });
const history = (page, operation) => page.locator(`.app-menu-quick-button[data-menu-command="edit.${operation}"]`).click();

async function open(page) {
  await openPostEffects(page);
  const header = row(page).locator(`[data-effect-stack-item="${id}"]`);
  if (await header.getAttribute("aria-expanded") !== "true") await header.click();
  await expect(input(page, "Enabled")).toBeVisible();
}
async function ready(page) {
  await open(page);
  await expect(status(page)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
}
async function advanced(page) {
  await open(page);
  if (await advancedDetails(page).getAttribute("open") === null) await advancedDetails(page).locator("summary").click();
  await expect(input(page, "Quality")).toBeVisible();
}
async function slider(page, field, position) {
  if (field !== "Opacity") await advanced(page);
  const range = input(page, field);
  const step = Number(await range.getAttribute("step") ?? 1);
  await range.focus(); await range.press(position > 50 ? "End" : "Home");
  for (let i = 0; i < (position > 50 ? 100 - position : position) / step; i++) {
    await range.press(position > 50 ? "ArrowLeft" : "ArrowRight");
  }
  await expect(range).toHaveValue(String(position));
}
async function fileMenu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}
async function switchBackend(page, backend) {
  const before = await project(page);
  await openPostEffects(page);
  await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
  // Backend changes intentionally reload the renderer, then asynchronously
  // restore the project. Engine ready alone does not mean model/camera ready.
  await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
  await expect.poll(async () => {
    const state = await project(page);
    return { scene: state.scene, camera: state.camera, lighting: state.lighting };
  }).toEqual({ scene: before.scene, camera: before.camera, lighting: before.lighting });
}
async function savedProject(path) {
  let saved;
  await expect.poll(() => {
    try { saved = JSON.parse(readFileSync(path, "utf8")); return true; }
    catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return false; throw error; }
  }, { message: "Wait for the complete saved project JSON" }).toBe(true);
  return saved;
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires its fixture argument to be destructured.
test("Sky Ambient RC: GUI controls, neutral bypass, singleton keys and project/backend lifecycle", async ({}, testInfo) => {
  test.setTimeout(withWebm ? 420000 : 300000);
  const launched = await launchMmdModoki(root); // Public FrameGraph route, no experimental feature flags.
  const report = { errors: [], consoleErrors: [], captures: {}, differences: {}, checkpoints: {}, webm: { requested: withWebm } };
  let page;
  try {
    launched.app.on("window", exportPage => {
      exportPage.on("pageerror", error => report.errors.push(error.stack ?? error.message));
      exportPage.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    });
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page, { fixed: false });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    report.camera = await camera(page, { tx: 0, ty: 1.5, tz: 0, rx: -20, ry: -38, rz: 0, camDistance: 31 });
    const take = name => capture(page, testInfo, report, name);
    const compare = (name, a, b) => report.differences[name] = difference(a, b);
    const validate = async name => {
      const value = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      report.checkpoints[name] = value; expect(value.count).toBe(0); expect(report.errors).toEqual([]);
    };
    const neutral = await take("baseline-no-sky-ambient");
    // Master OFF also bypasses the stack's anti-aliasing. Compare the same
    // pipeline, rather than treating edge-only AA differences as light leakage.
    await openPostEffects(page); await page.locator("#btn-effect-toggle-framegraph").click(); await closeRcLighting(page);
    const masterNeutral = await take("baseline-master-off");
    await openPostEffects(page); await page.locator("#btn-effect-toggle-framegraph").click();
    await switchBackend(page, "classic");
    await closeRcLighting(page);
    const classicNeutral = await take("baseline-classic");
    await openPostEffects(page);
    await switchBackend(page, "frameGraph");
    await closeRcLighting(page);
    const legacyBefore = (await project(page)).lighting;

    await openPostEffects(page); await expect(row(page)).toHaveCount(0);
    await addRcLighting(page, id); await ready(page);
    await expect(row(page).locator(`[data-effect-stack-item="${id}"]`)).toHaveText("Sky Ambient RC");
    await expect(input(page, "Enabled")).toBeChecked();
    await expect(row(page).locator('input[type="range"]')).toHaveCount(6);
    await expect(row(page).locator('input[type="range"]:visible')).toHaveCount(1);
    await expect(input(page, "Opacity")).toBeVisible();
    await expect(status(page)).not.toBeVisible();
    await expect(advancedDetails(page)).toHaveJSProperty("open", false);
    await expect(row(page).locator(".range-number-input")).toHaveCount(0);
    await expect(row(page).locator("p:not([role='status'])")).toHaveCount(0);
    await expect(input(page, "BaseLight")).toHaveCount(0);
    for (const [field, value] of [["Opacity", "100"], ["Strength", "48"], ["Fill", "4"], ["SkyBrightness", "0"],
      ["RangeScale", "50"], ["Quality", "50"]]) {
      await expect(input(page, field)).toHaveValue(value);
      await expect(input(page, field).locator("..")).toHaveClass(/effect-layer-control-row/);
      await expect(input(page, field)).toHaveAttribute("min", "0");
      await expect(input(page, field)).toHaveAttribute("max", "100");
    }
    await expect(input(page, "Opacity")).toHaveAccessibleName(/^(濃度|Opacity)$/);
    await advanced(page);
    await expect(input(page, "Strength")).toHaveAccessibleName(/^(陰影の強さ|Shading strength)$/);
    await expect(input(page, "Fill")).toHaveAccessibleName(/^(暗部の残光|Minimum fill)$/);
    await expect(input(page, "SkyBrightness")).toHaveAccessibleName(/^(空の明るさ|Sky brightness)$/);
    await expect(input(page, "Quality")).toHaveAttribute("step", "50");
    await advancedDetails(page).locator("summary").click();
    expect(await settings(page)).toEqual({ enabled: true, opacity: 1, strength: .95, fill: .035, baseLight: .25, skyBrightness: 0,
      rangeScale: 1, quality: "standard", volume: null });
    await expect(status(page)).toHaveAttribute("data-automatic-volume", "true");
    await page.locator("#btn-effect-add-post").click();
    await expect(page.locator(`[data-effect-add-post="${id}"]`)).toBeDisabled();
    await page.locator("#btn-effect-add-post").click();
    await page.screenshot({ path: testInfo.outputPath("default-sky-ambient-panel.png") });
    await closeRcLighting(page);
    const defaultOn = await take("default-sky-ambient-on");
    const materialPrograms = await page.evaluate(async () => {
      const probe = await import("/test/e2e/helpers/rc-sky-ambient-probe.mjs");
      return probe.inspectSkyAmbientMaterials();
    });
    report.checkpoints.materials = materialPrograms.map(({ fragment, ...material }, index) => {
      writeFileSync(testInfo.outputPath(`material-${index}.wgsl`), fragment);
      return { ...material, ambientBaseHooks: (fragment.match(/rcSkyAmbientBase \+=/g) ?? []).length };
    });
    expect(compare("defaultOnVsNeutral", defaultOn, neutral)).toBeGreaterThan(.15);
    const regions = skyAmbientRegions(report.camera);
    const baselineRegions = measureSkyAmbientRegions(neutral, regions), defaultRegions = measureSkyAmbientRegions(defaultOn, regions);
    report.checkpoints.defaultRegions = { baseline: baselineRegions, on: defaultRegions };
    const defaultCanopyDarkening = baselineRegions.canopy.mean - defaultRegions.canopy.mean;
    expect(defaultCanopyDarkening).toBeGreaterThan(2);
    expect(Math.abs(baselineRegions.open.mean - defaultRegions.open.mean)).toBeLessThan(1);

    // Density blends the existing effect without changing its brightness controls.
    await open(page); await slider(page, "Opacity", 0); await closeRcLighting(page);
    const densityZero = await take("opacity-zero");
    expect(compare("opacityZeroVsNeutral", densityZero, neutral)).toBeLessThan(.1);
    expect((await settings(page)).strength).toBe(.95);
    await open(page); await slider(page, "Opacity", 50); await ready(page); await closeRcLighting(page);
    const densityHalf = await take("opacity-half");
    const halfDifference = compare("opacityHalfVsZero", densityHalf, densityZero);
    expect(halfDifference).toBeGreaterThan(.1);
    expect(halfDifference).toBeLessThan(compare("opacityFullVsZero", defaultOn, densityZero));
    await open(page); await slider(page, "Opacity", 100); await ready(page); await closeRcLighting(page);
    expect(compare("opacityFullRestored", await take("opacity-full-restored"), defaultOn)).toBeLessThan(.1);

    // Quality changes the real field dimensions, while range keeps its center.
    await advanced(page);
    const effectiveVolume = async () => JSON.parse(await status(page).getAttribute("data-effective-volume") ?? "null");
    const standardVolume = await effectiveVolume();
    expect(standardVolume?.size).toBeGreaterThan(0);
    const center = standardVolume.min.map(value => value + standardVolume.size / 2);
    for (const [position, quality, probeGrid] of [[0, "low", 8], [50, "standard", 16], [100, "high", 32]]) {
      await slider(page, "Quality", position); await ready(page);
      expect((await settings(page)).quality).toBe(quality);
      await expect(status(page)).toHaveAttribute("data-probe-grid", String(probeGrid));
      await closeRcLighting(page); await take(`quality-${quality}`); await validate(`quality-${quality}`);
    }
    await advanced(page); await slider(page, "Quality", 50); await ready(page);
    for (const [position, scale] of [[25, .5], [50, 1], [75, 2]]) {
      await slider(page, "RangeScale", position); await ready(page);
      expect((await settings(page)).rangeScale).toBe(scale);
      const volume = await effectiveVolume();
      expect(volume.size).toBeCloseTo(standardVolume.size * scale, 6);
      volume.min.forEach((value, axis) => expect(value + volume.size / 2).toBeCloseTo(center[axis], 6));
      expect((await settings(page)).volume).toBeNull();
      report.checkpoints[`range-${scale}`] = volume;
      await closeRcLighting(page); await take(`range-${scale}`);
    }
    // Each final arrow edit and quality step is independently undoable.
    await advanced(page); await input(page, "RangeScale").focus(); await input(page, "RangeScale").press("ArrowRight");
    expect((await settings(page)).rangeScale).toBeGreaterThan(2);
    await closeRcLighting(page); await history(page, "undo"); expect((await settings(page)).rangeScale).toBe(2);
    await advanced(page); await slider(page, "RangeScale", 50); await slider(page, "Quality", 0);
    expect((await settings(page)).quality).toBe("low");
    await closeRcLighting(page); await history(page, "undo"); expect((await settings(page)).quality).toBe("standard");
    await history(page, "redo"); expect((await settings(page)).quality).toBe("low");
    await history(page, "undo"); expect((await settings(page)).quality).toBe("standard");
    await advanced(page); await row(page).screenshot({ path: testInfo.outputPath("development-sky-ambient-card.png") });
    await ready(page); await expect(status(page)).toHaveAttribute("data-probe-grid", "16"); await closeRcLighting(page);
    expect(compare("rangeQualityRestored", await take("range-quality-restored"), defaultOn)).toBeLessThan(.1);

    // Shading and optional sky light are independent; neither changes the other's setting.
    await open(page); await slider(page, "Strength", 0); await closeRcLighting(page);
    expect(compare("strengthZeroVsNeutral", await take("strength-zero"), neutral)).toBeLessThan(.1);
    await open(page); await slider(page, "SkyBrightness", 100); await ready(page); await closeRcLighting(page);
    expect((await settings(page)).strength).toBe(0); expect((await settings(page)).skyBrightness).toBe(2);
    expect(compare("skyBrightnessWithoutShading", await take("sky-brightness-without-shading"), neutral)).toBeGreaterThan(.15);
    await history(page, "undo"); expect((await settings(page)).skyBrightness).toBe(0);
    await history(page, "undo"); expect((await settings(page)).strength).toBe(.95);
    await ready(page); await input(page, "Enabled").uncheck();
    await expect(status(page)).toHaveAttribute("data-state", "off"); await closeRcLighting(page);
    expect(compare("disabledVsNeutral", await take("sky-ambient-off"), neutral)).toBeLessThan(.1);
    await open(page); await input(page, "Enabled").check(); await ready(page);

    // Static sliders are authored independently from animated enabled/strength/opacity.
    await slider(page, "Fill", 10); await slider(page, "SkyBrightness", 10);
    // Keep nondefault development settings for the following save/backend/export checks.
    await slider(page, "RangeScale", 75); await slider(page, "Quality", 0); await ready(page);
    expect(await settings(page)).toEqual({ enabled: true, opacity: 1, strength: .95, fill: .1, baseLight: .25, skyBrightness: .2,
      rangeScale: 2, quality: "low", volume: null });
    await input(page, "Fill").focus(); await input(page, "Fill").press("ArrowRight");
    expect((await settings(page)).fill).toBe(.11);
    await closeRcLighting(page); await history(page, "undo"); expect((await settings(page)).fill).toBe(.1);
    await history(page, "redo"); expect((await settings(page)).fill).toBe(.11);
    await history(page, "undo"); expect((await settings(page)).fill).toBe(.1);
    const currentLighting = (await project(page)).lighting;
    expect(currentLighting.rcSkyOcclusion).toEqual(legacyBefore.rcSkyOcclusion);
    expect(currentLighting.rcDiffuseGi).toEqual(legacyBefore.rcDiffuseGi);
    const configuredOn = await take("configured-sky-ambient-on");
    expect(compare("staticSlidersVsDefault", configuredOn, defaultOn)).toBeGreaterThan(.1);

    // The shared master switch suspends the effect without rewriting its saved controls.
    const beforeMaster = snapshot(await project(page));
    await openPostEffects(page); await page.locator("#btn-effect-toggle-framegraph").click(); await closeRcLighting(page);
    expect(snapshot(await project(page))).toEqual(beforeMaster);
    expect(compare("masterOffVsNeutral", await take("framegraph-master-off"), masterNeutral)).toBeLessThan(.1);
    await openPostEffects(page); await page.locator("#btn-effect-toggle-framegraph").click(); await ready(page); await closeRcLighting(page);
    expect(compare("masterRestored", await take("framegraph-master-restored"), configuredOn)).toBeLessThan(.1);

    // All three RC consumers can share the stage and the material shader at once.
    for (const legacyId of ["rcSkyOcclusion", "rcDiffuseGi"]) {
      await addRcLighting(page, legacyId); await openRcLighting(page, legacyId);
      await expect(rcLightingStatus(page, legacyId)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    }
    await ready(page); await slider(page, "Opacity", 50); await closeRcLighting(page);
    await take("all-three-rc-effects-opacity-half"); await validate("all-three-rc-effects-opacity-half");
    for (const legacyId of ["rcSkyOcclusion", "rcDiffuseGi"]) {
      await openRcLighting(page, legacyId); await rcLightingInput(page, legacyId, "Enabled").uncheck();
      await expect(rcLightingStatus(page, legacyId)).toHaveAttribute("data-state", "off");
    }
    await ready(page); await slider(page, "Opacity", 100); await closeRcLighting(page);
    expect(compare("legacyEffectsDisabled", await take("sky-ambient-alone-again"), configuredOn)).toBeLessThan(.1);

    // Each key is registered with the public card button, including an explicit OFF key.
    const expectedKeys = [
      { frame: 0, value: { enabled: true, strength: 2, opacity: 0 } },
      { frame: 20, value: { enabled: true, strength: 2, opacity: 1 } },
      { frame: 40, value: { enabled: false, strength: 2, opacity: 1 } },
      { frame: 60, value: { enabled: true, strength: 2, opacity: 1 } },
    ];
    for (const key of expectedKeys) {
      await seek(page, key.frame); await open(page);
      // Enable before editing a slider, since OFF intentionally disables the controls.
      await input(page, "Enabled").check(); await slider(page, "Strength", key.value.strength * 50);
      await slider(page, "Opacity", key.value.opacity * 100);
      await input(page, "Enabled").setChecked(key.value.enabled);
      await registerRcLighting(page, id); await closeRcLighting(page);
    }
    expect(keys(await project(page))).toEqual(expectedKeys);
    expect((await settings(page)).fill).toBe(.1); expect((await settings(page)).skyBrightness).toBe(.2);
    expect((await project(page)).effects.frameGraphInstances?.instances?.some(instance => instance.type === id) ?? false).toBe(false);
    await seek(page, 10); await open(page);
    await expect(input(page, "Opacity")).toHaveValue("50"); await expect(input(page, "Strength")).toHaveValue("100");
    await expect(input(page, "Enabled")).toBeChecked();
    await closeRcLighting(page);
    await seek(page, 0); const key0 = await take("key-0-opacity-zero");
    expect(compare("key0VsNeutral", key0, neutral)).toBeLessThan(.1);
    await seek(page, 20); await ready(page); await closeRcLighting(page);
    const key20 = await take("key-20-on"); expect(compare("key20VsNeutral", key20, neutral)).toBeGreaterThan(.15);
    await seek(page, 40); const key40 = await take("key-40-off");
    expect(compare("key40VsNeutral", key40, neutral)).toBeLessThan(.1);
    await seek(page, 60); await ready(page); await closeRcLighting(page);
    expect(compare("key60VsKey20", await take("key-60-on"), key20)).toBeLessThan(.1);

    const file = testInfo.outputPath("sky-ambient-project.json");
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, file);
    await fileMenu(page, "file.saveProject");
    const saved = await savedProject(file), savedSnapshot = snapshot(saved);
    expect(saved.lighting[id]).toEqual({ enabled: true, opacity: 1, strength: 2, fill: .1, baseLight: .25, skyBrightness: .2,
      rangeScale: 2, quality: "low", volume: null });
    expect(keys(saved)).toEqual(expectedKeys);
    await open(page); await slider(page, "Fill", 100); await slider(page, "SkyBrightness", 100);
    await slider(page, "RangeScale", 50); await slider(page, "Quality", 50); await closeRcLighting(page);
    expect((await settings(page)).fill).toBe(1); expect((await settings(page)).skyBrightness).toBe(2);
    expect((await settings(page)).rangeScale).toBe(1); expect((await settings(page)).quality).toBe("standard");
    await fileMenu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await expect.poll(async () => snapshot(await project(page))).toEqual(savedSnapshot);
    await ready(page);
    await expect(input(page, "Opacity")).toHaveValue("100"); await expect(input(page, "Strength")).toHaveValue("100");
    await expect(input(page, "Fill")).toHaveValue("10");
    await expect(input(page, "RangeScale")).toHaveValue("75"); await expect(input(page, "Quality")).toHaveValue("0");
    await expect(status(page)).toHaveAttribute("data-probe-grid", "8");
    await expect(input(page, "SkyBrightness")).toHaveValue("10"); await closeRcLighting(page);
    expect(compare("projectRestored", await take("project-restored-on"), key20)).toBeLessThan(.15);

    for (const backend of ["classic", "frameGraph"]) {
      await switchBackend(page, backend);
      expect(snapshot(await project(page))).toEqual(savedSnapshot);
      if (backend === "classic") {
        await expect(row(page)).toHaveCount(0); await closeRcLighting(page);
        expect(compare("classicSuspendedVsNeutral", await take("classic-suspended"), classicNeutral)).toBeLessThan(.15);
      } else {
        await ready(page); await closeRcLighting(page);
        expect(compare("backendRestored", await take("framegraph-backend-restored"), key20)).toBeLessThan(.15);
      }
      await validate(backend);
    }

    // Deleting a singleton removes its track, while Undo restores the full settings/track/stack edit.
    await open(page); await row(page).locator(`[data-effect-stack-remove="${id}"]`).click();
    await expect(row(page)).toHaveCount(0); expect(keys(await project(page))).toEqual([]);
    expect((await settings(page)).enabled).toBe(false); await closeRcLighting(page);
    expect(compare("removedVsNeutral", await take("removed-sky-ambient"), neutral)).toBeLessThan(.1);
    await history(page, "undo"); expect(snapshot(await project(page))).toEqual(savedSnapshot);
    await ready(page); await closeRcLighting(page);
    expect(compare("undoRemoved", await take("undo-restored-sky-ambient"), key20)).toBeLessThan(.15);
    await history(page, "redo"); await openPostEffects(page); await expect(row(page)).toHaveCount(0);
    expect(keys(await project(page))).toEqual([]);
    await history(page, "undo"); expect(snapshot(await project(page))).toEqual(savedSnapshot);
    await ready(page); await row(page).screenshot({ path: testInfo.outputPath("final-sky-ambient-card.png") });
    await closeRcLighting(page);

    // PNG capture must prepare an enabled key without depending on a viewport refresh.
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    await seek(page, 40); expect(compare("manualCaptureOff", await take("manual-render-key-40-off"), neutral)).toBeLessThan(.1);
    await seek(page, 60); expect(compare("manualCaptureOn", await take("manual-render-key-60-on"), key20)).toBeLessThan(.15);
    expect(await page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled())).toBe(false);

    if (withWebm) {
      const webm = testInfo.outputPath("sky-ambient-keys.webm");
      await launched.app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, webm);
      await fileMenu(page, "file.webmExportSettings"); await page.locator("#webm-output-use-playback-range").uncheck();
      for (const [name, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 60]]) {
        await page.locator(`#webm-output-${name}`).fill(String(value)); await page.locator(`#webm-output-${name}`).press("Enter");
      }
      await page.locator("#webm-output-fps").selectOption("30"); await page.locator("#webm-output-include-audio").uncheck();
      await page.getByRole("button", { name: /^(WebM出力|Export WebM)$/ }).click();
      await expect.poll(() => existsSync(webm) && statSync(webm).size > 1000, { timeout: 90000 }).toBe(true);
      await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
      const frames = await page.evaluate(async path => {
        const bytes = await window.electronAPI.readBinaryFile(path), video = document.createElement("video"), canvas = document.createElement("canvas");
        canvas.width = 640; canvas.height = 360;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("2D context unavailable");
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
        try {
          const loaded = new Promise((resolve, reject) => {
            video.onloadeddata = resolve; video.onerror = () => reject(new Error("Sky Ambient RC WebM decode failed"));
          });
          video.src = url; await loaded;
          const result = [];
          for (const frame of [0, 20, 40, 60]) {
            const sought = new Promise(resolve => { video.onseeked = resolve; });
            video.currentTime = (frame + .1) / 30; await sought;
            context.drawImage(video, 0, 0); result.push(Array.from(context.getImageData(0, 0, 640, 360).data));
          }
          return result;
        } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
      }, webm);
      const references = [key0, key20, key40, key20];
      frames.forEach((pixels, index) => writeFileSync(testInfo.outputPath(`webm-frame-${index * 20}.png`),
        PNG.sync.write({ width: 640, height: 360, data: Buffer.from(pixels) })));
      report.webm = { requested: true, path: webm, frames: frames.map((frame, index) => ({ frame: index * 20,
        matching: difference(frame, references[index]), opposite: difference(frame, index % 2 ? key0 : key20) })) };
      for (const result of report.webm.frames) {
        expect(result.matching).toBeLessThan(result.opposite);
        // Bound absolute error too: a darkened export could still be closer to the ON reference.
        expect(result.matching).toBeLessThan(1);
      }
      expect(await page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled())).toBe(false);
      await validate("webm");
    }
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(true));

    // Isolate material lighting from FXAA's contrast-dependent edge weights.
    // The authored fixture has shared toon01 and cast/receive-shadow flags.
    // Give its Toon floor an explicit neutral color, without changing app defaults.
    const lightingMatrix = report.checkpoints.lightingMatrix = { regions: {}, shadows: {} };
    const matrixImages = {};
    for (const shadowEnabled of [false, true]) {
      await page.evaluate(async shadowEnabled => {
        const state = window.mmdModokiE2e.exportProjectState();
        state.viewport.antialiasEnabled = false;
        Object.assign(state.lighting, { shadowEnabled, shadowColor: { r: .5, g: .5, b: .5 },
          toonShadowInfluence: 0, ambientIntensity: 0 });
        Object.assign(state.lighting.rcSkyAmbient, { enabled: true, opacity: 1, strength: .95, fill: .035,
          skyBrightness: 0, rangeScale: 1, quality: "standard", volume: null });
        state.lighting.rcSkyOcclusion.enabled = false;
        Object.assign(state.lighting.rcDiffuseGi, { enabled: false, strength: .08 });
        if (state.keyframes?.effectAnimations) state.keyframes.effectAnimations.tracks =
          state.keyframes.effectAnimations.tracks.filter(track => track.effectId !== "rcSkyAmbient");
        await window.mmdModokiE2e.importProjectState(state);
      }, shadowEnabled);
      await ready(page); await closeRcLighting(page);
      const lightBefore = (await project(page)).lighting;
      const withSkyName = shadowEnabled ? "both" : "skyOnly", noSkyName = shadowEnabled ? "shadowOnly" : "neither";
      for (const [name, enabled] of [[withSkyName, true], [noSkyName, false]]) {
        if (!enabled) { await open(page); await input(page, "Enabled").uncheck(); await closeRcLighting(page); }
        matrixImages[name] = await take(`lighting-matrix-${name}`);
        lightingMatrix.regions[name] = measureSkyAmbientRegions(matrixImages[name], regions);
      }
      lightingMatrix.shadows[noSkyName] = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
      expect(lightingMatrix.shadows[noSkyName].lightSamplingEnabled).toBe(shadowEnabled);
      const lightAfter = (await project(page)).lighting;
      delete lightBefore.rcSkyAmbient; delete lightAfter.rcSkyAmbient;
      expect(lightAfter).toEqual(lightBefore);
    }
    const measured = lightingMatrix.regions;
    const ordinaryShadowDrop = measured.neither.canopy.mean - measured.shadowOnly.canopy.mean;
    const combinedShadowDrop = measured.skyOnly.canopy.mean - measured.both.canopy.mean;
    const skyDrop = measured.neither.canopy.mean - measured.skyOnly.canopy.mean;
    lightingMatrix.contrast = { ordinaryShadowDrop, combinedShadowDrop, skyDrop };
    expect(ordinaryShadowDrop, "The canopy must cast a real standard shadow").toBeGreaterThan(2);
    expect(skyDrop, "Sky visibility must darken the canopy's auxiliary light").toBeGreaterThan(2);
    expect(measured.shadowOnly.canopy.mean - measured.both.canopy.mean).toBeGreaterThan(2);
    expect(measured.skyOnly.canopy.mean - measured.both.canopy.mean).toBeGreaterThan(2);
    // The removed common floor is independent of raster shadow: its direct-light
    // contrast survives instead of shrinking with the Sky Ambient density.
    expect(Math.abs(combinedShadowDrop - ordinaryShadowDrop)).toBeLessThan(1.5);
    expect(Math.abs(measured.neither.open.mean - measured.skyOnly.open.mean)).toBeLessThan(1);
    expect(Math.abs(measured.shadowOnly.open.mean - measured.both.open.mean)).toBeLessThan(1);

    // Retain GI's independent linear addition after the auxiliary-light shading.
    // A small authored GI gain avoids output clipping hiding a lost contribution.
    await openRcLighting(page, "rcDiffuseGi"); await rcLightingInput(page, "rcDiffuseGi", "Enabled").check();
    await expect(rcLightingStatus(page, "rcDiffuseGi")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await closeRcLighting(page);
    const giOnly = await take("lighting-matrix-shadow-gi");
    const giOnlyRegions = measureSkyAmbientRegions(giOnly, regions);
    await open(page); await input(page, "Enabled").check(); await ready(page); await closeRcLighting(page);
    const withGi = await take("lighting-matrix-shadow-sky-gi");
    const withGiRegions = measureSkyAmbientRegions(withGi, regions);
    const retention = measureSkyAmbientGiRetention(matrixImages.shadowOnly, matrixImages.both, giOnly, withGi);
    lightingMatrix.gi = { withoutSky: giOnlyRegions, withSky: withGiRegions, retention };
    expect(retention.pixels, "GI and sky shading must overlap on visible surfaces").toBeGreaterThan(100);
    expect(retention.meanGain).toBeGreaterThan(.002);
    expect(retention.meanAbsoluteError).toBeLessThan(Math.max(.0015, retention.meanGain * .15));

    // A hemisphere-only fixture distinguishes auxiliary illumination from the
    // directional Toon floor tested above. It must respond to the same sky mask.
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.viewport.antialiasEnabled = false;
      Object.assign(state.lighting, { intensity: 0, ambientIntensity: .6, shadowEnabled: false });
      state.lighting.rcDiffuseGi.enabled = false;
      state.lighting.rcSkyOcclusion.enabled = false;
      Object.assign(state.lighting.rcSkyAmbient, { enabled: true, opacity: 1, strength: .95, skyBrightness: 0 });
      await window.mmdModokiE2e.importProjectState(state);
    });
    await ready(page); await closeRcLighting(page);
    const hemisphereOn = measureSkyAmbientRegions(await take("hemisphere-only-sky-on"), regions);
    await open(page); await input(page, "Enabled").uncheck(); await closeRcLighting(page);
    const hemisphereOff = measureSkyAmbientRegions(await take("hemisphere-only-sky-off"), regions);
    report.checkpoints.hemisphereOnly = { lighting: (await project(page)).lighting, on: hemisphereOn, off: hemisphereOff };
    expect(hemisphereOff.canopy.mean - hemisphereOn.canopy.mean).toBeGreaterThan(2);
    expect(Math.abs(hemisphereOff.open.mean - hemisphereOn.open.mean)).toBeLessThan(1);
    await validate("final");
    expect(report.consoleErrors).toEqual([]);
  } finally {
    if (page && !page.isClosed()) {
      try { report.finalProject = await project(page); report.finalValidation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()); }
      catch (error) { report.finalDiagnosticError = String(error); }
    }
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, difference, initialState, seek } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, closeRcLighting, openPostEffects, openRcLighting, rcLightingInput, rcLightingRow,
  rcLightingStatus, registerRcLighting } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const withWebm = process.env.MMD_RC_SKY_AMBIENT_WEBM === "1";
const id = "rcSkyAmbient";
const row = page => rcLightingRow(page, id);
const input = (page, field) => rcLightingInput(page, id, field);
const status = page => row(page).locator("[data-rc-sky-ambient-status]");
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
async function slider(page, field, position) {
  const range = input(page, field);
  await range.focus(); await range.press(position > 50 ? "End" : "Home");
  for (let i = 0; i < (position > 50 ? 100 - position : position); i++) {
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
    await expect(row(page).locator('input[type="range"]')).toHaveCount(3);
    await expect(row(page).locator(".range-number-input")).toHaveCount(0);
    await expect(row(page).locator("p:not([role='status'])")).toHaveCount(0);
    for (const [field, value] of [["Strength", "48"], ["Fill", "4"], ["BaseLight", "25"]]) {
      await expect(input(page, field)).toHaveValue(value);
      await expect(input(page, field).locator("..")).toHaveClass(/effect-layer-control-row/);
      await expect(input(page, field)).toHaveAttribute("min", "0");
      await expect(input(page, field)).toHaveAttribute("max", "100");
    }
    await expect(input(page, "Strength")).toHaveAccessibleName(/^(空の明るさ|Sky brightness)$/);
    await expect(input(page, "Fill")).toHaveAccessibleName(/^(暗部の光|Dark fill)$/);
    await expect(input(page, "BaseLight")).toHaveAccessibleName(/^(通常光|Base lighting)$/);
    expect(await settings(page)).toEqual({ enabled: true, strength: .95, fill: .035, baseLight: .25, volume: null });
    await expect(status(page)).toHaveAttribute("data-automatic-volume", "true");
    await page.locator("#btn-effect-add-post").click();
    await expect(page.locator(`[data-effect-add-post="${id}"]`)).toBeDisabled();
    await page.locator("#btn-effect-add-post").click();
    await page.screenshot({ path: testInfo.outputPath("default-sky-ambient-panel.png") });
    await closeRcLighting(page);
    const defaultOn = await take("default-sky-ambient-on");
    expect(compare("defaultOnVsNeutral", defaultOn, neutral)).toBeGreaterThan(.15);

    // Strength zero must bypass the ordinary-light attenuation as well as the sky contribution.
    await open(page); await slider(page, "Strength", 0); await closeRcLighting(page);
    expect(compare("strengthZeroVsNeutral", await take("strength-zero"), neutral)).toBeLessThan(.1);
    await history(page, "undo"); expect((await settings(page)).strength).toBe(.95);
    await ready(page); await input(page, "Enabled").uncheck();
    await expect(status(page)).toHaveAttribute("data-state", "off"); await closeRcLighting(page);
    expect(compare("disabledVsNeutral", await take("sky-ambient-off"), neutral)).toBeLessThan(.1);
    await open(page); await input(page, "Enabled").check(); await ready(page);

    // Static sliders are authored independently from the animated enabled/strength pair.
    await slider(page, "Fill", 10); await slider(page, "BaseLight", 40);
    expect(await settings(page)).toEqual({ enabled: true, strength: .95, fill: .1, baseLight: .4, volume: null });
    await input(page, "BaseLight").focus(); await input(page, "BaseLight").press("ArrowRight");
    expect((await settings(page)).baseLight).toBe(.41);
    await closeRcLighting(page); await history(page, "undo"); expect((await settings(page)).baseLight).toBe(.4);
    await history(page, "redo"); expect((await settings(page)).baseLight).toBe(.41);
    await history(page, "undo"); expect((await settings(page)).baseLight).toBe(.4);
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
    await ready(page); await closeRcLighting(page); await take("all-three-rc-effects-on");
    for (const legacyId of ["rcSkyOcclusion", "rcDiffuseGi"]) {
      await openRcLighting(page, legacyId); await rcLightingInput(page, legacyId, "Enabled").uncheck();
      await expect(rcLightingStatus(page, legacyId)).toHaveAttribute("data-state", "off");
    }
    await ready(page); await closeRcLighting(page);
    expect(compare("legacyEffectsDisabled", await take("sky-ambient-alone-again"), configuredOn)).toBeLessThan(.1);

    // Each key is registered with the public card button, including an explicit OFF key.
    const expectedKeys = [
      { frame: 0, value: { enabled: true, strength: 0 } },
      { frame: 20, value: { enabled: true, strength: 2 } },
      { frame: 40, value: { enabled: false, strength: 2 } },
      { frame: 60, value: { enabled: true, strength: 2 } },
    ];
    for (const key of expectedKeys) {
      await seek(page, key.frame); await open(page);
      // Enable before editing a slider, since OFF intentionally disables the controls.
      await input(page, "Enabled").check(); await slider(page, "Strength", key.value.strength * 50);
      await input(page, "Enabled").setChecked(key.value.enabled);
      await registerRcLighting(page, id); await closeRcLighting(page);
    }
    expect(keys(await project(page))).toEqual(expectedKeys);
    expect((await settings(page)).fill).toBe(.1); expect((await settings(page)).baseLight).toBe(.4);
    expect((await project(page)).effects.frameGraphInstances?.instances?.some(instance => instance.type === id) ?? false).toBe(false);
    await seek(page, 10); await open(page);
    await expect(input(page, "Strength")).toHaveValue("50"); await expect(input(page, "Enabled")).toBeChecked();
    await closeRcLighting(page);
    await seek(page, 0); const key0 = await take("key-0-strength-zero");
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
    expect(saved.lighting[id]).toEqual({ enabled: true, strength: 2, fill: .1, baseLight: .4, volume: null });
    expect(keys(saved)).toEqual(expectedKeys);
    await open(page); await slider(page, "Fill", 100); await slider(page, "BaseLight", 100); await closeRcLighting(page);
    expect((await settings(page)).fill).toBe(1); expect((await settings(page)).baseLight).toBe(1);
    await fileMenu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await expect.poll(async () => snapshot(await project(page))).toEqual(savedSnapshot);
    await ready(page);
    await expect(input(page, "Strength")).toHaveValue("100"); await expect(input(page, "Fill")).toHaveValue("10");
    await expect(input(page, "BaseLight")).toHaveValue("40"); await closeRcLighting(page);
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

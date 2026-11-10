import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";
import { addRcLighting, openPostEffects, openRcLighting, rcLightingInput, rcLightingRow } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const ids = ["rcSkyAmbient", "rcSkyOcclusion", "rcDiffuseGi"];
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const snapshot = state => ({ lighting: Object.fromEntries(ids.map(id => [id, state.lighting[id]])),
  instances: state.effects.frameGraphInstances, tracks: state.keyframes?.effectAnimations });
const hidden = state => ({ sky: { fill: state.lighting.rcSkyAmbient.fill, baseLight: state.lighting.rcSkyAmbient.baseLight,
  rangeScale: state.lighting.rcSkyAmbient.rangeScale, quality: state.lighting.rcSkyAmbient.quality },
  volumes: ids.map(id => state.lighting[id].volume) });
async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}
async function savedProject(path) {
  let saved;
  await expect.poll(() => {
    try { saved = JSON.parse(readFileSync(path, "utf8")); return true; }
    catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return false; throw error; }
  }).toBe(true);
  return saved;
}

test("Compact RC cards retain hidden legacy settings through GUI edits and project/backend roundtrip", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), errors = [];
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    // Supply an older project fixture once; all subsequent edits use the public GUI.
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      Object.assign(state.lighting.rcSkyAmbient, { enabled: false, opacity: .8, strength: .7, skyBrightness: .6,
        fill: .13, baseLight: .31, rangeScale: 1.5, quality: "low", volume: { min: [-10, -2, -10], size: 20 } });
      Object.assign(state.lighting.rcSkyOcclusion, { enabled: false, volume: { min: [-8, -2, -8], size: 16 } });
      Object.assign(state.lighting.rcDiffuseGi, { enabled: false, volume: { min: [-6, -2, -6], size: 12 } });
      await window.mmdModokiE2e.importProjectState(state);
    });
    const retained = hidden(await project(page));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [index, id] of ids.entries()) {
      await addRcLighting(page, id); await openRcLighting(page, id);
      const card = rcLightingRow(page, id);
      await expect(card.locator('input[type="range"]:visible')).toHaveCount([3, 2, 1][index]);
      await expect(card.locator('input[type="number"], details, [data-rc-volume-controls]')).toHaveCount(0);
      for (const field of ["Fill", "BaseLight", "RangeScale", "Quality", "MinX", "MinY", "MinZ", "Size"]) {
        await expect(rcLightingInput(page, id, field)).toHaveCount(0);
      }
    }
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="luminousRadiance"]').click();
    const luminousId = (await project(page)).effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").instanceId;
    const luminous = page.locator(`[data-effect-instance-row="${luminousId}"]`);
    await expandEffectInstance(luminous);
    await expect(luminous.locator('input[type="range"]:visible')).toHaveCount(3);
    await expect(luminous.locator(".range-number-input:visible")).toHaveCount(3);
    await expect(luminous.locator("details, [data-rc-volume-controls]")).toHaveCount(0);
    for (const field of ["radianceStrength", "radianceRange", "radianceSoftness"]) await expect(luminous.locator(`[data-instance-fixed="${field}"]`)).toBeVisible();

    await openRcLighting(page, "rcSkyAmbient");
    for (const [field, value] of [["Opacity", "80"], ["Strength", "35"], ["SkyBrightness", "30"]]) await expect(rcLightingInput(page, "rcSkyAmbient", field)).toHaveValue(value);
    const before = snapshot(await project(page)), opacity = rcLightingInput(page, "rcSkyAmbient", "Opacity");
    await opacity.focus(); await opacity.press("ArrowLeft");
    await expect(opacity).toHaveValue("79");
    expect((await project(page)).lighting.rcSkyAmbient.opacity).toBe(.79);
    const edited = snapshot(await project(page));
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect(snapshot(await project(page))).toEqual(before);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click();
    expect(snapshot(await project(page))).toEqual(edited);
    expect(hidden(await project(page))).toEqual(retained);
    await openRcLighting(page, "rcSkyAmbient");
    await page.locator("#shader-panel").screenshot({ path: testInfo.outputPath("rc-compact-panel.png") });

    const path = testInfo.outputPath("compact-rc-project.json");
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, path);
    await menu(page, "file.saveProject");
    expect(snapshot(await savedProject(path))).toEqual(edited);
    await opacity.focus(); await opacity.press("ArrowLeft");
    await expect(opacity).toHaveValue("78");
    await menu(page, "file.loadProject");
    await expect.poll(async () => snapshot(await project(page))).toEqual(edited);
    await openRcLighting(page, "rcSkyAmbient"); await expect(opacity).toHaveValue("79");
    for (const backend of ["classic", "frameGraph"]) {
      await openPostEffects(page);
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
      await expect.poll(async () => snapshot(await project(page))).toEqual(edited);
      expect(hidden(await project(page))).toEqual(retained);
    }
    await openRcLighting(page, "rcSkyAmbient");
    await expect(rcLightingRow(page, "rcSkyAmbient").locator('input[type="range"]:visible')).toHaveCount(3);
    await expect(opacity).toHaveValue("79");
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
  } finally { await launched.close(); }
});

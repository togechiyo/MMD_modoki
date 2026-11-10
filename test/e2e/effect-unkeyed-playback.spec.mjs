import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";
import { addRcLighting, openPostEffects, openRcLighting, rcLightingInput, rcLightingRow,
  rcLightingStatus, registerRcLighting } from "./helpers/rc-lighting-controls.mjs";
import { restoreRetiredRcLightingFixture } from "./helpers/rc-lighting-fixture.mjs";

const root = resolve(import.meta.dirname, "../..");
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const instances = async page => (await project(page)).effects.frameGraphInstances;
const instance = async (page, id) => (await instances(page)).instances.find(item => item.instanceId === id);
const sceneTrack = async (page, id) => (await project(page)).keyframes?.effectAnimations?.tracks.find(track => track.effectId === id);
const history = (page, operation) => page.locator(`.app-menu-quick-button[data-menu-command="edit.${operation}"]`).click();
const playback = page => page.locator("#viewport-seek-play-toggle");

async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame));
  await page.locator("#current-frame").press("Enter");
  await expect(page.locator("#current-frame")).toHaveValue(String(frame));
}
async function initialize(page) {
  await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
  await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
  await page.locator("#info-model-select").selectOption("__camera__");
  // An unchanged camera key supplies playback duration without adding any effect keys.
  await selectTimelineTrack(page, "camera", "Camera");
  await seek(page, 600); await page.locator("#btn-kf-add").click(); await seek(page, 0);
  await page.locator("#viewport-seek-loop-toggle").click();
  await expect(page.locator("#viewport-seek-loop-toggle")).toHaveAttribute("aria-pressed", "true");
  await openPostEffects(page);
}
async function start(page) {
  await seek(page, 0);
  await playback(page).click();
  await expect(playback(page)).toHaveAccessibleName(/^(一時停止|Pause)$/);
  await expect.poll(async () => Number(await page.locator("#viewport-seek-current-frame").inputValue())).toBeGreaterThan(1);
}
async function pause(page) {
  await expect(playback(page)).toHaveAccessibleName(/^(一時停止|Pause)$/);
  await playback(page).click();
  await expect(playback(page)).toHaveAccessibleName(/^(再生|Play)$/);
}
async function deleteOnlyKey(page, id) {
  await seek(page, 0);
  await selectTimelineTrack(page, "effect", id);
  await page.locator("#btn-kf-delete").click();
}
async function fileMenu(page, command) {
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

test("Unkeyed effect instances stay editable during playback, including empty tracks and project reload", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), errors = [];
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => errors.push(error.message));
    await initialize(page);
    for (let index = 0; index < 2; index++) {
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="gamma"]').click();
    }
    const [a, b] = (await instances(page)).instances.filter(item => item.type === "gamma").map(item => item.instanceId);
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    const range = id => row(id).locator('[data-instance-field="gamma"]');
    const number = id => range(id).locator("..").locator(".range-number-input");
    const key = id => row(id).locator('[data-instance-action="registerKeyframe"]');
    const edit = async (id, position, duringPlayback = false) => {
      await expandEffectInstance(row(id));
      await number(id).fill(String(position));
      if (duringPlayback) {
        const frame = Number(await page.locator("#viewport-seek-current-frame").inputValue());
        await expect.poll(async () => Number(await page.locator("#viewport-seek-current-frame").inputValue())).toBeGreaterThan(frame + 2);
        await expect(number(id)).toHaveValue(String(position));
      }
      await number(id).press("Enter");
    };
    const gamma = async id => {
      const state = await instance(page, id);
      return state.animation.tracks[0]?.base.gamma ?? state.settings.gamma;
    };
    const keys = async id => (await instance(page, id)).animation.tracks.flatMap(track => track.keys);
    for (const id of [a, b]) await expandEffectInstance(row(id));
    await edit(a, 0); await key(a).click();
    expect((await keys(a)).map(item => item.frame)).toEqual([0]);
    expect(await keys(b)).toEqual([]);

    await start(page);
    await expect(range(a)).toBeDisabled(); await expect(number(a)).toBeDisabled();
    await expect(row(a).locator('[data-instance-field="enabled"]')).toBeDisabled();
    await expect(range(b)).toBeEnabled(); await expect(number(b)).toBeEnabled();
    await expect(row(b).locator('[data-instance-field="enabled"]')).toBeEnabled();
    for (const id of [a, b]) {
      await expect(key(id)).toBeDisabled();
      await expect(row(id).locator('[data-instance-action="delete"]')).toBeDisabled();
    }
    const toggle = row(b).locator('[data-instance-field="enabled"]');
    await toggle.uncheck();
    await expect.poll(async () => (await instance(page, b)).settings.enabled).toBe(false);
    await toggle.check();
    await expect.poll(async () => (await instance(page, b)).settings.enabled).toBe(true);
    await expect(playback(page)).toHaveAccessibleName(/^(一時停止|Pause)$/);
    await expect(row(a).locator('[data-instance-field="enabled"]')).toBeDisabled();
    await edit(b, 100, true);
    await expect.poll(() => gamma(b)).toBe(.5);
    const editedFrame = Number(await page.locator("#viewport-seek-current-frame").inputValue());
    await expect.poll(async () => Number(await page.locator("#viewport-seek-current-frame").inputValue())).not.toBe(editedFrame);
    await expect(range(b)).toHaveValue("100"); expect(await gamma(a)).toBe(2);
    expect(await keys(b)).toEqual([]);
    await pause(page);
    await history(page, "undo"); expect(await gamma(b)).toBe(1);
    await history(page, "redo"); expect(await gamma(b)).toBe(.5);

    await deleteOnlyKey(page, a);
    expect((await instance(page, a)).animation.tracks).toHaveLength(1);
    expect(await keys(a)).toEqual([]);
    await history(page, "undo"); expect((await keys(a)).map(item => item.frame)).toEqual([0]);
    await start(page); await expect(range(a)).toBeDisabled(); await pause(page);
    await history(page, "redo"); expect(await keys(a)).toEqual([]);
    await start(page);
    await expect(number(a)).toBeEnabled(); await edit(a, 100, true);
    await expect.poll(() => gamma(a)).toBe(.5);
    await pause(page);
    await history(page, "undo"); expect(await gamma(a)).toBe(2);
    await history(page, "redo"); expect(await gamma(a)).toBe(.5);

    // Save an empty-but-present track beside a keyed instance, then reload through the File menu.
    await seek(page, 0); await edit(b, 0); await key(b).click();
    const expected = await instances(page), path = testInfo.outputPath("unkeyed-playback.json");
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, path);
    await fileMenu(page, "file.saveProject");
    expect((await savedProject(path)).effects.frameGraphInstances).toEqual(expected);
    await edit(a, 0); expect(await gamma(a)).toBe(2);
    await fileMenu(page, "file.loadProject");
    await expect.poll(() => instances(page)).toEqual(expected);
    await openPostEffects(page);
    for (const id of [a, b]) await expandEffectInstance(row(id));
    await start(page);
    await expect(number(a)).toBeEnabled(); await expect(number(b)).toBeDisabled();
    await edit(a, 0, true); await expect.poll(() => gamma(a)).toBe(2);
    expect((await keys(b)).map(item => item.frame)).toEqual([0]);
    await pause(page);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
  } finally { await launched.close(); }
});

test("All three RC effects use their own key count to lock playback values", async () => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), errors = [];
  const cases = [["rcSkyAmbient", "Opacity", "opacity", 1], ["rcSkyOcclusion", "Strength", "strength", 1], ["rcDiffuseGi", "Strength", "strength", 2]];
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => errors.push(error.message));
    await initialize(page);
    for (const [id] of cases) {
      // Legacy Occlusion is restored from a fixture; public effects use the picker.
      if (id === "rcSkyOcclusion") await restoreRetiredRcLightingFixture(page, id, { enabled: true });
      else await addRcLighting(page, id);
      await openRcLighting(page, id);
    }
    await start(page);
    for (const [id, field, setting] of cases) {
      await openRcLighting(page, id);
      const control = rcLightingInput(page, id, field);
      await expect(control).toBeEnabled(); await expect(rcLightingInput(page, id, "Enabled")).toBeEnabled();
      await expect(rcLightingRow(page, id).locator(`[data-rc-register-key="${id}"]`)).toBeDisabled();
      await expect(rcLightingRow(page, id).locator(`[data-effect-stack-remove="${id}"]`)).toBeDisabled();
      // An unkeyed OFF releases RC resources; ON must rebuild them while playback continues.
      await rcLightingInput(page, id, "Enabled").uncheck();
      await expect.poll(async () => (await project(page)).lighting[id].enabled).toBe(false);
      await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", "off");
      await rcLightingInput(page, id, "Enabled").check();
      await expect.poll(async () => (await project(page)).lighting[id].enabled).toBe(true);
      await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", "ready", { timeout: 45000 });
      await expect(playback(page)).toHaveAccessibleName(/^(一時停止|Pause)$/);
      expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
      await control.focus(); await control.press("Home");
      await expect.poll(async () => (await project(page)).lighting[id][setting]).toBe(0);
      expect((await sceneTrack(page, id))?.keys ?? []).toEqual([]);
    }
    await pause(page);
    for (const [id, field, setting, maximum] of cases) {
      await seek(page, 0); await openRcLighting(page, id);
      await rcLightingInput(page, id, field).focus(); await rcLightingInput(page, id, field).press("ArrowRight");
      await registerRcLighting(page, id);
      expect((await sceneTrack(page, id)).keys.map(key => key.frame)).toEqual([0]);
      await start(page);
      await expect(rcLightingInput(page, id, field)).toBeDisabled();
      await expect(rcLightingInput(page, id, "Enabled")).toBeDisabled();
      for (const [other] of cases.filter(([other]) => other !== id)) await expect(rcLightingInput(page, other, "Enabled")).toBeEnabled();
      await pause(page); await deleteOnlyKey(page, id);
      expect((await sceneTrack(page, id)).keys).toEqual([]);
      await openRcLighting(page, id); await start(page);
      const control = rcLightingInput(page, id, field);
      await expect(control).toBeEnabled(); await control.focus(); await control.press("End");
      await expect.poll(async () => (await project(page)).lighting[id][setting]).toBe(maximum);
      expect((await sceneTrack(page, id)).keys).toEqual([]);
      await pause(page);
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
  } finally { await launched.close(); }
});

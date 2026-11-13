import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, difference, projectPoints } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, closeRcLighting, openRcLighting, rcLightingInput, rcLightingStatus } from "./helpers/rc-lighting-controls.mjs";
import { measureSkyAmbientRegions } from "./helpers/rc-sky-ambient-regions.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = file => resolve(root, "test/fixtures/rc-window-room", file);
const gi = "rcDiffuseGi", sky = "rcSkyAmbient";
const volume = { min: [-8, -2, -8], size: 16 };
const read = page => page.evaluate(() => window.rcRoomProbe.roomState());
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const savedState = state => JSON.parse(JSON.stringify({ accessories: state.accessories, camera: state.camera,
  gi: state.lighting.rcDiffuseGi, sky: state.lighting.rcSkyAmbient }));

async function effect(page, id, enabled, expected = enabled ? "ready" : "off") {
  await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(enabled);
  await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", expected, { timeout: 45000 });
  await closeRcLighting(page);
}

async function loadRoom(page, file) {
  expect(await page.evaluate(path => window.mmdModokiE2e.loadAccessory(path), fixture(file))).toBe(true);
  const option = page.locator('#info-model-select option[value^="__accessory__:"]');
  await expect(option).toHaveCount(1);
  const selection = await option.getAttribute("value");
  await page.locator("#info-model-select").selectOption(selection);
  // The loader has a 10x base scale. Match the authored room's world coordinates.
  await page.locator("#accessory-scale").fill("0.1"); await page.locator("#accessory-scale").press("Enter");
  await expect(page.locator("#accessory-scale")).toHaveValue("0.1");
  return selection;
}

async function lightY(page, value, selection) {
  await page.locator("#info-model-select").selectOption("__camera__");
  if (!await page.locator("#light-direction-y").isVisible()) await page.locator("#btn-toolbar-mode-toggle").click();
  const input = page.locator("#light-direction-y + .range-number-input");
  await input.fill(String(value)); await input.press("Enter");
  await expect.poll(async () => (await project(page)).lighting.y).toBe(value);
  await page.locator("#info-model-select").selectOption(selection);
}

async function preset(page, selection, id) {
  await page.locator("#info-model-select").selectOption(selection);
  if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
  await page.locator('[data-effect-tab="materials"]').click();
  await page.locator("#shader-preset-select").selectOption(id);
  await page.locator("#btn-shader-apply-all").click();
  await expect.poll(async () => {
    const materials = (await read(page)).materials;
    return materials.length === 2 && materials.every(material => material.preset === id);
  }).toBe(true);
  await closeRcLighting(page);
}

async function fileMenu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

function assertOpaque(state, expectedPreset) {
  expect(state.materials).toHaveLength(2);
  for (const material of state.materials) {
    expect(material.preset).toBe(expectedPreset);
    expect(material.alpha).toBe(1); expect(material.alphaTesting).toBe(false); expect(material.alphaBlending).toBe(false);
    expect(material.textureReady).toBe(true); expect(material.textureHasAlpha).toBe(false);
    expect(material.useAlphaFromDiffuseTexture).toBe(false);
    expect(material.giSource).toBe(true); expect(material.giReceiver).toBe(true); expect(material.skyAmbientReceiver).toBe(true);
  }
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("Opaque BMP X receives GI and Sky Ambient while PNG cutout remains excluded", async ({}, testInfo) => {
  test.setTimeout(300000);
  const launched = await launchMmdModoki(root);
  const report = { errors: [], consoleErrors: [], captures: {}, states: {}, comparisons: {} };
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async volume => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      // Explicit fixture lighting; no changes to application shadow defaults or generators.
      Object.assign(state.lighting, { x: 0, y: -1, z: -1, intensity: .6, ambientIntensity: 0, shadowEnabled: false,
        lightColor: { r: 1, g: 1, b: 1 }, rcDiffuseGi: { enabled: false, strength: .5, volume } });
      Object.assign(state.lighting.rcSkyAmbient, { enabled: false, opacity: 1, strength: 1, skyBrightness: 0,
        quality: "standard", rangeScale: 1, volume });
      await window.mmdModokiE2e.importProjectState(state);
      window.rcRoomProbe = await import("/test/e2e/helpers/rc-window-room-probe.mjs");
    }, volume);
    let selection = await loadRoom(page, "window-room-opaque-bmp.x");
    const view = await camera(page, { tx: 0, ty: 1.5, tz: 3, rx: -10.62, ry: 0, rz: 0, camDistance: 8.14, camFov: 60 });
    await page.locator("#info-model-select").selectOption(selection);
    for (const id of [gi, sky]) { await addRcLighting(page, id); await effect(page, id, false); }
    const regions = Object.fromEntries(Object.entries({
      bounceWall: [[-1.2, .25, 6], [1.2, .25, 6], [1.2, 1, 6], [-1.2, 1, 6]],
      deepFloor: [[-.8, 0, -.5], [.8, 0, -.5], [.8, 0, .5], [-.8, 0, .5]],
      clear: [[2.8, 2.8, 6], [3.2, 2.8, 6], [3.2, 3.2, 6], [2.8, 3.2, 6]],
      solid: [[4.8, 2.8, 6], [5.2, 2.8, 6], [5.2, 3.2, 6], [4.8, 3.2, 6]],
    }).map(([name, points]) => [name, projectPoints(view, points).map(point => point.slice(0, 2))]));
    const take = name => capture(page, testInfo, report, name);
    const pair = async (id, name, expected = "ready") => {
      await effect(page, id === gi ? sky : gi, false);
      await effect(page, id, false); const off = await take(`${name}-off`);
      await effect(page, id, true, expected); const on = await take(`${name}-on`);
      const state = await read(page);
      const result = { difference: difference(off, on), off: measureSkyAmbientRegions(off, regions),
        on: measureSkyAmbientRegions(on, regions), field: id === gi ? state.gi : state.skyAmbient };
      report.comparisons[name] = result;
      await effect(page, id, false);
      return result;
    };
    report.states.initial = await read(page);
    assertOpaque(report.states.initial, "wgsl-accessory-toon");
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.min(...report.states.initial.meshes.map(mesh => mesh.bounds.min[axis]))).toBeCloseTo([-6, 0, -6][axis], 4);
      expect(Math.max(...report.states.initial.meshes.map(mesh => mesh.bounds.max[axis]))).toBeCloseTo([6, 6, 6][axis], 4);
    }
    const bounced = await pair(gi, "bmp-default-gi");
    expect(bounced.field.diagnostics.triangleCount).toBe(26); expect(bounced.field.view).toBe(true);
    expect(bounced.on.bounceWall.rgbMean[0] - bounced.off.bounceWall.rgbMean[0]).toBeGreaterThan(1);
    expect(bounced.difference).toBeGreaterThan(.1);
    await lightY(page, 0, selection);
    const shaded = await pair(sky, "bmp-default-sky-ambient");
    expect(shaded.field.diagnostics.triangleCount).toBe(26); expect(shaded.field.view).toBe(true);
    expect(shaded.off.deepFloor.mean - shaded.on.deepFloor.mean).toBeGreaterThan(1);
    expect(shaded.difference).toBeGreaterThan(.1);

    await preset(page, selection, "wgsl-mmd-standard");
    assertOpaque(await read(page), "wgsl-mmd-standard");
    await lightY(page, -1, selection);
    await effect(page, gi, true); await effect(page, sky, true);
    const beforeSave = await take("bmp-standard-combined-before-save");
    const expected = savedState(await project(page));
    const projectPath = join(launched.tempDir, "bmp-lighting-project.json");
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, projectPath);
    await fileMenu(page, "file.saveProject");
    await expect.poll(() => {
      try { return savedState(JSON.parse(readFileSync(projectPath, "utf8"))); }
      catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
    }).toEqual(expected);
    await effect(page, gi, false); await effect(page, sky, false);
    await preset(page, selection, "wgsl-accessory-toon");
    await fileMenu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await expect.poll(async () => savedState(await project(page))).toEqual(expected);
    await page.locator("#info-model-select").selectOption(selection);
    await effect(page, gi, true); await effect(page, sky, true);
    report.states.restored = await read(page); assertOpaque(report.states.restored, "wgsl-mmd-standard");
    expect(report.states.restored.gi.diagnostics.triangleCount).toBe(26);
    expect(report.states.restored.skyAmbient.diagnostics.triangleCount).toBe(26);
    report.comparisons.restored = difference(beforeSave, await take("bmp-standard-combined-restored"));
    expect(report.comparisons.restored).toBeLessThan(.15);

    // Replace through the real GUI; the PNG's transparent pixels must retain their holes.
    await effect(page, gi, false); await effect(page, sky, false);
    await page.locator("#info-model-select").selectOption(selection);
    page.once("dialog", dialog => dialog.accept()); await page.locator("#btn-accessory-delete").click();
    await expect(page.locator('#info-model-select option[value^="__accessory__:"]')).toHaveCount(0);
    selection = await loadRoom(page, "window-room-cutout.x");
    report.states.cutout = await read(page);
    expect(report.states.cutout.materials).toHaveLength(2);
    for (const material of report.states.cutout.materials) {
      expect(material.alpha).toBe(1); expect(material.alphaTesting).toBe(true); expect(material.alphaBlending).toBe(false);
      expect(material.textureReady).toBe(true); expect(material.textureHasAlpha).toBe(true); expect(material.useAlphaFromDiffuseTexture).toBe(true);
      expect(material.giSource).toBe(false); expect(material.giReceiver).toBe(false); expect(material.skyAmbientReceiver).toBe(false);
    }
    const cutoutGi = await pair(gi, "cutout-gi", "preparing");
    expect(cutoutGi.field.diagnostics.supportedMaterialCount).toBe(0); expect(cutoutGi.field.view).toBe(false);
    expect(cutoutGi.difference).toBeLessThan(.1);
    // Include optional sky addition in the exclusion check, not just attenuation.
    await effect(page, sky, true);
    await openRcLighting(page, sky);
    const brightness = rcLightingInput(page, sky, "SkyBrightness");
    await brightness.focus(); await brightness.press("End"); await expect(brightness).toHaveValue("100");
    await closeRcLighting(page);
    const cutoutSky = await pair(sky, "cutout-sky-ambient");
    expect(cutoutSky.field.diagnostics.supportedMaterialCount).toBe(0); expect(cutoutSky.field.view).toBe(false);
    expect(cutoutSky.difference).toBeLessThan(.1);
    expect(Math.max(...cutoutGi.off.clear.rgbMean)).toBeLessThan(2);
    expect(Math.max(...cutoutGi.off.solid.rgbMean)).toBeGreaterThan(20);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    if (page && !page.isClosed()) await page.evaluate(() => window.rcRoomProbe?.disposeRoomProbe()).catch(() => undefined);
    await launched.close();
  }
});

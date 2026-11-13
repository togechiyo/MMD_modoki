import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, difference, projectPoints } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, closeRcLighting, openPostEffects, openRcLighting, rcLightingInput,
  rcLightingStatus } from "./helpers/rc-lighting-controls.mjs";
import { measureSkyAmbientRegions } from "./helpers/rc-sky-ambient-regions.mjs";

const root = resolve(import.meta.dirname, "../..");
const room = resolve(root, "test/fixtures/rc-window-room/window-room-plain.x");
const gi = "rcDiffuseGi", sky = "rcSkyAmbient", ids = [gi, sky];
const originVolumes = [128, 2048, 32768].map(size => ({ min: [-size / 2, -size / 2, -size / 2], size }));
const manualVolume = { min: [-64, -64, -64], size: 128 };
const roomY = 1;
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const stored = state => JSON.parse(JSON.stringify({ scene: state.scene, accessories: state.accessories,
  camera: state.camera, lighting: state.lighting }));
const read = page => page.evaluate(() => window.rcRoomProbe.roomState());
const installProbe = page => page.evaluate(async () => {
  // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
  window.rcRoomProbe = await import("/test/e2e/helpers/rc-window-room-probe.mjs");
});
const fieldOf = (state, id) => id === gi ? state.gi : state.skyAmbient;

async function ready(page, id) {
  await openRcLighting(page, id);
  await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", "ready", { timeout: 60000 });
  await closeRcLighting(page);
}

async function effect(page, id, enabled, wait = true) {
  await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(enabled);
  if (wait) await expect(rcLightingStatus(page, id)).toHaveAttribute("data-state", enabled ? "ready" : "off", { timeout: 60000 });
  await closeRcLighting(page);
}

async function accessory(page, index, values) {
  await page.locator("#info-model-select").selectOption(`__accessory__:${index}`);
  for (const [field, value] of Object.entries(values)) {
    const input = page.locator(`#accessory-${field}`);
    await input.fill(String(value)); await input.press("Enter");
    await expect.poll(async () => Number(await input.inputValue())).toBe(value);
  }
}

async function cameraAt(page, x = 0) {
  const view = await camera(page, { tx: x, ty: 6 + roomY, tz: 12, rx: -10.62, ry: 0, rz: 0, camDistance: 32.56, camFov: 60 });
  await page.locator("#info-model-select").selectOption("__accessory__:0");
  return view;
}

async function assertLightDirection(page, expected) {
  const saved = (await project(page)).lighting;
  expect([saved.x, saved.y, saved.z]).toEqual(expected);
  const actual = (await read(page)).light.direction, length = Math.hypot(...expected);
  actual.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis] / length, 6));
}

async function lightDirection(page, direction) {
  await page.locator("#info-model-select").selectOption("__camera__");
  if (!await page.locator("#light-direction-y").isVisible()) await page.locator("#btn-toolbar-mode-toggle").click();
  // The GUI commits all three slider values together. A fixture import does not
  // synchronize their DOM values, so editing Y alone can resend stale X/Z.
  for (const [index, axis] of ["x", "y", "z"].entries()) {
    const input = page.locator(`#light-direction-${axis} + .range-number-input`);
    await input.fill(String(direction[index])); await input.press("Enter");
  }
  await page.locator("#info-model-select").selectOption("__accessory__:0");
  await assertLightDirection(page, direction);
}

async function assertVolumes(page, mode, triangles) {
  for (const id of ids) await ready(page, id);
  const state = await read(page);
  for (const id of ids) {
    const field = fieldOf(state, id), skyField = id === sky, grid = skyField ? 32 : 16;
    const expected = mode === "origin" ? originVolumes : [manualVolume];
    const effective = mode === "manual" && skyField ? [{ min: [-128, -128, -128], size: 256 }] : expected;
    expect(field.diagnostics.spatialMode).toBe(mode);
    expect(field.diagnostics.volumes).toEqual(expected);
    if (skyField) {
      expect(field.diagnostics.effectiveVolumes).toEqual(effective);
      expect(field.diagnostics.probeGrid).toBe(32);
    }
    expect(field.volumeCount).toBe(expected.length);
    expect(field.irradianceSize).toEqual({ width: grid * (skyField ? 2 : 6), height: grid * grid * expected.length });
    expect(field.nearestSize).toEqual({ width: grid, height: grid * grid * expected.length });
    expect(field.diagnostics.triangleCount).toBe(triangles); expect(field.view).toBe(true);
    expect(effective.map(volume => volume.size / grid)).toEqual(mode === "origin"
      ? skyField ? [4, 64, 1024] : [8, 128, 2048] : skyField ? [8] : [8]);
  }
  return { gi: state.gi, sky: state.skyAmbient };
}

async function switchBackend(page, backend) {
  const expected = stored(await project(page));
  await openPostEffects(page);
  await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
  await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
  await expect.poll(async () => stored(await project(page))).toEqual(expected);
  await page.locator("#info-model-select").selectOption("__accessory__:0");
  await closeRcLighting(page);
  if (backend === "frameGraph") await installProbe(page);
}

async function fileMenu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("RC origin volumes keep world resolution through scene size, boundaries and saved manual volumes", async ({}, testInfo) => {
  test.setTimeout(420000);
  const launched = await launchMmdModoki(root);
  const report = { errors: [], consoleErrors: [], captures: {}, states: {}, comparisons: {}, regions: {} };
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      // Fixture illumination only. Keep both effects' default null volume and Sky rangeScale=2.
      Object.assign(state.lighting, { x: 0, y: 0, z: -1, intensity: .6, ambientIntensity: 0, shadowEnabled: false,
        lightColor: { r: 1, g: 1, b: 1 } });
      await window.mmdModokiE2e.importProjectState(state);
    });
    await installProbe(page);
    expect(await page.evaluate(path => window.mmdModokiE2e.loadAccessory(path), room)).toBe(true);
    // A 48-unit room gives the 8-unit near GI cells several surfaces to sample.
    // At floor Y=0, the 32 angular rays from the wall's adjacent (±4,4,20)
    // probes miss the narrow red tile. Y=1 gives each probe a visible red hit
    // near (±0.446,1,9.265), also lit through the window. Move the camera/ROIs
    // with the authored room; keep the product's fixed world grid unchanged.
    await accessory(page, 0, { scale: .4, "pos-y": roomY });
    const view = await cameraAt(page);
    await lightDirection(page, [0, 0, -1]);
    const initial = await project(page);
    expect(initial.lighting.rcSkyAmbient).toMatchObject({ volume: null, rangeScale: 2, quality: "high", skyBrightness: 1 });
    expect(initial.lighting.rcDiffuseGi).toMatchObject({ volume: null, strength: .5 });
    const auto = page.locator("#btn-auto-key");
    if (await auto.getAttribute("aria-pressed") === "true") await auto.click();
    const take = name => capture(page, testInfo, report, name);
    const compare = (name, a, b) => report.comparisons[name] = difference(a, b);
    const regions = Object.fromEntries(Object.entries({
      bounce: [[-1.2, .25, 6], [1.2, .25, 6], [1.2, 1, 6], [-1.2, 1, 6]],
      floor: [[-.8, 0, -.5], [.8, 0, -.5], [.8, 0, .5], [-.8, 0, .5]],
    }).map(([name, points]) => [name, projectPoints(view,
      points.map(point => point.map((value, axis) => value * 4 + (axis === 1 ? roomY : 0)))).map(point => point.slice(0, 2))]));
    const neutral = await take("origin-neutral");
    await addRcLighting(page, sky); await ready(page, sky);
    const defaultSky = await take("origin-sky-default");
    expect(compare("defaultSkyContribution", defaultSky, neutral)).toBeGreaterThan(.1);
    await openRcLighting(page, sky);
    const brightness = rcLightingInput(page, sky, "SkyBrightness");
    await brightness.focus(); await brightness.press("Home"); await expect(brightness).toHaveValue("0");
    await closeRcLighting(page);
    const shaded = await take("origin-sky-attenuation");
    report.regions.sky = { off: measureSkyAmbientRegions(neutral, regions), on: measureSkyAmbientRegions(shaded, regions) };
    expect(report.regions.sky.off.floor.mean - report.regions.sky.on.floor.mean).toBeGreaterThan(1);
    await effect(page, sky, false); await lightDirection(page, [0, -1, -1]);
    const giNeutral = await take("origin-gi-off");
    await assertLightDirection(page, [0, -1, -1]);
    await addRcLighting(page, gi); await ready(page, gi);
    const bounced = await take("origin-gi-on");
    await assertLightDirection(page, [0, -1, -1]);
    report.states.nearGi = await read(page);
    report.regions.gi = { off: measureSkyAmbientRegions(giNeutral, regions), on: measureSkyAmbientRegions(bounced, regions) };
    const gain = report.regions.gi.on.bounce.rgbMean.map((value, channel) => value - report.regions.gi.off.bounce.rgbMean[channel]);
    report.regions.gi.bounceGain = { rgb: gain, redExcess: gain[0] - (gain[1] + gain[2]) / 2 };
    expect(gain[0]).toBeGreaterThan(.5);
    expect(report.regions.gi.bounceGain.redExcess).toBeGreaterThan(.5);
    // The known white wall ROI proves colored transport; whole-image averages
    // dilute this local bounce with the large unlit floor/window background.
    compare("nearGiContribution", bounced, giNeutral);
    await effect(page, sky, true);
    report.states.initial = await assertVolumes(page, "origin", 26);

    // A distant, much larger receiving object would previously expand the fitted volume.
    expect(await page.evaluate(path => window.mmdModokiE2e.loadAccessory(path), room)).toBe(true);
    await accessory(page, 1, { "pos-x": 6000, scale: 10 });
    report.states.farAdded = await assertVolumes(page, "origin", 52);
    await accessory(page, 1, { scale: 20 });
    report.states.farScaled = await assertVolumes(page, "origin", 52);
    await camera(page, { tx: 100, ty: 20, tz: 0, rx: -20, ry: 15, rz: 0, camDistance: 150 });
    report.states.cameraMoved = await assertVolumes(page, "origin", 52);
    await cameraAt(page);
    const combined = await take("origin-after-far-object");
    await effect(page, gi, false); await effect(page, sky, false);
    expect(compare("nearContributionAfterFarObject", combined, await take("origin-after-far-object-off"))).toBeGreaterThan(.1);
    await effect(page, gi, true); await effect(page, sky, true);

    // Keep geometry identical in camera space while crossing each world-volume face.
    // This catches an abrupt spatial-level switch independently of camera-edge motion.
    for (const boundary of [64, 1024]) {
      const pair = [];
      for (const offset of [-.1, .1]) {
        const x = boundary + offset;
        await accessory(page, 0, { "pos-x": x }); await cameraAt(page, x);
        report.states[`boundary-${x}`] = await assertVolumes(page, "origin", 52);
        pair.push(await take(`origin-boundary-${x}`));
      }
      expect(compare(`boundary-${boundary}`, pair[0], pair[1])).toBeLessThan(2);
    }
    await accessory(page, 0, { "pos-x": 0 }); await cameraAt(page);

    const roundtrip = async (mode, triangles) => {
      const before = await take(`${mode}-before-save`), expected = stored(await project(page));
      const path = join(launched.tempDir, `rc-${mode}-volumes.json`);
      await launched.app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      }, path);
      await fileMenu(page, "file.saveProject");
      await expect.poll(() => {
        try { return stored(JSON.parse(readFileSync(path, "utf8"))); }
        catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
      }).toEqual(expected);
      for (const id of ids) await effect(page, id, false);
      await fileMenu(page, "file.loadProject");
      await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
      await expect.poll(async () => stored(await project(page))).toEqual(expected);
      await page.locator("#info-model-select").selectOption("__accessory__:0");
      report.states[`${mode}-loaded`] = await assertVolumes(page, mode, triangles);
      expect(compare(`${mode}-saveRestore`, before, await take(`${mode}-after-load`))).toBeLessThan(.15);
      await switchBackend(page, "classic"); await take(`${mode}-classic`);
      await switchBackend(page, "frameGraph");
      // The first PNG after restoring the backend must initialize its own fields.
      const restored = await take(`${mode}-framegraph-first-png`);
      report.states[`${mode}-backend`] = await assertVolumes(page, mode, triangles);
      expect(compare(`${mode}-backendRestore`, before, restored)).toBeLessThan(.15);
      expect(stored(await project(page))).toEqual(expected);
      return restored;
    };
    const originWarm = await roundtrip("origin", 52);
    for (const id of ids) await effect(page, id, false);
    // OFF releases all three levels. PNG must prepare them without a viewport refresh.
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    for (const id of ids) await effect(page, id, true, false);
    expect(compare("originColdPng", await take("origin-cold-combined"), originWarm)).toBeLessThan(.15);
    expect(await page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled())).toBe(false);
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(true));

    // Hidden legacy volumes remain saved-project fixtures, not a new public control.
    // Load the fixture through the project menu so the effect cards and runtime
    // are restored together, just as they are for a user's existing project.
    const manualState = await project(page);
    manualState.lighting.rcDiffuseGi.volume = manualVolume;
    manualState.lighting.rcSkyAmbient.volume = manualVolume;
    manualState.lighting.rcSkyAmbient.rangeScale = 2;
    const manualPath = join(launched.tempDir, "rc-manual-volume-fixture.json");
    writeFileSync(manualPath, JSON.stringify(manualState));
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, manualPath);
    await fileMenu(page, "file.loadProject");
    await expect.poll(async () => stored(await project(page))).toEqual(stored(manualState));
    await page.locator("#info-model-select").selectOption("__accessory__:0");
    report.states.manual = await assertVolumes(page, "manual", 52);
    const warm = await roundtrip("manual", 52);
    for (const id of ids) await effect(page, id, false);
    const manualOff = await take("manual-off");
    expect(compare("manualContribution", warm, manualOff)).toBeGreaterThan(.1);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    if (page && !page.isClosed()) await page.evaluate(() => window.rcRoomProbe?.disposeRoomProbe()).catch(() => undefined);
    await launched.close();
  }
});

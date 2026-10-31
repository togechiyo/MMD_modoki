import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";
import { ensureLuminousRadianceInstance, getLuminousInstanceRuntime, luminousInstanceRow,
  luminousRadianceInstanceRow } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixtureDirectory = resolve(root, "test/fixtures/luminous-material-conditions");
const readState = (page, mask = true) => page.evaluate(async mask =>
  // Browser-only Vite module, outside Node's module resolution.
  // eslint-disable-next-line import/no-unresolved
  (await import("/test/e2e/helpers/luminous-material-conditions-probe.mjs")).readLuminousMaterialConditions({ mask }), mask);
const material = (state, name) => state.materials.find(value => value.name === name);
const rgb = (state, sample) => state.mask.samples[sample].rgb;
const maxRgb = value => Math.max(...value);

function difference(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) for (let channel = 0; channel < 3; channel++) sum += Math.abs(a.data[i + channel] - b.data[i + channel]);
  return sum / (a.width * a.height * 3);
}
function rearBorderRgb(image) {
  // The fixed camera and 640x360 capture place the visible rear board here.
  // Check the exported pixels as well as the viewport mask: resizing for export
  // recreates render targets and must not lose this independent light source.
  const value = [0, 0, 0];
  for (let y = 100; y <= 104; y++) for (let x = 250; x <= 254; x++) {
    for (let channel = 0; channel < 3; channel++) value[channel] += image.data[(y * image.width + x) * 4 + channel] / 25;
  }
  expect(value[2]).toBeGreaterThan(20);
  expect(value[2]).toBeGreaterThan(value[0] + 10);
  return value;
}

async function openPost(page) {
  if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
  await page.locator('[data-effect-tab="post"]').click();
}
async function hidePanel(page) {
  if (await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
}
async function morph(page, name, enabled) {
  await hidePanel(page);
  await page.locator("#info-model-select").selectOption("0");
  const input = page.locator("#morph-controls .morph-slider-row")
    .filter({ has: page.locator(`[data-morph-name="${name}"]`) }).locator('input[type="range"]');
  await input.focus(); await input.press(enabled ? "End" : "Home");
  await expect(input).toHaveValue(enabled ? "1" : "0");
}
async function seek(page, frame) {
  await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter");
}
async function switchBackend(page, backend) {
  await openPost(page);
  await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
  await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
  await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
  await hidePanel(page);
}
async function setMaterialPreset(page, modelIndex, name, preset) {
  await openPost(page); await page.locator('[data-effect-tab="materials"]').click();
  await page.locator("#info-model-select").selectOption(String(modelIndex));
  const row = page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: name }) });
  if (!(await row.getAttribute("class"))?.split(" ").includes("active")) await row.click();
  await page.locator("#shader-preset-select").selectOption(preset);
  await page.locator("#btn-shader-apply-selected").click();
  await hidePanel(page);
}

// eslint-disable-next-line no-empty-pattern
test("2D Luminous uses current material conditions and preserves dark occluders without widening RC sources", async ({}, testInfo) => {
  test.setTimeout(240000);
  const launched = await launchMmdModoki(root), report = { errors: [], consoleErrors: [], states: {}, captures: {}, differences: {} };
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    // Test scene initialization only; all effect/morph/preset operations below use the GUI.
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      Object.assign(state.lighting, { intensity: 0, ambientIntensity: 0 });
      await window.mmdModokiE2e.importProjectState(state);
    });
    for (const name of ["front.pmx", "rear.pmx"]) {
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(fixtureDirectory, name))).not.toBeNull();
    }
    await expect(page.locator('#info-model-select option[value="0"]')).toContainText("front");
    await expect(page.locator('#info-model-select option[value="1"]')).toContainText("rear");
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: -0.4, ty: 1.8, tz: 0, rx: -8, ry: 0, rz: 0, camDistance: 15 })) {
      const input = page.locator(`#bone-controls input[data-control-key="${key}"]`);
      await input.fill(String(value)); await input.press("Enter");
    }
    await openPost(page);
    if (!await luminousInstanceRow(page).count()) {
      await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click();
    }
    const glow = () => luminousInstanceRow(page).locator('[data-instance-field="enabled"]');
    await glow().uncheck();
    await ensureLuminousRadianceInstance(page);
    const rc = () => luminousRadianceInstanceRow(page).locator('[data-instance-field="enabled"]');
    await rc().uncheck();
    const health = async () => {
      report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
    };
    const capture = async name => {
      await hidePanel(page);
      const directory = testInfo.outputPath(name); mkdirSync(directory, { recursive: true });
      const saved = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 640, 360), directory);
      report.captures[name] = saved; expect(saved.surfaceReleased).toBe(true);
      const image = PNG.sync.read(readFileSync(saved.path)); expect([image.width, image.height]).toEqual([640, 360]);
      await health(); return image;
    };
    const observe = async name => {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      const state = await readState(page); report.states[name] = state; await health(); return state;
    };
    const unlit = await capture("2d-off");
    await openPost(page); await glow().check(); await hidePanel(page);
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    await expect.poll(async () => maxRgb(rgb(await readState(page), "front")), { timeout: 30000 }).toBeGreaterThan(0.05);
    const first = await observe("material-on");
    expect(first.engine).toBe("WebGPU");
    expect(material(first, "Panel A")).toMatchObject({ shininess: 130, specular: [0, 0, 0], alpha: 1 });
    expect(material(first, "Panel C").shininess).toBe(100);
    expect(Math.hypot(...material(first, "Panel D").specular)).toBeGreaterThan(0.01);
    expect(maxRgb(rgb(first, "boundary"))).toBeLessThan(0.01);
    expect(maxRgb(rgb(first, "specular"))).toBeLessThan(0.01);
    expect(rgb(first, "front")[0]).toBeGreaterThan(rgb(first, "front")[2] + 0.05);
    expect(rgb(first, "rearBorder")[2]).toBeGreaterThan(0.05);
    expect(rgb(first, "rearBorder")[2]).toBeGreaterThan(rgb(first, "rearBorder")[0] + 0.05);
    const on = await capture("material-on");
    report.differences.glow = difference(unlit, on); expect(report.differences.glow).toBeGreaterThan(0.1);

    await morph(page, "ShininessOff", true);
    const dark = await observe("shininess-off");
    expect(material(dark, "Panel A").shininess).toBe(80);
    expect(maxRgb(rgb(dark, "front"))).toBeLessThan(0.01);
    expect(rgb(dark, "rearBorder")[2]).toBeGreaterThan(0.05);
    expect(rgb(dark, "rearBorder")[2]).toBeGreaterThan(rgb(dark, "rearBorder")[0] + 0.05);
    const darkPng = await capture("shininess-off");
    report.shininessOffRearRgb = rearBorderRgb(darkPng);
    report.differences.shininessOff = difference(on, darkPng); expect(report.differences.shininessOff).toBeGreaterThan(0.1);
    await morph(page, "ShininessOff", false);
    const restored = await observe("shininess-restored"); expect(material(restored, "Panel A").shininess).toBe(130);
    report.differences.restore = difference(on, await capture("shininess-restored")); expect(report.differences.restore).toBeLessThan(0.1);

    await morph(page, "LightOff", true);
    const namedOff = await observe("named-light-off");
    expect(maxRgb(rgb(namedOff, "front"))).toBeLessThan(0.01);
    expect(rgb(namedOff, "rearBorder")[2]).toBeGreaterThan(0.05); // A different model keeps emitting.
    expect(rgb(namedOff, "rearBorder")[2]).toBeGreaterThan(rgb(namedOff, "rearBorder")[0] + 0.05);
    report.namedOffRearRgb = rearBorderRgb(await capture("named-light-off")); await morph(page, "LightOff", false);
    await morph(page, "AlphaOff", true);
    const transparent = await observe("alpha-zero"); expect(material(transparent, "Panel A").alpha).toBe(0);
    expect(rgb(transparent, "front")[2]).toBeGreaterThan(rgb(transparent, "front")[0] + 0.05);
    await capture("alpha-zero"); await morph(page, "AlphaOff", false);
    await morph(page, "FrontAway", true);
    const moved = await observe("front-away");
    expect(rgb(moved, "front")[2]).toBeGreaterThan(rgb(moved, "front")[0] + 0.05);
    await capture("front-away"); await morph(page, "FrontAway", false);

    // Classic's semi-transparent source must emit. Its two ways to stop emitting must
    // preserve the same semi-transparent obstruction of Panel B (no alpha texture in this fixture).
    await switchBackend(page, "classic");
    // FrameGraph instances are retained but suspended in Classic. Its existing
    // explicit-material route enables Glow without changing Panel A's conditions.
    expect((await readState(page, false)).glowLayers).toHaveLength(0);
    await setMaterialPreset(page, 1, "Panel B", "wgsl-autoluminous");
    await morph(page, "Alpha35", true);
    await expect.poll(async () => (await readState(page, false)).glowLayers.length).toBe(2);
    report.states.classicAlpha35 = await readState(page, false);
    expect(material(report.states.classicAlpha35, "Panel A").alpha).toBeCloseTo(0.35, 5);
    const classicOn = await capture("classic-alpha35-on");
    await morph(page, "ShininessOff", true); const classicShininessOff = await capture("classic-alpha35-shininess-off");
    await morph(page, "ShininessOff", false); await morph(page, "LightOff", true);
    const classicLightOff = await capture("classic-alpha35-light-off");
    report.differences.classicAlpha35Emission = difference(classicOn, classicShininessOff);
    expect(report.differences.classicAlpha35Emission).toBeGreaterThan(0.1);
    report.differences.classicOffAgreement = difference(classicShininessOff, classicLightOff);
    expect(report.differences.classicOffAgreement).toBeLessThan(0.1);
    await morph(page, "LightOff", false); await morph(page, "Alpha35", false);
    await setMaterialPreset(page, 1, "Panel B", "wgsl-mmd-standard");
    const classicRestored = await readState(page, false);
    expect(classicRestored.glowLayers).toHaveLength(0);
    expect(material(classicRestored, "Panel B").shininess).toBe(130);
    await switchBackend(page, "frameGraph");

    // Register the actual material morph, then capture immediately after direct seeks.
    // The section register button requires a real edit; Home on an already-zero
    // slider emits no input event. Edit and return to zero before the first key.
    await seek(page, 0); await morph(page, "ShininessOff", true); await morph(page, "ShininessOff", false);
    await page.locator("#btn-morph-keyframe").click();
    await seek(page, 20); await morph(page, "ShininessOff", true); await page.locator("#btn-morph-keyframe").click();
    await seek(page, 40); await morph(page, "ShininessOff", false); await page.locator("#btn-morph-keyframe").click();
    await seek(page, 20);
    report.differences.seekOff = difference(darkPng, await capture("seek-20-off")); expect(report.differences.seekOff).toBeLessThan(0.1);
    await seek(page, 0);
    report.differences.seekOn = difference(on, await capture("seek-0-on")); expect(report.differences.seekOn).toBeLessThan(0.1);

    // RC keeps its old opt-in: the automatic 2D materials must remain black BVH blockers.
    await openPost(page); await glow().uncheck(); await rc().check(); await hidePanel(page);
    await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.emitters).toBe(0);
    report.ordinaryRc = await getLuminousInstanceRuntime(page);
    expect(report.ordinaryRc.luminousRadiance.triangles).toBe(10);
    report.differences.ordinaryRc = difference(unlit, await capture("ordinary-rc-only")); expect(report.differences.ordinaryRc).toBeLessThan(0.1);

    // Positive control: the same source becomes an RC emitter via the existing explicit preset.
    await openPost(page); await rc().uncheck(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#info-model-select").selectOption("0");
    const sourceRow = page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: /^Panel A$/ }) });
    if (!(await sourceRow.getAttribute("class"))?.split(" ").includes("active")) await sourceRow.click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous");
    await page.locator("#btn-shader-apply-selected").click();
    const explicitOff = await capture("explicit-rc-off");
    await openPost(page); await expandEffectInstance(luminousRadianceInstanceRow(page));
    const strength = luminousRadianceInstanceRow(page).locator('[data-instance-fixed="radianceStrength"]');
    await strength.focus(); await strength.press("End");
    const range = luminousRadianceInstanceRow(page).locator('[data-instance-fixed="radianceRange"]');
    await range.focus(); await range.press("Home"); for (let i = 0; i < 3; i++) await range.press("ArrowRight");
    await rc().check(); await hidePanel(page);
    await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.emitters).toBe(2);
    report.explicitRc = await getLuminousInstanceRuntime(page);
    report.differences.explicitRc = difference(explicitOff, await capture("explicit-rc-on")); expect(report.differences.explicitRc).toBeGreaterThan(0.02);
    await health();
  } finally {
    if (page && !page.isClosed()) {
      try { report.finalRuntime = await getLuminousInstanceRuntime(page); report.finalValidation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()); }
      catch (error) { report.finalReadError = String(error); }
    }
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2)); await launched.close();
  }
});

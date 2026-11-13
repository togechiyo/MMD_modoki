import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, difference, initialState } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, closeRcLighting, openPostEffects, openRcLighting, rcLightingInput,
  rcLightingStatus, setRcLightingEnabled } from "./helpers/rc-lighting-controls.mjs";
import { measureSkyAmbientRegions, skyAmbientRegions } from "./helpers/rc-sky-ambient-regions.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const id = "rcSkyAmbient";
const stage = "wgsl-stage-standard", semiMatte = "wgsl-semi-matte-highlight";
const project = page => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
const snapshot = state => ({ materials: state.scene.models[0]?.materialShaders ?? [], sky: state.lighting.rcSkyAmbient });

async function applyPreset(page, preset) {
  await page.locator("#info-model-select").selectOption("0");
  if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
  await page.locator('[data-effect-tab="materials"]').click();
  await page.locator("#shader-preset-select").selectOption(preset);
  await page.locator("#btn-shader-apply-all").click();
  await expect.poll(async () => {
    const materials = snapshot(await project(page)).materials;
    return materials.length > 0 && materials.every(material => material.presetId === preset);
  }).toBe(true);
  await expect(page.locator(".shader-material-item").first()).toContainText(preset === stage ? "Stage Standard" : "Semi Matte Highlight");
  await closeRcLighting(page);
}

async function ready(page, supported = true) {
  await openRcLighting(page, id);
  const status = rcLightingStatus(page, id);
  await expect(status).toHaveAttribute("data-state", "ready", { timeout: 45000 });
  await expect.poll(async () => Number(await status.getAttribute("data-supported-material-count")) > 0).toBe(supported);
  await closeRcLighting(page);
}

async function sliderEndpoint(page, field, maximum) {
  await openRcLighting(page, id);
  const slider = rcLightingInput(page, id, field);
  await slider.focus(); await slider.press(maximum ? "End" : "Home");
  await expect(slider).toHaveValue(maximum ? "100" : "0");
  await closeRcLighting(page);
}

async function switchBackend(page, backend) {
  const before = await project(page);
  await openPostEffects(page);
  await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
  // Backend changes reload the renderer; wait for project restoration as well as the engine.
  await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
  await expect.poll(async () => {
    const state = await project(page);
    return { scene: state.scene, camera: state.camera, lighting: state.lighting };
  }).toEqual({ scene: before.scene, camera: before.camera, lighting: before.lighting });
  await page.locator("#info-model-select").selectOption("0");
  await closeRcLighting(page);
}

async function fileMenu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("Sky Ambient shades Stage Standard through GUI preset, project and backend changes", async ({}, testInfo) => {
  test.setTimeout(300000);
  const launched = await launchMmdModoki(root);
  const report = { errors: [], consoleErrors: [], shaderResponses: [], shaderRequestFailures: [], captures: {}, states: {}, comparisons: {} };
  try {
    const observe = page => {
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
    };
    const page = await launched.app.firstWindow();
    observe(page); launched.app.on("window", observe);
    await initialState(page, { fixed: false });
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      // Saved fixture settings isolate attenuation; all behavior below uses GUI controls.
      Object.assign(state.lighting.rcSkyAmbient, { enabled: false, strength: 1, skyBrightness: 0,
        opacity: 1, quality: "standard", rangeScale: 1 });
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    await applyPreset(page, stage);
    const view = await camera(page, { tx: 0, ty: 1.5, tz: 0, rx: -20, ry: -38, rz: 0, camDistance: 31 });
    await page.locator("#info-model-select").selectOption("0");
    const take = name => capture(page, testInfo, report, name);
    const compare = (name, a, b) => report.comparisons[name] = difference(a, b);
    const regions = skyAmbientRegions(view);
    const neutral = await take("stage-framegraph-neutral");

    // Classic has its own AA/output path. Keep a same-backend OFF reference.
    await switchBackend(page, "classic");
    const classicNeutral = await take("stage-classic-neutral");
    await switchBackend(page, "frameGraph");
    await addRcLighting(page, id); await ready(page);
    const shaded = await take("stage-sky-darkening");
    const baselineRegions = measureSkyAmbientRegions(neutral, regions);
    const shadedRegions = measureSkyAmbientRegions(shaded, regions);
    report.states.regions = { baseline: baselineRegions, shaded: shadedRegions };
    expect(baselineRegions.canopy.mean - shadedRegions.canopy.mean).toBeGreaterThan(2);
    expect(compare("stageSkyContribution", shaded, neutral)).toBeGreaterThan(.15);

    // Read only the real compiled programs; diagnostic output omits mesh/material names.
    const programs = await page.evaluate(async () => {
      const probe = await import("/test/e2e/helpers/rc-sky-ambient-probe.mjs");
      return probe.inspectSkyAmbientMaterials().map(({ defines, fragment }) => ({ defines, fragment }));
    });
    expect(programs.length).toBeGreaterThan(0);
    report.states.materials = programs.map(({ defines, fragment }, index) => {
      writeFileSync(testInfo.outputPath(`stage-material-${index}.wgsl`), fragment);
      const state = { defines, stageHook: fragment.includes("stageContribution"),
        skyBaseHook: /rcSkyAmbientBase\s*\+=/.test(fragment) };
      expect(state.stageHook).toBe(true); expect(state.skyBaseHook).toBe(true);
      return state;
    });

    await sliderEndpoint(page, "Opacity", false); await ready(page);
    expect(snapshot(await project(page)).sky.opacity).toBe(0);
    expect(compare("opacityZeroNeutral", await take("stage-opacity-zero"), neutral)).toBeLessThan(.1);
    await sliderEndpoint(page, "Opacity", true); await ready(page);
    expect(compare("opacityRestored", await take("stage-opacity-restored"), shaded)).toBeLessThan(.1);

    await sliderEndpoint(page, "SkyBrightness", true); await ready(page);
    expect(snapshot(await project(page)).sky.skyBrightness).toBe(2);
    const bright = await take("stage-added-sky-light");
    const brightRegions = measureSkyAmbientRegions(bright, regions);
    report.states.regions.bright = brightRegions;
    expect(brightRegions.open.mean - shadedRegions.open.mean).toBeGreaterThan(2);
    expect(compare("addedSkyLight", bright, shaded)).toBeGreaterThan(.15);
    await sliderEndpoint(page, "SkyBrightness", false); await ready(page);

    await applyPreset(page, semiMatte); await ready(page, false);
    // Unsupported presets bypass both attenuation and the optional sky-light addition.
    await sliderEndpoint(page, "SkyBrightness", true); await ready(page, false);
    const semiOn = await take("semi-matte-sky-on");
    await setRcLightingEnabled(page, id, false);
    expect(compare("semiMatteBypass", semiOn, await take("semi-matte-sky-off"))).toBeLessThan(.1);
    await setRcLightingEnabled(page, id, true);
    await sliderEndpoint(page, "SkyBrightness", false);
    await applyPreset(page, stage); await ready(page);
    expect(compare("stagePresetRestored", await take("stage-preset-restored"), shaded)).toBeLessThan(.15);

    const expected = snapshot(await project(page));
    const projectPath = join(launched.tempDir, "sky-stage-standard.json");
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, projectPath);
    await fileMenu(page, "file.saveProject");
    await expect.poll(() => {
      try { return snapshot(JSON.parse(readFileSync(projectPath, "utf8"))); }
      catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
    }).toEqual(expected);
    await applyPreset(page, semiMatte); await sliderEndpoint(page, "Opacity", false);
    await fileMenu(page, "file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await page.locator("#info-model-select").selectOption("0");
    await expect.poll(async () => snapshot(await project(page))).toEqual(expected);
    await ready(page);
    report.states.restored = snapshot(await project(page));
    const restored = await take("stage-project-restored");
    await setRcLightingEnabled(page, id, false);
    const restoredOff = await take("stage-project-restored-sky-off");
    report.states.regions.restored = { on: measureSkyAmbientRegions(restored, regions), off: measureSkyAmbientRegions(restoredOff, regions) };
    expect(report.states.regions.restored.off.canopy.mean - report.states.regions.restored.on.canopy.mean).toBeGreaterThan(2);
    await setRcLightingEnabled(page, id, true); await ready(page);

    await switchBackend(page, "classic");
    expect(snapshot(await project(page))).toEqual(expected);
    expect(compare("classicBypass", await take("stage-classic-with-saved-sky"), classicNeutral)).toBeLessThan(.15);
    await switchBackend(page, "frameGraph"); await ready(page);
    expect(snapshot(await project(page))).toEqual(expected);
    expect(compare("framegraphRestored", await take("stage-framegraph-restored"), restored)).toBeLessThan(.15);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.shaderResponses.filter(response => /text\/html/i.test(response.contentType))).toEqual([]);
    expect(report.shaderRequestFailures).toEqual([]);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

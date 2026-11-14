import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { camera, difference, initialState, numberControl, projectPoints } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, closeRcLighting, openRcLighting, rcLightingInput } from "./helpers/rc-lighting-controls.mjs";
import { setRcLightingFixtureSettings } from "./helpers/rc-lighting-fixture.mjs";
import { measureSkyAmbientRegions } from "./helpers/rc-sky-ambient-regions.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const id = "rcSkyAmbient", volume = { min: [-12, -8, -12], size: 32 }, cell = 2;
const invoke = (page, name, value) => page.evaluate(async ({ name, value }) =>
  // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
  (await import("/test/e2e/helpers/rc-sky-screen-roof-probe.mjs"))[name](value), { name, value });
const top = [[-4.4, 1.5, -.4], [-3.6, 1.5, -.4], [-3.6, 1.5, .4], [-4.4, 1.5, .4]];

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("Sky Ambient screen keeps a sub-cell roof dark and refreshes camera and portrait captures", async ({}, testInfo) => {
  test.setTimeout(300000);
  const report = { errors: [], consoleErrors: [], captures: {}, states: {}, regions: {}, comparisons: {}, volume, cell,
    roof: { bottom: 1.5 + cell * .2, thickness: .2, gapCells: .2 } };
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page, { fixed: false });
    await page.evaluate(async () => {
      // eslint-disable-next-line import/no-unresolved -- Local test-only instrumentation.
      await import("/test/e2e/helpers/rc-sky-screen-roof-probe.mjs");
      const state = window.mmdModokiE2e.exportProjectState();
      Object.assign(state.viewport, { antialiasEnabled: false, groundVisible: false, skydomeVisible: false });
      Object.assign(state.lighting, { intensity: 0, ambientIntensity: .6, shadowEnabled: false });
      state.lighting.rcSkyOcclusion.enabled = false; state.lighting.rcDiffuseGi.enabled = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    await addRcLighting(page, id);
    await setRcLightingFixtureSettings(page, id, { enabled: false, strength: 1, fill: 0, skyBrightness: 0,
      opacity: 1, rangeScale: 1, quality: "standard", volume });
    await closeRcLighting(page);
    const baseCamera = { tx: -4, ty: 1, tz: 0, rx: -9, ry: 0, rz: 0, camDistance: 9.5 };
    report.camera = await camera(page, baseCamera);
    const regions = { top: projectPoints(report.camera, top).map(point => point.slice(0, 2)) };
    const auto = page.locator("#btn-auto-key");
    if (await auto.getAttribute("aria-pressed") === "true") await auto.click();
    await page.locator("#info-model-select").selectOption("0");
    const category = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "庇移動")?.category);
    expect(category).toBeTruthy();
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));

    const enable = async active => {
      await openRcLighting(page, id); await rcLightingInput(page, id, "Enabled").setChecked(active);
      await closeRcLighting(page);
    };
    const pose = async x => {
      await page.locator("#info-model-select").selectOption("0");
      await selectTimelineTrack(page, category, "庇移動");
      await numberControl(page, "tx", x); await numberControl(page, "ty", report.roof.bottom - 4);
      await page.locator("#info-model-select").selectOption("__camera__");
    };
    const take = async (name, width = 640, height = 360) => {
      await invoke(page, "beginSkyScreenCapture");
      const directory = testInfo.outputPath(name); mkdirSync(directory, { recursive: true });
      const result = await page.evaluate(({ directory, width, height }) =>
        window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, width, height), { directory, width, height });
      report.captures[name] = result; expect(result.surfaceReleased).toBe(true);
      const image = PNG.sync.read(readFileSync(result.path)); expect([image.width, image.height]).toEqual([width, height]);
      report.states[name] = await invoke(page, "inspectSkyScreenCapture");
      const state = report.states[name];
      if (state.settings.enabled && state.enabled) {
        const current = state.events.filter(event => event.published && event.width === Math.ceil(width / 2)
          && event.height === Math.ceil(height / 2));
        expect(current.length, `${name}: current-size screen pass must publish`).toBeGreaterThan(0);
        for (const event of current) {
          expect(event.geometryViewProjections.length, `${name}: geometry must draw`).toBeGreaterThan(0);
          expect(event.matrixMaxError, `${name}: geometry and material must share projection`).toBeLessThan(1e-6);
        }
      }
      if (!state.enabled) expect(state.events).toEqual([]);
      report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]);
      return image;
    };
    const compare = (name, a, b) => report.comparisons[name] = difference(a, b);
    const images = {};
    for (const [name, x] of [["open", 16], ["closed", 0]]) {
      await pose(x); await enable(false);
      images[`${name}-off`] = await take(`${name}-off`);
      await invoke(page, "setSkyScreenPath", false); await enable(true);
      images[`${name}-hard`] = await take(`${name}-hard`);
      await invoke(page, "setSkyScreenPath", true);
      images[`${name}-screen`] = await take(`${name}-screen`);
      for (const variant of ["off", "hard", "screen"]) {
        report.regions[`${name}-${variant}`] = measureSkyAmbientRegions(images[`${name}-${variant}`], regions).top;
      }
      expect(compare(`${name}-screenRepeat`, images[`${name}-screen`], await take(`${name}-screen-repeat`))).toBeLessThan(.1);
    }
    const value = name => report.regions[name].mean;
    expect(Math.abs(value("open-off") - value("closed-off"))).toBeLessThan(1);
    // The reference path must itself detect this sub-cell occluder. Then the
    // screen path must retain its dark interior rather than gather the roof top.
    expect(value("open-hard") - value("closed-hard")).toBeGreaterThan(20);
    expect(value("open-screen") - value("closed-screen")).toBeGreaterThan(20);
    expect(value("closed-screen") - value("closed-hard")).toBeLessThan(2);
    expect(value("closed-off") - value("closed-screen")).toBeGreaterThan(20);

    report.movedCamera = await camera(page, { ...baseCamera, ty: 1.05, rx: -8, ry: 3 });
    await invoke(page, "setSkyScreenPath", false);
    const movedHard = await take("moved-hard");
    await invoke(page, "setSkyScreenPath", true);
    const movedFirst = await take("moved-screen-first");
    expect(compare("movedFirstVsRepeat", movedFirst, await take("moved-screen-repeat"))).toBeLessThan(.1);
    expect(compare("cameraChangeVisible", movedFirst, images["closed-screen"])).toBeGreaterThan(.2);
    const movedRegions = { top: projectPoints(report.movedCamera, top).map(point => point.slice(0, 2)) };
    const movedHardTop = measureSkyAmbientRegions(movedHard, movedRegions).top;
    const movedScreenTop = measureSkyAmbientRegions(movedFirst, movedRegions).top;
    report.regions.moved = { hard: movedHardTop, screen: movedScreenTop };
    expect(movedScreenTop.mean - movedHardTop.mean).toBeLessThan(2);

    // Cold output in a different aspect ratio, without a viewport refresh.
    // Two identical wrong matrices could also repeat; compare to the hard
    // reference as well, where no screen projection or geometry buffer is used.
    await invoke(page, "setSkyScreenPath", false);
    const portraitHard = await take("portrait-hard", 360, 640);
    await invoke(page, "setSkyScreenPath", true);
    const portraitFirst = await take("portrait-screen-first", 360, 640);
    expect(compare("portraitFirstVsRepeat", portraitFirst, await take("portrait-screen-repeat", 360, 640))).toBeLessThan(.1);
    expect(compare("portraitScreenVsHard", portraitFirst, portraitHard)).toBeLessThan(2);
    expect(compare("landscapeAfterPortrait", movedFirst, await take("landscape-restored"))).toBeLessThan(.1);
    expect(await page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled())).toBe(false);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

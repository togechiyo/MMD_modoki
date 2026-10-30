import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { camera, capture, closeGi, difference, giInput, giSlider, numberControl, openGi, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";

const root = resolve(import.meta.dirname, "../.."), fixture = resolve(root, "test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx");
const character = resolve(root, "local-references/model/Alicia/MMD/Alicia_solid.pmx");
// eslint-disable-next-line import/no-unresolved -- Browser-only observation/setup of the original fixture.
const probe = (page, method, ...args) => page.evaluate(async ({ method, args }) => (await import("/test/e2e/helpers/rc-diffuse-gi-character-probe.mjs"))[method](...args), { method, args });

function regionDifference(off, on, pixels) {
  const before = [0, 0, 0], after = [0, 0, 0], delta = [0, 0, 0];
  let absolute = 0, maximum = 0, changed = 0;
  for (const pixel of pixels) {
    let peak = 0;
    for (let channel = 0; channel < 3; channel++) {
      const a = off.data[pixel * 4 + channel], b = on.data[pixel * 4 + channel], value = b - a;
      before[channel] += a; after[channel] += b; delta[channel] += value;
      absolute += Math.abs(value); peak = Math.max(peak, Math.abs(value));
    }
    maximum = Math.max(maximum, peak); if (peak > 2) changed++;
  }
  const mean = delta.map(value => value / Math.max(1, pixels.length));
  return { pixels: pixels.length, offMean: before.map(value => value / Math.max(1, pixels.length)), onMean: after.map(value => value / Math.max(1, pixels.length)),
    rgbSigned: mean, rgbMae: absolute / Math.max(1, pixels.length * 3), maximum, aboveTwoFraction: changed / Math.max(1, pixels.length),
    redExcess: mean[0] - (mean[1] + mean[2]) / 2, blueExcess: mean[2] - (mean[0] + mean[1]) / 2 };
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires its fixture argument to be destructured.
test("RC GI authorized character: colored wall bounce, zero and source-color isolation", async ({}, testInfo) => {
  test.skip(process.env.MMD_RC_GI_CHARACTER_REFERENCE !== "1" || !existsSync(character), "Optional owner-authorized Alicia reference is opt-in");
  test.setTimeout(300000);
  const launched = await launchMmdModoki(root), report = { captures: {}, errors: [], consoleErrors: [], cases: {},
    interpretation: "Optional Alicia plus original scaled box fixture. Checks source-color response on the character, capture health and OFF/zero neutrality. Color magnitude and clipping still require visual review. No reference asset is published." };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await probe(page, "readCharacterState").catch(() => null);
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      state.lighting.rcDiffuseGi = { enabled: false, strength: .5, volume: null };
      await window.mmdModokiE2e.importProjectState(state);
    });
    for (const path of [fixture, character]) expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path)).not.toBeNull();
    expect(await page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(2);
    await openGi(page); await closeGi(page);
    report.fixture = await probe(page, "prepareCharacterStage");
    await page.locator("#info-model-select").selectOption("1");
    const category = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "センター")?.category);
    expect(category).toBeTruthy(); await selectTimelineTrack(page, category, "センター"); await numberControl(page, "tx", -5);
    report.camera = await camera(page, { tx: -5, ty: 16.5, tz: 0, rx: 0, ry: 25, rz: 0, camDistance: 12 });
    // All axes are entered: imported light settings need not match cached UI values.
    for (const [id, value] of [["light-direction-x", -1], ["light-direction-y", -.5], ["light-direction-z", 0]]) {
      if (!await page.locator(`#${id}`).isVisible()) await page.locator("#btn-toolbar-mode-toggle").click();
      const numeric = page.locator(`#${id} + .range-number-input`); await numeric.fill(String(value)); await numeric.press("Enter");
      await expect(page.locator(`#${id}`)).toHaveValue(String(value));
    }
    report.lighting = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting);
    expect([report.lighting.x, report.lighting.y, report.lighting.z]).toEqual([-1, -.5, 0]);
    const redOff = await capture(page, testInfo, report, "red-off");
    await setGi(page, true); const redOn = await capture(page, testInfo, report, "red-on-default");
    report.redState = await probe(page, "readCharacterState");
    expect(report.redState.settings.volume).toBeNull(); expect(report.redState.sourceReady).toBe(true);
    expect(report.redState.diagnostics.fieldRevision).toBeGreaterThan(0);
    const mask = await probe(page, "characterPixelMask", report.camera);
    expect(mask.pixels.length).toBeGreaterThan(1000); expect(mask.facePixels.length).toBeGreaterThan(500);
    report.mask = { ...mask, pixels: mask.pixels.length, facePixels: mask.facePixels.length };
    const compare = (name, off, on) => { report.cases[name] = { character: regionDifference(off, on, mask.pixels), face: regionDifference(off, on, mask.facePixels) }; };
    compare("redDefault", redOff, redOn);
    await openGi(page); await giSlider(page, 0); await closeGi(page);
    const zero = await capture(page, testInfo, report, "strength-zero"); compare("zero", redOff, zero);
    expect(difference(redOff, zero)).toBeLessThan(.1); expect(report.cases.zero.face.rgbMae).toBeLessThan(.1);
    await openGi(page); await giInput(page, "Strength").focus(); await giInput(page, "Strength").press("End"); await closeGi(page);
    const strong = await capture(page, testInfo, report, "red-on-maximum"); compare("redMaximum", redOff, strong);
    expect(report.cases.redMaximum.face.rgbSigned[0]).toBeGreaterThanOrEqual(report.cases.redDefault.face.rgbSigned[0] - .1);
    await setGi(page, false); const restored = await capture(page, testInfo, report, "red-off-restored");
    expect(difference(redOff, restored)).toBeLessThan(.1);
    report.blueSource = await probe(page, "setCharacterSourceColor", "blue");
    const blueOff = await capture(page, testInfo, report, "blue-off");
    await setGi(page, true); await openGi(page); await giSlider(page, 25); await closeGi(page);
    const blueOn = await capture(page, testInfo, report, "blue-on-default"); compare("blueDefault", blueOff, blueOn);
    compare("offSourceColorChange", redOff, blueOff);
    report.blueState = await probe(page, "readCharacterState");
    expect(report.blueState.settings.volume).toBeNull(); expect(report.blueState.sourceReady).toBe(true);
    expect(report.cases.offSourceColorChange.face.rgbMae).toBeLessThan(.1);
    // The unchanged OFF face isolates transported source color from the wall's
    // direct pixels and from mere uniform brightening of the entire image.
    const redFace = report.cases.redDefault.face, blueFace = report.cases.blueDefault.face;
    expect(redFace.rgbMae).toBeGreaterThan(2); expect(blueFace.rgbMae).toBeGreaterThan(2);
    expect(redFace.onMean[0]).toBeGreaterThan(blueFace.onMean[0] + 1);
    expect(blueFace.onMean[2]).toBeGreaterThan(redFace.onMean[2] + 5);
    // Keep a whole-character view as visual context, outside the fixed-camera comparisons.
    report.overviewCamera = await camera(page, { tx: -5, ty: 11, tz: 0, rx: 0, ry: 25, rz: 0, camDistance: 42 });
    await capture(page, testInfo, report, "blue-overview");
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

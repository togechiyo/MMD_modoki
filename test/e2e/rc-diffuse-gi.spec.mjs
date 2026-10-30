import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { ensureLuminousRadianceInstance, getLuminousInstanceRuntime, luminousInstanceControl,
  setLuminousInstancePosition } from "./helpers/luminous-instance-controls.mjs";
import { camera, capture, closeGi, dialog, difference, giInput, giSlider, initialState, numberControl,
  openGi, projectPoints, receiverDifference, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = variant => resolve(root, `test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-${variant}.pmx`);
async function lightExtreme(page, id, maximum) {
  const control = page.locator(`#${id}`);
  if (!await control.isVisible()) await page.locator("#btn-toolbar-mode-toggle").click();
  await control.focus(); await control.press(maximum ? "End" : "Home");
}

for (const variant of ["red", "black", "textured-red"]) test(`RC diffuse GI transport: ${variant} source, directional bounce and isolation`, async ({}, testInfo) => {
  test.setTimeout(240000);
  const launched = await launchMmdModoki(root), report = { errors: [], consoleErrors: [], captures: {}, cases: {}, variant };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page); await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture(variant));
    let view = await camera(page); report.camera = view;
    const pair = async name => {
      await setGi(page, false); const off = await capture(page, testInfo, report, `${name}-off`);
      await setGi(page, true); const on = await capture(page, testInfo, report, `${name}-on`);
      report.cases[name] = receiverDifference(off, on, view); return { off, on, ...report.cases[name] };
    };
    const base = await pair("base");
    if (variant === "black") {
      // White receiver self-bounce may add gray; a black source must not create red energy.
      expect(Math.abs(base.redExcess)).toBeLessThan(0.2);
      expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
      return;
    }
    expect(base.redExcess).toBeGreaterThan(0.3);
    expect(base.rgbSigned[0]).toBeGreaterThan(0.5);
    if (variant === "textured-red") {
      // Diffuse white alone cannot produce this red excess: it must come from the texture.
      expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
      return;
    }
    await openGi(page); await giSlider(page, 0); await closeGi(page);
    const zero = await capture(page, testInfo, report, "strength-zero");
    report.zeroDifference = difference(base.off, zero); expect(report.zeroDifference).toBeLessThan(0.1);
    await openGi(page); await giSlider(page, 25); await closeGi(page);
    await setGi(page, false); const restoredOff = await capture(page, testInfo, report, "off-restored");
    report.offDifference = difference(base.off, restoredOff); expect(report.offDifference).toBeLessThan(0.1);

    view = await camera(page, { tx: 0.75, ty: 0, tz: 0, rx: -70, ry: 0, camDistance: 4.2 });
    const sourceCorners = [-3.2,-3].flatMap(x => [0,4].flatMap(y => [-3,3].map(z => [x,y,z])));
    report.offscreenProjection = projectPoints(view, sourceCorners);
    // Independent actual vertices, not a single PMX's conservative bounding sphere.
    // x * clip-w is the homogeneous left-plane test, also valid behind the eye.
    expect(report.offscreenProjection.every(([x,,depth]) => x * depth < 0)).toBe(true);
    const offscreen = await pair("offscreen-source"); expect(offscreen.redExcess).toBeGreaterThan(0.3);
    view = await camera(page);

    await page.locator("#info-model-select").selectOption("0");
    const category = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "光遮蔽板")?.category);
    expect(category).toBeTruthy(); await selectTimelineTrack(page, category, "光遮蔽板");
    await numberControl(page, "tx", -20); await page.locator("#info-model-select").selectOption("__camera__");
    const blocked = await pair("source-light-blocked");
    expect(blocked.redExcess).toBeLessThan(base.redExcess * 0.65);
    await page.locator("#info-model-select").selectOption("0"); await selectTimelineTrack(page, category, "光遮蔽板");
    await numberControl(page, "tx", 0); await page.locator("#info-model-select").selectOption("__camera__");

    await lightExtreme(page, "light-direction-x", true);
    const reversed = await pair("light-reversed"); expect(reversed.redExcess).toBeLessThan(base.redExcess * 0.65);
    await lightExtreme(page, "light-direction-x", false);
    await openGi(page);
    const sky = dialog(page).locator('[data-experiment-section="rc-sky-occlusion"]');
    await sky.locator('[name="rcSkyOcclusionEnabled"]').check();
    await expect(sky.locator("[data-rc-sky-occlusion-status]")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await closeGi(page);
    const combined = await pair("sky-combined"); expect(combined.redExcess).toBeGreaterThan(0.3);
    await openGi(page); await sky.locator('[name="rcSkyOcclusionEnabled"]').uncheck(); await closeGi(page);

    await page.locator("#info-model-select").selectOption("0");
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: "GI Source" }) }).click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous");
    await page.locator("#btn-shader-apply-selected").click(); await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    const luminous = await pair("luminous-source-preset");
    report.luminousRedDifference = Math.abs(luminous.redExcess - base.redExcess);
    expect(report.luminousRedDifference).toBeLessThan(Math.max(0.3, base.redExcess * 0.15));

    // Applying AutoLuminous above only changed the material. Now enable the actual
    // independent Luminous RC effect together with both persistent lighting effects.
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click(); await ensureLuminousRadianceInstance(page);
    await setLuminousInstancePosition(page, "luminousRadianceRange", 3);
    await setLuminousInstancePosition(page, "luminousRadianceStrength", 25);
    const emissionEnabled = luminousInstanceControl(page, "luminousRadianceEnabled");
    const toggleEmission = async enabled => {
      if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
      await page.locator('[data-effect-tab="post"]').click(); await emissionEnabled.setChecked(enabled);
      if (enabled) {
        await expect.poll(async () => (await getLuminousInstanceRuntime(page)).ready).toBe(true);
        await expect.poll(async () => (await getLuminousInstanceRuntime(page)).luminousRadiance?.emitters ?? 0).toBeGreaterThan(0);
        expect((await getLuminousInstanceRuntime(page)).luminousRadiance.error).toBeNull();
      }
      await page.locator("#btn-toggle-shader-panel").click();
    };
    await toggleEmission(true);
    await openGi(page); await sky.locator('[name="rcSkyOcclusionEnabled"]').check();
    await expect(sky.locator("[data-rc-sky-occlusion-status]")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await expect(giInput(page, "Enabled")).toBeChecked(); await closeGi(page);
    await capture(page, testInfo, report, "all-three-on");
    report.allThreeRuntime = await getLuminousInstanceRuntime(page);
    // Preserve the standalone GI color/zero-light assertions below.
    await toggleEmission(false); await openGi(page); await sky.locator('[name="rcSkyOcclusionEnabled"]').uncheck(); await closeGi(page);

    await lightExtreme(page, "light-color-r", false); await lightExtreme(page, "light-color-g", true); await lightExtreme(page, "light-color-b", false);
    const greenLight = await pair("green-light");
    expect(greenLight.rgbSigned[0]).toBeLessThan(base.rgbSigned[0] * 0.3);
    await lightExtreme(page, "light-intensity", false);
    const noLight = await pair("luminous-without-direct-light");
    report.noDirectLightDifference = difference(noLight.off, noLight.on);
    // The source remains visibly emissive, but GI must contain only reflected direct light.
    expect(report.noDirectLightDifference).toBeLessThan(0.1);

    await toggleEmission(true); await openGi(page); await sky.locator('[name="rcSkyOcclusionEnabled"]').check();
    await expect(sky.locator("[data-rc-sky-occlusion-status]")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await expect(giInput(page, "Enabled")).toBeChecked(); await closeGi(page);
    const darkThree = await capture(page, testInfo, report, "all-three-on-no-direct-light");
    report.darkThreeRuntime = await getLuminousInstanceRuntime(page);
    await toggleEmission(false);
    const darkWithoutEmission = await capture(page, testInfo, report, "sky-gi-on-no-direct-light");
    report.emissionRemaining = receiverDifference(darkWithoutEmission, darkThree, view);
    // Emission transport survives direct light=0 independently of the zero GI
    // contribution asserted above. Its magnitude is not a GI strength calibration.
    expect(report.emissionRemaining.rgbSigned[0]).toBeGreaterThan(0.5);

    // Geometry-only direct-light separation: horizontal light illuminates +X on
    // the source while its cosine against the receiver's +Y normal is zero.
    // The MMD fallback toon may retain display-space residual; record absolute
    // receiver values rather than presuming it becomes black or imposing a gain.
    await openGi(page); await sky.locator('[name="rcSkyOcclusionEnabled"]').uncheck(); await closeGi(page);
    await page.locator("#info-model-select").selectOption("0");
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: "GI Receiver" }) }).click();
    await page.locator("#shader-preset-select").selectOption("wgsl-light-and-shadow");
    await page.locator("#btn-shader-apply-selected").click(); await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    const lightValue = async (id, value) => {
      const control = page.locator(`#${id}`);
      if (!await control.isVisible()) await page.locator("#btn-toolbar-mode-toggle").click();
      const minimum = Number(await control.getAttribute("min")), step = Number(await control.getAttribute("step"));
      await control.focus(); await control.press("Home");
      for (let i = 0; i < Math.round((value - minimum) / step); i++) await control.press("ArrowRight");
      await expect(control).toHaveValue(String(value));
    };
    for (const [id, value] of [["light-direction-x", -1], ["light-direction-y", 0], ["light-direction-z", 0],
      ["light-color-r", 128], ["light-color-g", 128], ["light-color-b", 128], ["light-intensity", 60]]) await lightValue(id, value);
    const indirect = await pair("horizontal-light-floor");
    const blackReference = { data: Buffer.alloc(640 * 360 * 4) };
    for (let i = 3; i < blackReference.data.length; i += 4) blackReference.data[i] = 255;
    report.horizontalLightFloor = { delta: report.cases["horizontal-light-floor"],
      offMean: receiverDifference(blackReference, indirect.off, view).rgbSigned,
      onMean: receiverDifference(blackReference, indirect.on, view).rgbSigned,
      sourcePreset: "wgsl-autoluminous (diffuse-only GI source)", receiverPreset: "wgsl-light-and-shadow",
      lighting: await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting),
      note: "Geometric direct cosine=0 on floor, 1 on source; toon residual is measured, not assumed zero. Luminous RC and sky occlusion are OFF." };
    expect(indirect.rgbSigned[0]).toBeGreaterThan(0.5); expect(indirect.redExcess).toBeGreaterThan(0.3);
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

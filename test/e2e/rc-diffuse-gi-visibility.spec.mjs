import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, closeGi, difference, giSettings, giSlider, giStatus,
  giVolume, initialState, openGi, receiverDifference, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";
import { setRcLightingFixtureSettings } from "./helpers/rc-lighting-fixture.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx");
const originVolume = { min: [-64, -64, -64], size: 128 };

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("RC diffuse GI visibility: origin bounds, manual lighting, dark receiver and live light updates", async ({}, testInfo) => {
  test.setTimeout(240000);
  const launched = await launchMmdModoki(root);
  const report = { errors: [], consoleErrors: [], captures: {}, cases: [],
    interpretation: "Original 36-triangle PMX, default GI strength 0.5. Hidden volume settings are prepared through project import and resolved volume is observed through a diagnostic probe, not GUI editing. Manual size-16 bounds preserve this small fixture's red-bounce thresholds; automatic mode checks origin bounds and identical output after a manual round trip. Automatic lighting magnitude is covered with the larger room in rc-origin-volumes.spec.mjs. Black shadow tint and Toon influence 0 are fixture-only GUI shading controls; shadow generator, CSM, bias and distances are unchanged. PMX covers Stage; Accessory/OBJ presets belong to their respective import types." };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page, { fixed: false });
    // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
    await page.evaluate(async () => { await import("/test/e2e/helpers/rc-diffuse-gi-reference-probe.mjs"); });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    const view = await camera(page); report.camera = view;
    const blackReference = { data: Buffer.alloc(640 * 360 * 4) };
    for (let i = 3; i < blackReference.data.length; i += 4) blackReference.data[i] = 255;

    const state = async () => {
      await openGi(page);
      // Read the field diagnostically; there are no editable volume inputs in the card.
      const resolved = await page.evaluate(async () =>
        // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
        (await import("/test/e2e/helpers/rc-diffuse-gi-reference-probe.mjs")).readReferenceState().volume);
      const result = { status: await giStatus(page).getAttribute("data-state"), fieldRevision: Number(await giStatus(page).getAttribute("data-field-revision")),
        statusText: await giStatus(page).textContent(),
        supportedMaterials: Number(await giStatus(page).getAttribute("data-supported-material-count")),
        automatic: await giStatus(page).getAttribute("data-automatic-volume") === "true", resolved, stored: await giSettings(page) };
      await closeGi(page); return result;
    };
    const volume = async fixed => {
      await setRcLightingFixtureSettings(page, "rcDiffuseGi", { volume: fixed ? giVolume : null });
      expect((await giSettings(page)).volume).toEqual(fixed ? giVolume : null);
    };
    const pair = async (phase, name) => {
      await setGi(page, false); const off = await capture(page, testInfo, report, `${phase}-${name}-off`);
      await setGi(page, true); const on = await capture(page, testInfo, report, `${phase}-${name}-on`);
      const item = { phase, name, state: await state(), delta: receiverDifference(off, on, view),
        offMean: receiverDifference(blackReference, off, view).rgbSigned,
        onMean: receiverDifference(blackReference, on, view).rgbSigned, wholeImageDifference: difference(off, on),
        lighting: await page.evaluate(() => { const light=window.mmdModokiE2e.exportProjectState().lighting;
          return { direction:[light.x,light.y,light.z],intensity:light.intensity,lightColor:light.lightColor }; }) };
      report.cases.push(item);
      expect(item.state.status).toBe("ready"); expect(item.state.fieldRevision).toBeGreaterThan(0);
      expect(item.state.supportedMaterials).toBeGreaterThan(0); expect(item.state.stored.strength).toBe(0.5);
      expect(item.state.resolved.size).toBeGreaterThan(0);
      expect(item.delta.rgbSigned.every(Number.isFinite)).toBe(true);
      expect(item.lighting.direction).toEqual(phase === "dark" ? [-1,0,0] : [-1,-1,0]);
      if (name === "fixed16") {
        // Keep the original quantitative lighting gate at this fixture's explicit
        // grid resolution. Its tiny receiver does not resolve the automatic grid.
        expect(item.state.resolved).toEqual(giVolume);
        expect(item.state.stored.volume).toEqual(giVolume);
        expect(item.state.automatic).toBe(false);
        const minimumRed = phase === "dark" ? 10 : 2;
        expect(item.delta.rgbSigned[0]).toBeGreaterThan(minimumRed);
        expect(item.delta.redExcess).toBeGreaterThan(minimumRed);
      } else {
        expect(item.state.resolved).toEqual(originVolume);
        expect(item.state.stored.volume).toBeNull();
        expect(item.state.automatic).toBe(true);
      }
      if (phase === "dark") for (const value of item.offMean) expect(value).toBeLessThan(1);
      return { item, off, on };
    };
    const compareVolumes = async phase => {
      const automatic = await pair(phase, "auto");
      expect(automatic.item.state.stored.volume).toBeNull(); expect(automatic.item.state.automatic).toBe(true);
      await volume(true); const bounded = await pair(phase, "fixed16");
      expect(bounded.item.state.resolved).toEqual(giVolume);
      await volume(false); const restored = await pair(phase, "auto-restored");
      const restore = receiverDifference(automatic.on, restored.on, view);
      report[`${phase}Comparison`] = { automaticCellSize: automatic.item.state.resolved.size / 16,
        boundedCellSize: 1, automaticRedExcess: automatic.item.delta.redExcess, boundedRedExcess: bounded.item.delta.redExcess,
        automaticToBoundedRatio: bounded.item.delta.redExcess ? automatic.item.delta.redExcess / bounded.item.delta.redExcess : null,
        restoreWholeImageDifference: difference(automatic.on, restored.on), restoreReceiver: restore };
      expect(report[`${phase}Comparison`].restoreWholeImageDifference).toBeLessThan(0.15);
      // The auto/fixed ratio is diagnostic only. This test instead requires the
      // origin grid and rendered output to recover after the manual round trip.
      for (const value of restore.rgbAbsolute) expect(value).toBeLessThan(0.15);
      expect(restored.item.state.stored.volume).toBeNull();
      return restored.item.state;
    };

    await compareVolumes("normal");
    // Light & Shadow supplies a toon ramp for the original no-toon receiver.
    // Only the receiving material changes; the red source stays ordinary diffuse.
    await page.locator("#info-model-select").selectOption("0");
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: "GI Receiver" }) }).click();
    await page.locator("#shader-preset-select").selectOption("wgsl-light-and-shadow");
    await page.locator("#btn-shader-apply-selected").click(); await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    const lightValue = async (id, value) => {
      const control = page.locator(`#${id}`);
      await page.locator("#info-model-select").selectOption("__camera__");
      await expect(control).toBeVisible();
      const minimum = Number(await control.getAttribute("min")), step = Number(await control.getAttribute("step"));
      await control.focus(); await control.press("Home");
      for (let i = 0; i < Math.round((value - minimum) / step); i++) await control.press("ArrowRight");
      await expect(control).toHaveValue(String(value));
    };
    // Remove Toon residual through existing shading controls, without enabling or
    // reconfiguring raster shadows. At y=0 the floor's geometric direct cosine is 0.
    for (const id of ["light-shadow-color-r", "light-shadow-color-g", "light-shadow-color-b", "light-toon-shadow-influence"]) await lightValue(id, 0);
    const beforeLight = await state();
    for (const [axis, value] of [["x", -1], ["y", 0], ["z", 0]]) await lightValue(`light-direction-${axis}`, value);
    await openGi(page);
    await expect.poll(async () => Number(await giStatus(page).getAttribute("data-field-revision"))).toBeGreaterThan(beforeLight.fieldRevision);
    await closeGi(page);
    report.liveLightUpdate = { before: beforeLight, after: await state() };
    report.darkLighting = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting);
    expect([report.darkLighting.x, report.darkLighting.y, report.darkLighting.z]).toEqual([-1, 0, 0]);
    await compareVolumes("dark");

    // Stage was previously rejected by the GI material gate. Accessory/OBJ presets
    // are intentionally absent from the PMX menu and need their own format fixtures.
    await lightValue("light-direction-y", -1);
    await page.locator("#info-model-select").selectOption("0");
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    for (const material of ["GI Source", "GI Receiver"]) {
      await page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: material }) }).click();
      await page.locator("#shader-preset-select").selectOption("wgsl-stage-standard"); await page.locator("#btn-shader-apply-selected").click();
    }
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator("#info-model-select").selectOption("__camera__");
    await volume(true);
    const stage = await pair("preset-stage", "fixed16");
    stage.item.preset = "wgsl-stage-standard";
    stage.item.materialAssignments = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models[0].materialShaders);
    expect(stage.item.state.stored.volume).toEqual(giVolume); expect(stage.item.state.supportedMaterials).toBeGreaterThanOrEqual(2);

    await openGi(page); await giSlider(page, 0);
    await expect(giStatus(page)).toHaveAttribute("data-state", "ready");
    await expect(giStatus(page)).toContainText(/強度が0|Strength is zero/);
    report.zeroStrengthReason = await giStatus(page).textContent(); await closeGi(page);
    const zeroStrength = await capture(page, testInfo, report, "zero-strength-reason");
    report.zeroStrengthReceiver = receiverDifference(stage.off, zeroStrength, view);
    for (const value of report.zeroStrengthReceiver.rgbAbsolute) expect(value).toBeLessThan(0.15);
    await openGi(page); await giSlider(page, 25); await closeGi(page);
    await lightValue("light-intensity", 0); await openGi(page);
    await expect(giStatus(page)).toHaveAttribute("data-state", "ready");
    await expect(giStatus(page)).toContainText(/メイン方向光の光量が0|main light has zero output/);
    report.noDirectLightReason = await giStatus(page).textContent(); await closeGi(page);
    await lightValue("light-intensity", 60); await openGi(page);
    await expect(giStatus(page)).not.toContainText(/強度が0|光量が0|Strength is zero|main light has zero output/);
    await closeGi(page);
    report.restoredReasonState = await state();
    expect(report.restoredReasonState.stored.strength).toBe(0.5);
    expect(report.restoredReasonState.statusText).not.toMatch(/強度が0|光量が0|Strength is zero|main light has zero output/);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

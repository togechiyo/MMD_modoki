import { expect, test } from "@playwright/test";
import { copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = process.env.MMD_MODOKI_E2E_MODEL_PATH
  ?? resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");
const screenshotDirectory = resolve(repoRoot, "test-results");

test.skip("retired ocean implementation reference", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const loaded = await page.evaluate((path) => (
      window.mmdModokiE2e.loadModel(path)
    ), modelPath);
    expect(loaded).not.toBeNull();

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="ocean"]').click();

    const oceanRow = page.locator('[data-effect-stack-row="ocean"]');
    await expect(oceanRow).toBeVisible();
    await expect(oceanRow.locator('[data-effect-stack-control="oceanWaterHeight"]')).toHaveValue("47");
    await expect(oceanRow.locator('[data-effect-stack-value="oceanWaterHeight"]')).toHaveText("8.0");
    await expect(oceanRow.locator('[data-effect-stack-value="oceanClarity"]')).toHaveText("0.85");
    await expect(oceanRow.locator('[data-effect-stack-value="oceanVolumeStrength"]')).toHaveText("0.65");

    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(project.effects).toMatchObject({
      oceanWaterHeight: 8,
      oceanWaveStrength: 0.7,
      oceanClarity: 0.85,
      oceanCausticsStrength: 1.1,
      oceanVolumeStrength: 0.65,
    });
    expect(project.effects.frameGraphPostStack).toContainEqual({ id: "ocean", enabled: true });

    for (const field of ["oceanWaveStrength", "oceanClarity"]) {
      await oceanRow.locator(`[data-effect-stack-control="${field}"]`).evaluate((element) => {
        element.value = "100";
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    await expect(oceanRow.locator('[data-effect-stack-value="oceanWaveStrength"]')).toHaveText("2.00");
    await expect(oceanRow.locator('[data-effect-stack-value="oceanClarity"]')).toHaveText("4.00");

    for (const [field, sliderValue] of [["oceanWaveStrength", "35"], ["oceanClarity", "21"]]) {
      await oceanRow.locator(`[data-effect-stack-control="${field}"]`).evaluate((element, value) => {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }, sliderValue);
    }
    await expect(oceanRow.locator('[data-effect-stack-value="oceanWaveStrength"]')).toHaveText("0.70");
    await expect(oceanRow.locator('[data-effect-stack-value="oceanClarity"]')).toHaveText("0.84");

    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      return state.backend === "frameGraph"
        && state.ready
        && state.oceanWaveFieldReady
        && state.oceanVolumeReady
        && state.oceanSurfaceReady
        && state.stack.includes("ocean")
        && state.executedFrameCount >= 10;
    });

    expect(await page.evaluate(() => (
      window.mmdModokiE2e.getWebGpuValidationDiagnostics()
    ))).toEqual({ count: 0, messages: [] });

    const frameCountBeforeUnderwaterView = await page.evaluate(() => (
      window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount
    ));
    await page.evaluate(() => {
      window.mmdModokiE2e.setCameraPose(
        { x: 0, y: 6.5, z: -28 },
        { x: 0, y: 9, z: 0 },
      );
    });
    await page.waitForFunction((previousFrameCount) => (
      window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount >= previousFrameCount + 2
    ), frameCountBeforeUnderwaterView);

    const pngCapture = await page.evaluate(({ directory }) => (
      window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360)
    ), { directory: screenshotDirectory });
    expect(pngCapture).toMatchObject({
      width: 640,
      height: 360,
      surfaceReleased: true,
    });
    expect(pngCapture.byteLength).toBeGreaterThan(1000);
    await copyFile(
      pngCapture.path,
      resolve(screenshotDirectory, "ocean-surface-underwater-e2e.png"),
    );

    await page.evaluate(() => {
      window.mmdModokiE2e.setCameraPose(
        { x: 0, y: 12, z: -28 },
        { x: 0, y: 8, z: 0 },
      );
    });
    const aboveWaterCapture = await page.evaluate(({ directory }) => (
      window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360)
    ), { directory: screenshotDirectory });
    await copyFile(
      aboveWaterCapture.path,
      resolve(screenshotDirectory, "ocean-surface-above-e2e.png"),
    );

    await page.evaluate(() => {
      window.mmdModokiE2e.setCameraPose(
        { x: 0, y: 8.7, z: -24 },
        { x: 0, y: 7.5, z: 0 },
      );
    });
    const splitSurfaceCapture = await page.evaluate(({ directory }) => (
      window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360)
    ), { directory: screenshotDirectory });
    await copyFile(
      splitSurfaceCapture.path,
      resolve(screenshotDirectory, "ocean-surface-split-e2e.png"),
    );

    const waterHeightControl = oceanRow.locator('[data-effect-stack-control="oceanWaterHeight"]');
    const frameCountBeforeWaterlineView = await page.evaluate(() => (
      window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount
    ));
    await waterHeightControl.evaluate((element) => {
      element.value = "35";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(oceanRow.locator('[data-effect-stack-value="oceanWaterHeight"]')).toHaveText("1.0");
    await page.evaluate(() => {
      window.mmdModokiE2e.setCameraPose(
        { x: 0, y: 3.2, z: -12 },
        { x: 0, y: 1, z: 0 },
      );
    });
    await page.waitForFunction((previousFrameCount) => (
      window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount >= previousFrameCount + 2
    ), frameCountBeforeWaterlineView);
    const waterlineCapture = await page.evaluate(({ directory }) => (
      window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360)
    ), { directory: screenshotDirectory });
    await copyFile(
      waterlineCapture.path,
      resolve(screenshotDirectory, "ocean-waterline-e2e.png"),
    );

    const volumeControlForVisual = oceanRow.locator('[data-effect-stack-control="oceanVolumeStrength"]');
    await volumeControlForVisual.evaluate((element) => {
      element.value = "100";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate(() => {
      window.mmdModokiE2e.setCameraPose(
        { x: 0, y: -5, z: -24 },
        { x: 0, y: 5, z: 0 },
      );
    });
    const volumeVisualCapture = await page.evaluate(({ directory }) => (
      window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360)
    ), { directory: screenshotDirectory });
    await copyFile(
      volumeVisualCapture.path,
      resolve(screenshotDirectory, "ocean-volume-light-e2e.png"),
    );
    await volumeControlForVisual.evaluate((element) => {
      element.value = "32.5";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waterHeightControl.evaluate((element) => {
      element.value = "47";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await page.evaluate(() => {
      window.mmdModokiE2e.setCameraPose(
        { x: 0, y: 6.5, z: -28 },
        { x: 0, y: 9, z: 0 },
      );
    });

    const rendered = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(160, 90)
    ));
    expect(rendered).toMatchObject({
      backend: "frameGraph",
      ready: true,
      width: 160,
      height: 90,
    });
    expect(rendered.nonZeroRgbByteCount).toBeGreaterThan(1000);

    const renderedAgain = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(160, 90)
    ));
    expect(renderedAgain.pixelChecksum).toBe(rendered.pixelChecksum);

    const volumeControl = oceanRow.locator('[data-effect-stack-control="oceanVolumeStrength"]');
    await volumeControl.evaluate((element) => {
      element.value = "0";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const renderedWithoutVolume = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(160, 90)
    ));
    expect(renderedWithoutVolume.pixelChecksum).not.toBe(rendered.pixelChecksum);

    await volumeControl.evaluate((element) => {
      element.value = "32.5";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(oceanRow.locator('[data-effect-stack-value="oceanVolumeStrength"]')).toHaveText("0.66");
    const renderedWithRestoredVolume = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(160, 90)
    ));
    expect(renderedWithRestoredVolume.pixelChecksum).not.toBe(renderedWithoutVolume.pixelChecksum);

    await page.evaluate(() => {
      window.mmdModokiE2e.setLightDirection({ x: -0.7, y: -0.45, z: 0.2 });
    });
    const renderedWithRotatedLight = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(160, 90)
    ));
    expect(renderedWithRotatedLight.pixelChecksum).not.toBe(renderedWithRestoredVolume.pixelChecksum);

    expect(await page.evaluate(() => (
      window.mmdModokiE2e.getWebGpuValidationDiagnostics()
    ))).toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

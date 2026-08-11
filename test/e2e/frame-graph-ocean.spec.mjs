import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = process.env.MMD_MODOKI_E2E_MODEL_PATH
  ?? resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");
const screenshotDirectory = resolve(repoRoot, "test-results");

test("豆腐モデルにFrameGraph海エフェクトを適用できる", async () => {
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

    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(project.effects).toMatchObject({
      oceanWaterHeight: 8,
      oceanWaveStrength: 0.7,
      oceanClarity: 0.85,
      oceanCausticsStrength: 1.1,
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

    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      return state.backend === "frameGraph"
        && state.ready
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

    expect(await page.evaluate(() => (
      window.mmdModokiE2e.getWebGpuValidationDiagnostics()
    ))).toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

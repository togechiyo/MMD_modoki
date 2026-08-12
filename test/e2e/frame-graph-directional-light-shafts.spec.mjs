import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = process.env.MMD_MODOKI_E2E_MODEL_PATH
  ?? resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("directional-light-linked two-color para flare renders without WebGPU validation errors", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="directionalLightShafts"]').click();

    const row = page.locator('[data-effect-stack-row="directionalLightShafts"]');
    await expect(row).toBeVisible();
    await expect(row.locator('[data-effect-stack-control="directionalLightShaftsStrength"]')).toHaveValue("50");
    await expect(row.locator('[data-effect-stack-control="directionalLightShaftsPhaseG"]')).toHaveValue("50");
    await expect(row.locator('[data-effect-stack-value="directionalLightShaftsPhaseG"]')).toHaveText("0.00");
    await expect(row.locator('[data-effect-stack-control="directionalLightShaftsLightColor"]')).toHaveValue("#ffffff");
    await expect(row.locator('[data-effect-stack-control="directionalLightShaftsShadowColor"]')).toHaveValue("#000000");

    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      return state.backend === "frameGraph"
        && state.ready
        && state.stack.includes("directionalLightShafts")
        && state.executedFrameCount >= 10;
    }, null, { timeout: 20_000 });

    const strength = row.locator('[data-effect-stack-control="directionalLightShaftsStrength"]');
    await strength.evaluate((element) => {
      element.value = "100";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const firstDirection = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(64, 36));
    expect(firstDirection.nonZeroRgbByteCount).toBeGreaterThan(0);

    const lightColor = row.locator('[data-effect-stack-control="directionalLightShaftsLightColor"]');
    await lightColor.evaluate((element) => {
      element.value = "#ff4040";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const recolored = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(64, 36));
    expect(recolored.pixelChecksum).not.toBe(firstDirection.pixelChecksum);

    await strength.evaluate((element) => {
      element.value = "0";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const withoutShafts = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(64, 36));
    expect(withoutShafts.pixelChecksum).not.toBe(firstDirection.pixelChecksum);
    await strength.evaluate((element) => {
      element.value = "100";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await page.evaluate(() => {
      window.mmdModokiE2e.setLightDirection({ x: -0.7, y: -0.45, z: 0.2 });
    });
    await page.waitForTimeout(500);
    const secondDirection = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(64, 36));
    expect(secondDirection.pixelChecksum).not.toBe(firstDirection.pixelChecksum);

    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()))
      .toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

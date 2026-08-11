import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = process.env.MMD_MODOKI_E2E_MODEL_PATH
  ?? resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("PMXモデルでFrameGraph Motion Blurを描画できる", async () => {
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
    await page.locator('[data-effect-add-post="motionBlur"]').click();

    const motionBlurRow = page.locator('[data-effect-stack-row="motionBlur"]');
    await expect(motionBlurRow).toBeVisible();
    const strength = motionBlurRow.locator(
      '[data-effect-stack-control="motionBlurStrength"]',
    );
    await expect(strength).toHaveValue("100");
    await expect(
      motionBlurRow.locator('[data-effect-stack-value="motionBlurStrength"]'),
    ).toHaveText("10.00");

    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      return state.backend === "frameGraph"
        && state.ready
        && state.stack.includes("motionBlur")
        && state.executedFrameCount >= 10;
    });

    expect(await page.evaluate(() => (
      window.mmdModokiE2e.getWebGpuValidationDiagnostics()
    ))).toEqual({ count: 0, messages: [] });

    const rendered = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(64, 36)
    ));
    expect(rendered).toMatchObject({
      backend: "frameGraph",
      ready: true,
      width: 64,
      height: 36,
    });
    expect(rendered.nonZeroRgbByteCount).toBeGreaterThan(0);
  } finally {
    await launched.close();
  }
});

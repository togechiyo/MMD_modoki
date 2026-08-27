import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = process.env.MMD_MODOKI_E2E_MODEL_PATH
  ?? resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("PMXモデルで空気遠近をFrameGraph描画できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="aerialPerspective"]').click();

    const row = page.locator('[data-effect-stack-row="aerialPerspective"]');
    await expect(row).toBeVisible();
    await expect(row.locator('[data-effect-stack-control="aerialPerspectiveStrength"]')).toHaveValue("30");
    await expect(row.locator('[data-effect-stack-value="aerialPerspectiveStart"]')).toHaveText("55");
    await expect(row.locator('[data-effect-stack-value="aerialPerspectiveRange"]')).toHaveText("180");
    const color = row.locator('[data-effect-stack-control="aerialPerspectiveColor"]');
    await expect(color).toHaveValue("#b8c9d4");
    await expect(row.locator('[data-effect-stack-control="aerialPerspectiveColorB"]')).toHaveCount(0);
    await expect(row.locator('[data-effect-stack-control="aerialPerspectiveColorC"]')).toHaveCount(0);
    await expect(row.locator('[data-effect-stack-control="aerialPerspectiveColorMidpoint"]')).toHaveCount(0);
    await color.fill("#6b8fb8");

    await page.locator("#btn-effect-reload-framegraph").click();
    await expect(page.getByText("FrameGraphを再読み込みしました", { exact: true })).toBeVisible();
    await expect(row).toBeVisible();
    await expect(row.locator('[data-effect-stack-value="aerialPerspectiveStart"]')).toHaveText("55");
    await expect(color).toHaveValue("#6b8fb8");

    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(project.effects.aerialPerspectiveColor).toEqual({
      r: 107 / 255,
      g: 143 / 255,
      b: 184 / 255,
    });
    expect(project.effects).not.toHaveProperty("aerialPerspectiveColorB");
    expect(project.effects).not.toHaveProperty("aerialPerspectiveColorC");
    expect(project.effects).not.toHaveProperty("aerialPerspectiveColorMidpoint");

    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      return state.backend === "frameGraph"
        && state.ready
        && state.stack.includes("aerialPerspective")
        && state.executedFrameCount >= 10;
    });

    const strength = row.locator('[data-effect-stack-control="aerialPerspectiveStrength"]');
    const start = row.locator('[data-effect-stack-control="aerialPerspectiveStart"]');
    const range = row.locator('[data-effect-stack-control="aerialPerspectiveRange"]');
    await strength.evaluate((element) => {
      element.value = "100";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await start.evaluate((element) => {
      element.value = "0";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await range.evaluate((element) => {
      element.value = "0";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(row.locator('[data-effect-stack-value="aerialPerspectiveStart"]')).toHaveText("0");
    await expect(row.locator('[data-effect-stack-value="aerialPerspectiveRange"]')).toHaveText("20");

    const renderedWithFog = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(64, 36));
    expect(renderedWithFog.nonZeroRgbByteCount).toBeGreaterThan(0);

    await strength.evaluate((element) => {
      element.value = "0";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const renderedWithoutFog = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(64, 36));
    expect(renderedWithoutFog.pixelChecksum).not.toBe(renderedWithFog.pixelChecksum);

    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()))
      .toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { effectStackRow } from "./helpers/effect-instance-controls.mjs";

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

    const row = effectStackRow(page, "aerialPerspective");
    await expect(row).toBeVisible();
    await expect(row.locator('[data-instance-field="strength"]')).toHaveValue("30");
    await expect(row.locator('[data-instance-value="start"]')).toHaveText("55.00");
    await expect(row.locator('[data-instance-value="range"]')).toHaveText("180.00");
    const color = row.locator('[data-instance-field="color"]');
    await expect(color).toHaveValue("#b8c9d4");
    await expect(row.locator('[data-instance-field="colorB"]')).toHaveCount(0);
    await expect(row.locator('[data-instance-field="colorC"]')).toHaveCount(0);
    await expect(row.locator('[data-instance-field="colorMidpoint"]')).toHaveCount(0);
    await color.fill("#6b8fb8");

    const master = page.locator("#btn-effect-toggle-framegraph");
    await master.click();
    await expect(master).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().resourcesAllocated)).toBe(false);
    await master.click();
    await expect(master).toHaveAttribute("aria-pressed", "true");
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    await expect(row).toBeVisible();
    await expect(row.locator('[data-instance-value="start"]')).toHaveText("55.00");
    await expect(color).toHaveValue("#6b8fb8");

    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(project.effects.frameGraphInstances.instances.find(instance => instance.type === "aerialPerspective").fixedSettings.color).toEqual({
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
        && window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects.controller?.instances.some(instance => instance.type === "aerialPerspective")
        && state.executedFrameCount >= 10;
    });

    const strength = row.locator('[data-instance-field="strength"]');
    const start = row.locator('[data-instance-field="start"]');
    const range = row.locator('[data-instance-field="range"]');
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
    await expect(row.locator('[data-instance-value="start"]')).toHaveText("0.00");
    await expect(row.locator('[data-instance-value="range"]')).toHaveText("20.00");

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

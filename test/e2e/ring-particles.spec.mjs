import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("豆腐モデル周囲の光粒をFrameGraphスタックから再現可能に描画する", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    page.on("console", (message) => console.log(`[renderer:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => console.error(`[renderer:error] ${error.message}`));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e), null, { timeout: 30_000 });
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="ringParticles"]').click();
    const particleRow = page.locator('[data-effect-stack-row="ringParticles"]');
    await expect(particleRow).toBeVisible();
    await expect(particleRow.locator('[data-effect-stack-control="ringParticleCount"]')).toHaveValue("50");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleCount"]')).toHaveText("50");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleDensity"]')).toHaveText("50");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleSize"]')).toHaveText("30");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleSpeed"]')).toHaveText("10");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleIntensity"]')).toHaveText("100");
    await expect(particleRow.locator('[data-effect-stack-control="ringParticleColorA"]')).toHaveValue("#00cccc");
    await expect(particleRow.locator('[data-effect-stack-control="ringParticleColorB"]')).toHaveValue("#ffffff");
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="luminous"]').click();
    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      return state.backend === "frameGraph" && state.ready && state.stack.includes("luminous");
    });

    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(state.effects.ringParticles).toMatchObject({
      enabled: true,
      count: 180,
      density: 32.5,
      size: 0.335,
      speed: 0.05,
      intensity: 4,
    });

    const enabledFrame = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(160, 90));
    await page.locator("#render-canvas").screenshot({ path: resolve(repoRoot, "test-results/ring-particles-preview.png") });
    await particleRow.locator('[data-effect-stack-toggle="ringParticles"]').uncheck();
    const disabledFrame = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(160, 90));
    expect(enabledFrame.pixelChecksum).not.toBe(disabledFrame.pixelChecksum);

    await particleRow.locator('[data-effect-stack-toggle="ringParticles"]').check();
    await page.evaluate(() => window.mmdModokiE2e.seekTo(120));
    const frame120 = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(160, 90));
    await page.evaluate(() => window.mmdModokiE2e.seekTo(240));
    const frame240 = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(160, 90));
    expect(frame240.pixelChecksum).not.toBe(frame120.pixelChecksum);

    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()))
      .toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

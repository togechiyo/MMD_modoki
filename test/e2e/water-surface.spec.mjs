import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("hidden WaterMaterial ocean UI keeps project and runtime compatibility", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        console.log(`[renderer:${message.type()}] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => console.log(`[renderer:pageerror] ${error.message}`));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await expect(page.locator('[data-effect-add-post="ocean"]')).toBeHidden();
    await expect(page.locator('[data-effect-stack-row="ocean"]')).toHaveCount(0);
    await expect(page.locator('[data-menu-command="view.toggleWaterSurface"]')).toBeHidden();
    await expect(page.locator('[data-menu-command="view.waterSurfaceSettings"]')).toBeHidden();

    const imported = await page.evaluate(() => {
      const current = window.mmdModokiE2e.exportProjectState();
      const stackWithoutOcean = current.effects.frameGraphPostStack.filter((entry) => entry.id !== "ocean");
      return window.mmdModokiE2e.importProjectState({
        ...current,
        viewport: {
          ...current.viewport,
          waterSurface: {
            ...current.viewport.waterSurface,
            enabled: true,
            height: 0,
            waveHeight: 0.35,
            waterColor: { r: 18 / 255, g: 107 / 255, b: 128 / 255 },
          },
        },
        effects: {
          ...current.effects,
          oceanWaterHeight: 0,
          oceanClarity: 1,
          oceanCausticsStrength: 0,
          frameGraphPostStack: [...stackWithoutOcean, { id: "ocean", enabled: true }],
        },
      });
    });
    expect(imported).toMatchObject({ loadedModels: 1, warnings: [] });

    await expect(page.locator('[data-effect-stack-row="ocean"]')).toHaveCount(0);
    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      return state.backend === "frameGraph"
        && state.ready
        && state.stack.includes("ocean")
        && state.oceanWaveFieldReady
        && !state.oceanVolumeReady
        && !state.oceanSurfaceReady
        && state.executedFrameCount >= 10;
    });

    await expect.poll(async () => page.evaluate(() => {
      const snapshot = window.mmdModokiDiagnostics.dumpPerformanceSnapshot();
      const labels = snapshot.renderTargetDetails.map((target) => target.label);
      return labels.includes("waterReflection") && labels.includes("waterRefraction");
    })).toBe(true);

    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.viewport.waterSurface).toMatchObject({
      enabled: true,
      height: 0,
      waveHeight: 0.35,
      waterColor: { r: 18 / 255, g: 107 / 255, b: 128 / 255 },
    });
    expect(saved.effects.frameGraphPostStack).toContainEqual({ id: "ocean", enabled: true });
    expect(saved.effects).toMatchObject({
      oceanWaterHeight: 0,
      oceanClarity: 1,
      oceanCausticsStrength: 0,
    });

    const rendered = await page.evaluate(() => window.mmdModokiE2e.captureExportSurfaceProbe(64, 36));
    expect(rendered).toMatchObject({
      backend: "frameGraph",
      ready: true,
      width: 64,
      height: 36,
    });
    expect(rendered.nonZeroRgbByteCount).toBeGreaterThan(0);

    await page.evaluate(() => {
      const current = window.mmdModokiE2e.exportProjectState();
      return window.mmdModokiE2e.importProjectState({
        ...current,
        viewport: {
          ...current.viewport,
          waterSurface: { ...current.viewport.waterSurface, enabled: false },
        },
        effects: {
          ...current.effects,
          frameGraphPostStack: current.effects.frameGraphPostStack.map((entry) => (
            entry.id === "ocean" ? { ...entry, enabled: false } : entry
          )),
        },
      });
    });
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).viewport.waterSurface.enabled)
      .toBe(false);

    expect(await page.evaluate((project) => window.mmdModokiE2e.importProjectState(project), saved))
      .toMatchObject({ loadedModels: 1, warnings: [] });
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).viewport.waterSurface)
      .toMatchObject({ enabled: true, waveHeight: 0.35 });
    await expect(page.locator('[data-effect-stack-row="ocean"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()))
      .toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

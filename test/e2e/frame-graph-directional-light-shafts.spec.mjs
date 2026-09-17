import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
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

function measureRedSides(buffer) {
  const png = PNG.sync.read(buffer);
  const region = (x0, y0, x1, y1) => {
    let sum = 0, count = 0;
    for (let y = Math.floor(y0 * png.height); y < y1 * png.height; y++) {
      for (let x = Math.floor(x0 * png.width); x < x1 * png.width; x++) {
        const i = (y * png.width + x) * 4;
        sum += png.data[i] - (png.data[i + 1] + png.data[i + 2]) / 2;
        count++;
      }
    }
    return sum / count;
  };
  return {
    left: region(0.08, 0.4, 0.18, 0.6), right: region(0.82, 0.4, 0.92, 0.6),
    top: region(0.4, 0.08, 0.6, 0.18), bottom: region(0.4, 0.82, 0.6, 0.92),
  };
}

test("para flare light side follows the source of directional light in viewport and PNG", async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#info-model-select").selectOption("__camera__");
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="directionalLightShafts"]').click();
    const row = page.locator('[data-effect-stack-row="directionalLightShafts"]');
    for (const [key, value] of [["Strength", "100"], ["LightColor", "#ff0000"], ["ShadowColor", "#ffffff"]]) {
      await row.locator(`[data-effect-stack-control="directionalLightShafts${key}"]`).evaluate((element, value) => {
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
    }
    await page.locator("#btn-toggle-shader-panel").click();
    const measurements = [];
    for (const item of [
      { name: "from-left", direction: { x: 1, y: 0, z: 0 }, brighter: "left", darker: "right", cameraZ: -25 },
      { name: "from-right", direction: { x: -1, y: 0, z: 0 }, brighter: "right", darker: "left", cameraZ: -25 },
      { name: "from-above", direction: { x: 0, y: -1, z: 0 }, brighter: "top", darker: "bottom", cameraZ: -25 },
      { name: "from-below", direction: { x: 0, y: 1, z: 0 }, brighter: "bottom", darker: "top", cameraZ: -25 },
      { name: "rear-camera", direction: { x: 1, y: 0, z: 0 }, brighter: "right", darker: "left", cameraZ: 25 },
    ]) {
      await page.evaluate(z => window.mmdModokiE2e.setCameraPose({ x: 0, y: 3, z }, { x: 0, y: 3, z: 0 }), item.cameraZ);
      for (const [axis, value] of Object.entries(item.direction)) {
        const field = page.locator(`#light-direction-${axis}`);
        await field.fill(String(value)); await field.dispatchEvent("input");
      }
      const initialFrame = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount);
      await page.waitForFunction(frame => {
        const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
        return state.ready && state.executedFrameCount >= frame + 3;
      }, initialFrame);
      const viewport = measureRedSides(await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(`${item.name}-viewport.png`) }));
      const directory = testInfo.outputPath(item.name); mkdirSync(directory, { recursive: true });
      const output = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 640, 360), directory);
      const exported = measureRedSides(readFileSync(output.path));
      measurements.push({ ...item, viewport, exported });
      writeFileSync(testInfo.outputPath("direction-measurements.json"), JSON.stringify(measurements, null, 2));
      for (const sample of [viewport, exported]) expect.soft(sample[item.brighter] - sample[item.darker], `${item.name}: source side`).toBeGreaterThan(4);
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toEqual({ count: 0, messages: [] });
  } finally { await launched.close(); }
});

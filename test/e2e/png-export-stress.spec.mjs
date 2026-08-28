import { expect, test } from "@playwright/test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");
const xStressPath = resolve(
  repoRoot,
  "test/fixtures/accessory/tofu-grid-reversed-duplicates.x",
);
const privateXStressPath = process.env.MMD_MODOKI_PRIVATE_X_STRESS_PATH?.trim() || null;
const stressEnabled = process.env.MMD_MODOKI_RUN_PNG_STRESS === "1";

async function runSingleFrameXExport(xPath, outputName, completionTimeoutMs) {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    const loadStartedAt = Date.now();
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadAccessory(path), xPath)).toBe(true);
    console.info(`[png-stress] X asset load: ${Date.now() - loadStartedAt}ms`);

    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    project.viewport.groundVisible = false;
    project.viewport.skydomeVisible = false;
    project.viewport.backgroundBlack = true;
    project.viewport.backgroundDisplayMode = "black";
    project.lighting.shadowEnabled = false;

    const outputDirectory = resolve(launched.tempDir, outputName);
    const startedAt = Date.now();
    const launch = await page.evaluate(async ({ requestProject, outputDirectoryPath, prefix }) => (
      window.electronAPI.startPngSequenceExportWindow({
        project: requestProject,
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 0,
        step: 1,
        prefix,
        fps: 30,
        precision: 1,
        outputWidth: 1920,
        outputHeight: 1080,
        transparentBackground: false,
      })
    ), { requestProject: project, outputDirectoryPath: outputDirectory, prefix: outputName });
    expect(launch?.jobId).toBeTruthy();
    await expect.poll(
      () => page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled()),
    ).toBe(false);

    const outputPath = resolve(outputDirectory, `${outputName}_0000.png`);
    await expect.poll(
      () => existsSync(outputPath) && statSync(outputPath).size > 1_000,
      { timeout: completionTimeoutMs },
    ).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 60_000 });
    await expect.poll(
      () => page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled()),
    ).toBe(true);
    console.info(`[png-stress] X asset 1 frame 1920x1080: ${Date.now() - startedAt}ms`);
  } finally {
    await launched.close();
  }
}

test("PNG export stress: 500-frame sequence and two 4K frames", async () => {
  test.skip(!stressEnabled, "Set MMD_MODOKI_RUN_PNG_STRESS=1 to run long/4K export stress tests.");
  test.setTimeout(20 * 60_000);
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    project.viewport.groundVisible = false;
    project.viewport.skydomeVisible = false;
    project.viewport.backgroundBlack = true;
    project.viewport.backgroundDisplayMode = "black";

    const longDirectory = resolve(launched.tempDir, "png-long");
    const longStartedAt = Date.now();
    const longLaunch = await page.evaluate(async ({ requestProject, outputDirectoryPath }) => (
      window.electronAPI.startPngSequenceExportWindow({
        project: requestProject,
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 499,
        step: 1,
        prefix: "long",
        fps: 30,
        precision: 1,
        outputWidth: 320,
        outputHeight: 180,
        transparentBackground: false,
      })
    ), { requestProject: project, outputDirectoryPath: longDirectory });
    expect(longLaunch?.jobId).toBeTruthy();
    const lastLongFrame = resolve(longDirectory, "long_0499.png");
    await expect.poll(
      () => existsSync(lastLongFrame) && statSync(lastLongFrame).size > 100,
      { timeout: 15 * 60_000 },
    ).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 60_000 });
    const longFiles = readdirSync(longDirectory).filter((name) => name.endsWith(".png"));
    expect(longFiles).toHaveLength(500);
    expect(statSync(resolve(longDirectory, "long_0000.png")).size).toBeGreaterThan(100);
    console.info(`[png-stress] 500 frames 320x180: ${Date.now() - longStartedAt}ms`);

    const fourKDirectory = resolve(launched.tempDir, "png-4k");
    const fourKStartedAt = Date.now();
    const fourKLaunch = await page.evaluate(async ({ requestProject, outputDirectoryPath }) => (
      window.electronAPI.startPngSequenceExportWindow({
        project: requestProject,
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 1,
        step: 1,
        prefix: "four_k",
        fps: 30,
        precision: 1,
        outputWidth: 3840,
        outputHeight: 2160,
        transparentBackground: false,
      })
    ), { requestProject: project, outputDirectoryPath: fourKDirectory });
    expect(fourKLaunch?.jobId).toBeTruthy();
    const lastFourKFrame = resolve(fourKDirectory, "four_k_0001.png");
    await expect.poll(
      () => existsSync(lastFourKFrame) && statSync(lastFourKFrame).size > 10_000,
      { timeout: 5 * 60_000 },
    ).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 60_000 });
    const fourKFiles = readdirSync(fourKDirectory).filter((name) => name.endsWith(".png"));
    expect(fourKFiles).toHaveLength(2);
    expect(statSync(resolve(fourKDirectory, "four_k_0000.png")).size).toBeGreaterThan(10_000);
    console.info(`[png-stress] 2 frames 3840x2160: ${Date.now() - fourKStartedAt}ms`);
  } finally {
    await launched.close();
  }
});

test("PNG export stress: X grid with reversed duplicates completes one 1080p frame", async () => {
  test.skip(!stressEnabled, "Set MMD_MODOKI_RUN_PNG_STRESS=1 to run PNG export stress tests.");
  test.setTimeout(8 * 60_000);
  await runSingleFrameXExport(xStressPath, "x_grid", 5 * 60_000);
});

test("PNG export stress: authorized local X asset completes one 1080p frame", async () => {
  test.skip(!stressEnabled, "Set MMD_MODOKI_RUN_PNG_STRESS=1 to run PNG export stress tests.");
  test.skip(!privateXStressPath, "Set MMD_MODOKI_PRIVATE_X_STRESS_PATH to an authorized local X asset.");
  test.setTimeout(8 * 60_000);
  await runSingleFrameXExport(privateXStressPath, "private_x", 6 * 60_000);
});

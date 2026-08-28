import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
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
const stressEnabled = process.env.MMD_MODOKI_RUN_WEBM_X_STRESS === "1";

async function runSingleFrameXWebmExport(xPath, outputName, completionTimeoutMs) {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();

    const loadStartedAt = Date.now();
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadAccessory(path), xPath)).toBe(true);
    console.info(`[webm-x-stress] X asset load: ${Date.now() - loadStartedAt}ms`);

    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    project.viewport.groundVisible = false;
    project.viewport.skydomeVisible = false;
    project.viewport.backgroundBlack = true;
    project.viewport.backgroundDisplayMode = "black";
    project.lighting.shadowEnabled = false;

    const outputPath = resolve(launched.tempDir, `${outputName}.webm`);
    const startedAt = Date.now();
    const launch = await page.evaluate(async ({ requestProject, outputFilePath }) => (
      window.electronAPI.startWebmExportWindow({
        project: requestProject,
        outputFilePath,
        startFrame: 0,
        endFrame: 0,
        fps: 30,
        outputWidth: 1920,
        outputHeight: 1080,
        includeAudio: false,
        preferredVideoCodec: "vp8",
        captureMode: "rgba-surface",
      })
    ), { requestProject: project, outputFilePath: outputPath });
    expect(launch?.jobId).toBeTruthy();
    await expect(page.locator("#app")).toHaveClass(/ui-export-lock/);
    await expect.poll(
      () => page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled()),
    ).toBe(false);

    await expect.poll(
      () => existsSync(outputPath) && statSync(outputPath).size > 1_000,
      { timeout: completionTimeoutMs },
    ).toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 60_000 });
    await expect.poll(
      () => page.evaluate(() => window.mmdModokiE2e.getAutoRenderEnabled()),
    ).toBe(true);

    expect(readFileSync(outputPath).subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    expect(pageErrors).toEqual([]);
    console.info(`[webm-x-stress] X asset 1 frame 1920x1080: ${Date.now() - startedAt}ms`);
  } finally {
    await launched.close();
  }
}

test("WebM X stress: reversed-duplicate grid completes one 1080p frame", async () => {
  test.skip(!stressEnabled, "Set MMD_MODOKI_RUN_WEBM_X_STRESS=1 to run WebM X stress tests.");
  test.setTimeout(8 * 60_000);
  await runSingleFrameXWebmExport(xStressPath, "x_grid", 5 * 60_000);
});

test("WebM X stress: authorized local X asset completes one 1080p frame", async () => {
  test.skip(!stressEnabled, "Set MMD_MODOKI_RUN_WEBM_X_STRESS=1 to run WebM X stress tests.");
  test.skip(!privateXStressPath, "Set MMD_MODOKI_PRIVATE_X_STRESS_PATH to an authorized local X asset.");
  test.setTimeout(8 * 60_000);
  await runSingleFrameXWebmExport(privateXStressPath, "private_x", 6 * 60_000);
});

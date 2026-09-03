import { expect, test } from "@playwright/test";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

async function waitForExportFile(page, filePath, minimumBytes = 100) {
  await expect.poll(
    () => existsSync(filePath) && statSync(filePath).size > minimumBytes,
    { timeout: 60_000 },
  ).toBe(true);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30_000 });
}

async function comparePngFramesWithWebm(page, startPngPath, expectedPngPath, webmPath, timeSeconds) {
  return page.evaluate(async ({ startPath, expectedPath, videoPath, targetTime }) => {
    const readBytes = async (path) => {
      const bytes = await window.electronAPI.readBinaryFile(path);
      if (!bytes) throw new Error(`Export output unavailable: ${path}`);
      return new Uint8Array(bytes);
    };
    const loadImage = async (path) => {
      const url = URL.createObjectURL(new Blob([await readBytes(path)], { type: "image/png" }));
      const image = new Image();
      image.src = url;
      await image.decode();
      return { drawable: image, url };
    };
    const loadVideo = async (path) => {
      const url = URL.createObjectURL(new Blob([await readBytes(path)], { type: "video/webm" }));
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      await new Promise((resolveLoaded, rejectLoaded) => {
        video.addEventListener("loadeddata", resolveLoaded, { once: true });
        video.addEventListener("error", () => rejectLoaded(new Error("WebM decode failed")), { once: true });
      });
      video.currentTime = Math.min(targetTime, Math.max(0, video.duration - 0.05));
      await new Promise((resolveSeeked, rejectSeeked) => {
        video.addEventListener("seeked", resolveSeeked, { once: true });
        video.addEventListener("error", () => rejectSeeked(new Error("WebM seek failed")), { once: true });
      });
      if (typeof video.requestVideoFrameCallback === "function") {
        const frameReady = new Promise((resolveFrame) => video.requestVideoFrameCallback(resolveFrame));
        await video.play();
        await frameReady;
        video.pause();
      }
      return { drawable: video, url, currentTime: video.currentTime };
    };
    const start = await loadImage(startPath);
    const expected = await loadImage(expectedPath);
    const video = await loadVideo(videoPath);
    try {
      const width = 320;
      const height = 180;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const pixels = (drawable) => {
        context.clearRect(0, 0, width, height);
        context.drawImage(drawable, 0, 0, width, height);
        return context.getImageData(0, 0, width, height).data;
      };
      const startPixels = pixels(start.drawable);
      const expectedPixels = pixels(expected.drawable);
      const videoPixels = pixels(video.drawable);
      const meanDifference = (first, second) => {
        let total = 0;
        for (let index = 0; index < first.length; index += 4) {
          total += Math.abs(first[index] - second[index]);
          total += Math.abs(first[index + 1] - second[index + 1]);
          total += Math.abs(first[index + 2] - second[index + 2]);
        }
        return total / (width * height * 3);
      };
      return {
        pngStartToExpected: meanDifference(startPixels, expectedPixels),
        webmToStart: meanDifference(videoPixels, startPixels),
        webmToExpected: meanDifference(videoPixels, expectedPixels),
        videoTime: video.currentTime,
      };
    } finally {
      URL.revokeObjectURL(start.url);
      URL.revokeObjectURL(expected.url);
      URL.revokeObjectURL(video.url);
    }
  }, {
    startPath: startPngPath,
    expectedPath: expectedPngPath,
    videoPath: webmPath,
    targetTime: timeSeconds,
  });
}

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
    await expect(particleRow.locator(".effect-layer-name")).toHaveText("パーティクル");
    await expect(particleRow.locator('[data-effect-stack-control="ringParticleCount"]')).toHaveValue("50");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleCount"]')).toHaveText("50");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleDensity"]')).toHaveText("50");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleSize"]')).toHaveText("30");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleSpeed"]')).toHaveText("10");
    await expect(particleRow.locator('[data-effect-stack-value="ringParticleIntensity"]')).toHaveText("100");
    await expect(particleRow.locator('[data-effect-stack-control="ringParticleColorA"]')).toHaveValue("#ffffff");
    await expect(particleRow.locator('[data-effect-stack-control="ringParticleColorB"]')).toHaveValue("#ffffff");
    await expect(particleRow.locator('[data-effect-stack-control="ringParticleColorC"]')).toHaveValue("#ffffff");
    await particleRow.locator('[data-effect-stack-control="ringParticleColorA"]').fill("#ff0000");
    await particleRow.locator('[data-effect-stack-control="ringParticleColorB"]').fill("#00ff00");
    await particleRow.locator('[data-effect-stack-control="ringParticleColorC"]').fill("#0000ff");
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
      colorA: { r: 1, g: 0, b: 0 },
      colorB: { r: 0, g: 1, b: 0 },
      colorC: { r: 0, g: 0, b: 1 },
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

    const exportProject = structuredClone(state);
    exportProject.effects.ringParticles.speed = 0.5;
    const pngPrefix = "ring_particle_webm_sync";
    const pngStartPath = resolve(launched.tempDir, `${pngPrefix}_0000.png`);
    const pngExpectedPath = resolve(launched.tempDir, `${pngPrefix}_0054.png`);
    const pngLaunch = await page.evaluate(async ({ project, outputDirectoryPath, prefix }) => (
      window.electronAPI.startPngSequenceExportWindow({
        project,
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 54,
        step: 54,
        prefix,
        fps: 30,
        precision: 1,
        outputWidth: 320,
        outputHeight: 180,
        transparentBackground: false,
      })
    ), { project: exportProject, outputDirectoryPath: launched.tempDir, prefix: pngPrefix });
    expect(pngLaunch?.jobId).toBeTruthy();
    await waitForExportFile(page, pngStartPath);
    await waitForExportFile(page, pngExpectedPath);

    const webmPath = resolve(launched.tempDir, "ring_particle_webm_sync.webm");
    const webmLaunch = await page.evaluate(async ({ project, outputFilePath }) => (
      window.electronAPI.startWebmExportWindow({
        project,
        outputFilePath,
        startFrame: 0,
        endFrame: 60,
        fps: 30,
        outputWidth: 320,
        outputHeight: 180,
        includeAudio: false,
        preferredVideoCodec: "vp8",
        captureMode: "rgba-surface",
      })
    ), { project: exportProject, outputFilePath: webmPath });
    expect(webmLaunch?.jobId).toBeTruthy();
    await waitForExportFile(page, webmPath, 1_000);

    const exportComparison = await comparePngFramesWithWebm(
      page,
      pngStartPath,
      pngExpectedPath,
      webmPath,
      1.8,
    );
    console.log(`[ring-particle-webm-sync] ${JSON.stringify(exportComparison)}`);
    expect(exportComparison.pngStartToExpected).toBeGreaterThan(0.5);
    expect(exportComparison.webmToExpected).toBeLessThan(exportComparison.webmToStart);

    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()))
      .toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

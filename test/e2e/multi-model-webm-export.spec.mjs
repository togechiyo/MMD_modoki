import { expect, test } from "@playwright/test";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

function centerMotion(name, x) {
  return {
    name,
    boneTracks: [],
    movableBoneTracks: [{
      name: "センター",
      frameNumbers: [0, 60],
      positions: [x, 0, 0, x, 0, 0],
      positionInterpolations: [
        20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107,
        20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107,
      ],
      rotations: [0, 0, 0, 1, 0, 0, 0, 1],
      rotationInterpolations: [20, 107, 20, 107, 20, 107, 20, 107],
      physicsToggles: [1, 1],
    }],
    morphTracks: [],
    propertyTrack: { frameNumbers: [], visibles: [], ikBoneNames: [], ikStates: [] },
  };
}

test("V022-006/V022-050: two separated models survive WebM export while viewport playback pauses and recovers", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();

    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    project.viewport.groundVisible = false;
    project.viewport.skydomeVisible = false;
    project.viewport.backgroundBlack = true;
    project.viewport.backgroundDisplayMode = "black";
    project.keyframes.modelAnimations[0].animation = centerMotion("left", -6);
    project.keyframes.modelAnimations[1].animation = centerMotion("right", 6);
    const imported = await page.evaluate(
      (value) => window.mmdModokiE2e.importProjectState(value),
      project,
    );
    expect(imported.warnings).toEqual([]);
    await page.evaluate(() => window.mmdModokiE2e.seekTo(0));

    const positions = await page.evaluate(() => [
      window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター"),
    ]);
    expect(positions[1].x - positions[0].x).toBeCloseTo(12, 4);

    const pngPath = resolve(launched.tempDir, "two_models_0000.png");
    const pngLaunch = await page.evaluate(async ({ outputDirectoryPath }) => (
      window.electronAPI.startPngSequenceExportWindow({
        project: window.mmdModokiE2e.exportProjectState(),
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 0,
        step: 1,
        prefix: "two_models",
        fps: 30,
        precision: 1,
        outputWidth: 320,
        outputHeight: 180,
        transparentBackground: false,
      })
    ), { outputDirectoryPath: launched.tempDir });
    expect(pngLaunch?.jobId).toBeTruthy();
    await expect.poll(() => existsSync(pngPath) && statSync(pngPath).size > 100, { timeout: 30_000 })
      .toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/);

    await page.locator("#viewport-seek-play-toggle").click();
    await expect(page.locator("#viewport-seek-play-toggle")).toHaveAttribute("aria-label", "一時停止");

    const webmPath = resolve(launched.tempDir, "two_models.webm");
    const webmLaunch = await page.evaluate(async ({ outputFilePath }) => (
      window.electronAPI.startWebmExportWindow({
        project: window.mmdModokiE2e.exportProjectState(),
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
    ), { outputFilePath: webmPath });
    expect(webmLaunch?.jobId).toBeTruthy();
    await expect(page.locator("#app")).toHaveClass(/ui-export-lock/);
    await expect(page.locator("#viewport-seek-play-toggle")).toHaveAttribute("aria-label", "再生");

    await expect.poll(() => existsSync(webmPath) && statSync(webmPath).size > 1_000, { timeout: 60_000 })
      .toBe(true);
    await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30_000 });
    await expect(page.locator("#ui-busy-overlay")).toHaveClass(/hidden/);

    await page.locator("#viewport-seek-play-toggle").click();
    await expect(page.locator("#viewport-seek-play-toggle")).toHaveAttribute("aria-label", "一時停止");
    await page.locator("#viewport-seek-play-toggle").click();

    const comparison = await page.evaluate(async ({ pngFilePath, webmFilePath }) => {
      const loadImage = async (path) => {
        const bytes = await window.electronAPI.readBinaryFile(path);
        if (!bytes) throw new Error(`Image bytes unavailable: ${path}`);
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          return image;
        } finally {
          // The image remains decoded after its object URL is released.
          URL.revokeObjectURL(url);
        }
      };
      const loadVideo = async (path) => {
        const bytes = await window.electronAPI.readBinaryFile(path);
        if (!bytes) throw new Error(`WebM bytes unavailable: ${path}`);
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
        const video = document.createElement("video");
        video.muted = true;
        video.src = url;
        await new Promise((resolveLoaded, rejectLoaded) => {
          video.addEventListener("loadeddata", resolveLoaded, { once: true });
          video.addEventListener("error", () => rejectLoaded(new Error("WebM decode failed")), { once: true });
        });
        video.currentTime = 0;
        await new Promise((resolveSeeked) => {
          if (video.readyState >= 2) resolveSeeked();
          else video.addEventListener("seeked", resolveSeeked, { once: true });
        });
        return { video, url };
      };
      const png = await loadImage(pngFilePath);
      const { video, url } = await loadVideo(webmFilePath);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(png, 0, 0, canvas.width, canvas.height);
        const pngRgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const webmRgba = context.getImageData(0, 0, canvas.width, canvas.height).data;

        let absoluteDifference = 0;
        const bright = { pngLeft: 0, pngRight: 0, webmLeft: 0, webmRight: 0 };
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const offset = (y * canvas.width + x) * 4;
            const pngLuma = (pngRgba[offset] + pngRgba[offset + 1] + pngRgba[offset + 2]) / 3;
            const webmLuma = (webmRgba[offset] + webmRgba[offset + 1] + webmRgba[offset + 2]) / 3;
            absoluteDifference += Math.abs(pngLuma - webmLuma);
            if (pngLuma > 24) bright[x < canvas.width / 2 ? "pngLeft" : "pngRight"] += 1;
            if (webmLuma > 24) bright[x < canvas.width / 2 ? "webmLeft" : "webmRight"] += 1;
          }
        }
        return {
          meanAbsoluteDifference: absoluteDifference / (canvas.width * canvas.height),
          bright,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }, { pngFilePath: pngPath, webmFilePath: webmPath });

    expect(comparison.bright.pngLeft).toBeGreaterThan(100);
    expect(comparison.bright.pngRight).toBeGreaterThan(100);
    expect(comparison.bright.webmLeft).toBeGreaterThan(80);
    expect(comparison.bright.webmRight).toBeGreaterThan(80);
    expect(comparison.meanAbsoluteDifference).toBeLessThan(18);
  } finally {
    await launched.close();
  }
});

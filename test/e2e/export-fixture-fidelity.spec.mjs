import { expect, test } from "@playwright/test";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");
const lutPath = resolve(repoRoot, "test/fixtures/lut/synthetic-channel-swap.cube");
const xPath = resolve(repoRoot, "test/fixtures/accessory/simple-triangle.x");
const width = 320;
const height = 180;

async function waitForFile(page, filePath, minimumBytes = 100) {
  await expect.poll(
    () => existsSync(filePath) && statSync(filePath).size > minimumBytes,
    { timeout: 60_000 },
  ).toBe(true);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30_000 });
}

async function exportPng(page, tempDir, project, prefix, externalLut = null) {
  const filePath = resolve(tempDir, `${prefix}_0000.png`);
  const launch = await page.evaluate(async ({ requestProject, outputDirectoryPath, requestPrefix, lut }) => (
    window.electronAPI.startPngSequenceExportWindow({
      project: requestProject,
      externalLut: lut,
      outputDirectoryPath,
      startFrame: 0,
      endFrame: 0,
      step: 1,
      prefix: requestPrefix,
      fps: 30,
      precision: 1,
      outputWidth: 320,
      outputHeight: 180,
      transparentBackground: false,
    })
  ), { requestProject: project, outputDirectoryPath: tempDir, requestPrefix: prefix, lut: externalLut });
  expect(launch?.jobId).toBeTruthy();
  await waitForFile(page, filePath);
  return filePath;
}

async function exportWebm(page, tempDir, project, name, externalLut = null) {
  const filePath = resolve(tempDir, `${name}.webm`);
  const launch = await page.evaluate(async ({ requestProject, outputFilePath, lut }) => (
    window.electronAPI.startWebmExportWindow({
      project: requestProject,
      externalLut: lut,
      outputFilePath,
      startFrame: 0,
      endFrame: 0,
      fps: 30,
      outputWidth: 320,
      outputHeight: 180,
      includeAudio: false,
      preferredVideoCodec: "vp8",
      captureMode: "rgba-surface",
    })
  ), { requestProject: project, outputFilePath: filePath, lut: externalLut });
  expect(launch?.jobId).toBeTruthy();
  await waitForFile(page, filePath);
  return filePath;
}

async function comparePixels(page, firstPath, firstMime, secondPath, secondMime) {
  return await page.evaluate(async ({ aPath, aMime, bPath, bMime, targetWidth, targetHeight }) => {
    const loadDrawable = async (path, mime) => {
      const bytes = await window.electronAPI.readBinaryFile(path);
      if (!bytes) throw new Error(`Fixture output unavailable: ${path}`);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
      if (mime === "video/webm") {
        const video = document.createElement("video");
        video.muted = true;
        video.src = url;
        await new Promise((resolveLoaded, rejectLoaded) => {
          video.addEventListener("loadeddata", resolveLoaded, { once: true });
          video.addEventListener("error", () => rejectLoaded(new Error("WebM decode failed")), { once: true });
        });
        video.currentTime = Math.min(0.001, Number.isFinite(video.duration) ? video.duration / 2 : 0.001);
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
        return { drawable: video, url };
      }
      const image = new Image();
      image.src = url;
      await image.decode();
      return { drawable: image, url };
    };
    const readPixels = (drawable) => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(drawable, 0, 0, targetWidth, targetHeight);
      return context.getImageData(0, 0, targetWidth, targetHeight).data;
    };
    const first = await loadDrawable(aPath, aMime);
    const second = await loadDrawable(bPath, bMime);
    try {
      const a = readPixels(first.drawable);
      const b = readPixels(second.drawable);
      let absoluteDifference = 0;
      const meanA = [0, 0, 0];
      const meanB = [0, 0, 0];
      let brightA = 0;
      let brightB = 0;
      const pixelCount = targetWidth * targetHeight;
      for (let index = 0; index < a.length; index += 4) {
        const lumaA = (a[index] + a[index + 1] + a[index + 2]) / 3;
        const lumaB = (b[index] + b[index + 1] + b[index + 2]) / 3;
        if (lumaA > 24) brightA += 1;
        if (lumaB > 24) brightB += 1;
        for (let channel = 0; channel < 3; channel += 1) {
          absoluteDifference += Math.abs(a[index + channel] - b[index + channel]);
          meanA[channel] += a[index + channel];
          meanB[channel] += b[index + channel];
        }
      }
      return {
        meanAbsoluteDifference: absoluteDifference / (pixelCount * 3),
        meanA: meanA.map((value) => value / pixelCount),
        meanB: meanB.map((value) => value / pixelCount),
        brightA,
        brightB,
      };
    } finally {
      URL.revokeObjectURL(first.url);
      URL.revokeObjectURL(second.url);
    }
  }, {
    aPath: firstPath,
    aMime: firstMime,
    bPath: secondPath,
    bMime: secondMime,
    targetWidth: width,
    targetHeight: height,
  });
}

async function configureSimpleScene(page) {
  const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  project.viewport.groundVisible = false;
  project.viewport.skydomeVisible = false;
  project.viewport.backgroundBlack = true;
  project.viewport.backgroundDisplayMode = "black";
  project.lighting.shadowEnabled = false;
  const imported = await page.evaluate(
    (value) => window.mmdModokiE2e.importProjectState(value),
    project,
  );
  expect(imported.warnings).toEqual([]);
}

test("V022-012: synthetic external LUT produces matching PNG and WebM pixels", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    await configureSimpleScene(page);

    const baselineProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadExternalLut(path), lutPath)).toBe(true);
    const externalLut = await page.evaluate(() => window.mmdModokiE2e.getExternalLutExportAsset());
    expect(externalLut).toMatchObject({ path: lutPath, sourceFormat: "cube" });
    expect(externalLut.runtimeText.length).toBeGreaterThan(20);
    const lutProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const lutStackEntry = lutProject.effects.frameGraphPostStack?.find(({ id }) => id === "lut");
    if (lutStackEntry) lutStackEntry.enabled = true;
    else lutProject.effects.frameGraphPostStack = [
      ...(lutProject.effects.frameGraphPostStack ?? []),
      { id: "lut", enabled: true },
    ];
    expect(lutProject.effects).toMatchObject({
      lutEnabled: true,
      lutSourceMode: "external-absolute",
      lutExternalPath: lutPath,
    });

    const baselinePng = await exportPng(page, launched.tempDir, baselineProject, "lut_baseline");
    const lutPng = await exportPng(page, launched.tempDir, lutProject, "lut_enabled", externalLut);
    const lutWebm = await exportWebm(page, launched.tempDir, lutProject, "lut_enabled", externalLut);
    const lutEffect = await comparePixels(page, baselinePng, "image/png", lutPng, "image/png");
    const exportMatch = await comparePixels(page, lutPng, "image/png", lutWebm, "video/webm");

    expect(lutEffect.meanAbsoluteDifference).toBeGreaterThan(12);
    expect(exportMatch.brightA).toBeGreaterThan(500);
    expect(exportMatch.brightB).toBeGreaterThan(400);
    expect(exportMatch.meanAbsoluteDifference).toBeLessThan(24);
  } finally {
    await launched.close();
  }
});

test("V022-013: debug-white survives project round-trip and matches WebM", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    await configureSimpleScene(page);

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await expect(page.locator('#shader-preset-select option[value="wgsl-debug-white"]')).toHaveText("Debug White");
    await page.locator("#shader-preset-select").selectOption("wgsl-debug-white");
    await page.locator("#btn-shader-apply-all").click();
    const savedProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(savedProject.scene.models[0].materialShaders.length).toBeGreaterThan(0);
    expect(savedProject.scene.models[0].materialShaders.every(
      ({ presetId }) => presetId === "wgsl-debug-white",
    )).toBe(true);

    const imported = await page.evaluate(
      (value) => window.mmdModokiE2e.importProjectState(value),
      savedProject,
    );
    expect(imported.warnings).toEqual([]);
    const restoredProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restoredProject.scene.models[0].materialShaders).toEqual(savedProject.scene.models[0].materialShaders);

    const pngPath = await exportPng(page, launched.tempDir, restoredProject, "debug_white");
    const webmPath = await exportWebm(page, launched.tempDir, restoredProject, "debug_white");
    const comparison = await comparePixels(page, pngPath, "image/png", webmPath, "video/webm");
    expect(comparison.brightA).toBeGreaterThan(500);
    expect(comparison.brightB).toBeGreaterThan(400);
    expect(comparison.meanAbsoluteDifference).toBeLessThan(24);
  } finally {
    await launched.close();
  }
});

test("V022-037/V022-038: X fixture round-trips and matches PNG/WebM output", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadAccessory(path), xPath)).toBe(true);
    await configureSimpleScene(page);
    await page.evaluate(() => window.mmdModokiE2e.setCameraPose(
      { x: 2.5, y: 1.8, z: -3.5 },
      { x: 0.4, y: 0.4, z: 0 },
    ));

    const savedProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(savedProject.accessories).toHaveLength(1);
    expect(savedProject.accessories[0].path).toBe(xPath);
    const imported = await page.evaluate(
      (value) => window.mmdModokiE2e.importProjectState(value),
      savedProject,
    );
    expect(imported.warnings).toEqual([]);
    const restoredProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restoredProject.accessories).toHaveLength(1);
    expect(restoredProject.accessories[0].path).toBe(xPath);

    const pngPath = await exportPng(page, launched.tempDir, restoredProject, "x_fixture");
    const webmPath = await exportWebm(page, launched.tempDir, restoredProject, "x_fixture");
    const comparison = await comparePixels(page, pngPath, "image/png", webmPath, "video/webm");
    expect(comparison.brightA).toBeGreaterThan(50);
    expect(comparison.brightB).toBeGreaterThan(40);
    expect(comparison.meanAbsoluteDifference).toBeLessThan(24);
  } finally {
    await launched.close();
  }
});

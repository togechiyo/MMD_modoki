import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tofuPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

const readUnfilteredRgba = (pngPath) => {
  const bytes = readFileSync(pngPath);
  const idatChunks = [];
  let width = 0;
  let height = 0;
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[9]).toBe(6);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    }
    offset += 12 + length;
  }

  const filtered = inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  const rowLength = width * 4;
  for (let y = 0; y < height; y += 1) {
    const filteredOffset = y * (rowLength + 1);
    expect(filtered[filteredOffset]).toBe(0);
    filtered.copy(rgba, y * rowLength, filteredOffset + 1, filteredOffset + 1 + rowLength);
  }
  return { width, height, rgba };
};

const countPixels = (rgba) => {
  let transparent = 0;
  let opaque = 0;
  let black = 0;
  let lightGray = 0;
  let white = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    const a = rgba[offset + 3];
    if (a === 0) transparent += 1;
    if (a === 255) opaque += 1;
    if (a === 255 && r < 12 && g < 12 && b < 12) black += 1;
    if (a === 255 && r >= 215 && r <= 240 && g >= 215 && g <= 240 && b >= 215 && b <= 240) {
      lightGray += 1;
    }
    if (a === 255 && r >= 248 && g >= 248 && b >= 248) white += 1;
  }
  return { transparent, opaque, black, lightGray, white, total: rgba.length / 4 };
};

const decodeScreenshotRgba = (bytes) => {
  const idatChunks = [];
  let width = 0;
  let height = 0;
  let colorType = 0;
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8);
      colorType = data[9];
      expect([2, 6]).toContain(colorType);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    }
    offset += 12 + length;
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowLength = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(idatChunks));
  const raw = Buffer.alloc(rowLength * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filteredOffset = y * (rowLength + 1);
    const filter = filtered[filteredOffset];
    for (let x = 0; x < rowLength; x += 1) {
      const source = filtered[filteredOffset + 1 + x];
      const left = x >= bytesPerPixel ? raw[y * rowLength + x - bytesPerPixel] : 0;
      const up = y > 0 ? raw[(y - 1) * rowLength + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel
        ? raw[(y - 1) * rowLength + x - bytesPerPixel]
        : 0;
      const value = filter === 0
        ? source
        : filter === 1
          ? source + left
          : filter === 2
            ? source + up
            : filter === 3
              ? source + Math.floor((left + up) / 2)
              : source + paeth(left, up, upLeft);
      raw[y * rowLength + x] = value & 0xff;
    }
  }

  if (colorType === 6) return { width, height, rgba: raw };
  const rgba = Buffer.alloc(width * height * 4);
  for (let source = 0, target = 0; source < raw.length; source += 3, target += 4) {
    rgba[target] = raw[source];
    rgba[target + 1] = raw[source + 1];
    rgba[target + 2] = raw[source + 2];
    rgba[target + 3] = 255;
  }
  return { width, height, rgba };
};

const getTopRegionLuminance = ({ width, height, rgba }) => {
  const luminance = [];
  const sampleHeight = Math.max(1, Math.floor(height * 0.2));
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      luminance.push((rgba[offset] + rgba[offset + 1] + rgba[offset + 2]) / 3);
    }
  }
  return luminance;
};

test("PNG export can be transparent while opaque PNG and WebM preserve black background", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate(() => window.electronAPI.setWindowZoomFactor(1.25))).toBe(1.25);
    await page.evaluate(async (path) => {
      await window.mmdModokiE2e.loadModel(path);
      document.querySelector('[data-menu-command="background.toggleBlack"]')?.click();
    }, tofuPath);

    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(project.viewport.backgroundBlack).toBe(true);

    const launchPng = async (prefix, transparentBackground) => {
      const result = await page.evaluate(async ({ outputDirectoryPath, prefix: exportPrefix, transparent }) => {
        const currentProject = window.mmdModokiE2e.exportProjectState();
        return await window.electronAPI.startPngSequenceExportWindow({
          project: currentProject,
          outputDirectoryPath,
          startFrame: 0,
          endFrame: 0,
          step: 1,
          prefix: exportPrefix,
          fps: 30,
          precision: 1,
          outputWidth: 320,
          outputHeight: 180,
          transparentBackground: transparent,
        });
      }, { outputDirectoryPath: launched.tempDir, prefix, transparent: transparentBackground });
      expect(result?.jobId).toBeTruthy();
      const path = resolve(launched.tempDir, `${prefix}_0000.png`);
      await expect.poll(() => existsSync(path) && statSync(path).size > 100, { timeout: 30_000 }).toBe(true);
      return countPixels(readUnfilteredRgba(path).rgba);
    };

    const opaque = await launchPng("black_opaque", false);
    expect(opaque.black / opaque.total).toBeGreaterThan(0.4);
    expect(opaque.black).toBeGreaterThan(opaque.lightGray);
    expect(opaque.transparent).toBe(0);

    const transparent = await launchPng("transparent", true);
    expect(transparent.transparent / transparent.total).toBeGreaterThan(0.4);
    expect(transparent.opaque).toBeGreaterThan(100);

    const webmPath = resolve(launched.tempDir, "black_background.webm");
    const webmLaunch = await page.evaluate(async (outputFilePath) => {
      const currentProject = window.mmdModokiE2e.exportProjectState();
      return await window.electronAPI.startWebmExportWindow({
        project: currentProject,
        outputFilePath,
        startFrame: 0,
        endFrame: 0,
        fps: 30,
        outputWidth: 320,
        outputHeight: 180,
        includeAudio: false,
        preferredVideoCodec: "vp8",
        captureMode: "rgba-surface",
      });
    }, webmPath);
    expect(webmLaunch?.jobId).toBeTruthy();
    await expect.poll(() => existsSync(webmPath) && statSync(webmPath).size > 1_000, { timeout: 30_000 }).toBe(true);

    const webmPixels = await page.evaluate(async (path) => {
      const bytes = await window.electronAPI.readBinaryFile(path);
      if (!bytes) throw new Error("WebM bytes unavailable");
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      try {
        await new Promise((resolveLoaded, rejectLoaded) => {
          video.addEventListener("loadeddata", resolveLoaded, { once: true });
          video.addEventListener("error", () => rejectLoaded(new Error("WebM decode failed")), { once: true });
        });
        const frameReady = new Promise((resolveFrame) => {
          if ("requestVideoFrameCallback" in video) {
            video.requestVideoFrameCallback(() => resolveFrame());
          } else {
            requestAnimationFrame(() => resolveFrame());
          }
        });
        await video.play();
        await Promise.race([
          frameReady,
          new Promise((resolveFrame) => setTimeout(resolveFrame, 3_000)),
        ]);
        video.pause();
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(video, 0, 0);
        return Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data);
      } finally {
        URL.revokeObjectURL(url);
      }
    }, webmPath);
    const webm = countPixels(webmPixels);
    expect(webm.black / webm.total).toBeGreaterThan(0.35);
    expect(webm.lightGray / webm.total).toBeLessThan(0.25);
  } finally {
    await launched.close();
  }
});

test("PNG image and sequence menu dialogs share the transparent background option", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const fileMenu = page.locator(".app-menu-group").first();
    await fileMenu.locator(".app-menu-trigger").click();
    await fileMenu.locator('[data-menu-command="file.exportPng"]').click();
    const pngDialog = page.locator('[data-popup-id="png-export"]');
    const transparentCheckbox = pngDialog.locator("#png-output-transparent-background");
    await expect(transparentCheckbox).not.toBeChecked();
    await transparentCheckbox.check();
    await pngDialog.locator(".popup-form-button-secondary").click();

    await fileMenu.locator(".app-menu-trigger").click();
    await fileMenu.locator('[data-menu-command="file.exportPngSequence"]').click();
    const sequenceDialog = page.locator('[data-popup-id="png-sequence-export"]');
    await expect(sequenceDialog).toBeVisible();
    await expect(sequenceDialog.locator("#png-output-transparent-background")).toBeChecked();
  } finally {
    await launched.close();
  }
});

test("viewport switches between default, white, black, and regular checker backgrounds", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const backgroundMenu = page.locator(".app-menu-group").filter({
      has: page.locator('[data-menu-command="background.setChecker"]'),
    });
    const canvas = page.locator("#render-canvas");

    const chooseMode = async (command) => {
      await backgroundMenu.locator(".app-menu-trigger").click();
      await backgroundMenu.locator(`[data-menu-command="${command}"]`).click();
      await page.waitForTimeout(150);
    };

    await chooseMode("background.setWhite");
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).viewport.backgroundDisplayMode).toBe("white");
    const whiteLuminance = getTopRegionLuminance(decodeScreenshotRgba(await canvas.screenshot()));
    expect(whiteLuminance.reduce((sum, value) => sum + value, 0) / whiteLuminance.length).toBeGreaterThan(245);

    await chooseMode("background.toggleBlack");
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).viewport.backgroundDisplayMode).toBe("black");
    const blackLuminance = getTopRegionLuminance(decodeScreenshotRgba(await canvas.screenshot()));
    expect(blackLuminance.reduce((sum, value) => sum + value, 0) / blackLuminance.length).toBeLessThan(10);

    await chooseMode("background.setChecker");
    const checkerProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(checkerProject.viewport.backgroundDisplayMode).toBe("checker");
    const checkerImage = decodeScreenshotRgba(await canvas.screenshot());
    const checkerLuminance = getTopRegionLuminance(checkerImage);
    const checkerRange = checkerLuminance.reduce(
      (range, value) => ({ min: Math.min(range.min, value), max: Math.max(range.max, value) }),
      { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
    );
    expect(checkerRange.min).toBeLessThan(230);
    expect(checkerRange.max).toBeGreaterThan(250);

    await backgroundMenu.locator(".app-menu-trigger").click();
    await expect(backgroundMenu.locator('[role="menuitemradio"]')).toHaveCount(4);
    await expect(backgroundMenu.locator('[data-menu-command="background.setChecker"]')).toHaveAttribute("aria-checked", "true");
    await expect(backgroundMenu.locator('[data-menu-command="background.setWhite"]')).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");

    const exportPrefix = "checker_preview_suppressed";
    const launch = await page.evaluate(async ({ project, outputDirectoryPath, prefix }) => (
      await window.electronAPI.startPngSequenceExportWindow({
        project,
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 0,
        step: 1,
        prefix,
        fps: 30,
        precision: 1,
        outputWidth: 320,
        outputHeight: 180,
        transparentBackground: false,
      })
    ), { project: checkerProject, outputDirectoryPath: launched.tempDir, prefix: exportPrefix });
    expect(launch?.jobId).toBeTruthy();
    const pngPath = resolve(launched.tempDir, `${exportPrefix}_0000.png`);
    await expect.poll(() => existsSync(pngPath) && statSync(pngPath).size > 100, { timeout: 30_000 }).toBe(true);
    const exported = countPixels(readUnfilteredRgba(pngPath).rgba);
    expect(exported.white).toBeGreaterThan(exported.lightGray);

    await chooseMode("background.setDefault");
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).viewport.backgroundDisplayMode).toBe("default");
  } finally {
    await launched.close();
  }
});

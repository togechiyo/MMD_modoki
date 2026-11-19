import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectRendererWorkerPng = process.env.MMD_MODOKI_PNG_ENCODER !== "main";

const readPngChunks = (pngBytes) => {
  const chunks = new Map();
  let offset = 8;
  while (offset < pngBytes.length) {
    const length = pngBytes.readUInt32BE(offset);
    const type = pngBytes.toString("ascii", offset + 4, offset + 8);
    chunks.set(type, pngBytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  return chunks;
};

const expectNoneFilteredRgbaPng = (pngPath, width, height) => {
  const pngBytes = readFileSync(pngPath);
  const pngChunks = readPngChunks(pngBytes);
  const ihdr = pngChunks.get("IHDR");
  const idat = pngChunks.get("IDAT");
  expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(ihdr).toBeDefined();
  expect(idat).toBeDefined();
  expect([...ihdr.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  const filtered = inflateSync(idat);
  expect(filtered.byteLength).toBe((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    expect(filtered[row * (width * 4 + 1)]).toBe(0);
  }
};

test("FrameGraphの最終出力を共通RGBA surfaceから取得できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const result = await page.evaluate(() => (
      window.mmdModokiE2e.captureExportSurfaceProbe(64, 36)
    ));

    expect(result).toMatchObject({
      backend: "frameGraph",
      ready: true,
      width: 64,
      height: 36,
      byteLength: 64 * 36 * 4,
      format: "RGBA",
      rowOrder: "top-to-bottom",
      surfaceFormat: "rgba8unorm",
      readbackCount: 1,
    });
    expect(result.nonZeroByteCount).toBeGreaterThan(0);
  } finally {
    await launched.close();
  }
});

// Playwright requires a destructured fixtures argument when using testInfo.
// eslint-disable-next-line no-empty-pattern
test("PNG連番とWebMが共通RGBA surfaceから書き出せる", async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const pngLaunch = await page.evaluate(async ({ outputDirectoryPath }) => {
      const project = window.mmdModokiE2e.exportProjectState();
      return await window.electronAPI.startPngSequenceExportWindow({
        project,
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 0,
        step: 1,
        prefix: "rgba_surface_e2e",
        fps: 30,
        precision: 1,
        outputWidth: 320,
        outputHeight: 180,
      });
    }, { outputDirectoryPath: launched.tempDir });

    expect(pngLaunch?.jobId).toBeTruthy();
    const pngPath = resolve(launched.tempDir, "rgba_surface_e2e_0000.png");
    await expect.poll(() => existsSync(pngPath) && statSync(pngPath).size > 100, { timeout: 30_000 }).toBe(true);
    expect(statSync(pngPath).size).toBeGreaterThan(0);
    const pngBytes = readFileSync(pngPath);
    const pngChunks = readPngChunks(pngBytes);
    const ihdr = pngChunks.get("IHDR");
    const idat = pngChunks.get("IDAT");
    expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(ihdr).toBeDefined();
    expect(idat).toBeDefined();
    if (expectRendererWorkerPng) {
      expectNoneFilteredRgbaPng(pngPath, 320, 180);
    } else {
      expect(ihdr[8]).toBe(8);
      expect([2, 6]).toContain(ihdr[9]);
    }

    const webmPath = resolve(launched.tempDir, "rgba_surface_e2e.webm");
    const webmLaunch = await page.evaluate(async ({ outputFilePath }) => {
      const project = window.mmdModokiE2e.exportProjectState();
      return await window.electronAPI.startWebmExportWindow({
        project,
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
    }, { outputFilePath: webmPath });

    expect(webmLaunch?.jobId).toBeTruthy();
    await expect.poll(() => existsSync(webmPath) && statSync(webmPath).size > 1_000, { timeout: 30_000 }).toBe(true);
    expect(statSync(webmPath).size).toBeGreaterThan(0);
  } finally {
    try {
      const page = await launched.app.firstWindow();
      const log = await page.evaluate(() => window.electronAPI.getLogFileInfo());
      await testInfo.attach("export-log", { body: readFileSync(log.path), contentType: "text/plain" });
    } finally { await launched.close(); }
  }
});

test("単発PNGを共通RGBA surfaceから書き出して通常描画へ戻せる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const result = await page.evaluate(async ({ outputDirectoryPath }) => (
      await window.mmdModokiE2e.captureSinglePngSurfaceToPath(
        outputDirectoryPath,
        320,
        180,
      )
    ), { outputDirectoryPath: launched.tempDir });

    expect(result).toMatchObject({
      width: 320,
      height: 180,
      surfaceReleased: true,
    });
    expect(result.byteLength).toBeGreaterThan(100);
    expect(existsSync(result.path)).toBe(true);
    expect(statSync(result.path).size).toBe(result.byteLength);
    expectNoneFilteredRgbaPng(result.path, 320, 180);
  } finally {
    await launched.close();
  }
});

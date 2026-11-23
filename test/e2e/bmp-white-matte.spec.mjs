import { expect, test } from "@playwright/test";
import { PNG } from "playwright-core/lib/utilsBundle";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { writePmx } from "../../scripts/generate-external-parent-test-models.mjs";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

function createWhiteMattedBmp() {
  const size = 128, bytes = Buffer.alloc(54 + size * size * 4);
  bytes.write("BM"); bytes.writeUInt32LE(bytes.length, 2); bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14); bytes.writeInt32LE(size, 18); bytes.writeInt32LE(size, 22);
  bytes.writeUInt16LE(1, 26); bytes.writeUInt16LE(32, 28);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot(x + 0.5 - 64, y + 0.5 - 64);
    const alpha = radius < 28 ? 255 : radius < 42 ? 128 : radius < 52 ? 8 : 0;
    const offset = 54 + ((size - 1 - y) * size + x) * 4;
    bytes[offset] = bytes[offset + 1] = 255 - alpha;
    bytes[offset + 2] = 255; bytes[offset + 3] = alpha;
  }
  return bytes;
}

function writeWhiteMattedQuad(directory) {
    const modelPath = resolve(directory, "white-matte.pmx");
    const bmp = createWhiteMattedBmp();
    writeFileSync(resolve(directory, "white-matte.bmp"), bmp);
    writeFileSync(modelPath, writePmx({
      modelName: "White matte quad", englishModelName: "White matte quad", comment: "Generated distributable fixture",
      diffuseTexture: "white-matte.bmp", noToon: true,
      vertices: [[-9, 5.5, 0], [9, 5.5, 0], [9, 14.5, 0], [-9, 14.5, 0]].map((position, index) => ({
        position, normal: [0, 0, -1], uv: [[0, 1], [2, 1], [2, 0], [0, 0]][index],
      })),
      // Author an alpha-blended PMX material. The loader chooses the material mode normally.
      materialGroups: [{ name: "Quad", englishName: "Quad", diffuse: [1, 1, 1, 0.98], ambient: [1, 1, 1],
        indices: [0, 1, 2, 0, 2, 3], doubleSided: true, edge: false }],
    }));
    return { modelPath, bmp };
}

async function openQuad(launched, page, path) {
  await launched.app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, path);
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator('[data-menu-command="file.openFile"]').click();
  await expect(page.locator("#model-comment-notice")).toBeVisible();
  await page.locator("#model-comment-notice-ok").click();
  await expect(page.locator('#info-model-select option[value="0"]')).toContainText("white-matte");
  await expect(page.locator(".viewport-empty-state")).toBeHidden();
}

async function setBlackBackdrop(page) {
  const menu = page.locator('.app-menu-trigger[data-i18n="menu.background"]');
  await menu.click();
  for (const command of ["view.toggleGround", "view.toggleSkydome"]) {
    const item = page.locator(`[data-menu-command="${command}"]`);
    if (await item.getAttribute("aria-checked") === "true") {
      await item.click();
      await menu.click();
    }
  }
  await page.locator('[data-menu-command="background.toggleBlack"]').click();
}

function sampleRgb(png, point) {
  const x = Math.round(point[0] * png.width), y = Math.round(point[1] * png.height);
  expect(x).toBeGreaterThan(2); expect(x).toBeLessThan(png.width - 2);
  expect(y).toBeGreaterThan(2); expect(y).toBeLessThan(png.height - 2);
  const rgb = [0, 0, 0];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const offset = ((y + dy) * png.width + x + dx) * 4;
    for (let channel = 0; channel < 3; channel++) rgb[channel] += png.data[offset + channel] / 25;
  }
  return rgb;
}

test("normal PMX BMP loading unmattes white edge texels without a material override", async ({}, testInfo) => {
  test.setTimeout(600_000);
  const launched = await launchMmdModoki(root);
  try {
    const { modelPath } = writeWhiteMattedQuad(launched.tempDir);
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e), null, { timeout: 600_000 });
    await openQuad(launched, page, modelPath);
    await setBlackBackdrop(page);
    const report = await page.evaluate(async () => (await import("/test/e2e/helpers/bmp-white-matte-probe.mjs")).observe());
    await testInfo.attach("texture-readback", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    expect(report.isWebGPU).toBe(process.env.MMD_MODOKI_RENDERER !== "webgl2");
    if (!report.isWebGPU) expect(report.webGLVersion).toBe(2);
    expect(report.raw).toBe(true);
    expect(report.metadata.mmdModokiDecodedWhiteMattedAlpha).toBe(true);
    expect(report.hasAlpha).toBe(true);
    expect(report.sampler).toEqual({ wrapU: 1, wrapV: 1, noMipmap: false, invertY: true, samplingMode: 3 });
    expect(report.minAlpha).toBe(0); expect(report.maxAlpha).toBe(255);
    expect(report.edgePixels).toBeGreaterThan(16);
    expect(report.edge[0]).toBeGreaterThan(250);
    expect(report.edge[1]).toBeLessThan(1); expect(report.edge[2]).toBeLessThan(1);
    const regions = await page.evaluate(async () => (await import("/test/e2e/helpers/bmp-white-matte-probe.mjs")).tileSamplePoints());
    const screenshot = await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath("white-matte-canvas.png") });
    const png = PNG.sync.read(screenshot);
    const colors = regions.map(tile => tile.map(point => sampleRgb(png, point)));
    await testInfo.attach("visible-tile-colors", { body: JSON.stringify(colors), contentType: "application/json" });
    // Compare the opaque center, half-alpha red edge and alpha-zero exterior in each UV tile.
    for (const [center, edge, clear] of colors) {
      expect(center[0]).toBeGreaterThan(120);
      expect(edge[0]).toBeGreaterThan(center[0] * 0.18);
      expect(edge[0]).toBeLessThan(center[0] * 0.85);
      expect(Math.max(edge[1], edge[2])).toBeLessThan(edge[0] * 0.3);
      expect(Math.max(...clear)).toBeLessThan(12);
    }
    expect(errors).toEqual([]);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally { await launched.close(); }
});

test("BPMX conversion embeds original white-matted BMP bytes without disposing the live texture", async ({}, testInfo) => {
  test.setTimeout(600_000);
  const launched = await launchMmdModoki(root);
  try {
    const { modelPath, bmp } = writeWhiteMattedQuad(launched.tempDir);
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e), null, { timeout: 600_000 });
    await openQuad(launched, page, modelPath);
    const before = await page.evaluate(async () => {
      const probe = await import("/test/e2e/helpers/bmp-white-matte-probe.mjs");
      probe.watchQuadTextureDisposal();
      return probe.observe();
    });
    await page.locator('.app-menu-trigger[data-i18n="menu.tools"]').click();
    await page.locator('[data-menu-command="tools.mmdOptimizedFormat"]').click();
    const dialog = page.locator('[data-popup-id="mmd-optimized-format"]');
    await dialog.locator('[data-optimized-format-file="model"]').click();
    await dialog.locator('[data-optimized-format-convert="model"]').click();
    const bpmxPath = resolve(launched.tempDir, "user-data/white-matte.bpmx");
    await expect.poll(() => existsSync(bpmxPath), { timeout: 120_000 }).toBe(true);
    const bpmx = readFileSync(bpmxPath);
    expect(bpmx.subarray(0, 4).toString("ascii")).toBe("BPMX");
    expect(bpmx.includes(bmp)).toBe(true);
    expect(await page.evaluate(async () => (await import("/test/e2e/helpers/bmp-white-matte-probe.mjs")).getQuadTextureDisposalCount())).toBe(0);
    expect(await page.evaluate(async () => (await import("/test/e2e/helpers/bmp-white-matte-probe.mjs")).observe())).toEqual(before);
    await dialog.locator(".app-menu-dialog-close").click();
    await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath("live-texture-after-conversion.png") });
  } finally { await launched.close(); }
});

import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { createTofuModel, writePmx } from "../../scripts/generate-external-parent-test-models.mjs";
import { createSwatchBmp } from "../fixtures/feedback-reproduction/create.mjs";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(root, "artifacts/e2e/feedback-fixes-2026-10-19");
async function ready(page) {
  await page.evaluate(async () => (await import("/test/e2e/helpers/feedback-reproduction-probe.mjs")).observe());
}
function backgroundCells(png) {
  const colors = new Set();
  for (let y = Math.ceil(png.height * 0.25); y < png.height * 0.7; y++) for (let x = 20; x < 130; x++) {
    const i = (y * png.width + x) * 4;
    if (png.data[i] === png.data[i + 1] && png.data[i] === png.data[i + 2]) colors.add(png.data[i]);
  }
  return colors;
}
for (const backend of ["classic", "frameGraph"]) test(`AA keeps checker preview and excludes it from PNG (${backend})`, async () => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    if (backend === "classic") {
      await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic")); await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    }
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    state.viewport.backgroundDisplayMode = "checker"; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
    state.effects.frameGraphPostStack = []; state.viewport.antialiasEnabled = true;
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), state);
    await ready(page);
    mkdirSync(output, { recursive: true });
    const shot = await page.locator("#render-canvas").screenshot({ path: resolve(output, `checker-${backend}.png`), style: "#viewport-overlay,.toast{visibility:hidden!important}" });
    const colors = backgroundCells(PNG.sync.read(shot));
    expect(colors.has(255)).toBe(true); expect(colors.has(216)).toBe(true);
    const frame = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 640, 360), launched.tempDir);
    const png = PNG.sync.read(readFileSync(frame.path));
    expect([...png.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(backgroundCells(png).has(216)).toBe(false);
    await ready(page);
    expect(backgroundCells(PNG.sync.read(await page.locator("#render-canvas").screenshot())).has(216)).toBe(true);
    expect(errors).toEqual([]);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally { await launched.close(); }
});

test("same-path BMP reload reads fresh pixels while an existing model retains its texture", async () => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const model = createTofuModel(); model.toonTexture = "reload-color.bmp";
    const path = resolve(launched.tempDir, "texture-reload.pmx"), texture = resolve(launched.tempDir, "reload-color.bmp");
    writeFileSync(path, writePmx(model)); writeFileSync(texture, createSwatchBmp([255, 0, 0]));
    const blank = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const pixels = () => page.evaluate(async () => (await import("/test/e2e/helpers/feedback-reproduction-probe.mjs")).textures());
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path)).not.toBeNull();
    expect((await pixels()).length).toBeGreaterThan(0);
    expect((await pixels()).every(texture => texture.pixels.slice(0, 4).join() === "255,0,0,255")).toBe(true);
    writeFileSync(texture, createSwatchBmp([0, 0, 255]));
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path)).not.toBeNull();
    expect((await pixels()).map(texture => texture.pixels.slice(0, 4))).toEqual(expect.arrayContaining([[255, 0, 0, 255], [0, 0, 255, 255]]));
    await page.evaluate(blank => window.mmdModokiE2e.importProjectState(blank), blank);
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path)).not.toBeNull();
    const report = await pixels();
    expect(report.some(texture => texture.pixels.slice(0, 4).join() === "0,0,255,255")).toBe(true);
    const activePixels = await page.evaluate(async () => (await import("/test/e2e/helpers/feedback-reproduction-probe.mjs")).modelToonPixels());
    expect(activePixels.length).toBeGreaterThan(0);
    expect(activePixels.every(pixel => pixel.join() === "0,0,255,255")).toBe(true);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally { await launched.close(); }
});

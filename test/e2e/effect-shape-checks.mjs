import { createDimLuminousFixture } from "../fixtures/effect-shape/generate.mjs";
import { expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";

// Exercise shape parameters independently of intensity and ON/OFF.
export async function verifyEffectShapeKeys(page, app, testInfo, effectId, selectEffect) {
  await selectEffect(page, effectId);
  const frameInput = page.locator("#current-frame");
  const seek = async frame => { await frameInput.fill(String(frame)); await frameInput.press("Enter"); };
  const fill = async (field, position) => {
    const input = page.locator('[data-effect-key-field="' + field + '"]');
    await input.fill(String(position)); await input.dispatchEvent("input");
  };
  const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  const track = async () => (await state()).keyframes.effectAnimations.tracks.find(track => track.effectId === effectId);
  const initialStatic = (await state()).effects;
  if (effectId === "luminous") {
    const fixture = testInfo.outputPath("dim-luminous.pmx");
    writeFileSync(fixture, createDimLuminousFixture());
    const project = await state();
    project.scene.models[0].path = fixture;
    const projectPath = testInfo.outputPath("dim-fixture-project.json");
    writeFileSync(projectPath, JSON.stringify(project));
    await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, projectPath);
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="file.loadProject"]').click();
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await selectEffect(page, effectId);
  }
  const shapeField = effectId === "bloom" ? "kernel" : "radius";
  const shapeMax = effectId === "bloom" ? 256 : 128;
  for (const frame of [0, 20, 40]) {
    await seek(frame);
    await page.locator("#effect-key-enabled").check();
    await fill(effectId === "bloom" ? "weight" : "intensity", effectId === "bloom" ? 100 : 400);
    await fill("threshold", effectId === "bloom" ? 90 : frame === 40 ? 150 : 0);
    await fill(shapeField, frame === 0 ? 0 : 100);
    await page.locator("#btn-kf-add").click();
  }
  expect((await track()).keys.find(key => key.frame === 20).value[shapeField]).toBe(shapeMax);
  await seek(10);
  await expect(page.locator('[data-effect-key-field="' + shapeField + '"]')).toHaveValue("50");
  const backend = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend);
  if (backend === "frameGraph") {
    const control = page.locator('[data-effect-stack-control="' + (effectId === "bloom" ? "bloomKernel" : "luminousRadius") + '"]');
    if (!await control.isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await expect(control).toHaveValue("50");
    await page.locator("#effect-key-enabled").uncheck();
    await expect(control).toBeEnabled();
    await control.fill("30"); await control.dispatchEvent("input");
    await expect(page.locator('[data-effect-key-field="' + shapeField + '"]')).toHaveValue("30");
    expect((await track()).preview.value.enabled).toBe(false);
    await seek(11); await seek(10);
  }
  // Changing another slider must not round the interpolated half-pixel width.
  await fill("threshold", 37);
  expect((await track()).preview.value[shapeField]).toBe((1 + shapeMax) / 2);
  await page.locator("#btn-kf-add").click();
  await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
  await seek(11); await seek(10);
  expect((await track()).keys.some(key => key.frame === 10)).toBe(false);
  const menu = async command => {
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="' + command + '"]').click();
  };
  const saved = testInfo.outputPath("shape-project.json");
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, saved);
  await menu("file.saveProject");
  await expect.poll(() => existsSync(saved)).toBe(true);
  const expected = await track();
  await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, saved);
  await menu("file.loadProject");
  await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
  await selectEffect(page, effectId);
  expect(await track()).toEqual(expected);
  for (const field of ["bloomKernel", "glowThreshold", "glowKernel"]) {
    expect((await state()).effects[field]).toBe(initialStatic[field]);
  }
  const difference = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i]);
    return sum / (a.length * 0.75);
  };
  const pngs = [];
  await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
  const preparedGeneration = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
  for (const frame of [0, 20, 40, 0]) {
    await seek(frame);
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(preparedGeneration);
  }
  // PNG capture resizes its render surface, which legitimately rebuilds the graph.
  for (const frame of [0, 20, 40, 0]) {
    await seek(frame);
    const dir = testInfo.outputPath("shape-" + frame + "-" + pngs.length);
    mkdirSync(dir, { recursive: true });
    await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 640, 360), dir);
    pngs.push(PNG.sync.read(readFileSync(resolve(dir, "single_rgba_surface_e2e.png"))).data);
  }
  expect(difference(pngs[0], pngs[1])).toBeGreaterThan(0.001);
  if (effectId === "luminous") expect(difference(pngs[1], pngs[2])).toBeGreaterThan(0.0001);
  expect(difference(pngs[0], pngs[3])).toBeLessThan(0.0001);
  await page.screenshot({ path: testInfo.outputPath("shape-controls.png") });
  const webmPath = testInfo.outputPath("shape.webm");
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, webmPath);
  await menu("file.webmExportSettings");
  await page.locator("#webm-output-use-playback-range").uncheck();
  for (const [id, value] of [["width", 640], ["height", 360], ["start-frame", 0], ["end-frame", 40]]) {
    await page.locator("#webm-output-" + id).fill(String(value));
    await page.locator("#webm-output-" + id).press("Enter");
  }
  await page.locator("#webm-output-fps").selectOption("30");
  await page.locator("#webm-output-include-audio").uncheck();
  await page.getByRole("button", { name: "WebM出力", exact: true }).click();
  await expect.poll(() => existsSync(webmPath) && statSync(webmPath).size > 1000, { timeout: 60000 }).toBe(true);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
  const frames = await page.evaluate(async path => {
    const bytes = await window.electronAPI.readBinaryFile(path);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
    const video = document.createElement("video"), canvas = document.createElement("canvas");
    canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    try {
      const ready = new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
      video.src = url; await ready;
      const frames = [];
      for (const frame of [0, 20, 40]) {
        const seeked = new Promise(resolve => video.addEventListener("seeked", resolve, { once: true }));
        video.currentTime = (frame + 0.1) / 30; await seeked;
        context.drawImage(video, 0, 0, 640, 360);
        frames.push(Array.from(context.getImageData(0, 0, 640, 360).data));
      }
      return frames;
    } finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
  }, webmPath);
  const report = frames.map((frame, index) => ({
    frame: index * 20, matching: difference(frame, pngs[index]), opposite: difference(frame, pngs[index === 0 ? 1 : 0]),
  }));
  writeFileSync(testInfo.outputPath("shape-comparison.json"), JSON.stringify(report, null, 2));
  for (let i = 0; i < frames.length; i++) {
    writeFileSync(testInfo.outputPath("shape-video-" + i * 20 + ".png"), PNG.sync.write({ width: 640, height: 360, data: Buffer.from(frames[i]) }));
  }
  for (const item of report) expect(item.matching).toBeLessThan(item.opposite);
}

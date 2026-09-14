import { expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";

export async function verifyAerialShapeKeys(page, app, testInfo, selectEffect) {
  const seek = async frame => {
    await page.locator("#current-frame").fill(String(frame));
    await page.locator("#current-frame").press("Enter");
  };
  const fill = async (field, value) => {
    const input = page.locator('[data-effect-key-field="' + field + '"]');
    await input.fill(String(value)); await input.dispatchEvent("input");
  };
  const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  const track = async () => (await state()).keyframes.effectAnimations.tracks.find(track => track.effectId === "aerialPerspective");
  const initial = (await state()).effects;
  // Same strength: vary onset and transition distance independently.
  for (const [frame, start, range] of [[0, 0, 0], [20, 100, 0], [40, 0, 100]]) {
    await seek(frame);
    await page.locator("#effect-key-enabled").check();
    await fill("strength", 100); await fill("start", start); await fill("range", range);
    await page.locator("#btn-kf-add").click();
  }
  await seek(30);
  await expect(page.locator('[data-effect-key-field="start"]')).toHaveValue("50");
  await expect(page.locator('[data-effect-key-field="range"]')).toHaveValue("83");
  await fill("strength", 75);
  expect((await track()).preview.value).toEqual({ enabled: true, strength: 0.45, start: 250, range: 510 });
  await page.locator("#btn-kf-add").click();
  await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
  await seek(31); await seek(30);
  const expected = await track();
  for (const field of ["Strength", "Start", "Range"]) {
    expect((await state()).effects["aerialPerspective" + field]).toBe(initial["aerialPerspective" + field]);
  }
  const menu = async command => {
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="' + command + '"]').click();
  };
  const projectPath = testInfo.outputPath("aerial-shape-project.json");
  await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, projectPath);
  await menu("file.saveProject"); await expect.poll(() => existsSync(projectPath)).toBe(true);
  await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, projectPath);
  await menu("file.loadProject");
  await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
  await selectEffect(page, "aerialPerspective");
  expect(await track()).toEqual(expected);
  await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
  const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
  for (const frame of [0, 20, 40, 20, 0]) await seek(frame);
  expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
  const frames = [];
  for (const [index, frame] of [0, 20, 40, 0].entries()) {
    await seek(frame);
    const output = testInfo.outputPath("aerial-shape-" + index);
    mkdirSync(output, { recursive: true });
    await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
    frames.push(PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png"))).data);
  }
  const difference = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) if (i % 4 !== 3) sum += Math.abs(a[i] - b[i]);
    return sum / (a.length * 0.75);
  };
  const report = { onset: difference(frames[0], frames[1]), range: difference(frames[0], frames[2]), reverse: difference(frames[0], frames[3]) };
  writeFileSync(testInfo.outputPath("aerial-shape-comparison.json"), JSON.stringify(report));
  expect(report.onset).toBeGreaterThan(0.05);
  expect(report.range).toBeGreaterThan(0.05);
  expect(report.reverse).toBeLessThan(0.0001);
}

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("shelved effect keys stay hidden and inert while static effects and saved data remain usable", async ({}, testInfo) => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toolbar-mode-toggle").click();
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    const assertHidden = async () => {
      const tracks = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks());
      expect(tracks.filter(track => track.category === "effect")).toEqual([]);
      for (const category of ["light", "shadow", "gravity"]) expect(tracks.some(track => track.category === category)).toBe(true);
      await expect(page.locator("#effect-key-controls")).toBeHidden();
    };
    const menu = async command => {
      await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
      await page.locator('[data-menu-command="' + command + '"]').click();
    };
    const seek = async frame => {
      await page.locator("#current-frame").fill(String(frame));
      await page.locator("#current-frame").press("Enter");
    };
    await assertHidden();
    const original = await state();
    const archived = { version: 1, future: "retain", tracks: [{
      effectId: "gamma", valueVersion: 1, base: { enabled: false, gamma: 1 },
      keys: [{ frame: 0, value: { enabled: true, gamma: 0.25 } }, { frame: 20, value: { enabled: true, gamma: 4 } }],
      preview: { frame: 0, value: { enabled: true, gamma: 2 } }, extra: [1, 2, 3],
    }] };
    original.effects.gamma = 1;
    original.effects.frameGraphPostStack = [{ id: "gamma", enabled: true }];
    original.keyframes.effectAnimations = archived;
    const projectPath = testInfo.outputPath("shelved-project.json");
    mkdirSync(testInfo.outputPath(), { recursive: true });
    writeFileSync(projectPath, JSON.stringify(original));
    await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, projectPath);
    await menu("file.loadProject");
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await assertHidden();
    expect((await state()).keyframes.effectAnimations).toEqual(archived);
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator('[data-effect-stack-item="gamma"]').click();
    const gamma = page.locator('[data-effect-stack-control="gammaPower"]');
    await expect(gamma).toHaveValue("50");
    await gamma.fill("75"); await gamma.dispatchEvent("input");
    expect((await state()).effects.gamma).not.toBe(1);
    expect((await state()).keyframes.effectAnimations).toEqual(archived);
    const capture = async frame => {
      await seek(frame);
      const output = testInfo.outputPath("png-" + frame);
      mkdirSync(output, { recursive: true });
      await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
      return PNG.sync.read(readFileSync(resolve(output, "single_rgba_surface_e2e.png"))).data;
    };
    expect((await capture(0)).equals(await capture(20))).toBe(true);
    await page.locator("#viewport-seek-play-toggle").click();
    await expect.poll(() => page.locator("#current-frame").inputValue()).not.toBe("20");
    await page.locator("#viewport-seek-play-toggle").click();
    expect((await state()).keyframes.effectAnimations).toEqual(archived);
    const savedPath = testInfo.outputPath("saved-project.json");
    await launched.app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, savedPath);
    await menu("file.saveProject");
    await expect.poll(() => existsSync(savedPath)).toBe(true);
    expect(JSON.parse(readFileSync(savedPath, "utf8")).keyframes.effectAnimations).toEqual(archived);
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
      await assertHidden();
      expect((await state()).keyframes.effectAnimations).toEqual(archived);
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("shelved-controls.png") });
  } finally { await launched.close(); }
});

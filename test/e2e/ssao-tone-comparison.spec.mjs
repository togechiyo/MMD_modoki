import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = resolve(root, "artifacts/e2e/ssao-tone-comparison-2026-10-20");

function difference(aPath, bPath) {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let changed = 0, brighter = 0, darker = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const delta = [0, 1, 2].map(c => b.data[i + c] - a.data[i + c]);
    if (Math.max(...delta.map(Math.abs)) > 8) {
      changed++;
      if (delta.reduce((sum, value) => sum + value, 0) > 0) brighter++;
      else darker++;
    }
  }
  return { changed, brighter, darker };
}

async function settle(page) {
  await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
  const frame = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount);
  await page.waitForFunction(before => window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount > before + 3, frame);
}

async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

async function details(page) {
  const panelToggle = page.locator("#btn-toggle-shader-panel");
  if (await panelToggle.getAttribute("aria-pressed") !== "true") await panelToggle.click();
  const target = page.locator("#info-model-select");
  if (await target.inputValue() !== "__camera__") await target.selectOption("__camera__");
  const postTab = page.locator('[data-effect-tab="post"]');
  if (await postTab.getAttribute("aria-selected") !== "true") await postTab.click();
  const button = page.locator('[data-effect-stack-item="ssao"]');
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
  return page.locator('[data-effect-stack-control="ssaoToneMode"]');
}

test("SSAO tone comparison keeps legacy output, saved choice and backend state", async ({}, testInfo) => {
  mkdirSync(output, { recursive: true });
  const launched = await launchMmdModoki(root);
  const report = { errors: [], captures: {} };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.ssaoToneMode)).toBe("simple");
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      state.viewport.groundVisible = true;
      state.viewport.skydomeVisible = false;
      state.effects.modelEdgeWidth = 0;
      state.lighting.shadowEnabled = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -12, ry: -25, rz: 0, camDistance: 14 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value));
      await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="ssao"]').click();
    let tone = await details(page);
    await expect(tone).toHaveValue("simple");
    const strength = page.locator('[data-effect-stack-control="ssaoStrength"]');
    await strength.fill("100");
    await strength.dispatchEvent("input");
    await strength.dispatchEvent("change");
    await settle(page);

    async function capture(name) {
      await settle(page);
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}-viewport.png`) });
      const png = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 960, 540), resolve(output, name));
      report.captures[name] = png.path;
    }
    for (const mode of ["legacy", "simple", "legacy"]) {
      tone = await details(page);
      // PNG capture can rebuild for its output size; measure the mode change alone.
      const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
      await tone.selectOption(mode);
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.ssaoToneMode)).toBe(mode);
      await settle(page);
      expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
      await capture(mode === "legacy" && report.captures.legacy ? "legacy-restored" : mode);
    }
    report.viewportDifference = difference(resolve(output, "legacy-viewport.png"), resolve(output, "simple-viewport.png"));
    report.exportDifference = difference(report.captures.legacy, report.captures.simple);
    report.legacyRestoredDifference = difference(report.captures.legacy, report.captures["legacy-restored"]);
    expect(report.viewportDifference.changed).toBeGreaterThan(100);
    expect(report.exportDifference.changed).toBeGreaterThan(100);
    expect(report.exportDifference.brighter).toBeGreaterThan(report.exportDifference.darker);
    expect(report.legacyRestoredDifference.changed).toBeLessThan(100);

    const savedPath = testInfo.outputPath("ssao-tone.json");
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, savedPath);
    for (const mode of ["simple", "legacy"]) {
      await (await details(page)).selectOption(mode);
      await menu(page, "file.saveProject");
      await expect.poll(() => {
        try { return JSON.parse(readFileSync(savedPath, "utf8")).effects.ssaoToneMode; }
        catch { return null; }
      }).toBe(mode);
      await (await details(page)).selectOption(mode === "simple" ? "legacy" : "simple");
      await menu(page, "file.loadProject");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.ssaoToneMode)).toBe(mode);
      await settle(page);
      await expect(await details(page)).toHaveValue(mode);
    }

    // Actual file load also checks the migration from projects without a tone field.
    const oldProject = JSON.parse(readFileSync(savedPath, "utf8"));
    delete oldProject.effects.ssaoToneMode;
    writeFileSync(savedPath, JSON.stringify(oldProject));
    await (await details(page)).selectOption("simple");
    await menu(page, "file.loadProject");
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.ssaoToneMode)).toBe("legacy");
    await settle(page);
    await expect(await details(page)).toHaveValue("legacy");
    await capture("old-project");
    expect(difference(report.captures.legacy, report.captures["old-project"]).changed).toBeLessThan(100);

    for (const mode of ["simple", "legacy"]) {
      await (await details(page)).selectOption(mode);
      for (const backend of ["classic", "frameGraph"]) {
        await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
        await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
        await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
        expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.ssaoToneMode)).toBe(mode);
      }
      await settle(page);
      await expect(await details(page)).toHaveValue(mode);
    }
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]);
    console.log(JSON.stringify(report));
  } finally {
    writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

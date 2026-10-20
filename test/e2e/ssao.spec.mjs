import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function difference(aPath, bPath) {
  const a = PNG.sync.read(readFileSync(aPath)), b = PNG.sync.read(readFileSync(bPath));
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
  await page.waitForFunction(() => window.mmdModokiE2e?.getFrameGraphPostEffectsState().ready);
  const frame = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount);
  await page.waitForFunction(before => window.mmdModokiE2e.getFrameGraphPostEffectsState().executedFrameCount > before + 3, frame);
}

async function details(page) {
  const panel = page.locator("#btn-toggle-shader-panel");
  if (await panel.getAttribute("aria-pressed") !== "true") await panel.click();
  const target = page.locator("#info-model-select");
  if (await target.inputValue() !== "__camera__") await target.selectOption("__camera__");
  const tab = page.locator('[data-effect-tab="post"]');
  if (await tab.getAttribute("aria-selected") !== "true") await tab.click();
  const button = page.locator('[data-effect-stack-item="ssao"]');
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
  const row = page.locator('[data-effect-stack-row="ssao"]');
  await expect(row.locator("select")).toHaveCount(0);
  return row.locator('[data-effect-stack-control="ssaoStrength"]');
}

async function menu(page, command) {
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator(`[data-menu-command="${command}"]`).click();
}

for (const pbr of [false, true]) test(`SSAO unified simple rendering, legacy files and backend restoration (PBR=${pbr})`, async ({}, testInfo) => {
  const output = resolve(root, "artifacts/e2e/ssao-simple-2026-10-20", pbr ? "pbr" : "mmd");
  mkdirSync(output, { recursive: true });
  const launched = await launchMmdModoki(root);
  const report = { pbr, errors: [], captures: {}, migrations: {} };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      state.viewport.groundVisible = true;
      state.viewport.skydomeVisible = false;
      state.effects.modelEdgeWidth = 0;
      state.lighting.shadowEnabled = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"))).not.toBeNull();
    if (pbr) {
      await page.locator('.app-menu-trigger[data-i18n="menu.window"]').click();
      await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
      const dialog = page.locator('[data-popup-id="experimental-settings"]');
      await dialog.getByLabel("PBRモード", { exact: true }).check();
      await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeChecked();
      await dialog.locator(".app-menu-dialog-close").click();
    }
    const materialMode = pbr ? "pbr-standard" : "mmd-standard";
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.materialMode)).toBe(materialMode);
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -12, ry: -25, rz: 0, camDistance: 14 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="ssao"]').click();

    async function capture(name) {
      await settle(page);
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}-viewport.png`) });
      const png = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 960, 540), resolve(output, name));
      report.captures[name] = png.path;
    }
    for (const [position, name] of [[50, "half"], [100, "max"]]) {
      const strength = await details(page);
      await strength.fill(String(position));
      await strength.dispatchEvent("input"); await strength.dispatchEvent("change");
      await capture(name);
    }
    report.range = difference(report.captures.half, report.captures.max);
    expect(report.range.changed).toBeGreaterThan(100);
    expect(report.range.darker).toBeGreaterThan(report.range.brighter);

    const savedPath = testInfo.outputPath("ssao.json");
    await launched.app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, savedPath);
    await menu(page, "file.saveProject");
    await expect.poll(() => {
      try { return JSON.parse(readFileSync(savedPath, "utf8")).effects.ssaoStrength; }
      catch { return null; }
    }).toBe(1);
    const saved = JSON.parse(readFileSync(savedPath, "utf8"));
    expect(saved.effects).not.toHaveProperty("ssaoToneMode");
    for (const flag of [undefined, "legacy", "simple"]) {
      const old = structuredClone(saved);
      if (flag !== undefined) old.effects.ssaoToneMode = flag;
      writeFileSync(savedPath, JSON.stringify(old));
      const strength = await details(page);
      await strength.fill("25"); await strength.dispatchEvent("input"); await strength.dispatchEvent("change");
      await menu(page, "file.loadProject");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.ssaoStrength)).toBe(1);
      await expect(await details(page)).toHaveValue("100");
      const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(restored.effects).not.toHaveProperty("ssaoToneMode");
      expect(restored.scene.materialMode).toBe(materialMode);
      const name = `loaded-${flag ?? "missing"}`;
      await capture(name);
      report.migrations[name] = difference(report.captures.max, report.captures[name]);
      expect(report.migrations[name].changed).toBeLessThan(100);
    }
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
      await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
      // The backend flag changes before the asynchronous project restore ends;
      // a previous status message can still be visible during that interval.
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.ssaoStrength)).toBe(1);
      const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(restored.effects.ssaoStrength).toBe(1);
      expect(restored.effects.ssaoRadius).toBe(3);
      expect(restored.effects).not.toHaveProperty("ssaoToneMode");
      expect(restored.scene.materialMode).toBe(materialMode);
    }
    await settle(page);
    await expect(await details(page)).toHaveValue("100");
    await capture("backend-restored");
    report.backendRestored = difference(report.captures.max, report.captures["backend-restored"]);
    expect(report.backendRestored.changed).toBeLessThan(100);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]);
    console.log(JSON.stringify(report));
  } finally {
    writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

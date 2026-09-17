import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("bundled snow, day and night presets retain adjustments and restore without external references", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const open = async () => {
      await page.locator('[data-i18n="menu.window"]').click();
      await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    };
    const dialog = page.locator('[data-popup-id="experimental-settings"]');
    const preset = dialog.getByRole("combobox", { name: "内蔵プリセット", exact: true });
    const diagnostics = () => page.evaluate(() => window.mmdModokiE2e.getEnvironmentLightingDiagnostics());
    const checkPreset = async id => {
      await expect(preset).toBeEnabled();
      await expect(preset).toHaveValue(id);
      await expect.poll(async () => (await diagnostics()).textureReady).toBe(true);
      const state = await diagnostics();
      expect(state.preset).toBe(id);
      expect(state.source).toBe("bundled");
      expect(state.sourcePath).toBeNull();
      expect(state.hasSphericalPolynomial).toBe(true);
      expect(state.environmentTextureSize).toEqual({ width: 1024, height: 1024 });
    };
    await open();
    await expect(preset).toHaveValue("yamagata-field");
    await expect(preset).toBeDisabled();
    const pbr = dialog.getByLabel("PBRモード", { exact: true });
    await pbr.check();
    await checkPreset("yamagata-field");
    const background = dialog.locator('[data-experimental-lighting] input[type="checkbox"]').nth(0);
    await background.check();
    // Use the native range controls so adjustments survive all source changes.
    const ranges = dialog.locator('[data-experimental-lighting] input[type="range"]');
    await ranges.nth(0).focus();
    await ranges.nth(0).press("End");
    const rotation = dialog.getByRole("slider", { name: "環境の水平回転", exact: true });
    await rotation.focus();
    await rotation.press("End");

    // A failed bundled load must retain the previously selected environment.
    const dayAsset = /\/eitai-bridge-20190111-1215-2k\.hdr(?:\?.*)?$/;
    await page.route(dayAsset, route => route.abort());
    await preset.selectOption("eitai-bridge");
    await expect(page.getByText("HDRIの読み込みに失敗しました").first()).toBeVisible();
    await checkPreset("yamagata-field");
    await page.unroute(dayAsset);

    for (const id of ["eitai-bridge", "mifune-bridge", "yamagata-field", "mifune-bridge"]) {
      await preset.selectOption(id);
      await checkPreset(id);
      await expect(background).toBeChecked();
      await expect(rotation).toHaveValue("360");
      await expect(ranges.nth(0)).toHaveValue("100");
      await expect.poll(async () => (await diagnostics()).backgroundTextureReady).toBe(true);
      const state = await diagnostics();
      expect(state.backgroundTextureSize).toEqual(state.environmentTextureSize);
      expect(state.backgroundReflectionMatrix).toEqual(state.reflectionMatrix);
      await dialog.locator(".app-menu-dialog-close").click();
      await page.screenshot({ path: testInfo.outputPath(`${id}.png`) });
      await open();
    }
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.lighting.environmentLightingPreset).toBe("mifune-bridge");
    await preset.selectOption("eitai-bridge");
    await checkPreset("eitai-bridge");
    await dialog.locator(".app-menu-dialog-close").click();
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    await open();
    await checkPreset("mifune-bridge");
    await pbr.uncheck();
    await expect(preset).toBeDisabled();
    await pbr.check();
    await checkPreset("mifune-bridge");
    for (const backend of ["classic", "frameGraph"]) {
      await page.evaluate(value => localStorage.setItem("mmd_modoki.postEffectBackend", value), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await open();
      await checkPreset("mifune-bridge");
      expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
    }
    // Supply a bundled fixture through the OS dialog hook; no local-references dependency.
    const source = resolve(root, "src/assets/ibl-shadows/eitai-bridge-20190111-1215-2k.hdr");
    await launched.app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, source);
    const load = dialog.getByRole("button", { name: "HDRI読込", exact: true });
    await load.click();
    await expect(preset).toHaveValue("external");
    await expect(load).toBeEnabled();
    await dialog.getByRole("button", { name: "クリア", exact: true }).click();
    await checkPreset("mifune-bridge");
    await load.click();
    await expect(preset).toHaveValue("external");
    await expect(load).toBeEnabled();
    await preset.selectOption("eitai-bridge");
    await checkPreset("eitai-bridge");
    await expect(background).toBeChecked();
    delete saved.lighting.environmentLightingPreset;
    await dialog.locator(".app-menu-dialog-close").click();
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    await open();
    await checkPreset("yamagata-field");
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await launched.close();
  }
});

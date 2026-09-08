import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("experimental settings persist PBR imports and expose environment and log operations", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toolbar-mode-toggle").click();
    await page.locator("#light-color-r").fill("200");
    await page.locator("#light-color-r").dispatchEvent("input");
    await page.locator("#btn-light-keyframe").click();
    const keys = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes);
    await launched.app.evaluate(({ shell, clipboard }) => {
      globalThis.experimentOriginalClipboard = clipboard.readText();
      globalThis.experimentOpenedPaths = [];
      shell.openPath = async path => { globalThis.experimentOpenedPaths.push(path); return ""; };
    });
    const open = async () => {
      await page.locator('[data-i18n="menu.tools"]').click();
      await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
      await expect(page.locator('[data-popup-id="experimental-settings"]')).toBeVisible();
    };
    await open();
    const dialog = page.locator('[data-popup-id="experimental-settings"]');
    const pbr = dialog.getByLabel("PBRモード", { exact: true });
    await expect(pbr).not.toBeChecked();
    const checks = dialog.locator('[data-experimental-lighting] input[type="checkbox"]');
    const ranges = dialog.locator('[data-experimental-lighting] input[type="range"]');
    await checks.nth(1).check();
    await ranges.nth(1).fill("150");
    await ranges.nth(1).dispatchEvent("input");
    await checks.nth(1).uncheck();
    await pbr.check();
    await expect(pbr).toBeEnabled();
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].materialPipeline).toBe("pbr-standard");
    expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().keyframes)).toEqual(keys);
    await expect(dialog).toContainText("IBL影：既知のWebGPU");
    await expect(checks.nth(1)).toBeChecked();
    await expect(ranges.nth(1)).toBeEnabled();
    await expect(ranges.nth(1)).toHaveValue("150");
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.lighting.environmentLightingEnabled).toBe(true);
    expect(saved.lighting.environmentLightingIntensity).toBe(1.5);

    const logInfo = await page.evaluate(() => window.electronAPI.getLogFileInfo());
    await expect(dialog.getByLabel("現在のログファイル")).toHaveValue(logInfo.path);
    await dialog.getByRole("button", { name: "ログフォルダを開く", exact: true }).click();
    await dialog.getByRole("button", { name: "現在のログを開く", exact: true }).click();
    await expect.poll(() => launched.app.evaluate(() => globalThis.experimentOpenedPaths)).toEqual([logInfo.directoryPath, logInfo.path]);
    await page.evaluate(() => window.electronAPI.logInfo("renderer", "experimental-settings-copy-fixture"));
    await dialog.getByRole("button", { name: "ログ内容をコピー", exact: true }).click();
    await expect.poll(() => launched.app.evaluate(({ clipboard }) => clipboard.readText().includes("experimental-settings-copy-fixture"))).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath("experimental-settings.png") });
    await page.reload();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await open();
    await expect(pbr).toBeChecked();
    await expect(ranges.nth(1)).toHaveValue("150");
    await dialog.locator(".app-menu-dialog-close").click();
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].materialPipeline).toBe("pbr-standard");
    await open();
    await pbr.uncheck();
    await expect(pbr).toBeEnabled();
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models[0].materialPipeline).toBe("mmd-standard");
    await expect(checks.nth(1)).toBeChecked();
    await dialog.locator(".app-menu-dialog-close").click();
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    await open();
    await expect(pbr).toBeChecked();
    await expect(ranges.nth(1)).toHaveValue("150");
    await dialog.locator(".app-menu-dialog-close").click();
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.models.at(-1).materialPipeline).toBe("pbr-standard");
    for (const locale of ["en", "ko", "zh-Hans", "zh-Hant", "ja"]) {
      await page.evaluate(locale => window.mmdI18n.setLocale(locale), locale);
      await open();
      await expect(dialog).not.toContainText("experiment.");
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await dialog.screenshot({ path: testInfo.outputPath(`experimental-settings-${locale}.png`) });
      await dialog.locator(".app-menu-dialog-close").click();
    }
    expect(errors).toEqual([]);
    expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
  } finally {
    await launched.app.evaluate(({ clipboard }) => {
      if (typeof globalThis.experimentOriginalClipboard === "string") clipboard.writeText(globalThis.experimentOriginalClipboard);
    }).catch(() => undefined);
    await launched.close();
  }
});

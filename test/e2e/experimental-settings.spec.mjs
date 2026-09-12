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
    await expect(dialog.locator(".experimental-settings-section > h3")).toHaveText(["PBR", "WGSL", "MCP"]);
    for (const name of ["PBR", "WGSL", "MCP"]) {
      const heading = dialog.getByRole("heading", { name, exact: true });
      await expect(heading.getByRole("checkbox")).toHaveCount(1);
      await expect(heading.locator("label > span")).toHaveText(name);
    }
    await expect(dialog.locator('.experimental-settings-section > .experimental-settings-toggle')).toHaveCount(0);
    const sections = dialog.locator(".experimental-settings-section");
    await expect(sections.nth(0).getByLabel("PBRモード", { exact: true })).toBeVisible();
    await expect(sections.nth(1).getByLabel("外部WGSL材質を有効にする", { exact: true })).toBeVisible();
    await expect(sections.nth(2).getByLabel("構造情報を含む詳細診断を許可", { exact: true })).toBeVisible();
    expect(await dialog.locator(".experimental-settings-toggle").evaluateAll(fields => fields.every(field => {
      const checkbox = field.querySelector("input").getBoundingClientRect();
      const label = field.querySelector("span").getBoundingClientRect();
      return checkbox.right <= label.left && label.width > 250;
    }))).toBe(true);
    await dialog.screenshot({ path: testInfo.outputPath("experimental-settings-pbr.png") });
    await sections.nth(1).scrollIntoViewIfNeeded();
    await dialog.screenshot({ path: testInfo.outputPath("experimental-settings-wgsl.png") });
    await sections.nth(2).evaluate(element => element.scrollIntoView({ block: "start" }));
    await dialog.screenshot({ path: testInfo.outputPath("experimental-settings-mcp.png") });
    const pbr = dialog.getByLabel("PBRモード", { exact: true });
    await expect(pbr).not.toBeChecked();
    const checks = dialog.locator('[data-experimental-lighting] input[type="checkbox"]');
    const ranges = dialog.locator('[data-experimental-lighting] input[type="range"]');
    await expect(checks.nth(1)).toBeDisabled();
    await expect(ranges.nth(1)).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "HDRI読込", exact: true })).toBeDisabled();
    await dialog.getByRole("heading", { name: "PBR", exact: true }).locator("label > span").click();
    await expect(pbr).toBeChecked();
    await expect(pbr).toBeEnabled();
    await expect(checks.nth(1)).toBeEnabled();
    await checks.nth(1).check();
    await ranges.nth(1).fill("150");
    await ranges.nth(1).dispatchEvent("input");
    await checks.nth(1).uncheck();
    await pbr.uncheck();
    await expect(pbr).toBeEnabled();
    await expect(checks.nth(1)).toBeDisabled();
    await expect(ranges.nth(1)).toHaveValue("150");
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
    await dialog.locator(".experimental-settings-logs > summary").click();
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
    await open();
    await expect(pbr).not.toBeChecked();
    await expect(checks.nth(1)).toBeDisabled();
    await expect(ranges.nth(1)).toBeDisabled();
    await expect(ranges.nth(1)).toHaveValue("150");
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

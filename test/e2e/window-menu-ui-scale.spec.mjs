import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("Window menu controls UI visibility and persists UI scale", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const windowMenu = page.locator('.app-menu-trigger[data-i18n="menu.window"]');
    const showUiItem = page.locator('[data-menu-command="window.toggleUi"]');
    const scale125Item = page.locator('[data-menu-command="window.uiScale.125"]');

    await windowMenu.click();
    await expect(showUiItem).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-menu-command="window.uiScale.100"]')).toHaveAttribute("aria-checked", "true");

    await scale125Item.click();
    await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => (
      BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor()
    ))).toBe(1.25);

    await windowMenu.click();
    await expect(scale125Item).toHaveAttribute("aria-checked", "true");

    const exporterWindowPromise = launched.app.waitForEvent("window");
    const exportLaunch = await page.evaluate(async (outputDirectoryPath) => (
      window.electronAPI.startPngSequenceExportWindow({
        project: window.mmdModokiE2e.exportProjectState(),
        outputDirectoryPath,
        startFrame: 0,
        endFrame: 10,
        step: 1,
        prefix: "ui_scale_export",
        fps: 30,
        precision: 1,
        outputWidth: 320,
        outputHeight: 180,
        transparentBackground: false,
      })
    ), launched.tempDir);
    expect(exportLaunch?.jobId).toBeTruthy();
    const exporterPage = await exporterWindowPromise;
    await exporterPage.waitForFunction(() => document.body.classList.contains("exporter-mode"));
    const windowZooms = await launched.app.evaluate(({ BrowserWindow }) => (
      BrowserWindow.getAllWindows().map((window) => ({
        title: window.getTitle(),
        zoomFactor: window.webContents.getZoomFactor(),
      }))
    ));
    expect(windowZooms.find((window) => window.title === "MMD modoki")?.zoomFactor).toBe(1.25);
    expect(windowZooms.find((window) => window.title.startsWith("PNG Sequence Export"))?.zoomFactor).toBe(1);
    await exporterPage.close();

    await showUiItem.click();
    await expect(page.locator("#app")).toHaveClass(/ui-presentation-mode/);

    await page.keyboard.press("Tab");
    await expect(page.locator("#app")).not.toHaveClass(/ui-presentation-mode/);

    await page.reload();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => (
      BrowserWindow.getAllWindows()[0]?.webContents.getZoomFactor()
    ))).toBe(1.25);
    await windowMenu.click();
    await expect(scale125Item).toHaveAttribute("aria-checked", "true");
  } finally {
    await launched.close();
  }
});

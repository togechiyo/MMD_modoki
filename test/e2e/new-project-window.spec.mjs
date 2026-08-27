import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

async function waitForEditorReady(page) {
  await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
}

async function expectEmptyProject(page) {
  const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  expect(state.scene.models).toHaveLength(0);
  expect(state.accessories ?? []).toHaveLength(0);
  expect(state.scene.currentFrame).toBe(0);
}

async function expectVisibleEditorWindows(app, expectedCount) {
  const windowStates = await app.evaluate(({ BrowserWindow }) => (
    BrowserWindow.getAllWindows().map((window) => ({
      destroyed: window.isDestroyed(),
      visible: window.isVisible(),
    }))
  ));
  expect(windowStates).toHaveLength(expectedCount);
  expect(windowStates.every(({ destroyed, visible }) => !destroyed && visible)).toBe(true);
}

test("new project opens in an independent window", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const originalPage = await launched.app.firstWindow();
    await waitForEditorReady(originalPage);
    expect(await originalPage.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    await originalPage.evaluate(() => window.mmdModokiE2e.seekTo(17));

    const originalBefore = await originalPage.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(originalBefore.scene.models).toHaveLength(1);
    expect(originalBefore.scene.currentFrame).toBe(17);

    await originalPage.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    const newProjectItem = originalPage.locator('[data-menu-command="file.newProjectWindow"]');
    await expect(newProjectItem).toContainText("プロジェクト新規作成");
    await expect(newProjectItem.locator(".app-menu-shortcut")).toHaveText("Ctrl+N");
    const fileCommands = await originalPage.locator('[data-i18n="menu.file"] + .app-menu-list [data-menu-command]').evaluateAll(
      (items) => items.map((item) => item.getAttribute("data-menu-command")),
    );
    expect(fileCommands.indexOf("file.newProjectWindow") + 1).toBe(fileCommands.indexOf("file.loadProject"));
    expect(fileCommands.indexOf("file.loadProject") + 1).toBe(fileCommands.indexOf("file.saveProject"));

    const menuWindowPromise = launched.app.waitForEvent("window");
    await newProjectItem.click();
    const menuWindow = await menuWindowPromise;
    await waitForEditorReady(menuWindow);
    await expect.poll(() => launched.app.windows().length).toBe(2);
    await expectVisibleEditorWindows(launched.app, 2);
    await expect(originalPage.locator(".toast.error")).toHaveCount(0);
    await expectEmptyProject(menuWindow);

    const originalAfter = await originalPage.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(originalAfter.scene.models).toEqual(originalBefore.scene.models);
    expect(originalAfter.scene.currentFrame).toBe(17);

    await menuWindow.close();
    await expect.poll(() => launched.app.windows().length).toBe(1);
    expect(await originalPage.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(1);

    const shortcutWindowPromise = launched.app.waitForEvent("window");
    await originalPage.keyboard.press("Control+N");
    const shortcutWindow = await shortcutWindowPromise;
    await waitForEditorReady(shortcutWindow);
    await expect.poll(() => launched.app.windows().length).toBe(2);
    await expectVisibleEditorWindows(launched.app, 2);
    await expect(originalPage.locator(".toast.error")).toHaveCount(0);
    await expectEmptyProject(shortcutWindow);
    expect(await originalPage.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(1);

    await shortcutWindow.close();
    await expect.poll(() => launched.app.windows().length).toBe(1);
  } finally {
    await launched.close();
  }
});

import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("omits empty help entries and ends with Physics, Window, Tools", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const menuTriggers = page.locator("#app-menu-bar .app-menu-trigger");
    await expect(menuTriggers).toHaveCount(8);
    expect(await menuTriggers.evaluateAll((elements) => elements.map((element) => element.dataset.i18n).slice(-3)))
      .toEqual(["menu.physics", "menu.window", "menu.tools"]);
    await expect(page.locator('.app-menu-trigger[data-i18n="menu.help"]')).toHaveCount(0);

    const toolsGroup = page.locator(".app-menu-group", {
      has: page.locator('.app-menu-trigger[data-i18n="menu.tools"]'),
    });
    expect(await toolsGroup.locator("[data-menu-command]").evaluateAll(
      (elements) => elements.map((element) => element.dataset.menuCommand),
    )).toEqual([
      "tools.mmdOptimizedFormat",
      "tools.vmdRetarget",
      "tools.openLogFolder",
    ]);
    await expect(page.locator('[data-menu-command="dialog.shortcuts"]')).toHaveCount(0);
    await expect(page.locator('[data-menu-command="dialog.about"]')).toHaveCount(0);
  } finally {
    await launched.close();
  }
});

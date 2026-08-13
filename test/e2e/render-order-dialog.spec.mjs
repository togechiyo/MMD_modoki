import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("render order dialog exposes the experimental import mode", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const command = page.locator('[data-menu-command="view.renderOrderSettings"]');
    const group = page.locator(".app-menu-group", { has: command });
    await group.locator(".app-menu-trigger").click();
    await command.click();

    const dialog = page.locator('[data-popup-id="render-order-settings"]');
    await expect(dialog).toBeVisible();
    const mode = dialog.locator("#mmd-render-order-mode");
    await expect(mode).toBeEnabled();
    await expect(mode).toHaveValue("evaluated");
    await mode.selectOption("mmd-fixed");
    await expect(mode).toHaveValue("mmd-fixed");
    const coplanarCorrection = dialog.locator("#mmd-coplanar-depth-bias-strength");
    await expect(coplanarCorrection).toHaveValue("0");
    await coplanarCorrection.fill("2");
    await expect(coplanarCorrection).toHaveValue("2");
    await expect(dialog.locator(".render-order-row")).toHaveCount(0);
  } finally {
    await launched.close();
  }
});

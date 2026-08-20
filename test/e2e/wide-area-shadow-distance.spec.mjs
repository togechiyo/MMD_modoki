import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("extends the detailed shadow range to 100,000 for wide-area stages", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.locator("#light-shadow-max-z").fill("10000");

    const command = page.locator('[data-menu-command="view.lightShadowSettings"]');
    const group = page.locator(".app-menu-group", { has: command });
    await group.locator(".app-menu-trigger").click();
    await command.click();

    const dialog = page.locator('[data-popup-id="lighting-shadow-settings"]');
    await expect(dialog).toBeVisible();

    const multiplier = dialog.locator("#light-shadow-distance-multiplier");
    const effectiveValue = dialog.locator("#light-shadow-distance-multiplier-val");
    await expect(multiplier).toHaveValue("1");
    await expect(effectiveValue).toHaveText("×1 (10000)");

    await multiplier.fill("10");
    await expect(multiplier).toHaveValue("10");
    await expect(effectiveValue).toHaveText("×10 (100000)");

    const lighting = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting);
    expect(lighting.shadowMaxZ).toBe(10000);
    expect(lighting.shadowDistanceMultiplier).toBe(10);
  } finally {
    await launched.close();
  }
});

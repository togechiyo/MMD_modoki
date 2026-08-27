import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("汎用UIアクセントと詳細ポップアップをブルーグリーンで統一する", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate(() => (
      getComputedStyle(document.documentElement).getPropertyValue("--accent-primary").trim()
    ))).toBe("#39c5bb");

    const locale = page.locator("#toolbar-locale-select");
    await locale.focus();
    await expect.poll(() => locale.evaluate((element) => getComputedStyle(element).borderColor))
      .toBe("rgb(57, 197, 187)");

    await page.locator(".app-menu-trigger").filter({ hasText: "ファイル" }).click();
    await page.locator('[data-menu-command="file.exportPng"]').click();
    const dialog = page.locator('[data-popup-id="png-export"]');
    await expect(dialog).toBeVisible();

    const primary = dialog.locator(".popup-form-button-primary");
    expect(await primary.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderColor };
    })).toEqual({
      background: "rgba(57, 197, 187, 0.24)",
      border: "rgba(57, 197, 187, 0.62)",
    });

    const width = dialog.locator("#png-output-width");
    await width.focus();
    await expect.poll(() => width.evaluate((element) => getComputedStyle(element).borderColor))
      .toBe("rgba(57, 197, 187, 0.72)");

    const transparent = dialog.locator("#png-output-transparent-background");
    await transparent.check();
    expect(await transparent.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgb(57, 197, 187)");

    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await launched.close();
  }
});

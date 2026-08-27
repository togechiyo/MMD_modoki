import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const openPngExportDialog = async (page) => {
  await page.locator(".app-menu-trigger").filter({ hasText: "ファイル" }).click();
  await page.locator('[data-menu-command="file.exportPng"]').click();
  return page.locator('[data-popup-id="png-export"]');
};

test("メニューのPNG出力で解像度詳細を設定して再表示できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const dialog = await openPngExportDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#app-menu-dialog-title")).toHaveText("PNG画像出力");

    const aspect = dialog.locator("#png-output-aspect");
    const sizePreset = dialog.locator("#png-output-size-preset");
    const width = dialog.locator("#png-output-width");
    const height = dialog.locator("#png-output-height");

    await expect(aspect).toHaveValue("16:9");
    await expect(sizePreset).toHaveValue("1920");
    await expect(width).toHaveValue("1920");
    await expect(height).toHaveValue("1080");
    await expect(sizePreset.locator('option[value="7680"]')).toHaveText("8K");

    await width.fill("1111");
    await height.focus();
    await expect(width).toHaveValue("1920");
    await expect(height).toHaveValue("1080");

    await width.fill("1280");
    await width.press("Enter");
    await height.focus();
    await expect(width).toHaveValue("1280");
    await expect(height).toHaveValue("1080");

    await aspect.selectOption("9:16");
    await sizePreset.selectOption("7680");
    await expect(width).toHaveValue("4320");
    await expect(height).toHaveValue("7680");
    await expect(dialog.getByText("8Kなどの大型出力は多くのメモリを使用します。")).toBeVisible();

    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(dialog).toBeHidden();

    const reopenedDialog = await openPngExportDialog(page);
    await expect(reopenedDialog.locator("#png-output-aspect")).toHaveValue("9:16");
    await expect(reopenedDialog.locator("#png-output-size-preset")).toHaveValue("7680");
    await expect(reopenedDialog.locator("#png-output-width")).toHaveValue("4320");
    await expect(reopenedDialog.locator("#png-output-height")).toHaveValue("7680");

    await reopenedDialog.locator("#png-output-width").fill("640");
    await reopenedDialog.locator("#png-output-width").press("Enter");
    await reopenedDialog.locator("#png-output-height").fill("360");
    await reopenedDialog.locator("#png-output-height").press("Enter");
    await reopenedDialog.getByRole("button", { name: "PNG出力" }).click();

    const userDataPath = resolve(launched.tempDir, "user-data");
    let pngPath = "";
    await expect.poll(() => {
      if (!existsSync(userDataPath)) return false;
      const pngName = readdirSync(userDataPath).find((name) => (
        name.startsWith("mmd_capture_") && name.endsWith(".png")
      ));
      if (!pngName) return false;
      pngPath = resolve(userDataPath, pngName);
      return existsSync(pngPath);
    }, { timeout: 30_000 }).toBe(true);

    const pngBytes = readFileSync(pngPath);
    expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngBytes.readUInt32BE(16)).toBe(640);
    expect(pngBytes.readUInt32BE(20)).toBe(360);
  } finally {
    await launched.close();
  }
});

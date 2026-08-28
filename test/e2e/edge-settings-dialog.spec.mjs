import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function openEdgeSettingsDialog(page) {
  await page.locator('.app-menu-trigger[data-i18n="menu.view"]').click();
  await page.locator('[data-menu-command="view.edgeSettings"]').click();
  const dialog = page.locator('[data-popup-id="edge-settings"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

test("エッジ幅の均一化設定をUIとプロジェクトで維持する", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    let dialog = await openEdgeSettingsDialog(page);
    const uniformWidth = dialog.locator('[data-edge-uniform-width="true"]');
    await expect(uniformWidth).not.toBeChecked();
    await uniformWidth.check();

    const exported = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(exported.effects.modelEdgeUniformWidthEnabled).toBe(true);

    await dialog.locator(".app-menu-dialog-close").click();
    dialog = await openEdgeSettingsDialog(page);
    await expect(dialog.locator('[data-edge-uniform-width="true"]')).toBeChecked();

    await dialog.locator(".app-menu-dialog-close").click();
    await page.evaluate(async (project) => {
      await window.mmdModokiE2e.importProjectState(project);
    }, exported);

    dialog = await openEdgeSettingsDialog(page);
    await expect(dialog.locator('[data-edge-uniform-width="true"]')).toBeChecked();
  } finally {
    await launched.close();
  }
});

import { expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function aliciaDanceFiles(root) {
  const directory = process.env.MMD_RC_ALICIA_DIR ?? resolve(root, "local-references/model/Alicia");
  return { character: resolve(directory, "MMD/Alicia_solid.pmx"), motion: resolve(directory, "MMD Motion/2分ループステップ20.vmd") };
}

export function hasAliciaDance({ character, motion }) {
  return existsSync(character) && existsSync(motion);
}

export async function loadAliciaDance(app, page, { character, motion }) {
  const index = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models.length);
  expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), character)).not.toBeNull();
  await page.locator("#info-model-select").selectOption(String(index));
  await app.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, motion);
  await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
  await page.locator('[data-menu-command="file.openMotion"]').click();
  await expect.poll(() => page.evaluate(i => window.mmdModokiE2e.exportProjectState().scene.models[i]?.motionImports, index), { timeout: 45000 })
    .toContainEqual({ type: "vmd", path: motion });
}

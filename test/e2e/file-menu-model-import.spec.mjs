import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

test("モデル・アクセサリ読込からPMXとPLYを読み込む", async () => {
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await launched.app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async options => {
        const extensions = options.filters[0].extensions;
        if ([...extensions].sort().join() !== "bpmx,obj,ply,pmd,pmx,splat,spz,stl,x") throw new Error("Unexpected model file filter: " + extensions);
        return { canceled: false, filePaths: [paths.shift()] };
      };
    }, [resolve(root, "test/fixtures/external-parent/tofu.pmx"), resolve(root, "test/fixtures/accessory/static-triangle.ply")]);

    const file = page.locator('[data-i18n="menu.file"]');
    const openModel = page.getByRole("menuitem", { name: "モデル・アクセサリ読込..." });
    await file.click();
    for (const [scope, label] of [["Model", "モデル"], ["Camera", "カメラ"]]) {
      await expect(page.locator(`[data-menu-command="file.export${scope}Vmd"]`)).toHaveText(`VMD${label}モーション出力...`);
      await expect(page.locator(`[data-menu-command="file.export${scope}Bvmd"]`)).toHaveText(`BVMD${label}モーション出力（UTF-8）...`);
    }
    await openModel.click();
    await expect(page.locator("#model-comment-notice-meta")).toContainText("PMX");
    await page.locator("#model-comment-notice-ok").click();
    const models = page.locator("#info-model-select");
    await expect(models).toHaveValue("0");
    await file.click();
    await openModel.click();
    await expect(models).toHaveValue("__accessory__:0");
    await expect(page.locator("#info-accessory-kind")).toHaveText("PLY");
    await expect(models.locator('option[value="0"]')).toHaveCount(1);
  } finally {
    await launched.close();
  }
});

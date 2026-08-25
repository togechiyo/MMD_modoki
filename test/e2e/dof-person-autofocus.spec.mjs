import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("DoFオートフォーカスを既定選択としてproject保存復元できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((path) => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="dof"]').click();

    const dofRow = page.locator('[data-effect-stack-row="dof"]');
    const focusMode = dofRow.locator('[data-effect-stack-control="dofFocusMode"]');
    await expect(focusMode).toBeVisible();
    await expect(focusMode.locator("option")).toHaveText([
      "オートフォーカス",
      "指定対象",
      "カメラ注視点",
    ]);
    await expect(focusMode).toHaveValue("person-auto");

    await expect(dofRow.locator('[data-effect-stack-value="dofFocusMode"]')).toHaveText("オートフォーカス");
    await expect(dofRow.locator('[data-effect-stack-control="dofTargetModel"]')).toHaveCount(0);
    await expect(dofRow.locator('[data-effect-stack-control="dofTargetBone"]')).toHaveCount(0);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).effects.dofFocusMode)
      .toBe("person-auto");

    await dofRow.locator('[data-effect-stack-control="dofFocusMode"]').selectOption("model-target");
    await expect(dofRow.locator('[data-effect-stack-control="dofTargetModel"]')).toHaveCount(1);
    await expect(dofRow.locator('[data-effect-stack-control="dofTargetBone"]')).toHaveCount(1);

    await dofRow.locator('[data-effect-stack-control="dofFocusMode"]').selectOption("person-auto");
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(await page.evaluate((project) => window.mmdModokiE2e.importProjectState(project), saved))
      .toEqual({ loadedModels: 1, warnings: [] });

    await expect(page.locator('[data-effect-stack-row="dof"] [data-effect-stack-control="dofFocusMode"]'))
      .toHaveValue("person-auto");
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).effects.dofFocusMode)
      .toBe("person-auto");
  } finally {
    await launched.close();
  }
});

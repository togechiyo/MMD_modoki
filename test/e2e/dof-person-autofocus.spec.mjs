import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

const countBrightCenterPixels = async (app, page) => {
  const png = await page.locator("#render-canvas").screenshot();
  return app.evaluate(({ nativeImage }, pngBase64) => {
    const image = nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
    const size = image.getSize();
    const center = image.crop({
      x: Math.floor(size.width / 4),
      y: Math.floor(size.height / 4),
      width: Math.max(1, Math.floor(size.width / 2)),
      height: Math.max(1, Math.floor(size.height / 2)),
    });
    const bitmap = center.toBitmap();
    let brightPixels = 0;
    for (let offset = 0; offset + 3 < bitmap.length; offset += 4) {
      if (bitmap[offset] > 12 || bitmap[offset + 1] > 12 || bitmap[offset + 2] > 12) {
        brightPixels += 1;
      }
    }
    return brightPixels;
  }, png.toString("base64"));
};

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

    const disabledDofProject = structuredClone(saved);
    disabledDofProject.effects.dofEnabled = true;
    disabledDofProject.effects.frameGraphPostStack = disabledDofProject.effects.frameGraphPostStack.map((entry) => (
      entry.id === "dof" ? { ...entry, enabled: false } : entry
    ));
    expect(await page.evaluate((project) => window.mmdModokiE2e.importProjectState(project), disabledDofProject))
      .toEqual({ loadedModels: 1, warnings: [] });

    await expect.poll(async () => page.evaluate(() => {
      const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
      return state.ready;
    }), { timeout: 30_000 }).toBe(true);

    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restored.effects.dofEnabled).toBe(true);
    expect(restored.effects.frameGraphPostStack.find((entry) => entry.id === "dof"))
      .toEqual({ id: "dof", enabled: false });

    await expect.poll(
      () => countBrightCenterPixels(launched.app, page),
      { timeout: 15_000 },
    ).toBeGreaterThan(100);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()))
      .toEqual({ count: 0, messages: [] });
  } finally {
    await launched.close();
  }
});

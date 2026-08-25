import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("V022-008: camera distance and FoV can reach close-up values independently", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();
    await page.locator("#info-model-select").selectOption("__camera__");

    const distance = page.locator("#bone-controls input[data-control-key='camDistance']");
    const fov = page.locator("#bone-controls input[data-control-key='camFov']");
    await distance.fill("0.25");
    await distance.press("Enter");
    await fov.fill("5");
    await fov.press("Enter");

    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getCameraKeyframePose()))
      .toMatchObject({ distance: 0.25, fov: 5 });
  } finally {
    await launched.close();
  }
});

test("V022-010: changing Runtime restores the in-memory project after reload", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();
    await page.evaluate(() => window.mmdModokiE2e.seekTo(17));
    await page.evaluate(() => { window.__runtimeReloadMarker = "before"; });

    await page.locator('.app-menu-trigger[data-i18n="menu.physics"]').click();
    await page.locator('[data-menu-command="physics.settings"]').click();
    await page.locator(".popup-form select").first().selectOption("wasm");
    await page.waitForFunction(() => window.__runtimeReloadMarker !== "before");
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(1);
    expect((await page.evaluate(() => window.mmdModokiE2e.exportProjectState())).scene.currentFrame).toBe(17);
  } finally {
    await launched.close();
  }
});

test("V022-011: changing Bullet backend with a loaded model is deferred without replacing the live runtime", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    expect(await page.evaluate((filePath) => window.mmdModokiE2e.loadModel(filePath), modelPath))
      .not.toBeNull();

    const before = await page.evaluate(() => window.mmdModokiE2e.getPhysicsRuntimeState());
    const requested = before.active === "Bullet SPR" ? "bullet-mpr" : "bullet-spr";
    await page.locator('.app-menu-trigger[data-i18n="menu.physics"]').click();
    await page.locator('[data-menu-command="physics.settings"]').click();
    await page.locator(".popup-form select").nth(1).selectOption(requested);

    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getPhysicsRuntimeState()))
      .toEqual({ preferred: requested, active: before.active });
  } finally {
    await launched.close();
  }
});

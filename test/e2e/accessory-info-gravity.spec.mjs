import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const accessoryPath = resolve(repoRoot, "test", "fixtures", "accessory", "simple-triangle.x");
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");

test("lists an X accessory in Info and uses the former slot for gravity", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await expect(page.locator("#accessory-section")).toHaveCount(0);
    await expect(page.locator("#viewport-overlay")).toBeVisible();
    await expect(page.locator("#viewport-axis-space-toggle")).toHaveCount(0);
    await expect(page.locator("#viewport-axis-handle")).toBeVisible();
    await expect(page.locator("#gravity-section")).toBeVisible();
    await expect(page.locator("#btn-gravity-keyframe")).toBeDisabled();

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadModel(filePath),
      modelPath,
    )).not.toBeNull();

    const loaded = await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadAccessory(filePath),
      accessoryPath,
    );
    expect(loaded).toBe(true);
    await expect(page.locator("#viewport-overlay")).toBeHidden();
    await expect(page.locator(".viewport-axis-handle-tool")).toHaveCount(6);

    const targetSelect = page.locator("#info-model-select");
    await expect(targetSelect.locator("optgroup")).toHaveCount(0);
    await expect(targetSelect.locator('option[value="0"]')).toContainText("tofu");
    await expect(targetSelect.locator('option[value="__accessory__:0"]')).toContainText("simple-triangle [X]");
    await expect(targetSelect).toHaveValue("__accessory__:0");
    await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "accessory");
    const accessoryLayoutEdgeDelta = await page.evaluate(() => {
      const root = document.querySelector(".bottom-panel-inner")?.getBoundingClientRect();
      const accessory = document.querySelector("#bone-section")?.getBoundingClientRect();
      if (!root || !accessory) return Number.POSITIVE_INFINITY;
      return Math.abs(accessory.right - (root.left + root.width / 2));
    });
    expect(accessoryLayoutEdgeDelta).toBeLessThan(3);
    await expect(page.locator("#accessory-info-content")).toBeVisible();
    await expect(page.locator("#accessory-transform-content")).toBeVisible();
    await expect(page.locator("#accessory-pos-x")).toBeEnabled();
    await expect(page.locator("#accessory-scale")).toHaveValue("1");
    expect(await page.locator("#accessory-pos-x").evaluate((input) => input.closest("section")?.id)).toBe("bone-section");
    await expect(page.locator("#info-model-content")).toBeHidden();
    await expect(page.locator("#morph-section")).toBeHidden();
    await expect(page.locator("#gravity-section")).toBeHidden();
    await expect(page.locator("#chk-accessory-visibility")).toBeChecked();
    await expect(page.locator("#chk-accessory-shadow")).toBeChecked();
    await expect(page.locator("#btn-toolbar-mode-toggle")).toBeEnabled();
    await expect(page.locator("#btn-toolbar-mode-toggle")).toHaveText(/カメラ編/);
    await expect(page.locator("#btn-info-keyframe")).toHaveAttribute("aria-label", /アクセサリー/);

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    const shaderTargetSelect = page.locator("#shader-model-select");
    await expect(shaderTargetSelect.locator('option[value="0"]')).toContainText("tofu");
    await expect(shaderTargetSelect.locator('option[value="__accessory__:0"]')).toContainText("simple-triangle [X]");
    await expect(shaderTargetSelect).toHaveValue("__accessory__:0");
    await expect(page.locator(".shader-material-item")).toHaveCount(1);
    await expect(page.locator(".shader-material-preset")).toHaveText("Accessory Toon");
    await page.locator("#btn-toggle-shader-panel").click();

    const beforeHandleDrag = await page.evaluate(() => {
      const state = window.mmdModokiE2e.exportProjectState();
      return {
        accessory: state.accessories?.[0]?.transform ?? null,
        camera: state.camera,
      };
    });
    expect(beforeHandleDrag.accessory).not.toBeNull();
    const moveXHandle = page.locator('.viewport-axis-handle-tool[data-handle-kind="move"][data-handle-axis="x"]');
    const handleBounds = await moveXHandle.boundingBox();
    expect(handleBounds).not.toBeNull();
    const handleCenterX = handleBounds.x + handleBounds.width / 2;
    const handleCenterY = handleBounds.y + handleBounds.height / 2;
    await page.mouse.move(handleCenterX, handleCenterY);
    await page.mouse.down();
    await page.mouse.move(handleCenterX, handleCenterY - 50);
    await page.mouse.up();

    const afterHandleDrag = await page.evaluate(() => {
      const state = window.mmdModokiE2e.exportProjectState();
      return {
        accessory: state.accessories?.[0]?.transform ?? null,
        camera: state.camera,
      };
    });
    expect(afterHandleDrag.accessory?.position.x).toBeCloseTo(beforeHandleDrag.accessory.position.x + 1, 5);
    expect(afterHandleDrag.camera).toEqual(beforeHandleDrag.camera);
    await expect(page.locator("#accessory-pos-x")).toHaveValue("1.0");

    await page.locator("#accessory-pos-x").fill("1");
    await page.locator("#accessory-pos-x").press("Enter");
    await expect(page.locator("#btn-info-keyframe")).toBeEnabled();
    await page.locator("#btn-info-keyframe").click();
    const accessoryTrack = await page.evaluate(
      () => window.mmdModokiE2e.exportProjectState().keyframes.accessoryTransformAnimations?.[0] ?? null,
    );
    expect(accessoryTrack).not.toBeNull();

    await page.locator("#chk-accessory-visibility").uncheck();
    await page.locator("#chk-accessory-shadow").uncheck();
    const savedAccessory = await page.evaluate(
      () => window.mmdModokiE2e.exportProjectState().accessories?.[0] ?? null,
    );
    expect(savedAccessory?.visible).toBe(false);
    expect(savedAccessory?.castsShadow).toBe(false);

    await page.locator("#physics-gravity-accel").evaluate((input) => {
      input.value = "42";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const savedGravity = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().physics);
    expect(savedGravity.gravityAcceleration).toBe(42);

    await page.locator("#btn-toolbar-mode-toggle").click();
    await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "camera");
    await expect(targetSelect).toHaveValue("__camera__");
    await expect(page.locator("#accessory-info-content")).toBeHidden();
    await expect(page.locator("#accessory-transform-content")).toBeHidden();
    await expect(page.locator("#gravity-section")).toBeVisible();
    await expect(page.locator("#btn-toolbar-mode-toggle")).toBeEnabled();
    await expect(page.locator("#btn-toolbar-mode-toggle")).toHaveText(/モデル編/);

    await page.locator("#btn-toolbar-mode-toggle").click();
    await expect(targetSelect).toHaveValue("__accessory__:0");
    await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "accessory");
    await expect(page.locator("#btn-toolbar-mode-toggle")).toHaveText(/カメラ編/);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});

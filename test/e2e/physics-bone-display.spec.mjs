import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/dynamic-follower.pmx");

test("keeps PMX-visible physics bones on the timeline but hides them from the viewport by default", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const viewMenu = page.locator('.app-menu-trigger[data-i18n="menu.view"]');
    const physicsBonesItem = page.locator('[data-menu-command="view.togglePhysicsBones"]');

    await viewMenu.click();
    await expect(physicsBonesItem).toHaveCount(1);
    await expect(physicsBonesItem).toHaveText("物理ボーンを表示");
    await expect(physicsBonesItem).toHaveAttribute("aria-checked", "false");
    await expect(physicsBonesItem).toBeDisabled();
    await expect(page.locator('[data-menu-command="view.toggleViewportPhysicsBones"]')).toHaveCount(0);
    await expect(page.locator('[data-menu-command="view.toggleTimelinePhysicsBones"]')).toHaveCount(0);

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadModel(filePath),
      modelPath,
    )).not.toBeNull();

    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getTimelineTracks().map((track) => track.name),
    )).toContain("Camera Output");
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getViewportVisibleBoneNames(),
    )).not.toContain("Camera Output");

    await page.keyboard.press("Escape");
    await viewMenu.click();
    await expect(physicsBonesItem).toBeEnabled();
    await physicsBonesItem.click();
    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getViewportVisibleBoneNames(),
    )).toContain("Camera Output");
    await viewMenu.click();
    await expect(physicsBonesItem).toHaveAttribute("aria-checked", "true");

    await physicsBonesItem.click();
    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getViewportVisibleBoneNames(),
    )).not.toContain("Camera Output");
    await expect.poll(() => page.evaluate(
      () => window.mmdModokiE2e.getTimelineTracks().map((track) => track.name),
    )).toContain("Camera Output");
    await viewMenu.click();
    await expect(physicsBonesItem).toHaveAttribute("aria-checked", "false");
  } finally {
    await launched.close();
  }
});

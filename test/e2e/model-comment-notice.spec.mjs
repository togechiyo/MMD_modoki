import { test, expect } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const modelPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");

test("PMX model comment requires OK and Cancel prevents loading", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.evaluate((path) => {
      void window.mmdModokiE2e.loadModelInteractively(path);
    }, modelPath);
    const notice = page.locator("#model-comment-notice");
    await expect(notice).toBeVisible();
    await expect(page.locator("#model-comment-notice-title")).toContainText("外部親確認用・豆腐");
    await expect(page.locator("#model-comment-notice-title")).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator("#model-comment-notice-title")).toHaveCSS("font-weight", "700");
    await expect(page.locator("#model-comment-notice-meta")).toHaveText("PMX ver2.0");
    await expect(page.locator("#model-comment-notice-body")).toContainText("外部親登録の確認用モデル");
    await expect(notice).toHaveCSS("left", "14px");
    await expect(notice).toHaveCSS("border-top-color", "rgba(255, 255, 255, 0.18)");
    await expect(page.locator("#model-comment-notice-ok")).toHaveCSS("border-top-color", "rgb(255, 121, 184)");
    await expect(page.locator("#model-comment-notice-ok")).toHaveCSS("color", "rgb(255, 255, 255)");
    const shortNoticeHeight = await notice.evaluate((element) => element.getBoundingClientRect().height);
    await page.locator("#model-comment-notice-body").evaluate((element) => {
      element.textContent = Array.from({ length: 24 }, (_, index) => `モデル注記 ${index + 1}`).join("\n");
    });
    const longNoticeHeight = await notice.evaluate((element) => element.getBoundingClientRect().height);
    expect(longNoticeHeight).toBeGreaterThan(shortNoticeHeight + 100);
    expect(longNoticeHeight).toBeLessThanOrEqual(540);
    await page.locator("#model-comment-notice-cancel").click();
    expect(await page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(0);

    await page.evaluate((path) => {
      void window.mmdModokiE2e.loadModelInteractively(path);
    }, modelPath);
    await expect(notice).toBeVisible();
    await page.locator("#model-comment-notice-ok").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getLoadedModelCount())).toBe(1);
    await expect(notice).toBeHidden();
  } finally {
    await launched.close();
  }
});

import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");
const missingModelPath = resolve(repoRoot, "test", "fixtures", "missing-model.pmx");

test("shows persistent localized model-load failures at the viewport top right", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    const failedResult = await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadModel(filePath),
      missingModelPath,
    );
    expect(failedResult).toBeNull();

    const statusHost = page.locator("#viewport-runtime-status-host");
    const statusCard = statusHost.locator(".viewport-runtime-status");
    await expect(statusHost).toBeVisible();
    await expect(statusCard).toHaveAttribute("data-level", "error");
    await expect(statusCard.locator(".viewport-runtime-status__title")).toHaveText("モデルを読み込めませんでした");
    await expect(statusCard.locator(".viewport-runtime-status__detail")).toContainText("missing-model.pmx");
    await expect(statusCard.getByRole("button", { name: "ログを開く" })).toBeVisible();
    await expect(statusCard.getByRole("button", { name: "閉じる" })).toBeVisible();
    const placement = await page.evaluate(() => {
      const viewport = document.getElementById("viewport-container")?.getBoundingClientRect();
      const topBar = document.getElementById("viewport-top-bar")?.getBoundingClientRect();
      const status = document.getElementById("viewport-runtime-status-host")?.getBoundingClientRect();
      if (!viewport || !topBar || !status) return null;
      return {
        rightInset: viewport.right - status.right,
        topGap: status.top - topBar.bottom,
        insideViewport: status.left >= viewport.left && status.right <= viewport.right,
      };
    });
    expect(placement).not.toBeNull();
    expect(placement.insideViewport).toBe(true);
    expect(placement.rightInset).toBeGreaterThanOrEqual(8);
    expect(placement.topGap).toBeGreaterThanOrEqual(0);

    await page.evaluate(() => window.mmdI18n?.setLocale("en"));
    await expect(statusCard.locator(".viewport-runtime-status__title")).toHaveText("Could not load the model");
    await expect(statusCard.getByRole("button", { name: "Open log" })).toBeVisible();

    await statusCard.getByRole("button", { name: "Dismiss" }).click();
    await expect(statusHost).toBeHidden();

    const loadedResult = await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadModel(filePath),
      modelPath,
    );
    expect(loadedResult).not.toBeNull();
    await expect(statusHost).toBeVisible();
    await expect(statusCard).toHaveAttribute("data-level", "success");
    await expect(statusCard.locator(".viewport-runtime-status__title")).toHaveText("Model loaded");
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});

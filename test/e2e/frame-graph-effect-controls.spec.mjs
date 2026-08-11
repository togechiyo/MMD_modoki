import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("FrameGraph詳細操作と並べ替え後もruntimeを維持できる", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.locator("#btn-toggle-shader-panel").click();
    await expect(page.locator("#shader-panel")).toBeVisible();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-add-post").click();

    const addSsgiButton = page.locator('[data-effect-add-post="ssgi"]');
    await expect(addSsgiButton).toHaveText("SSGI");
    await addSsgiButton.click();

    const ssgiRow = page.locator('[data-effect-stack-row="ssgi"]');
    await expect(ssgiRow).toBeVisible();
    await expect(ssgiRow.locator(".effect-layer-name")).toHaveText("SSGI");

    const sliders = ssgiRow.locator('input[type="range"][data-effect-stack-control]');
    await expect(sliders).toHaveCount(2);
    for (let index = 0; index < await sliders.count(); index += 1) {
      await expect(sliders.nth(index)).toHaveAttribute("min", "0");
      await expect(sliders.nth(index)).toHaveAttribute("max", "100");
      await expect(sliders.nth(index)).toHaveAttribute("step", "1");
    }

    const strength = ssgiRow.locator('[data-effect-stack-control="ssgiStrength"]');
    await strength.evaluate((input) => {
      input.value = "75";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(ssgiRow.locator('[data-effect-stack-value="ssgiStrength"]')).toHaveText("0.75");

    const radius = ssgiRow.locator('[data-effect-stack-control="ssgiSampleRadius"]');
    await radius.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(ssgiRow.locator('[data-effect-stack-value="ssgiSampleRadius"]')).toHaveText("129px");

    await page.locator("#btn-effect-add-post").click();
    await page.locator('[data-effect-add-post="luminous"]').click();

    const luminousRow = page.locator('[data-effect-stack-row="luminous"]');
    await expect(luminousRow).toBeVisible();
    const luminousRadius = luminousRow.locator('[data-effect-stack-control="luminousRadius"]');
    await expect(luminousRadius).toHaveAttribute("min", "0");
    await expect(luminousRadius).toHaveAttribute("max", "100");
    await luminousRadius.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(luminousRow.locator('[data-effect-stack-value="luminousRadius"]')).toHaveText("65px");

    const luminousDragHandle = luminousRow.locator('[data-effect-stack-drag="luminous"]');
    const ssgiTargetBox = await ssgiRow.boundingBox();
    if (!ssgiTargetBox) throw new Error("SSGI stack row has no bounding box");
    await luminousDragHandle.dragTo(ssgiRow, {
      targetPosition: { x: 20, y: Math.max(1, ssgiTargetBox.height - 2) },
    });

    await expect.poll(async () => (
      page.locator("[data-effect-stack-row]").evaluateAll((rows) => (
        rows.map((row) => row.getAttribute("data-effect-stack-row"))
      ))
    )).toEqual(["ssgi", "luminous"]);
    await page.waitForFunction(() => {
      const state = window.mmdModokiE2e?.getFrameGraphPostEffectsState();
      return state?.backend === "frameGraph"
        && state.ready
        && state.executedFrameCount >= 2
        && state.stack.join(",") === "luminous,ssgi";
    });

    const reloadFrameGraph = page.locator("#btn-effect-reload-framegraph");
    await expect(reloadFrameGraph).toBeEnabled();
    await expect(reloadFrameGraph).toHaveAttribute("title", "FrameGraphを再読み込み");
    await reloadFrameGraph.click();

    await expect(page.getByText("FrameGraphを再読み込みしました", { exact: true })).toBeVisible();
    await expect(page.locator('[data-effect-stack-row="ssgi"]')).toBeVisible();
    await expect(page.locator('[data-effect-stack-row="luminous"]')).toBeVisible();
    await expect(page.locator('[data-effect-stack-value="luminousRadius"]')).toHaveText("65px");
  } finally {
    await launched.close();
  }
});

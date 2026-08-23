import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

async function seek(page, frame) {
  const input = page.locator("#current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
  await expect(input).toHaveValue(String(frame));
}

test("registers, evaluates, and serializes light keyframes", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadModel(filePath),
      modelPath,
    )).not.toBeNull();
    await page.locator("#btn-toolbar-mode-toggle").click();
    await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "camera");
    await expect.poll(() => page.locator("#timeline-label-canvas").evaluate((element) => element.style.height)).toBe("128px");
    await expect(page.locator("#timeline-selection-label")).toContainText("[カメラ] カメラ");
    await expect(page.locator("#light-direction-x")).toHaveCSS("accent-color", "rgb(224, 113, 123)");
    await expect(page.locator("#btn-light-keyframe")).toBeDisabled();
    await expect(page.locator("#btn-light-keyframe")).toHaveText("");

    await setRange(page, "#light-color-r", 255);
    await setRange(page, "#light-direction-x", 0);
    await setRange(page, "#light-direction-y", -1);
    await setRange(page, "#light-direction-z", 0);
    await expect(page.locator("#btn-light-keyframe")).toHaveText("♢");
    await page.locator("#btn-light-keyframe").click();
    await expect(page.locator("#btn-light-keyframe")).toHaveText("♦");

    await seek(page, 30);
    await setRange(page, "#light-color-r", 0);
    await setRange(page, "#light-direction-x", 1);
    await setRange(page, "#light-direction-y", 0);
    await setRange(page, "#light-direction-z", 0);
    await page.locator("#btn-light-keyframe").click();

    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.keyframes.lightAnimation.frameNumbers).toEqual([0, 30]);
    expect(saved.keyframes.lightAnimation.colors[0]).toBeCloseTo(2, 6);
    expect(saved.keyframes.lightAnimation.colors[3]).toBeCloseTo(0, 6);

    await seek(page, 15);
    const evaluated = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting);
    expect(evaluated.lightColor.r).toBeCloseTo(1, 5);
    expect(evaluated.x).toBeCloseTo(0.5, 5);
    expect(evaluated.y).toBeCloseTo(-0.5, 5);

    await page.evaluate(
      async (project) => window.mmdModokiE2e.importProjectState(project),
      saved,
    );
    await seek(page, 15);
    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restored.keyframes.lightAnimation).toEqual(saved.keyframes.lightAnimation);
    expect(restored.lighting.lightColor.r).toBeCloseTo(1, 5);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});

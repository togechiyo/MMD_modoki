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

test("registers, evaluates, and serializes visible shadow controls", async () => {
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
    await expect(page.locator("#light-shadow-color-r")).toHaveCSS("accent-color", "rgb(111, 159, 218)");
    await expect(page.locator("#btn-shadow-keyframe")).toBeDisabled();
    await expect(page.locator("#btn-shadow-keyframe")).toHaveText("");

    await setRange(page, "#light-shadow-color-r", 51);
    await setRange(page, "#light-shadow-color-g", 102);
    await setRange(page, "#light-shadow-color-b", 153);
    await setRange(page, "#light-toon-shadow-influence", 25);
    await setRange(page, "#light-shadow-max-z", 1000);
    await setRange(page, "#light-intensity", 50);
    await expect(page.locator("#btn-shadow-keyframe")).toHaveText("♢");
    await page.locator("#btn-shadow-keyframe").click();
    await expect(page.locator("#btn-shadow-keyframe")).toHaveText("♦");

    await seek(page, 30);
    await setRange(page, "#light-shadow-color-r", 204);
    await setRange(page, "#light-shadow-color-g", 153);
    await setRange(page, "#light-shadow-color-b", 102);
    await setRange(page, "#light-toon-shadow-influence", 75);
    await setRange(page, "#light-shadow-max-z", 5000);
    await setRange(page, "#light-intensity", 150);
    await page.locator("#btn-shadow-keyframe").click();

    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.keyframes.shadowAnimation.frameNumbers).toEqual([0, 30]);
    expect(saved.keyframes.shadowAnimation.colors).toEqual([0.2, 0.4, 0.6, 0.8, 0.6, 0.4]);
    expect(saved.keyframes.shadowAnimation.toonInfluences).toEqual([0.25, 0.75]);
    expect(saved.keyframes.shadowAnimation.maxZs).toEqual([1000, 5000]);
    expect(saved.keyframes.shadowAnimation.lightIntensities).toEqual([0.5, 1.5]);

    await seek(page, 15);
    const evaluated = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting);
    expect(evaluated.shadowColor).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    expect(evaluated.toonShadowInfluence).toBeCloseTo(0.5, 5);
    expect(evaluated.shadowMaxZ).toBeCloseTo(3000, 5);
    expect(evaluated.intensity).toBeCloseTo(1, 5);

    await page.evaluate(
      async (project) => window.mmdModokiE2e.importProjectState(project),
      saved,
    );
    await seek(page, 15);
    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restored.keyframes.shadowAnimation).toEqual(saved.keyframes.shadowAnimation);
    expect(restored.lighting.shadowColor).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    expect(restored.lighting.toonShadowInfluence).toBeCloseTo(0.5, 5);
    expect(restored.lighting.shadowMaxZ).toBeCloseTo(3000, 5);
    expect(restored.lighting.intensity).toBeCloseTo(1, 5);
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});

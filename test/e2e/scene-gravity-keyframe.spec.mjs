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

test("registers, evaluates, and serializes visible gravity controls", async () => {
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
    await expect(page.locator("#btn-gravity-keyframe")).toBeEnabled();

    await setRange(page, "#physics-gravity-accel", 98);
    await setRange(page, "#physics-gravity-dir-x", 0);
    await setRange(page, "#physics-gravity-dir-y", -100);
    await setRange(page, "#physics-gravity-dir-z", 0);
    await page.locator("#btn-gravity-keyframe").click();

    await seek(page, 30);
    await setRange(page, "#physics-gravity-accel", 50);
    await setRange(page, "#physics-gravity-dir-x", 100);
    await setRange(page, "#physics-gravity-dir-y", 0);
    await setRange(page, "#physics-gravity-dir-z", 20);
    await page.locator("#btn-gravity-keyframe").click();

    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(saved.keyframes.gravityAnimation.frameNumbers).toEqual([0, 30]);
    expect(saved.keyframes.gravityAnimation.accelerations).toEqual([98, 50]);
    expect(saved.keyframes.gravityAnimation.directions).toEqual([0, -100, 0, 100, 0, 20]);

    await seek(page, 15);
    const evaluated = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().physics);
    expect(evaluated.gravityAcceleration).toBeCloseTo(74, 5);
    expect(evaluated.gravityDirection).toEqual({ x: 50, y: -50, z: 10 });

    await page.evaluate(
      async (project) => window.mmdModokiE2e.importProjectState(project),
      saved,
    );
    await seek(page, 15);
    const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(restored.keyframes.gravityAnimation).toEqual(saved.keyframes.gravityAnimation);
    expect(restored.physics.gravityAcceleration).toBeCloseTo(74, 5);
    expect(restored.physics.gravityDirection).toEqual({ x: 50, y: -50, z: 10 });
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});

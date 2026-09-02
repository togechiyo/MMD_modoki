import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");

async function seek(page, frame) {
  const input = page.locator("#current-frame");
  await input.fill(String(frame));
  await input.press("Enter");
  await expect(input).toHaveValue(String(frame));
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((input, nextValue) => {
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("playback locks only scene categories that have keyframes", async () => {
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

    // Keep playback alive without giving any scene category ownership.
    await page.locator("#info-model-select").selectOption("0");
    await selectCenterBone(page);
    await seek(page, 60);
    const modelX = page.locator("#bone-controls input[data-control-key='tx']");
    await modelX.fill("1");
    await modelX.press("Enter");
    await expect(page.locator("#btn-bone-keyframe")).toBeEnabled();
    await page.locator("#btn-bone-keyframe").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    const cameraFov = page.locator("#bone-controls input[data-control-key='camFov']");
    await seek(page, 0);

    const playbackToggle = page.locator("#viewport-seek-play-toggle");
    await playbackToggle.click();
    await expect(cameraFov).toBeEnabled();
    await expect(page.locator("#viewport-tool-fov")).toBeEnabled();
    await expect(page.locator("#light-color-r")).toBeEnabled();
    await expect(page.locator("#light-shadow-color-r")).toBeEnabled();
    await expect(page.locator("#physics-gravity-accel")).toBeEnabled();

    await cameraFov.fill("45");
    await cameraFov.press("Enter");
    await setRange(page, "#light-color-r", 200);
    await setRange(page, "#physics-gravity-accel", 70);
    const liveState = await page.evaluate(() => ({
      cameraFov: window.mmdModokiE2e.getCameraKeyframePose().fov,
      lightR: window.mmdModokiE2e.exportProjectState().lighting.lightColor.r,
      gravity: window.mmdModokiE2e.exportProjectState().physics.gravityAcceleration,
    }));
    expect(liveState.cameraFov).toBeCloseTo(45, 4);
    expect(liveState.lightR).toBeCloseTo(200 / 127.5, 4);
    expect(liveState.gravity).toBeCloseTo(70, 4);
    await playbackToggle.click();

    // A light key owns only the light controls.
    await setRange(page, "#light-color-r", 200);
    await expect(page.locator("#btn-light-keyframe")).toBeEnabled();
    await page.locator("#btn-light-keyframe").click();
    await playbackToggle.click();
    await expect(page.locator("#light-color-r")).toBeDisabled();
    await expect(page.locator("#light-color-r + .range-number-input")).toBeDisabled();
    await expect(cameraFov).toBeEnabled();
    await expect(page.locator("#light-shadow-color-r")).toBeEnabled();
    await expect(page.locator("#physics-gravity-accel")).toBeEnabled();
    await playbackToggle.click();

    // Once every remaining category has a key, all corresponding editing paths lock.
    await cameraFov.fill("46");
    await cameraFov.press("Enter");
    await expect(page.locator("#btn-bone-keyframe")).toBeEnabled();
    await page.locator("#btn-bone-keyframe").click();
    await setRange(page, "#light-shadow-color-r", 200);
    await setRange(page, "#physics-gravity-accel", 70);
    await expect(page.locator("#btn-shadow-keyframe")).toBeEnabled();
    await expect(page.locator("#btn-gravity-keyframe")).toBeEnabled();
    await page.locator("#btn-shadow-keyframe").click();
    await page.locator("#btn-gravity-keyframe").click();
    await playbackToggle.click();
    await expect(cameraFov).toBeDisabled();
    await expect(page.locator("#viewport-tool-fov")).toBeDisabled();
    await expect(page.locator("#viewport-tool-distance")).toBeDisabled();
    await expect(page.locator("#viewport-tool-pan")).toBeDisabled();
    await expect(page.locator("#viewport-tool-viewcube")).toBeDisabled();
    await expect(page.locator("#light-shadow-color-r")).toBeDisabled();
    await expect(page.locator("#light-intensity")).toBeDisabled();
    await expect(page.locator("#physics-gravity-accel")).toBeDisabled();
    await expect(page.locator("#physics-gravity-accel + .range-number-input")).toBeDisabled();
    await playbackToggle.click();

    await expect(cameraFov).toBeEnabled();
    await expect(page.locator("#light-color-r")).toBeEnabled();
    await expect(page.locator("#light-shadow-color-r")).toBeEnabled();
    await expect(page.locator("#physics-gravity-accel")).toBeEnabled();
    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});

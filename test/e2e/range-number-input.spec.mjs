import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");

test("range companion number inputs revert drafts and commit on Enter", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    expect(await page.evaluate(
      async (filePath) => window.mmdModokiE2e.loadModel(filePath),
      modelPath,
    )).not.toBeNull();
    await page.locator("#btn-toolbar-mode-toggle").click();
    await expect(page.locator(".bottom-panel-inner")).toHaveAttribute("data-bottom-panel-mode", "camera");

    const lightSlider = page.locator("#light-direction-x");
    const lightNumber = page.locator("#light-direction-x + .range-number-input");
    const gravitySlider = page.locator("#physics-gravity-accel");
    const gravityNumber = page.locator("#physics-gravity-accel + .range-number-input");
    const originalLightValue = await lightNumber.inputValue();

    await lightNumber.fill("0.5");
    await gravityNumber.focus();
    await expect(lightNumber).toHaveValue(originalLightValue);

    await lightNumber.fill("0.5");
    await lightNumber.press("Enter");
    await expect(lightNumber).toHaveValue("0.5");
    await expect(lightSlider).toHaveValue("0.5");

    await gravityNumber.fill("123");
    await gravityNumber.press("Enter");
    await expect(gravityNumber).toHaveValue("123");
    await expect(gravitySlider).toHaveValue("123");
  } finally {
    await launched.close();
  }
});

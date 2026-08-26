import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");
const presets = [
  ["wgsl-full-shadow", "Full Shadow"],
  ["wgsl-cel-shadow-sharp", "Cel Shadow Sharp"],
  ["wgsl-gloss-highlight", "Gloss Highlight"],
  ["wgsl-semi-matte-highlight", "Semi Matte Highlight"],
  ["wgsl-matte-highlight", "Matte Highlight"],
];

test("renders the unified-shadow-color material presets", async () => {
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

    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();

    for (const [presetId, label] of presets) {
      await expect(page.locator(`#shader-preset-select option[value="${presetId}"]`))
        .toHaveText(label);
      await page.locator("#shader-preset-select").selectOption(presetId);
      await page.locator("#btn-shader-apply-all").click();
      await expect(page.locator(".shader-material-preset")).toHaveText([label, label]);
      await page.evaluate(async () => {
        for (let frame = 0; frame < 3; frame += 1) {
          await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        }
      });
      expect(await page.evaluate(
        () => window.mmdModokiE2e.getWebGpuValidationDiagnostics(),
      )).toMatchObject({ count: 0 });
    }

    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});

import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");

test("applies and restores the Self Shadow material preset", async () => {
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
    await expect(page.locator('#shader-preset-select option[value="wgsl-self-shadow"]'))
      .toHaveText("Self Shadow");
    await page.locator("#shader-preset-select").selectOption("wgsl-self-shadow");
    await page.locator("#btn-shader-apply-all").click();
    await expect(page.locator(".shader-material-preset"))
      .toHaveText(["Self Shadow", "Self Shadow"]);

    const savedProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(savedProject.scene.models[0].materialShaders).toHaveLength(2);
    expect(savedProject.scene.models[0].materialShaders.every(
      ({ presetId }) => presetId === "wgsl-self-shadow",
    )).toBe(true);

    const imported = await page.evaluate(
      (project) => window.mmdModokiE2e.importProjectState(project),
      savedProject,
    );
    expect(imported.warnings).toEqual([]);
    await expect(page.locator(".shader-material-preset"))
      .toHaveText(["Self Shadow", "Self Shadow"]);

    await page.evaluate(async () => {
      for (let frame = 0; frame < 10; frame += 1) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    });
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getWebGpuValidationDiagnostics(),
    )).toMatchObject({ count: 0 });
  } finally {
    await launched.close();
  }
});

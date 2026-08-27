import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");
const presets = [
  ["wgsl-sss-standard", "SSS Standard"],
  ["wgsl-sss-skin", "SSS Skin"],
];

test("hides rejected SSS presets while retaining legacy project compatibility", async () => {
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

    for (const [presetId] of presets) {
      await expect(page.locator(`#shader-preset-select option[value="${presetId}"]`))
        .toHaveCount(0);
    }

    const materialKeys = await page.locator(".shader-material-item").evaluateAll(
      (items) => items.map((item) => item.title),
    );
    expect(materialKeys).toHaveLength(2);
    const baseProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());

    for (const [presetId, label] of presets) {
      const legacyProject = structuredClone(baseProject);
      legacyProject.scene.models[0].materialShaders = materialKeys.map((materialKey) => ({
        materialKey,
        presetId,
      }));
      const imported = await page.evaluate(
        (project) => window.mmdModokiE2e.importProjectState(project),
        legacyProject,
      );
      expect(imported.warnings).toEqual([]);
      await expect(page.locator(".shader-material-preset")).toHaveText([label, label]);
      await expect(page.locator(`#shader-preset-select option[value="${presetId}"]`))
        .toHaveCount(0);
    }

    await page.locator("#shader-preset-select").selectOption("wgsl-mmd-standard");
    await page.locator("#btn-shader-apply-all").click();
    await expect(page.locator(".shader-material-preset")).toHaveText(["MMD Standard", "MMD Standard"]);
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getWgslSssSkinDiagnostics(),
    )).toMatchObject({
      materialCount: 0,
      configurationEnabled: false,
    });

    expect(pageErrors).toEqual([]);
  } finally {
    await launched.close();
  }
});

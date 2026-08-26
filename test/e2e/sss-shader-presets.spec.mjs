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

test("applies the deferred Standard preset and screen-space SSS Skin preset", async () => {
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
      if (presetId === "wgsl-sss-skin") {
        const diagnostics = await page.evaluate(
          () => window.mmdModokiE2e.getWgslSssSkinDiagnostics(),
        );
        expect(diagnostics).toMatchObject({
          materialCount: 2,
          visibleMaterialCount: 2,
          configurationEnabled: true,
          prePassEnabled: true,
          metersPerUnit: 0.08,
          diffusionProfile: [2.4, 0.9, 0.35],
        });
        expect(diagnostics.profileIndex).toBeGreaterThanOrEqual(0);
        expect(diagnostics.standardMaterialPatch).toMatchObject({
          wgslProducerStatePresent: true,
          wgslColorSeparationPresent: true,
        });
      }
    }

    const savedProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(savedProject.scene.models[0].materialShaders).toHaveLength(2);
    expect(savedProject.scene.models[0].materialShaders.every(
      ({ presetId }) => presetId === "wgsl-sss-skin",
    )).toBe(true);

    const imported = await page.evaluate(
      (project) => window.mmdModokiE2e.importProjectState(project),
      savedProject,
    );
    expect(imported.warnings).toEqual([]);
    await expect(page.locator(".shader-material-preset")).toHaveText(["SSS Skin", "SSS Skin"]);
    expect(await page.evaluate(
      () => window.mmdModokiE2e.getWgslSssSkinDiagnostics(),
    )).toMatchObject({
      materialCount: 2,
      configurationEnabled: true,
    });

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

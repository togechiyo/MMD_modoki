import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(repoRoot, "test", "fixtures", "external-parent", "tofu.pmx");
const presets = [
  ["wgsl-sss-standard", "SSS Standard"],
  ["wgsl-sss-skin", "SSS Skin"],
  ["wgsl-owned-sss-skin", "SSS Diffusion Skin"],
  ["wgsl-owned-sss-wax", "SSS Diffusion Wax"],
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
      // Exercise the old format, without a newer mode bank overriding it.
      delete legacyProject.scene.models[0].materialSettingsByMode;
      legacyProject.scene.models[0].materialShaders = materialKeys.map((materialKey) => ({
        materialKey,
        presetId,
      }));
      const imported = await page.evaluate(
        (project) => window.mmdModokiE2e.importProjectState(project),
        legacyProject,
      );
      expect(imported.warnings).toEqual([]);
      const restored = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(restored.scene.models[0].materialShaders).toHaveLength(materialKeys.length);
      expect(restored.scene.models[0].materialShaders.every(item => item.presetId === presetId)).toBe(true);
      await page.locator("#info-model-select").selectOption("0");
      await page.locator('[data-effect-tab="materials"]').click();
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

    await page.locator('[data-i18n="menu.window"]').click();
    await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    const dialog = page.locator('[data-popup-id="experimental-settings"]');
    const pbrMode = dialog.getByLabel("PBRモード", { exact: true });
    await pbrMode.check();
    await expect(pbrMode).toBeEnabled();
    await dialog.locator(".app-menu-dialog-close").click();
    for (const preset of ["pbr-skin", "pbr-skin-face", "pbr-sss-wax"]) {
      const option = page.locator(`#shader-preset-select option[value="${preset}"]`);
      await expect(option).toHaveCount(1);
      const label = await option.textContent();
      await page.locator("#shader-preset-select").selectOption(preset);
      await page.locator("#btn-shader-apply-all").click();
      await expect(page.locator(".shader-material-preset")).toHaveText([label, label]);
    }
    await page.locator('[data-i18n="menu.window"]').click();
    await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    await pbrMode.uncheck();
    await expect(pbrMode).toBeEnabled();
    await dialog.locator(".app-menu-dialog-close").click();
    for (const [presetId] of presets) await expect(page.locator(`#shader-preset-select option[value="${presetId}"]`)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
  } finally {
    await launched.close();
  }
});

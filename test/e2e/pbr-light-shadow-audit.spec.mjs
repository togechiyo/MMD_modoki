import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki, selectCenterBone } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
function changedPixels(a, b) {
  const left = PNG.sync.read(a), right = PNG.sync.read(b);
  expect([left.width, left.height]).toEqual([right.width, right.height]);
  let count = 0;
  for (let i = 0; i < left.data.length; i += 4) {
    // Runtime status toasts overlay the canvas top; compare rendered geometry below them.
    if (Math.floor(i / 4 / left.width) < left.height * 0.25) continue;
    if ([0, 1, 2].some(c => Math.abs(left.data[i + c] - right.data[i + c]) > 8)) count++;
  }
  return count;
}

for (const backend of ["classic", "frameGraph"]) {
  test(`directional occlusion and ambient color audit ${backend}`, async ({}, testInfo) => {
    test.setTimeout(240000);
    const launched = await launchMmdModoki(root);
    try {
      const page = await launched.app.firstWindow();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(backend => localStorage.setItem("mmd_modoki.postEffectBackend", backend), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      for (const name of ["plate", "tofu"]) {
        await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, `test/fixtures/external-parent/${name}.pmx`));
      }
      await page.locator("#info-model-select").selectOption("1");
      await selectCenterBone(page);
      const y = page.locator("#bone-controls input[data-control-key='ty']");
      await y.fill("4"); await y.press("Enter");
      await page.locator("#info-model-select").selectOption("__camera__");
      await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 14, y: 11, z: -17 }, { x: 0, y: 2, z: 0 }));
      const original = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      const summary = [];
      for (const mode of ["mmd-standard", "pbr-base", "pbr-mmd-like"]) {
        const presetId = mode === "mmd-standard" ? "wgsl-mmd-standard" : mode;
        await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), original);
        if (mode !== "mmd-standard") {
          await page.locator('[data-i18n="menu.window"]').click();
          await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
          const dialog = page.locator('[data-popup-id="experimental-settings"]');
          await dialog.getByLabel("PBRモード", { exact: true }).check();
          await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
          await dialog.locator(".app-menu-dialog-close").click();
        }
        if (!await page.locator("#shader-preset-select").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
        await page.locator('[data-effect-tab="materials"]').click();
        for (const index of ["0", "1"]) {
          await page.locator("#info-model-select").selectOption(index);
          await page.locator("#shader-preset-select").selectOption(presetId);
          await page.locator("#btn-shader-apply-all").click();
        }
        await page.locator("#btn-toggle-shader-panel").click();
        await page.locator("#info-model-select").selectOption("__camera__");
        const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
        Object.assign(project.lighting, {
          ambientIntensity: 0, environmentLightingEnabled: false, environmentBackgroundVisible: false,
          lightColor: { r: 1, g: 1, b: 1 }, shadowColor: { r: 1, g: 0, b: 0 },
          shadowEnabled: true, toonShadowInfluence: 0,
        });
        const captures = {};
        for (const variant of ["shadow-on", "shadow-off", "blue-shadow", "ambient-blue", "ambient-red", "red-light"]) {
          const state = structuredClone(project);
          if (variant === "shadow-off") state.lighting.shadowEnabled = false;
          if (["blue-shadow", "ambient-blue"].includes(variant)) state.lighting.shadowColor = { r: 0, g: 0, b: 1 };
          if (variant.startsWith("ambient")) state.lighting.ambientIntensity = 0.6;
          if (variant === "red-light") state.lighting.lightColor = { r: 1, g: 0, b: 0 };
          await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), state);
          await page.evaluate(() => window.mmdModokiE2e.setCameraPose({ x: 14, y: 11, z: -17 }, { x: 0, y: 2, z: 0 }));
          const probe = await page.evaluate(async () => (await import("/test/e2e/helpers/light-shadow-audit-probe.mjs")).inspectLightShadowAudit());
          const shadows = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
          expect(shadows.lightSamplingEnabled).toBe(variant !== "shadow-off");
          expect(shadows.models.every(model => model.receiverMeshCount > 0)).toBe(true);
          expect(probe.lights.find(light => light.name === "hemiLight").intensity).toBe(variant.startsWith("ambient") ? 0.6 : 0);
          const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
          writeFileSync(testInfo.outputPath("current-state.json"), JSON.stringify({ mode, variant, probe, scene: saved.scene }, null, 2));
          expect(saved.scene.materialMode).toBe(mode === "mmd-standard" ? "mmd-standard" : "pbr-standard");
          if (mode !== "mmd-standard") expect(saved.scene.models.every(model => model.materialShaders.length > 0 && model.materialShaders.every(entry => entry.presetId === presetId))).toBe(true);
          expect(probe.meshes.length).toBeGreaterThan(0);
          expect(probe.meshes.every(mesh => mesh.material === (mode === "mmd-standard" ? "StandardMaterial" : "PBRMaterial"))).toBe(true);
          captures[variant] = await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath(`${mode}-${variant}.png`) });
          summary.push({ mode, variant, probe, shadows });
          writeFileSync(testInfo.outputPath("audit.json"), JSON.stringify(summary, null, 2));
        }
        const difference = {
          shadow: changedPixels(captures["shadow-on"], captures["shadow-off"]),
          shadowColorWithoutAmbient: changedPixels(captures["shadow-on"], captures["blue-shadow"]),
          shadowColorWithAmbient: changedPixels(captures["ambient-red"], captures["ambient-blue"]),
        };
        summary.push({ mode, difference });
        expect(difference.shadow).toBeGreaterThan(100);
        expect(difference.shadowColorWithAmbient).toBeGreaterThan(100);
        if (mode === "pbr-base") expect(difference.shadowColorWithoutAmbient).toBe(0);
      }
      writeFileSync(testInfo.outputPath("audit.json"), JSON.stringify(summary, null, 2));
      expect(errors).toEqual([]);
      expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
    } finally { await launched.close(); }
  });
}

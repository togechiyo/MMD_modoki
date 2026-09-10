import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const modelPath = resolve(root, "local-references/model/Alicia/MMD/Alicia_solid.pmx");
const backend = process.env.MMD_MATERIAL_VISIBILITY_BACKEND === "classic" ? "classic" : "frameGraph";
const outputRoot = resolve(root, "local-references/material-visibility-fixed-2026-09-10", backend);

function delta(aPath, bPath) {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let changed = 0, absolute = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(...[0, 1, 2].map(c => Math.abs(a.data[i + c] - b.data[i + c])));
    if (d > 12) changed++;
    absolute += d;
  }
  return { changed, mean: absolute / (a.width * a.height), pixels: a.width * a.height };
}

for (const pipeline of ["mmd-standard", "pbr-standard"]) {
  test(`Alicia material visibility ${pipeline}`, async () => {
    test.setTimeout(240000);
    test.skip(!existsSync(modelPath), "Optional owner-authorized Alicia reference is not installed");
    const output = resolve(outputRoot, pipeline);
    mkdirSync(output, { recursive: true });
    const launched = await launchMmdModoki(root);
    const report = { pipeline, backend, states: {}, errors: [] };
    try {
      const page = await launched.app.firstWindow();
      page.on("pageerror", error => report.errors.push({ type: "pageerror", message: error.message }));
      page.on("console", message => {
        if (message.type() === "error") report.errors.push({ type: "console", message: message.text() });
      });
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      if (backend === "classic") {
        await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
        await page.reload();
        await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      }
      // Stable scene setup only; visibility and pipeline changes below use GUI.
      await page.evaluate(async () => {
        const state = window.mmdModokiE2e.exportProjectState();
        state.physics.enabled = false;
        state.viewport.groundVisible = false;
        state.viewport.skydomeVisible = false;
        await window.mmdModokiE2e.importProjectState(state);
      });
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
      if (pipeline === "pbr-standard") {
        await page.locator('[data-i18n="menu.tools"]').click();
        await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        const dialog = page.locator('[data-popup-id="experimental-settings"]');
        await dialog.getByLabel("PBRモード", { exact: true }).check();
        await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
      }
      await page.locator("#info-model-select").selectOption("__camera__");
      for (const [key, value] of Object.entries({ tx: 0, ty: 10, tz: 0, rx: 0, ry: 0, rz: 0, camDistance: 42 })) {
        const input = page.locator(`#bone-controls input[data-control-key='${key}']`);
        await input.fill(String(value));
        await input.press("Enter");
      }
      await page.locator("#info-model-select").selectOption("0");
      await page.locator("#btn-toggle-shader-panel").click();
      await page.locator('[data-effect-tab="materials"]').click();
      const toggles = page.locator("#shader-material-list .shader-material-toggle");
      await expect(toggles.first()).toBeVisible();
      const count = await toggles.count();
      expect(count).toBeGreaterThan(1);
      const capture = async name => {
        await page.evaluate(async () => {
          for (let i = 0; i < 12; i++) await new Promise(resolve => requestAnimationFrame(resolve));
        });
        report.states[name] = await page.evaluate(async () => ({
          ...((await import("/test/e2e/helpers/material-visibility-probe.mjs")).inspectMaterialVisibility()),
          postEffects: window.mmdModokiE2e.getFrameGraphPostEffectsState(),
          model: window.mmdModokiE2e.exportProjectState().scene.models[0],
          validation: window.mmdModokiE2e.getWebGpuValidationDiagnostics(),
        }));
        report.states[name].ui = await toggles.evaluateAll(inputs => inputs.map(input => ({
          checked: input.checked, label: input.getAttribute("aria-label"),
        })));
        // Camera selection hides editor bone overlays without altering model visibility.
        await page.locator("#info-model-select").selectOption("__camera__");
        await page.evaluate(async () => {
          for (let i = 0; i < 3; i++) await new Promise(resolve => requestAnimationFrame(resolve));
        });
        await expect(page.locator(".toast")).toHaveCount(0);
        await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) });
        await page.locator("#info-model-select").selectOption("0");
        await page.locator('[data-effect-tab="materials"]').click();
      };
      await capture("on");
      expect(report.states.on.engine).toBe("WebGPU");
      expect(report.states.on.postEffects.backend).toBe(backend);
      expect(report.states.on.materials.length).toBe(count);
      expect(report.states.on.model.materialPipeline).toBe(pipeline);
      expect(report.states.on.materials.every(material => pipeline === "pbr-standard"
        ? material.type === "PBRMaterial" : material.type === "StandardMaterial")).toBe(true);
      // Pick an Opaque material by draw size, independent of the model's naming.
      const candidates = report.states.on.materials.map((material, index) => ({ material, index }))
        .filter(({ material }) => material.transparencyMode === 0)
        .sort((a, b) => b.material.meshes.reduce((sum, mesh) => sum + mesh.vertices, 0)
          - a.material.meshes.reduce((sum, mesh) => sum + mesh.vertices, 0));
      report.individualMaterialIndex = candidates[0]?.index ?? 0;
      await toggles.nth(report.individualMaterialIndex).uncheck();
      await expect(toggles.nth(report.individualMaterialIndex)).not.toBeChecked();
      await capture("one-off");
      await toggles.nth(report.individualMaterialIndex).check();
      await capture("one-restored");
      for (let i = 0; i < count; i++) await toggles.nth(i).uncheck();
      expect(await toggles.evaluateAll(inputs => inputs.every(input => !input.checked))).toBe(true);
      await capture("all-off");
      const hiddenProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      expect(hiddenProject.scene.models[0].materialShaders.filter(state => state.visible === false)).toHaveLength(count);
      if (pipeline === "pbr-standard") {
        await page.locator("#shader-preset-select").selectOption("pbr-base");
        await page.locator("#btn-shader-apply-all").click();
        await capture("preset-off");
      }
      for (const enabled of [pipeline !== "pbr-standard", pipeline === "pbr-standard"]) {
        await page.locator('[data-i18n="menu.tools"]').click();
        await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
        const dialog = page.locator('[data-popup-id="experimental-settings"]');
        await dialog.getByLabel("PBRモード", { exact: true }).setChecked(enabled);
        await expect(dialog.getByLabel("PBRモード", { exact: true })).toBeEnabled();
        await dialog.locator(".app-menu-dialog-close").click();
        await page.locator('[data-effect-tab="materials"]').click();
        expect(await toggles.evaluateAll((inputs, expectedCount) => inputs.length === expectedCount
          && inputs.every(input => !input.checked), count)).toBe(true);
        await capture(enabled ? "switched-pbr-off" : "switched-mmd-off");
      }
      await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), hiddenProject);
      await page.locator("#info-model-select").selectOption("0");
      await page.locator('[data-effect-tab="materials"]').click();
      expect(await toggles.evaluateAll(inputs => inputs.every(input => !input.checked))).toBe(true);
      await capture("reloaded-off");
      await page.locator("#chk-model-visibility").uncheck();
      await capture("model-off");
      await page.locator("#chk-model-visibility").check();
      for (let i = 0; i < count; i++) await toggles.nth(i).check();
      await capture("restored");
      const compare = (a, b) => delta(resolve(output, `${a}.png`), resolve(output, `${b}.png`));
      report.comparisons = {
        onToEmpty: compare("on", "model-off"),
        onToOneOff: compare("on", "one-off"),
        offToEmpty: compare("all-off", "model-off"),
        restoration: compare("on", "restored"),
        reloadedOffToEmpty: compare("reloaded-off", "model-off"),
        switchedPbrOffToEmpty: compare("switched-pbr-off", "model-off"),
        switchedMmdOffToEmpty: compare("switched-mmd-off", "model-off"),
        ...(pipeline === "pbr-standard" ? { presetOffToEmpty: compare("preset-off", "model-off") } : {}),
      };
      console.log(JSON.stringify({ pipeline, comparisons: report.comparisons }));
      expect(report.comparisons.onToEmpty.changed).toBeGreaterThan(1000);
      expect(report.comparisons.onToOneOff.changed, "Individual material OFF must change the rendered body").toBeGreaterThan(1000);
      // A hidden model is the image reference: this fails when OFF leaves its body rendered.
      expect.soft(report.comparisons.offToEmpty.changed, "All material toggles OFF must remove the rendered body")
        .toBeLessThan(report.comparisons.onToEmpty.changed * 0.05);
      expect.soft(report.comparisons.restoration.changed, "ON must restore the original image")
        .toBeLessThan(report.comparisons.onToEmpty.changed * 0.05);
      expect.soft(report.comparisons.reloadedOffToEmpty.changed, "Project load must preserve hidden draw ranges")
        .toBeLessThan(report.comparisons.onToEmpty.changed * 0.05);
      expect.soft(report.comparisons.switchedPbrOffToEmpty.changed, "Switching to PBR must preserve hidden draw ranges")
        .toBeLessThan(report.comparisons.onToEmpty.changed * 0.05);
      expect.soft(report.comparisons.switchedMmdOffToEmpty.changed, "Switching to MMD Standard must preserve hidden draw ranges")
        .toBeLessThan(report.comparisons.onToEmpty.changed * 0.05);
      if (report.comparisons.presetOffToEmpty) {
        expect.soft(report.comparisons.presetOffToEmpty.changed, "PBR preset changes must preserve hidden draw ranges")
          .toBeLessThan(report.comparisons.onToEmpty.changed * 0.05);
      }
      expect.soft(report.errors.filter(error => error.type === "pageerror")).toEqual([]);
      expect.soft(report.states.restored.validation.count).toBe(0);
    } finally {
      writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
      await launched.close();
    }
  });
}

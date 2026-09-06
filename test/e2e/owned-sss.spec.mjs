import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const alicia = resolve(root, "local-references/model/Alicia/MMD/Alicia_solid.pmx");
const useAlicia = process.env.MMD_MODOKI_SSS_ALICIA === "1";
const useBlueToon = !useAlicia && process.env.MMD_MODOKI_SSS_BLUE_TOON === "1";
const useNoToon = !useAlicia && !useBlueToon && process.env.MMD_MODOKI_SSS_NO_TOON === "1";
const output = resolve(root, useAlicia ? "local-references/sss-development-2026-09-06" : "test-results/owned-sss");
test.setTimeout(240000);
test.skip(useAlicia && !existsSync(alicia), "Owner-authorized local Alicia asset is not installed");

async function frames(page) {
  await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
  await page.waitForFunction(async () => (await import("/src/render/owned-sss.ts")).isOwnedSssReady(), null, { timeout: 15000 });
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) await new Promise(resolveFrame => requestAnimationFrame(resolveFrame));
  });
}
async function slider(page, selector, value) {
  const field = page.locator(selector);
  await field.focus();
  await field.press("Home");
  const limits = await field.evaluate(el => ({ min: Number(el.min), max: Number(el.max), step: Number(el.step) }));
  const steps = Math.round((value - limits.min) / limits.step);
  const pageSteps = Math.round((limits.max - limits.min) / limits.step / 10);
  for (let i = 0; i < Math.floor(steps / pageSteps); i++) await field.press("PageUp");
  for (let i = 0; i < steps % pageSteps; i++) await field.press("ArrowRight");
  await expect(field).toHaveValue(String(value));
}

async function centerMean(page, path, x = 560, y = 308) {
  return page.evaluate(async ({ imagePath, x, y }) => {
    const bytes = await window.electronAPI.readBinaryFile(imagePath);
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
    const canvas = document.createElement("canvas"); canvas.width = 1152; canvas.height = 648;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const data = context.getImageData(x, y, 32, 32).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c] / 1024;
    return sum;
  }, { imagePath: path, x, y });
}

async function isolateTransmission(page) {
  await page.locator("#info-model-select").selectOption("__camera__");
  const keys = ["light-toon-shadow-influence", "light-shadow-color-r", "light-shadow-color-g", "light-shadow-color-b"];
  const previous = [];
  for (const key of keys) {
    previous.push(Number(await page.locator(`#${key}`).inputValue()));
    await slider(page, `#${key}`, 0);
  }
  await frames(page);
  return async () => {
    for (const [index, key] of keys.entries()) await slider(page, `#${key}`, previous[index]);
    await frames(page);
  };
}

async function applyPreset(page, preset) {
  await page.locator("#info-model-select").selectOption("0");
  await page.locator('[data-effect-tab="materials"]').click();
  await page.locator("#shader-preset-select").selectOption(preset);
  if (useAlicia && preset !== "wgsl-mmd-standard") {
    for (const materialName of ["body", "hand", "face"]) {
      await page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: new RegExp(`^${materialName}$`) }) }).click();
      await page.locator("#btn-shader-apply-selected").click();
    }
  } else await page.locator("#btn-shader-apply-all").click();
}

test("owned SSS renders, restores, and detaches without the legacy SSS pipeline", async () => {
  mkdirSync(output, { recursive: true });
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    const consoleErrors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") {
      consoleErrors.push(message.text());
      writeFileSync(resolve(output, "console-errors.json"), JSON.stringify(consoleErrors, null, 2));
    } });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    if (process.env.MMD_MODOKI_SSS_BACKEND === "classic") {
      await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    }
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      state.lighting.ambientIntensity = 0.15;
      state.viewport.groundVisible = false;
      state.viewport.skydomeVisible = false;
      state.viewport.backgroundBlack = true;
      state.viewport.backgroundDisplayMode = "black";
      await window.mmdModokiE2e.importProjectState(state);
    });
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), useAlicia ? alicia : resolve(root, `test/fixtures/external-parent/${useBlueToon ? "sss-blue-toon" : useNoToon ? "sss-no-toon" : "sss-reference"}.pmx`))).not.toBeNull();
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: useAlicia ? 16.5 : 1.5, tz: 0, rx: 0, ry: 0, rz: 0, camDistance: useAlicia ? 12 : 12 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    const materialNames = await page.locator(".shader-material-item").allTextContents();
    writeFileSync(resolve(output, "materials.json"), JSON.stringify(materialNames, null, 2));
    for (const [name, direction] of [["front", [0.3, -0.3, 0.9]], ["side", [0.9, -0.2, 0.1]], ["back", [0.3, -0.2, -0.9]]]) {
      await page.locator("#info-model-select").selectOption("__camera__");
      for (const [axis, value] of direction.entries()) await slider(page, `#light-direction-${["x", "y", "z"][axis]}`, value);
      await page.locator("#info-model-select").selectOption("0");
      await page.locator('[data-effect-tab="materials"]').click();
      for (const preset of ["wgsl-mmd-standard", "wgsl-owned-sss-skin", "wgsl-owned-sss-wax"]) {
        console.log("[owned-sss]", name, preset);
        await applyPreset(page, preset);
        await frames(page);
        if (preset !== "wgsl-mmd-standard") {
          const passes = await page.evaluate(async () => (await import("/src/render/owned-sss.ts")).inspectOwnedSss());
          expect(passes.surfacePassCount).toBe(preset === "wgsl-owned-sss-skin" ? 2 : 0);
          expect(passes.targetCount).toBe(preset === "wgsl-owned-sss-skin" ? 4 : 3);
        }
        await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}-${preset}.png`) });
        const png = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 1152, 648), output);
        copyFileSync(png.path, resolve(output, `${name}-${preset}-export.png`));
        if (useBlueToon && name === "back" && preset === "wgsl-owned-sss-wax") {
          const restore = await isolateTransmission(page);
          const isolated = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 1152, 648), output);
          copyFileSync(isolated.path, resolve(output, "wax-toon-transmission.png"));
          const blue = await centerMean(page, isolated.path, 442, 305);
          await restore();
          writeFileSync(resolve(output, "wax-toon-transmission.json"), JSON.stringify(blue));
          expect(blue[2]).toBeGreaterThan(blue[0] + 25);
          expect(blue[2]).toBeGreaterThan(blue[1] + 15);
        }
        if (!useAlicia && name === "back" && preset === "wgsl-owned-sss-skin") {
          // Isolate thickness transmission from the user-adjustable Toon shadow fill.
          const restore = await isolateTransmission(page);
          const isolated = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 1152, 648), output);
          copyFileSync(isolated.path, resolve(output, "thickness-isolated-export.png"));
          const thickness = await page.evaluate(async path => {
            const bytes = await window.electronAPI.readBinaryFile(path);
            const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
            const canvas = document.createElement("canvas"); canvas.width = 1152; canvas.height = 648;
            const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
            function mean(x, y) {
              const data = context.getImageData(x, y, 16, 16).data;
              const sum = [0, 0, 0];
              for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c] / 256;
              return sum;
            }
            return { ear: mean(442, 305), head: mean(568, 315) };
          }, isolated.path);
          await restore();
          writeFileSync(resolve(output, "thickness-metrics.json"), JSON.stringify(thickness, null, 2));
          expect(thickness.ear[0]).toBeGreaterThan(thickness.head[0] * 1.3);
          expect(thickness.ear[0] - thickness.ear[2]).toBeGreaterThan(30);
          expect(thickness.head[0]).toBeLessThan(120);
        }
        if (preset === "wgsl-owned-sss-skin") {
          const diagnostics = await page.evaluate(async () => {
            const { inspectOwnedSss } = await import("/src/render/owned-sss.ts");
            return inspectOwnedSss();
          });
          writeFileSync(resolve(output, `${name}-diagnostics.json`), JSON.stringify(diagnostics, null, 2));
          expect(diagnostics.probes.length).toBeGreaterThan(0);
          expect(diagnostics.blurPassCount).toBe(2);
          for (const probe of diagnostics.probes) {
            expect(Math.abs(probe.pixel[0] - probe.projected[0])).toBeLessThan(0.002);
            expect(Math.abs(probe.pixel[1] - probe.projected[1])).toBeLessThan(0.002);
          }
        }
        writeFileSync(resolve(output, "errors.json"), JSON.stringify({ errors, consoleErrors, validation: await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()) }, null, 2));
        expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
        expect(errors).toEqual([]);
      }
    }
    // Verify UI color controls in the final exported image, not just material uniforms.
    await page.locator("#info-model-select").selectOption("__camera__");
    const colorMetrics = {};
    for (const [name, changes] of [
      ["shadow-blue", { "light-toon-shadow-influence": 0, "light-shadow-color-r": 32, "light-shadow-color-g": 64, "light-shadow-color-b": 240 }],
      ["shadow-red", { "light-shadow-color-r": 240, "light-shadow-color-g": 64, "light-shadow-color-b": 32 }],
      ["toon", { "light-toon-shadow-influence": 100 }],
      ["light-blue", { "light-direction-z": 0.9, "light-color-r": 40, "light-color-g": 80, "light-color-b": 200 }],
      ["light-red", { "light-color-r": 200, "light-color-g": 80, "light-color-b": 40 }],
    ]) {
      for (const [key, value] of Object.entries(changes)) await slider(page, `#${key}`, value);
      await frames(page);
      const png = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 1152, 648), output);
      copyFileSync(png.path, resolve(output, `${name}-export.png`));
      colorMetrics[name] = await centerMean(page, png.path);
    }
    writeFileSync(resolve(output, "color-metrics.json"), JSON.stringify(colorMetrics, null, 2));
    expect(colorMetrics["shadow-blue"][2]).toBeGreaterThan(colorMetrics["shadow-red"][2] + 10);
    expect(colorMetrics["shadow-red"][0]).toBeGreaterThan(colorMetrics["shadow-blue"][0] + 10);
    expect(Math.max(...colorMetrics.toon.map((value, channel) => Math.abs(value - colorMetrics["shadow-red"][channel])))).toBeGreaterThan(5);
    expect(colorMetrics["light-blue"][2]).toBeGreaterThan(colorMetrics["light-red"][2] + 10);
    expect(colorMetrics["light-red"][0]).toBeGreaterThan(colorMetrics["light-blue"][0] + 10);
    // Match the reported close, oblique camera condition on the authorized model.
    for (const [key, value] of Object.entries({ "light-color-r": 147, "light-color-g": 133, "light-color-b": 133,
      "light-shadow-color-r": 132, "light-shadow-color-g": 166, "light-shadow-color-b": 186,
      "light-direction-x": 0.4, "light-direction-y": -0.2, "light-direction-z": 0.68 })) await slider(page, `#${key}`, value);
    // Equal camera/material/color settings; vary only the real directional light intensity.
    const intensityMetrics = {};
    for (const preset of ["wgsl-owned-sss-skin", "wgsl-owned-sss-wax"]) {
      await applyPreset(page, preset);
      await page.locator("#info-model-select").selectOption("__camera__");
      for (const intensity of [0, 100, 200]) {
        await slider(page, "#light-intensity", intensity);
        await frames(page);
        const png = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 1152, 648), output);
        copyFileSync(png.path, resolve(output, `intensity-${intensity}-${preset}.png`));
        intensityMetrics[`${preset}-${intensity}`] = await centerMean(page, png.path);
      }
      const luminance = intensity => intensityMetrics[`${preset}-${intensity}`].reduce((sum, value) => sum + value, 0) / 3;
      expect(luminance(100)).toBeGreaterThan(luminance(0) + 10);
      // Standard material composition clamps before albedo. A fully lit texel
      // may already be saturated at 100; doubling light must not darken it.
      expect(luminance(200)).toBeGreaterThanOrEqual(luminance(100) - 0.5);
    }
    writeFileSync(resolve(output, "intensity-metrics.json"), JSON.stringify(intensityMetrics, null, 2));
    await slider(page, "#light-intensity", 100);
    for (const [name, rotation] of [["close-front", [0, -12.4]], ["close-side", [22, 78.8]]]) {
      await page.locator("#info-model-select").selectOption("__camera__");
      for (const [key, value] of Object.entries({ rx: rotation[0], ry: rotation[1], camDistance: useAlicia ? 7 : 6 })) {
        const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
        await field.fill(String(value)); await field.press("Enter");
      }
      for (const preset of ["wgsl-mmd-standard", "wgsl-owned-sss-skin", "wgsl-owned-sss-wax"]) {
        await applyPreset(page, preset);
        await page.locator("#info-model-select").selectOption("__camera__");
        await frames(page);
        await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}-${preset}.png`) });
      }
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(state.scene.models[0].materialShaders.some(item => item.presetId === "wgsl-owned-sss-wax")).toBe(true);
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), state);
    await frames(page);
    await page.locator("#render-canvas").screenshot({ path: resolve(output, "restored.png") });
    await page.locator("#info-model-select").selectOption("0");
    await page.locator('[data-effect-tab="materials"]').click();
    expect(await page.evaluate(() => window.mmdModokiE2e.getWgslSssSkinDiagnostics())).toMatchObject({ materialCount: 0, configurationEnabled: false });
    await page.locator("#shader-preset-select").selectOption("wgsl-mmd-standard");
    await page.locator("#btn-shader-apply-all").click();
    await frames(page);
    expect(errors).toEqual([]);
    const detached = await page.evaluate(async () => (await import("/src/render/owned-sss.ts")).inspectOwnedSss());
    expect(detached).toMatchObject({ materialCount: 0, targetCount: 0 });
  } finally { await launched.close(); }
});

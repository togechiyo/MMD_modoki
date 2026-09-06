import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const alicia = resolve(root, "local-references/model/Alicia/MMD/Alicia_solid.pmx");
const useAlicia = process.env.MMD_MODOKI_SSS_ALICIA === "1";
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
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), useAlicia ? alicia : resolve(root, "test/fixtures/external-parent/sss-reference.pmx"))).not.toBeNull();
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
        await page.locator("#shader-preset-select").selectOption(preset);
        if (useAlicia && preset !== "wgsl-mmd-standard") {
          for (const materialName of ["body", "hand", "face"]) {
            await page.locator(".shader-material-item").filter({ has: page.locator(".shader-material-name", { hasText: new RegExp(`^${materialName}$`) }) }).click();
            await page.locator("#btn-shader-apply-selected").click();
          }
        } else await page.locator("#btn-shader-apply-all").click();
        await frames(page);
        await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}-${preset}.png`) });
        const png = await page.evaluate(dir => window.mmdModokiE2e.captureSinglePngSurfaceToPath(dir, 1152, 648), output);
        copyFileSync(png.path, resolve(output, `${name}-${preset}-export.png`));
        if (!useAlicia && name === "back" && preset === "wgsl-owned-sss-skin") {
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
          }, png.path);
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
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(state.scene.models[0].materialShaders.some(item => item.presetId === "wgsl-owned-sss-wax")).toBe(true);
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), state);
    await frames(page);
    await page.locator("#render-canvas").screenshot({ path: resolve(output, "restored.png") });
    expect(await page.evaluate(() => window.mmdModokiE2e.getWgslSssSkinDiagnostics())).toMatchObject({ materialCount: 0, configurationEnabled: false });
    await page.locator("#shader-preset-select").selectOption("wgsl-mmd-standard");
    await page.locator("#btn-shader-apply-all").click();
    await frames(page);
    expect(errors).toEqual([]);
    const detached = await page.evaluate(async () => (await import("/src/render/owned-sss.ts")).inspectOwnedSss());
    expect(detached).toMatchObject({ materialCount: 0, targetCount: 0 });
  } finally { await launched.close(); }
});

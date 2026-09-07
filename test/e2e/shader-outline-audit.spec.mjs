import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const regression = process.env.MMD_SSS_OUTLINE_REGRESSION === "1";
const outputRoot = resolve(root, regression ? "local-references/sss-outline-fixed-2026-09-07" : "local-references/shader-outline-audit-2026-09-07");
test.setTimeout(600000);
async function probe(page) {
  return page.evaluate(async () => (await import("/test/e2e/helpers/shader-outline-probe.mjs")).outlineProbe());
}
async function edge(page, width) {
  await page.locator('.app-menu-trigger[data-i18n="menu.view"]').click();
  await page.locator('[data-menu-command="view.edgeSettings"]').click();
  const dialog = page.locator('[data-popup-id="edge-settings"]');
  await dialog.locator('input[type="range"]').fill(String(width));
  await dialog.locator('input[type="range"]').dispatchEvent("input");
  await dialog.locator(".app-menu-dialog-close").click();
  return probe(page);
}
function delta(aPath, bPath) {
  const a = PNG.sync.read(readFileSync(aPath)), b = PNG.sync.read(readFileSync(bPath));
  let changed = 0, darker = 0, brighter = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = (b.data[i] + b.data[i + 1] + b.data[i + 2] - a.data[i] - a.data[i + 1] - a.data[i + 2]) / 3;
    if (Math.abs(d) > 8) changed++;
    if (d < -8) darker++;
    if (d > 8) brighter++;
  }
  return { changed, darker, brighter, pixels: a.width * a.height };
}
for (const backend of ["framegraph", "classic"]) for (const model of ["tofu", "alicia"]) {
  test(`shader outline audit ${backend} ${model}`, async () => {
    const modelPath = resolve(root, model === "tofu" ? "test/fixtures/external-parent/tofu.pmx" : "local-references/model/Alicia/MMD/Alicia_solid.pmx");
    test.skip(!existsSync(modelPath), "Optional owner-authorized Alicia reference is not installed");
    const output = resolve(outputRoot, `${backend}-${model}`); mkdirSync(output, { recursive: true });
    const launched = await launchMmdModoki(root);
    const results = [], errors = []; let current = "setup";
    try {
      const page = await launched.app.firstWindow();
      page.on("pageerror", error => errors.push({ current, type: "pageerror", message: error.message }));
      page.on("console", message => { if (message.type() === "error") errors.push({ current, type: "console", message: message.text() }); });
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      if (backend === "classic") {
        await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
        await page.reload(); await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      }
      await page.evaluate(async () => {
        const state = window.mmdModokiE2e.exportProjectState();
        state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
        await window.mmdModokiE2e.importProjectState(state);
      });
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
      await page.locator("#btn-toggle-shader-panel").click();
      await page.locator("#info-model-select").selectOption("__camera__");
      for (const [key, value] of Object.entries({ tx: 0, ty: model === "tofu" ? 1.5 : 16.5, tz: 0, rx: model === "tofu" ? -12 : 0, ry: model === "tofu" ? -25 : 0, rz: 0, camDistance: model === "tofu" ? 18 : 12 })) {
        const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
        await field.fill(String(value)); await field.press("Enter");
      }
      await page.locator("#info-model-select").selectOption("0");
      await page.locator('[data-effect-tab="materials"]').click();
      const catalog = await page.locator("#shader-preset-select option").evaluateAll(options => options.map(option => ({ id: option.value, name: option.textContent })).filter(option => option.id.startsWith("wgsl-")));
      const presets = regression ? catalog.filter(preset => preset.id.startsWith("wgsl-owned-sss")) : catalog;
      const runtime = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState());
      expect(runtime.backend).toBe(backend === "framegraph" ? "frameGraph" : "classic");
      await probe(page);
      for (const preset of presets) {
        current = preset.id;
        await edge(page, 0);
        await page.locator("#shader-preset-select").selectOption(preset.id);
        await page.locator("#btn-shader-apply-all").click();
        const off = await probe(page);
        if (preset.id.startsWith("wgsl-owned-sss")) await page.waitForFunction(async () => (await import("/src/render/owned-sss.ts")).isOwnedSssReady(), null, { timeout: 15000 });
        await expect(page.locator(".toast")).toHaveCount(0, { timeout: 15000 });
        const offPath = resolve(output, `${preset.id}-off.png`), onPath = resolve(output, `${preset.id}-on.png`);
        await page.locator("#render-canvas").screenshot({ path: offPath });
        const on = await edge(page, 100);
        await page.locator("#render-canvas").screenshot({ path: onPath });
        results.push({ ...preset, off, on, delta: delta(offPath, onPath), validation: await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics()) });
        writeFileSync(resolve(output, "results.json"), JSON.stringify({ backend, model, results, errors }, null, 2));
        console.log(`${backend} ${model} ${preset.name}: ${JSON.stringify(results.at(-1).delta)}`);
        if (regression) {
          expect(results.at(-1).validation.count).toBe(0);
          expect(on.some(material => material.outline)).toBe(true);
          expect(off.every(material => !material.outline)).toBe(true);
          expect(results.at(-1).delta.changed).toBeGreaterThan(100);
          expect(results.at(-1).delta.changed).toBeLessThan(results.at(-1).delta.pixels * 0.1);
          const exportOn = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 1152, 648), resolve(output, `${preset.id}-export-on`));
          await edge(page, 0);
          const restored = resolve(output, `${preset.id}-restored.png`);
          await page.locator("#render-canvas").screenshot({ path: restored });
          expect(delta(offPath, restored).changed).toBeLessThan(100);
          const exportOff = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 1152, 648), resolve(output, `${preset.id}-export-off`));
          const exportDelta = delta(exportOff.path, exportOn.path);
          expect(exportDelta.changed).toBeGreaterThan(100);
          expect(exportDelta.changed).toBeLessThan(exportDelta.pixels * 0.1);
          expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
        }
      }
      expect(results.length).toBe(regression ? 2 : 18);
    } finally {
      writeFileSync(resolve(output, "results.json"), JSON.stringify({ backend, model, results, errors }, null, 2));
      await launched.close();
    }
  });
}

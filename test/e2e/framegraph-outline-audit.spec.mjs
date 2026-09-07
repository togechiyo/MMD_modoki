import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const ids = ["ssao", "ssgi", "dof", "luminous", "bloom", "directionalLightShafts", "lut", "gamma", "motionBlur", "distortion", "ringParticles", "aerialPerspective", "offsetShadow", "offsetHighlight", "vignette", "grain", "sharpen", "chromatic", "edgeBlur", "ssr"];
const model = resolve(root, "test/fixtures/external-parent/tofu.pmx");
const detail = process.env.MMD_FRAMEGRAPH_OUTLINE_DETAIL === "1";
const regression = process.env.MMD_FRAMEGRAPH_OUTLINE_FIXED === "1";
test.setTimeout(120000);
async function settle(page) {
  await page.evaluate(async () => (await import("/test/e2e/helpers/shader-outline-probe.mjs")).outlineProbe());
  await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
}
async function edge(page, width) {
  await page.locator('.app-menu-trigger[data-i18n="menu.view"]').click();
  await page.locator('[data-menu-command="view.edgeSettings"]').click();
  const dialog = page.locator('[data-popup-id="edge-settings"]');
  await dialog.locator('input[type="range"]').fill(String(width));
  await dialog.locator('input[type="range"]').dispatchEvent("input");
  await dialog.locator(".app-menu-dialog-close").click();
  await settle(page);
}
function compare(aPath, bPath) {
  const a = PNG.sync.read(readFileSync(aPath)), b = PNG.sync.read(readFileSync(bPath));
  let changed = 0, black = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.max(...[0, 1, 2].map(c => Math.abs(a.data[i + c] - b.data[i + c]))) > 8) changed++;
    if (b.data[i] < 5 && b.data[i + 1] < 5 && b.data[i + 2] < 5) black++;
  }
  return { changed, black, pixels: a.width * a.height };
}
for (const id of (regression ? ["ssgi", "ssr"] : detail ? ["motionBlur", "aerialPerspective", "distortion", "edgeBlur", "offsetShadow", "offsetHighlight"] : ids)) test(`FrameGraph outline compatibility audit: ${id}`, async () => {
  test.skip(!existsSync(model), "Repository fixture not installed");
  const output = resolve(root, regression ? "local-references/framegraph-outline-fixed-2026-09-07" : detail ? "local-references/framegraph-outline-detail-2026-09-07" : "local-references/framegraph-outline-audit-2026-09-07", id);
  mkdirSync(output, { recursive: true });
  const launched = await launchMmdModoki(root);
  const report = { id, errors: [], states: {} };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), model)).not.toBeNull();
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.5, tz: 0, rx: -12, ry: -25, rz: 0, camDistance: 14 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    if (["ssr", "luminous"].includes(id)) {
      await page.locator("#info-model-select").selectOption("0");
      await page.locator('[data-effect-tab="materials"]').click();
      await page.locator("#shader-preset-select").selectOption(id === "ssr" ? "wgsl-ssr-reflective" : "wgsl-autoluminous");
      await page.locator("#btn-shader-apply-all").click();
      await page.locator("#info-model-select").selectOption("__camera__");
    }
    await page.locator('[data-effect-tab="post"]').click();
    async function capture(name) {
      await settle(page);
      report.states[name] = await page.evaluate(() => ({ runtime: window.mmdModokiE2e.getFrameGraphPostEffectsState(), effects: window.mmdModokiE2e.exportProjectState().effects, validation: window.mmdModokiE2e.getWebGpuValidationDiagnostics() }));
      report.states[name].toggles = await page.locator("[data-effect-stack-toggle]").evaluateAll(inputs => inputs.map(input => ({ id: input.dataset.effectStackToggle, checked: input.checked })));
      await page.locator("#render-canvas").screenshot({ path: resolve(output, `${name}.png`) });
    }
    await edge(page, 0); await capture("baseline-off");
    await edge(page, 100); await capture("baseline-on");
    await page.locator("#btn-effect-add-post").click();
    report.available = await page.locator("[data-effect-add-post]:not([hidden])").evaluateAll(buttons => buttons.map(button => button.dataset.effectAddPost));
    await page.locator(`[data-effect-add-post="${id}"]`).click();
    const row = page.locator(`[data-effect-stack-row="${id}"]`);
    await expect(row).toBeVisible();
    // Use a non-neutral gamma so its presence is observable in the comparison.
    if (id === "gamma") {
      await row.locator('[data-effect-stack-control="gammaPower"]').fill("70");
      await row.locator('[data-effect-stack-control="gammaPower"]').dispatchEvent("input");
    }
    if (detail) {
      const settings = {
        aerialPerspective: { aerialPerspectiveStart: "0", aerialPerspectiveRange: "3", aerialPerspectiveStrength: "65" },
        distortion: { distortion: "85" }, edgeBlur: { edgeBlur: "85" },
        offsetShadow: { offsetShadowStrength: "80", offsetShadowOffsetX: "75", offsetShadowOffsetY: "75" },
        offsetHighlight: { offsetHighlightStrength: "80", offsetHighlightOffsetX: "75", offsetHighlightOffsetY: "75" },
      }[id] ?? {};
      for (const [key, value] of Object.entries(settings)) {
        await row.locator(`[data-effect-stack-control="${key}"]`).fill(value);
        await row.locator(`[data-effect-stack-control="${key}"]`).dispatchEvent("input");
      }
      if (id === "motionBlur") report.animatedMeshes = await page.evaluate(async () => (await import("/test/e2e/helpers/outline-motion-probe.mjs")).startOutlineMotion());
    }
    report.controls = await row.locator("[data-effect-stack-control]").evaluateAll(inputs => inputs.map(input => ({ key: input.dataset.effectStackControl, value: input.value })));
    await capture("effect-added-after-edge");
    await edge(page, 0);
    await page.locator(`[data-effect-stack-toggle="${id}"]`).check();
    await capture("effect-edge-off");
    await edge(page, 100); await capture("effect-edge-on");
    report.effectDelta = compare(resolve(output, "baseline-off.png"), resolve(output, "effect-edge-off.png"));
    report.edgeDelta = compare(resolve(output, "effect-edge-off.png"), resolve(output, "effect-edge-on.png"));
    const exported = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 1152, 648), resolve(output, "export"));
    report.exportPath = exported.path;
    report.exportValidation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    if (regression) {
      expect(report.exportValidation.count).toBe(0);
      expect(report.errors).toEqual([]);
      expect(report.states["effect-edge-on"].effects.modelEdgeWidth).toBe(1);
      expect(report.states["effect-edge-on"].toggles).toContainEqual({ id, checked: true });
      expect(report.edgeDelta.changed).toBeGreaterThan(100);
      expect(report.edgeDelta.changed).toBeLessThan(report.edgeDelta.pixels * 0.1);
      expect(report.edgeDelta.black).toBeLessThan(report.edgeDelta.pixels * 0.1);
      await edge(page, 0); await capture("restored-off");
      expect(compare(resolve(output, "effect-edge-off.png"), resolve(output, "restored-off.png")).changed).toBeLessThan(100);
      const offExport = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 1152, 648), resolve(output, "export-off"));
      const exportDelta = compare(offExport.path, exported.path);
      expect(exportDelta.changed).toBeGreaterThan(100);
      expect(exportDelta.black).toBeLessThan(exportDelta.pixels * 0.1);
      await edge(page, 100);
      await page.locator(`[data-effect-stack-toggle="${id}"]`).uncheck(); await settle(page);
      await page.locator(`[data-effect-stack-toggle="${id}"]`).check(); await capture("reenabled");
      if (id === "ssr") {
        await page.locator("#btn-effect-add-post").click();
        await page.locator('[data-effect-add-post="ssgi"]').click();
        await capture("ssr-and-ssgi");
      }
      expect((await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).count).toBe(0);
    }
    console.log(`${id}: delta=${report.edgeDelta.changed}, errors=${report.exportValidation.count}, edge=${report.states["effect-edge-on"].effects.modelEdgeWidth}, toggles=${JSON.stringify(report.states["effect-edge-on"].toggles)}`);
  } finally {
    writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

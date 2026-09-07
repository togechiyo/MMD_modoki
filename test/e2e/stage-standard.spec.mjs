import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test.setTimeout(180000);
async function settle(page, shadows) {
  return page.evaluate(async shadows => (await import("/test/e2e/helpers/stage-standard-probe.mjs")).stageProbeState(shadows), shadows);
}
async function apply(page, id) {
  await page.locator("#info-model-select").selectOption("0");
  await page.locator('[data-effect-tab="materials"]').click();
  await page.locator("#shader-preset-select").selectOption(id);
  await page.locator("#btn-shader-apply-all").click();
  await settle(page);
}
for (const [backend, fixtureName] of [["framegraph", "sss-no-toon"], ["classic", "sss-no-toon"], ["framegraph", "sss-blue-toon"]]) test(`Stage Standard GUI, persistence and stage rendering (${backend}, ${fixtureName})`, async () => {
  const output = resolve(root, `test-results/stage-standard-${backend}${fixtureName === "sss-blue-toon" ? "-blue-toon" : ""}`);
  mkdirSync(output, { recursive: true });
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    if (backend === "classic") {
      await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "classic"));
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    }
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false;
      state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, `test/fixtures/external-parent/${fixtureName}.pmx`))).not.toBeNull();
    await page.locator("#btn-toggle-shader-panel").click();
    await apply(page, "wgsl-stage-standard");
    await expect(page.locator(".shader-material-item").first()).toContainText("Stage Standard");
    const state = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(state.scene.models[0].materialShaders.some(item => item.presetId === "wgsl-stage-standard")).toBe(true);
    await apply(page, "wgsl-mmd-standard");
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), state);
    await page.locator("#info-model-select").selectOption("0");
    await expect(page.locator(".shader-material-item").first()).toContainText("Stage Standard");
    const geometry = await page.evaluate(async () => (await import("/test/e2e/helpers/stage-standard-probe.mjs")).createStageProbe());
    expect(geometry.shadowMaps).toBeGreaterThan(0);
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1.4, tz: 0.7, rx: -20, ry: -25, rz: 0, camDistance: 24 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    const before = await settle(page);
    expect(before.stageShader).toBe(true);
    expect(before.signedStageLight).toBe(true);
    if (fixtureName === "sss-no-toon") expect(before.material.toon).toBe("preset:stage_toon_30gray");
    else expect(before.material.toon).toContain("sss-blue-toon.bmp");
    writeFileSync(resolve(output, "diagnostics.json"), JSON.stringify(before, null, 2));
    await expect(page.locator(".toast")).toHaveCount(0, { timeout: 15000 });
    await page.locator("#render-canvas").screenshot({ path: resolve(output, "stage.png") });
    await settle(page, false);
    await page.locator("#render-canvas").screenshot({ path: resolve(output, "no-cast-shadows.png") });
    const a = PNG.sync.read(readFileSync(resolve(output, "stage.png")));
    const b = PNG.sync.read(readFileSync(resolve(output, "no-cast-shadows.png")));
    let changed = 0;
    for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) > 8) changed++;
    expect(changed).toBeGreaterThan(100);
    await settle(page, true);
    await apply(page, "wgsl-mmd-standard");
    await page.locator("#render-canvas").screenshot({ path: resolve(output, "standard.png") });
    const after = await settle(page);
    expect(before.targets).toEqual(after.targets);
    expect(after.stageShader).toBe(false);
    expect(after.signedStageLight).toBe(false);
    await apply(page, "wgsl-stage-standard");
    await expect(page.locator(".shader-material-item").first()).toContainText("Stage Standard");
    if (backend === "framegraph") {
      await page.locator('[data-effect-tab="post"]').click();
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="ssao"]').click();
      await expect(page.locator('[data-effect-stack-row="ssao"]')).toBeVisible();
      await page.waitForFunction(() => {
        const state = window.mmdModokiE2e.getFrameGraphPostEffectsState();
        return state.ready && state.stack.includes("ssao") && state.executedFrameCount > 2;
      });
      await settle(page);
      await page.locator("#render-canvas").screenshot({ path: resolve(output, "stage-with-ssao.png") });
      const capture = await page.evaluate(path => window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, 1152, 648), output);
      expect(PNG.sync.read(readFileSync(capture.path)).width).toBe(1152);
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
    expect(errors).toEqual([]);
  } finally { await launched.close(); }
});

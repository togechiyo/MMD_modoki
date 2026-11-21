import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const probePath = "/test/e2e/helpers/csm-boundary-probe.mjs";

async function inspect(page, phase = "actual") {
  return page.evaluate(async ({ phase, probePath }) => {
    const { inspectBoundary } = await import(probePath);
    return inspectBoundary(phase);
  }, { phase, probePath });
}

async function clickMenuCommand(page, name) {
  const command = page.locator(`[data-menu-command="${name}"]`);
  await page.locator(".app-menu-group", { has: command }).locator(".app-menu-trigger").click();
  await command.click();
}

async function selectShadowMode(page, mode) {
  await clickMenuCommand(page, "view.lightShadowSettings");
  await page.locator("#light-shadow-mode").selectOption(mode);
  await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics().effectiveMode)).toBe(mode);
  await page.keyboard.press("Escape");
}

async function exportFrame(page, directory, state) {
  mkdirSync(directory, { recursive: true });
  await page.evaluate(async ({ path, width, height }) => {
    await window.mmdModokiE2e.captureSinglePngSurfaceToPath(path, width, height);
  }, { path: directory, width: state.width, height: state.height });
  return PNG.sync.read(readFileSync(resolve(directory, "single_rgba_surface_e2e.png")));
}

function maximumShadowRatio(shadow, clear, state) {
  const ratios = state.samples.flatMap(sample => {
    const x = Math.round(sample.x * shadow.width / state.width);
    const y = Math.round(sample.y * shadow.height / state.height);
    const offset = (y * shadow.width + x) * 4;
    return clear.data[offset] > 100 ? [shadow.data[offset] / clear.data[offset]] : [];
  });
  expect(ratios.length).toBeGreaterThan(200);
  return Math.max(...ratios);
}

for (const backend of ["classic", "frameGraph"]) for (const penumbra of [false, true]) {
  test(`keeps shadows across cascade splits: ${backend}, penumbra ${penumbra}`, async () => {
    const testInfo = test.info();
    const launched = await launchMmdModoki(repoRoot);
    try {
      const page = await launched.app.firstWindow();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(backend => localStorage.setItem("mmd_modoki.postEffectBackend", backend), backend);
      await page.reload();
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      // Saved projects retain PCSS, including projects from versions that
      // exposed the experimental penumbra control.
      await page.evaluate(async penumbra => {
        const project = window.mmdModokiE2e.exportProjectState();
        project.lighting.shadowPenumbraEnabled = penumbra;
        await window.mmdModokiE2e.importProjectState(project);
      }, penumbra);
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx"));
      expect(await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics())).toMatchObject({
        effectiveMode: "cascaded", filter: penumbra ? "pcss" : "none", engine: "WebGPU",
      });
      const state = await inspect(page);
      expect(state.falloff).toBe(0);
      expect(state.blend).toBeGreaterThan(0);
      const canvas = page.locator("#render-canvas");
      const actual = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath("actual.png") }));
      const exported = await exportFrame(page, testInfo.outputPath("export"), state);
      await inspect(page, "legacy");
      const legacy = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath("legacy.png") }));
      await inspect(page, "unshadowed");
      const clear = PNG.sync.read(await canvas.screenshot({ path: testInfo.outputPath("unshadowed.png") }));
      expect(maximumShadowRatio(actual, clear, state)).toBeLessThan(0.4);
      if (penumbra) expect(maximumShadowRatio(legacy, clear, state)).toBeGreaterThan(0.65);
      // Export uses render resolution; viewport screenshots use CSS resolution.
      const exportClear = await exportFrame(page, testInfo.outputPath("export-clear"), state);
      expect(maximumShadowRatio(exported, exportClear, state)).toBeLessThan(0.4);
      await inspect(page);
      await selectShadowMode(page, "standard");
      expect((await inspect(page)).falloff).toBe(0.26);
      await selectShadowMode(page, "cascaded");
      expect((await inspect(page)).falloff).toBe(0);
      expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
      expect(errors).toEqual([]);
    } finally {
      await launched.close();
    }
  });
}

async function deleteCaster(page, kind) {
  await page.locator("#info-model-select").selectOption(kind === "pmx" ? "0" : "__accessory__:0");
  page.once("dialog", dialog => dialog.accept());
  await page.locator(kind === "pmx" ? "#btn-model-delete" : "#btn-accessory-delete").click();
}

async function expectCasterSampling(page, mode, active) {
  await page.evaluate(async probePath => {
    const { waitForShadowFrames } = await import(probePath);
    await waitForShadowFrames();
  }, probePath);
  const state = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
  expect(state).toMatchObject({ effectiveMode: mode, enabled: true, lightSamplingEnabled: active });
  if (active) expect(state.casterCount).toBeGreaterThan(0);
  else expect(state.casterCount).toBe(0);
}

test("stops and restores shadow sampling when fixture casters are deleted and reloaded", async () => {
  const testInfo = test.info();
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const pmx = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");
    const obj = resolve(repoRoot, "test/fixtures/accessory/tofu.obj");
    for (const mode of ["cascaded", "standard"]) {
      await selectShadowMode(page, mode);
      const empty = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), pmx);
      await expectCasterSampling(page, mode, true);
      await page.evaluate(path => window.mmdModokiE2e.loadAccessory(path), obj);
      await deleteCaster(page, "pmx");
      await expectCasterSampling(page, mode, true);
      await deleteCaster(page, "obj");
      await expectCasterSampling(page, mode, false);

      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), pmx);
      await expectCasterSampling(page, mode, true);
      await deleteCaster(page, "pmx");
      await expectCasterSampling(page, mode, false);
      const size = { width: 640, height: 360 };
      const afterRemoval = await exportFrame(page, testInfo.outputPath(mode, "removed"), size);
      await clickMenuCommand(page, "view.toggleShadow");
      await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics().enabled)).toBe(false);
      const control = await exportFrame(page, testInfo.outputPath(mode, "shadows-off"), size);
      expect(afterRemoval.data.equals(control.data)).toBe(true);
      await clickMenuCommand(page, "view.toggleShadow");
      await page.evaluate(path => window.mmdModokiE2e.loadModel(path), pmx);
      await expectCasterSampling(page, mode, true);
      await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), empty);
      await expectCasterSampling(page, mode, false);
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
  } finally {
    await launched.close();
  }
});

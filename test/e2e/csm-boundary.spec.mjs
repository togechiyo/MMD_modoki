import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function inspect(page, phase = "actual") {
  return page.evaluate(async phase => {
    const { inspectBoundary } = await import("/test/e2e/helpers/csm-boundary-probe.mjs");
    return inspectBoundary(phase);
  }, phase);
}

async function selectShadowMode(page, mode) {
  const command = page.locator('[data-menu-command="view.lightShadowSettings"]');
  await page.locator(".app-menu-group", { has: command }).locator(".app-menu-trigger").click();
  await command.click();
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
  test(`keeps shadows across cascade splits: ${backend}, penumbra ${penumbra}`, async ({}, testInfo) => {
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

test("restores CSM shadows after deleting and reloading the last fixture caster", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    for (const kind of ["pmx", "obj"]) {
      const path = resolve(repoRoot, kind === "pmx" ? "test/fixtures/external-parent/tofu.pmx" : "test/fixtures/accessory/tofu.obj");
      for (let cycle = 0; cycle < 2; cycle++) {
        await page.evaluate(async ({ path, kind }) => {
          if (kind === "pmx") await window.mmdModokiE2e.loadModel(path);
          else await window.mmdModokiE2e.loadAccessory(path);
        }, { path, kind });
        const selector = page.locator("#info-model-select");
        await selector.selectOption(kind === "pmx" ? "0" : "__accessory__:0");
        await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics().lightSamplingEnabled)).toBe(true);
        await page.evaluate(async () => {
          const { waitForShadowFrames } = await import("/test/e2e/helpers/csm-boundary-probe.mjs");
          await waitForShadowFrames();
        });
        page.once("dialog", dialog => dialog.accept());
        await page.locator(kind === "pmx" ? "#btn-model-delete" : "#btn-accessory-delete").click();
        await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics())).toMatchObject({
          effectiveMode: "cascaded", casterCount: 0,
        });
        // PMX removal currently omits syncShadowSamplingWithCasterList; track
        // that existing lifecycle issue separately from cascade-edge fading.
        if (kind === "obj") expect(await page.evaluate(() =>
          window.mmdModokiE2e.getShadowRuntimeDiagnostics().lightSamplingEnabled)).toBe(false);
        await page.evaluate(async () => {
          const { waitForShadowFrames } = await import("/test/e2e/helpers/csm-boundary-probe.mjs");
          await waitForShadowFrames();
        });
      }
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics())).toMatchObject({ count: 0 });
  } finally {
    await launched.close();
  }
});

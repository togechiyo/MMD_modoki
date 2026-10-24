import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { luminousInstanceRow, luminousInstanceControl, setLuminousInstancePosition, getLuminousInstanceRuntime } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("RC illuminates scenes exceeding the old per-mesh and total triangle budgets", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root), report = {}, errors = [];
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      state.lighting.intensity = 0; state.lighting.ambientIntensity = 0;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => { const probe = await import("/test/e2e/helpers/luminous-radiance-probe.mjs");
      await probe.createRadianceProbe(); probe.createDenseRadianceProbe({ subdivisions: 192, tiles: 2 }); });
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: -25, ry: 0, rz: 0, camDistance: 11 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`); await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    if (!await luminousInstanceRow(page).count()) {
      await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click();
    }
    const control = key => luminousInstanceControl(page, key);
    for (const [key, value] of [["luminousIntensity", 0], ["luminousRadianceStrength", 100], ["luminousRadianceRange", 3]]) {
      await setLuminousInstancePosition(page, key, value);
    }
    async function capture(name) {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      const points = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState({ blocker: false }));
      const path = testInfo.outputPath(`${name}.png`); await expect(page.locator(".toast")).toHaveCount(0);
      await page.locator("#render-canvas").screenshot({ path });
      const png = PNG.sync.read(readFileSync(path)), x = Math.round(points.floor[0] * png.width), y = Math.round(points.floor[1] * png.height);
      const rgb = [0, 0, 0];
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) for (let c = 0; c < 3; c++) rgb[c] += png.data[((y + dy) * png.width + x + dx) * 4 + c] / 169;
      report[name] = { rgb, runtime: (await getLuminousInstanceRuntime(page)).luminousRadiance };
      writeFileSync(testInfo.outputPath("budget-report.json"), JSON.stringify(report, null, 2)); return report[name];
    }
    const off = await capture("rc-off");
    await control("luminousRadianceEnabled").check();
    for (const [name, subdivisions, tiles] of [["total-over-100k", 192, 2], ["mesh-over-100k", 384, 1]]) {
      if (tiles === 1) await page.evaluate(async options => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createDenseRadianceProbe(options), { subdivisions, tiles });
      const on = await capture(name);
      expect(on.runtime.error).toBeNull(); expect(on.runtime.triangles).toBeGreaterThan(tiles * subdivisions * subdivisions * 2);
      expect(on.rgb[0] - off.rgb[0]).toBeGreaterThan(10); expect(on.rgb[0] - on.rgb[1]).toBeGreaterThan(10);
      report[name].profile = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceProbe(10));
      expect(report[name].profile.counts.cascades).toBe(0); expect(report[name].profile.counts.receiver).toBeGreaterThan(0);
    }
    // Retain a finite safety ceiling; reject before packing, then recover without toggling RC.
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createDenseRadianceProbe({ subdivisions: 768 }));
    const rejected = await capture("over-ceiling");
    expect(rejected.runtime.error).toContain("1179672 opaque triangles; limit 1000000");
    expect(rejected.runtime.triangles).toBe(0); expect(rejected.rgb[0] - off.rgb[0]).toBeLessThan(3);
    report["over-ceiling"].profile = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceProbe(10));
    expect(report["over-ceiling"].profile.counts).toEqual({ cascades: 0, receiver: 0 });
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createDenseRadianceProbe({ subdivisions: 384 }));
    const restored = await capture("under-ceiling-restored");
    expect(restored.runtime.error).toBeNull(); expect(restored.rgb[0] - off.rgb[0]).toBeGreaterThan(10);
    writeFileSync(testInfo.outputPath("budget-report.json"), JSON.stringify(report, null, 2));
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { await launched.close(); }
});

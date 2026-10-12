import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("RC reuses its static field and stops compute at zero strength", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root), report = {}, errors = [];
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => {
      const probe = await import("/test/e2e/helpers/luminous-radiance-probe.mjs");
      await probe.createRadianceProbe(); probe.createDenseRadianceProbe();
    });
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: -25, ry: 0, rz: 0, camDistance: 11 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    if (!await page.locator('[data-effect-stack-row="luminous"]').count()) {
      await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click();
    }
    const control = key => page.locator(`[data-effect-stack-control="${key}"]`);
    const slider = (key, value) => control(key).evaluate((input, value) => {
      input.value = String(value); input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await slider("luminousRadianceRange", 3); await slider("luminousIntensity", 2);
    await control("luminousRadianceEnabled").selectOption("1");
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    async function measure(name) {
      await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState({ blocker: false }));
      report[name] = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceProbe());
      report[name].runtime = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().luminousRadiance);
      writeFileSync(testInfo.outputPath("performance-report.json"), JSON.stringify(report, null, 2));
      return report[name];
    }
    const active = await measure("static-active");
    await slider("luminousRadianceStrength", 0); const zero = await measure("zero-strength");
    await slider("luminousRadianceStrength", 56); const restored = await measure("strength-restored");
    expect(active.runtime.triangles).toBeGreaterThan(32768);
    expect(active.counts.cascades).toBe(0);
    expect(active.counts.receiver).toBeGreaterThan(0);
    expect(zero.counts).toEqual({ cascades: 0, receiver: 0 });
    expect(restored.counts.cascades).toBe(0); expect(restored.counts.receiver).toBeGreaterThan(0);
    for (const change of ["vertex", "transform"]) {
      report[change] = await page.evaluate(async change => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceProbe(30, change), change);
      expect(report[change].counts.cascades).toBe(4);
      expect(report[change].counts.receiver).toBeGreaterThan(0);
    }
    await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(2600, 1600));
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    const large = await measure("large-view");
    expect(Math.max(...large.receiverSize)).toBeLessThanOrEqual(640);
    expect(large.counts.cascades).toBe(0); expect(large.counts.receiver).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    expect(errors).toEqual([]);
  } finally { await launched.close(); }
});

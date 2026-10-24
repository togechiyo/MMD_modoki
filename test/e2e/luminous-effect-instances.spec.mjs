import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const difference = (a, b) => a.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : Math.abs(value - b[i])), 0) / (a.length * 0.75);

test("Luminous instances own RC settings, resources and enabled keys", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), report = { errors: [] };
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false; state.lighting.shadowEnabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createRadianceProbe());
    for (const id of ["light-intensity", "light-ambient"]) await page.locator(`#${id}`).evaluate(input => { input.value = "0"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: -25, ry: 0, rz: 0, camDistance: 11 })) { const input = page.locator(`#bone-controls input[data-control-key='${key}']`); await input.fill(String(value)); await input.press("Enter"); }
    await page.locator("#btn-kf-add").click();
    await page.locator('[data-effect-tab="post"]').click();
    for (let i = 0; i < 2; i++) { await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click(); }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const [a, b] = (await state()).instances.map(item => item.instanceId), row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    const fixed = async (id, field, value) => {
      await expandEffectInstance(row(id)); const input = row(id).locator(`[data-instance-fixed="${field}"]`);
      await input.fill(String(Math.round(field === "radianceStrength" ? value / 8 * 100 : (value - 1) / 99 * 100)));
      await input.dispatchEvent("input"); await input.dispatchEvent("change");
    };
    const diagnostics = () => page.evaluate(() => window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects);
    const capture = async name => {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState());
      await expect(page.locator(".toast")).toHaveCount(0);
      const path = testInfo.outputPath(`${name}.png`); await page.locator("#render-canvas").screenshot({ path }); return PNG.sync.read(readFileSync(path)).data;
    };
    for (const id of [a, b]) { await expandEffectInstance(row(id)); const intensity = row(id).locator('[data-instance-field="intensity"]').locator("..").locator(".range-number-input"); await intensity.fill("0"); await intensity.press("Enter"); await fixed(id, "radianceRange", 4); }
    const dark = await capture("rc-off");
    await expandEffectInstance(row(a)); await row(a).locator('[data-instance-fixed-toggle="radiance"]').check(); const single = await capture("one-rc");
    expect(difference(dark, single)).toBeGreaterThan(0.2);
    const first = await diagnostics(); expect(first.resourcePlan.activeEffects).not.toContain("luminous"); expect(first.controller.instances.find(item => item.instanceId === a).radiance.emitters).toBeGreaterThan(0);
    await fixed(b, "radianceStrength", 2); await row(b).locator('[data-instance-fixed-toggle="radiance"]').check();
    const double = await capture("two-rc"); expect(difference(single, double)).toBeGreaterThan(0.2);
    const both = await diagnostics(); expect(both.controller.instances.every(item => item.radiance.emitters > 0)).toBe(true);
    expect(new Set(both.controller.instances.flatMap(item => item.taskNames)).size).toBe(both.controller.instances.flatMap(item => item.taskNames).length);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click(); await capture("undo-second-rc");
    expect((await diagnostics()).controller.instances.find(item => item.instanceId === b).radiance).toBeNull();
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click(); await capture("redo-second-rc");
    expect((await diagnostics()).controller.instances.find(item => item.instanceId === b).radiance.emitters).toBeGreaterThan(0);
    const seek = async frame => { await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter"); };
    await row(b).locator('[data-instance-field="enabled"]').uncheck(); await row(a).locator('[data-instance-action="select"]').click();
    await seek(0); await page.locator("#effect-key-enabled").uncheck(); await page.locator("#btn-kf-add").click();
    await seek(20); await page.locator("#effect-key-enabled").check(); await page.locator("#btn-kf-add").click();
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    await seek(0); expect(difference(dark, await capture("key-off"))).toBeLessThan(0.1);
    await seek(20); expect(difference(single, await capture("key-on"))).toBeLessThan(0.1);
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    const saved = await state(); await page.locator("#btn-effect-toggle-framegraph").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().resourcesAllocated)).toBe(false);
    await page.locator("#btn-effect-toggle-framegraph").click(); expect(difference(single, await capture("restored"))).toBeLessThan(0.1); expect(await state()).toEqual(saved);
    for (const type of ["ssao", "ssgi", "ssr", "motionBlur"]) {
      await page.locator("#btn-effect-add-post").click(); await page.locator(`[data-effect-add-post="${type}"]`).click();
      const id = (await state()).instances.find(item => item.type === type).instanceId;
      await row(id).locator('[data-instance-field="enabled"]').uncheck();
    }
    await capture("all-resource-inputs");
    report.differences = { single: difference(dark, single), layering: difference(single, double) }; report.diagnostics = await diagnostics();
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(report.errors).toEqual([]);
  } finally { writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2)); await launched.close(); }
});

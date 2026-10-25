import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance, registerEffectInstance } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const difference = (a, b) => a.reduce((sum, value, i) => sum + (i % 4 === 3 ? 0 : Math.abs(value - b[i])), 0) / (a.length * 0.75);

test("legacy nested RC migrates to an independent row with its enabled keys", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root, { effectTimeline: true });
  try {
    const page = await launched.app.firstWindow(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    const legacyProject = await page.evaluate(() => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      project.effects.frameGraphInstances = { version: 1, order: ["fx-legacy"], instances: [{
        instanceId: "fx-legacy", type: "luminous", label: "Legacy light", settings: { enabled: true, intensity: 1, threshold: 0.15, radius: 48 },
        fixedSettings: { radiance: { enabled: true, strength: 2, range: 4 } },
        animation: { version: 1, tracks: [{ effectId: "luminous", valueVersion: 1, base: { enabled: false, intensity: 1 }, keys: [{ frame: 20, value: { enabled: true, intensity: 1 } }] }] },
      }] };
      return project;
    });
    const path = testInfo.outputPath("legacy-nested.json"); writeFileSync(path, JSON.stringify(legacyProject));
    await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path);
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="file.loadProject"]').click();
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await expect(page.locator("#shader-panel")).toBeVisible();
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const migrated = await state(), rc = migrated.instances.find(item => item.type === "luminousRadiance");
    expect(migrated.order).toEqual([rc.instanceId, "fx-legacy"]);
    const row = page.locator(`[data-effect-instance-row="${rc.instanceId}"]`);
    await expandEffectInstance(row);
    await expect(row.locator('[data-instance-field="enabled"]')).not.toBeChecked();
    await expect(row.locator('[data-instance-fixed="radianceRange"]')).toHaveValue("3");
    await page.locator("#current-frame").fill("20"); await page.locator("#current-frame").press("Enter");
    await expect(row.locator('[data-instance-field="enabled"]')).toBeChecked();
    await page.locator('[data-effect-instance-row="fx-legacy"] [data-instance-field="enabled"]').uncheck();
    await expect(row.locator('[data-instance-field="enabled"]')).toBeChecked();
    const saved = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    await page.evaluate(project => window.mmdModokiE2e.importProjectState(project), saved);
    expect((await state()).instances).toHaveLength(2);
    expect((await state()).instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance).toEqual({ enabled: true, strength: 2, range: 4 });
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    expect(errors).toEqual([]);
  } finally { await launched.close(); }
});

test("Luminous and Luminous RC own independent tasks, settings and enabled keys", async ({}, testInfo) => {
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
    for (const type of ["luminous", "luminousRadiance", "luminousRadiance"]) { await page.locator("#btn-effect-add-post").click(); await page.locator(`[data-effect-add-post="${type}"]`).click(); }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const [a, b] = (await state()).instances.filter(item => item.type === "luminousRadiance").map(item => item.instanceId), row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    const glow = (await state()).instances.find(item => item.type === "luminous").instanceId;
    await row(glow).locator('[data-instance-field="enabled"]').uncheck();
    expect(await row(glow).locator('[data-instance-fixed="radianceRange"]').count()).toBe(0);
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
    for (const id of [a, b]) { await row(id).locator('[data-instance-field="enabled"]').uncheck(); await fixed(id, "radianceRange", 4); }
    const dark = await capture("rc-off");
    await row(a).locator('[data-instance-field="enabled"]').check(); const single = await capture("one-rc");
    expect(difference(dark, single)).toBeGreaterThan(0.2);
    const first = await diagnostics(); expect(first.resourcePlan.activeEffects).not.toContain("luminous"); expect(first.controller.instances.find(item => item.instanceId === a).radiance.emitters).toBeGreaterThan(0);
    await fixed(b, "radianceStrength", 2); await row(b).locator('[data-instance-field="enabled"]').check();
    const double = await capture("two-rc"); expect(difference(single, double)).toBeGreaterThan(0.2);
    const both = await diagnostics(); expect(both.controller.instances.filter(item => item.type === "luminousRadiance").every(item => item.radiance.emitters > 0)).toBe(true);
    expect(both.controller.instances.find(item => item.instanceId === glow).radiance).toBeNull();
    expect(new Set(both.controller.instances.flatMap(item => item.taskNames)).size).toBe(both.controller.instances.flatMap(item => item.taskNames).length);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect(difference(single, await capture("undo-second-rc"))).toBeLessThan(0.1);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.redo"]').click(); await capture("redo-second-rc");
    expect((await diagnostics()).controller.instances.find(item => item.instanceId === b).radiance.emitters).toBeGreaterThan(0);
    const seek = async frame => { await page.locator("#current-frame").fill(String(frame)); await page.locator("#current-frame").press("Enter"); };
    await row(b).locator('[data-instance-field="enabled"]').uncheck(); await expandEffectInstance(row(a));
    await seek(0); await row(a).locator('[data-instance-field="enabled"]').uncheck(); await registerEffectInstance(row(a));
    await seek(20); await row(a).locator('[data-instance-field="enabled"]').check(); await registerEffectInstance(row(a));
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    await seek(0); expect(difference(dark, await capture("key-off"))).toBeLessThan(0.1);
    await seek(20); expect(difference(single, await capture("key-on"))).toBeLessThan(0.1);
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    const saved = await state(); await page.locator("#btn-effect-toggle-framegraph").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().resourcesAllocated)).toBe(false);
    await page.locator("#btn-effect-toggle-framegraph").click(); expect(difference(single, await capture("restored"))).toBeLessThan(0.1); expect(await state()).toEqual(saved);
    await row(glow).locator('[data-instance-field="enabled"]').check(); await capture("glow-and-rc");
    expect((await diagnostics()).controller.instances.find(item => item.instanceId === a).radiance.emitters).toBeGreaterThan(0);
    await expandEffectInstance(row(glow)); await row(glow).locator('[data-instance-action="delete"]').click();
    await capture("rc-without-glow"); expect((await diagnostics()).resourcePlan.needsLuminousMask).toBe(false);
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

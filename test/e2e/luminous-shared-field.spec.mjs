import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance, dragEffectStackRow } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const baselineDir = resolve(root, "local-references/luminous-rc-shared-field-before");
const recordBaseline = process.env.MMD_RC_SHARED_FIELD_BASELINE === "1";
const compareBaseline = process.env.MMD_RC_SHARED_FIELD_COMPARE_BASELINE === "1";
function difference(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let sum = 0, samples = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    if (x >= a.width * 0.85 && y >= a.height * 0.8) continue;
    for (let channel = 0; channel < 3; channel++) {
      const offset = (y * a.width + x) * 4 + channel;
      sum += Math.abs(a.data[offset] - b.data[offset]); samples++;
    }
  }
  return sum / samples;
}

test("RC fields share matching ranges while keeping receiver settings and order independent", async ({}, testInfo) => {
  test.setTimeout(180000);
  if (compareBaseline) expect(existsSync(baselineDir), "Capture a stage-A baseline on this GPU first").toBe(true);
  const launched = await launchMmdModoki(root), report = { baseline: recordBaseline, errors: [], comparisons: {}, validationCounts: {} };
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      state.lighting.shadowEnabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createRadianceProbe());
    for (const id of ["light-intensity", "light-ambient"]) await page.locator(`#${id}`).evaluate(input => {
      input.value = "0"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: -25, ry: 0, rz: 0, camDistance: 11 })) {
      const input = page.locator(`#bone-controls input[data-control-key='${key}']`); await input.fill(String(value)); await input.press("Enter");
    }
    await page.locator("#btn-kf-add").click(); await page.locator('[data-effect-tab="post"]').click();
    for (let i = 0; i < 2; i++) { await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminousRadiance"]').click(); }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const diagnostics = () => page.evaluate(() => window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects);
    const [a, b] = (await state()).instances.filter(item => item.type === "luminousRadiance").map(item => item.instanceId);
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`), enabled = id => row(id).locator('[data-instance-field="enabled"]');
    const fixed = async (id, field, percent) => {
      await expandEffectInstance(row(id)); const input = row(id).locator(`[data-instance-fixed="${field}"]`);
      await input.fill(String(percent)); await input.dispatchEvent("input"); await input.dispatchEvent("change");
    };
    for (const [id, strength, softness] of [[a, 13, 20], [b, 25, 65]]) {
      await fixed(id, "radianceStrength", strength); await fixed(id, "radianceRange", 3);
      await fixed(id, "radianceSoftness", softness); await enabled(id).uncheck();
    }
    const compare = (name, image, path) => {
      const beforePath = resolve(baselineDir, `${name}.png`);
      if (recordBaseline) { mkdirSync(baselineDir, { recursive: true }); writeFileSync(beforePath, readFileSync(path)); }
      else if (existsSync(beforePath)) {
        const before = PNG.sync.read(readFileSync(beforePath));
        if (before.width !== image.width || before.height !== image.height) {
          report.comparisons[name] = { skipped: "Viewport size differs", before: [before.width, before.height], after: [image.width, image.height] };
          if (compareBaseline) expect([image.width, image.height], `${name}: same-GPU baseline requires the same viewport`).toEqual([before.width, before.height]);
        } else {
          report.comparisons[name] = difference(before, image);
          if (compareBaseline) expect(report.comparisons[name], `${name}: baseline illumination difference`).toBeLessThan(0.1);
        }
      }
      return image;
    };
    const capture = async name => {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState());
      report.validationCounts[name] = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count);
      expect(report.validationCounts[name]).toBe(0); await expect(page.locator(".toast")).toHaveCount(0);
      const path = testInfo.outputPath(`${name}.png`); await page.locator("#render-canvas").screenshot({ path });
      return compare(name, PNG.sync.read(readFileSync(path)), path);
    };
    const receivers = async () => (await diagnostics()).controller.instances.filter(item => item.type === "luminousRadiance")
      .flatMap(item => item.taskNames.filter(name => name.endsWith("luminousRadianceReceiver")));
    const bindings = async () => page.evaluate(async names => (await import("/test/e2e/helpers/luminous-shared-scene-probe.mjs")).sharedRadianceBindings(names), await receivers());
    const measure = async () => page.evaluate(async names => (await import("/test/e2e/helpers/luminous-shared-scene-probe.mjs")).measureSharedRadianceScene(names), await receivers());
    const assertGroups = async (name, groups, active = 2) => {
      const data = report[name] = { bindings: await bindings(), moving: await measure() };
      for (const key of ["triangles", "nodes", "emissionPixels"]) expect(data.bindings.distinct[key]).toBe(1);
      // Disabled consumers may retain a prior ping-pong binding until they execute again.
      if (active === data.bindings.receiverCount) for (const key of ["radianceField", "probeEpochs"]) {
        expect(data.bindings.distinct[key]).toBe(recordBaseline ? data.bindings.receiverCount : groups);
      }
      for (const key of ["outputGi", "previousGi"]) expect(data.bindings.distinct[key]).toBe(data.bindings.receiverCount);
      expect(data.moving.bvhPerFrame).toEqual(Array(data.moving.frames).fill(active ? 1 : 0));
      expect(data.moving.dispatches).toEqual({ cascades: data.moving.frames * (recordBaseline ? active : Math.min(active, groups)) * 4, receiver: data.moving.frames * active });
    };
    const dark = await capture("off"); await enabled(a).check(); const first = await capture("first-only");
    await enabled(a).uncheck(); await enabled(b).check(); const second = await capture("second-only");
    expect(difference(first, second)).toBeGreaterThan(0.2); expect(difference(dark, second)).toBeGreaterThan(0.2);
    await enabled(a).check(); const combined = await capture("combined"); await assertGroups("matching", 1);
    const generation = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration);
    await fixed(b, "radianceRange", 7); const split = await capture("split-ranges"); await assertGroups("split", 2);
    expect(difference(combined, split)).toBeGreaterThan(0.1);
    await fixed(b, "radianceRange", 3); expect(difference(combined, await capture("joined-ranges"))).toBeLessThan(0.1); await assertGroups("joined", 1);
    expect(await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().buildGeneration)).toBe(generation);
    await enabled(a).uncheck(); expect(difference(second, await capture("first-off"))).toBeLessThan(0.1); await assertGroups("firstOff", 1, 1);
    await enabled(b).uncheck(); expect(difference(dark, await capture("all-off"))).toBeLessThan(0.1);
    report.idle = await measure(); expect(report.idle.bvhUpdates).toBe(0); expect(report.idle.dispatches).toEqual({ cascades: 0, receiver: 0 });
    await enabled(a).check(); await enabled(b).check(); expect(difference(combined, await capture("all-restored"))).toBeLessThan(0.1);
    const saved = await state(); await expandEffectInstance(row(a)); await row(a).locator('[data-instance-action="delete"]').click();
    expect(difference(second, await capture("after-delete"))).toBeLessThan(0.1); await assertGroups("survivor", 1, 1);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect(difference(combined, await capture("undo-delete"))).toBeLessThan(0.1);
    const restored = await state(); expect(restored.order).toEqual(saved.order);
    expect(saved.instances.map(item => restored.instances.find(candidate => candidate.instanceId === item.instanceId))).toEqual(saved.instances);
    await dragEffectStackRow(row(a), row(b), "before");
    await expect.poll(async () => (await state()).order).toEqual([...saved.order].reverse());
    await capture("reordered"); await assertGroups("reordered", 1);
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect(difference(combined, await capture("undo-order"))).toBeLessThan(0.1);
    const output = testInfo.outputPath("export"); mkdirSync(output, { recursive: true });
    await page.evaluate(output => window.mmdModokiE2e.captureSinglePngSurfaceToPath(output, 640, 360), output);
    const exportPath = resolve(output, "single_rgba_surface_e2e.png"), exported = PNG.sync.read(readFileSync(exportPath));
    expect([exported.width, exported.height]).toEqual([640, 360]); compare("export-640x360", exported, exportPath);
    expect(difference(combined, await capture("export-restored"))).toBeLessThan(0.1); await assertGroups("afterExport", 1);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(report.errors).toEqual([]);
  } finally {
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    if (recordBaseline) { mkdirSync(baselineDir, { recursive: true }); writeFileSync(resolve(baselineDir, "report.json"), JSON.stringify(report, null, 2)); }
    await launched.close();
  }
});

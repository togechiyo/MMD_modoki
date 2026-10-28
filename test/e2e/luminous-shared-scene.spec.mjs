import { test, expect } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { expandEffectInstance } from "./helpers/effect-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const baselineDir = resolve(root, "local-references/luminous-rc-shared-scene-before");
const recordBaseline = process.env.MMD_RC_SHARED_SCENE_BASELINE === "1";
const compareBaseline = process.env.MMD_RC_SHARED_SCENE_COMPARE_BASELINE === "1";
// Camera-edit gizmo labels at bottom right are not lighting and disappear after renderer reload.
// Retain full PNG evidence, but compare radiance outside that editor overlay region.
const difference = (a, b) => {
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
};

test("RC scene sharing preserves distinct ranges and independent consumer lifecycles", async ({}, testInfo) => {
  test.setTimeout(240000);
  if (compareBaseline) expect(existsSync(baselineDir), "Capture an unshared baseline on this GPU first").toBe(true);
  const launched = await launchMmdModoki(root), report = { baseline: recordBaseline, errors: [], comparisons: {}, validationCounts: {} };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.lighting.shadowEnabled = false;
      state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous");
    await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createRadianceProbe());
    for (const id of ["light-intensity", "light-ambient"]) {
      await page.locator(`#${id}`).evaluate(input => {
        input.value = "0"; input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: -25, ry: 0, rz: 0, camDistance: 11 })) {
      const input = page.locator(`#bone-controls input[data-control-key='${key}']`);
      await input.fill(String(value)); await input.press("Enter");
    }
    await page.locator("#btn-kf-add").click();
    await page.locator('[data-effect-tab="post"]').click();
    for (let i = 0; i < 2; i++) {
      await page.locator("#btn-effect-add-post").click();
      await page.locator('[data-effect-add-post="luminousRadiance"]').click();
    }
    const state = () => page.evaluate(() => window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances);
    const diagnostics = () => page.evaluate(() => window.mmdModokiDiagnostics.dumpPerformanceSnapshot().frameGraphPostEffects);
    const [a, b] = (await state()).instances.filter(item => item.type === "luminousRadiance").map(item => item.instanceId);
    const row = id => page.locator(`[data-effect-instance-row="${id}"]`);
    const enabled = id => row(id).locator('[data-instance-field="enabled"]');
    const fixed = async (id, field, percent) => {
      await expandEffectInstance(row(id)); const input = row(id).locator(`[data-instance-fixed="${field}"]`);
      await input.fill(String(percent)); await input.dispatchEvent("input"); await input.dispatchEvent("change");
    };
    for (const [id, strength, range, softness] of [[a, 13, 3, 20], [b, 25, 7, 65]]) {
      await fixed(id, "radianceStrength", strength); await fixed(id, "radianceRange", range);
      await fixed(id, "radianceSoftness", softness); await enabled(id).uncheck();
    }
    let canvasSize;
    const capture = async name => {
      await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
      const readCanvasSize = () => page.locator("#render-canvas").evaluate(canvas => ({ width: canvas.clientWidth, height: canvas.clientHeight }));
      if (canvasSize) await expect.poll(readCanvasSize).toEqual(canvasSize);
      else canvasSize = await readCanvasSize();
      await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState());
      report.validationCounts[name] = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count);
      expect(report.validationCounts[name], `${name}: WebGPU validation errors`).toBe(0);
      await expect(page.locator(".toast")).toHaveCount(0);
      const path = testInfo.outputPath(`${name}.png`);
      await page.locator("#render-canvas").screenshot({ path });
      const image = PNG.sync.read(readFileSync(path)), beforePath = resolve(baselineDir, `${name}.png`);
      if (recordBaseline) { mkdirSync(baselineDir, { recursive: true }); writeFileSync(beforePath, readFileSync(path)); }
      else if (existsSync(beforePath)) {
        const before = PNG.sync.read(readFileSync(beforePath));
        report.comparisons[name] = before.width === image.width && before.height === image.height
          ? { meanAbsoluteRgb: difference(before, image), width: image.width, height: image.height }
          : { skipped: "Viewport size differs", before: [before.width, before.height], after: [image.width, image.height] };
        if (compareBaseline) {
          expect(report.comparisons[name].skipped, `${name}: same-GPU baseline requires the same viewport`).toBeUndefined();
          expect(report.comparisons[name].meanAbsoluteRgb, `${name}: baseline illumination difference`).toBeLessThan(0.1);
        }
      }
      return image;
    };
    const receivers = async () => (await diagnostics()).controller.instances.filter(item => item.type === "luminousRadiance")
      .flatMap(item => item.taskNames.filter(name => name.endsWith("luminousRadianceReceiver")));
    const bindings = async () => page.evaluate(async names => (await import("/test/e2e/helpers/luminous-shared-scene-probe.mjs")).sharedRadianceBindings(names), await receivers());
    const measure = async () => page.evaluate(async names => (await import("/test/e2e/helpers/luminous-shared-scene-probe.mjs")).measureSharedRadianceScene(names), await receivers());
    const dark = await capture("rc-off");
    await enabled(a).check(); const first = await capture("first-only");
    expect(difference(dark, first)).toBeGreaterThan(0.2);
    await enabled(a).uncheck(); await enabled(b).check(); const second = await capture("second-only");
    expect(difference(first, second)).toBeGreaterThan(0.2);
    await enabled(a).check(); const combined = await capture("combined");
    expect(difference(first, combined)).toBeGreaterThan(0.2);
    report.bindings = await bindings(); report.moving = await measure();
    expect(report.bindings.receiverCount).toBe(2);
    expect(report.bindings.volumes[0]).not.toEqual(report.bindings.volumes[1]);
    for (const name of ["probeEpochs", "radianceField", "outputGi", "previousGi"]) expect(report.bindings.distinct[name]).toBe(2);
    for (const name of ["triangles", "nodes", "emissionPixels"]) expect(report.bindings.distinct[name]).toBe(recordBaseline ? 2 : 1);
    expect(report.moving.bvhPerFrame).toEqual(Array(report.moving.frames).fill(recordBaseline ? 2 : 1));
    await enabled(a).uncheck(); await capture("one-disabled");
    report.singleMoving = await measure();
    expect(report.singleMoving.bvhPerFrame).toEqual(Array(report.singleMoving.frames).fill(1));
    await capture("one-disabled-after-movement");
    if (!recordBaseline) {
      const name = (await diagnostics()).controller.instances.find(item => item.instanceId === a).taskNames.find(name => name.endsWith("luminousRadianceReceiver"));
      await page.evaluate(async name => (await import("/test/e2e/helpers/luminous-shared-scene-probe.mjs")).watchResumedRadianceContact(name), name);
    }
    await enabled(a).check();
    expect(difference(combined, await capture("restored-after-missed-movement"))).toBeLessThan(0.1);
    if (!recordBaseline) {
      report.resumedContact = await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-shared-scene-probe.mjs")).resumedRadianceContact());
      expect(report.resumedContact).not.toBeNull();
      expect(report.resumedContact.dirtyMin[3]).toBe(1);
      for (let axis = 0; axis < 3; axis++) {
        expect(report.resumedContact.dirtyMin[axis]).toBeCloseTo(report.resumedContact.volumeMin[axis], 4);
        expect(report.resumedContact.dirtyMax[axis]).toBeCloseTo(report.resumedContact.volumeMin[axis] + report.resumedContact.volumeSize[axis], 4);
      }
    }
    await enabled(a).uncheck(); await enabled(b).uncheck(); await capture("all-disabled");
    report.idle = await measure(); expect(report.idle.bvhUpdates).toBe(0); expect(report.idle.bufferUploads).toBe(0);
    expect(report.idle.dispatches).toEqual({ cascades: 0, receiver: 0 });
    await enabled(a).check(); await enabled(b).check();
    expect(difference(combined, await capture("reenabled"))).toBeLessThan(0.1);
    const saved = await state(), projectPath = testInfo.outputPath("shared-rc.json");
    await launched.app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, projectPath);
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="file.saveProject"]').click();
    await expect.poll(() => existsSync(projectPath)).toBe(true);
    expect(JSON.parse(readFileSync(projectPath, "utf8")).effects.frameGraphInstances).toEqual(saved);
    for (const backend of ["classic", "frameGraph"]) {
      await page.locator('select[data-postfx-select="backend"]').selectOption(backend, { force: true });
      await page.waitForFunction(backend => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === backend, backend);
      await expect(page.locator("#status-text")).toContainText("Project restored after Runtime change");
      expect(await state()).toEqual(saved);
    }
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createRadianceProbe());
    expect(difference(combined, await capture("backend-restored"))).toBeLessThan(0.1);
    if (!await page.locator("#shader-panel").isVisible()) await page.locator("#btn-toggle-shader-panel").click();
    await page.locator('[data-effect-tab="post"]').click();
    await page.locator("#btn-effect-toggle-framegraph").click();
    await expect.poll(() => page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().resourcesAllocated)).toBe(false);
    await page.locator("#btn-effect-toggle-framegraph").click();
    expect(difference(combined, await capture("master-restored"))).toBeLessThan(0.1);
    await expandEffectInstance(row(a)); await row(a).locator('[data-instance-action="delete"]').click();
    expect(difference(second, await capture("surviving-consumer"))).toBeLessThan(0.1);
    report.survivor = await measure(); expect(report.survivor.bvhPerFrame).toEqual(Array(report.survivor.frames).fill(1));
    await page.locator('.app-menu-quick-button[data-menu-command="edit.undo"]').click();
    expect(difference(combined, await capture("undo-deletion"))).toBeLessThan(0.1);
    const restored = await state();
    // Map insertion order changes after delete/undo; the explicit order is the render/UI contract.
    expect({ ...restored, instances: saved.instances.map(item => restored.instances.find(candidate => candidate.instanceId === item.instanceId)) }).toEqual(saved);
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-shared-scene-probe.mjs")).clearSharedRadianceProbe());
    await launched.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, projectPath);
    await page.locator('.app-menu-trigger[data-i18n="menu.file"]').click();
    await page.locator('[data-menu-command="file.loadProject"]').click();
    await expect(page.locator("#status-text")).toContainText(/Project loaded|プロジェクト/);
    expect(await state()).toEqual(saved);
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).createRadianceProbe());
    expect(difference(combined, await capture("project-reloaded"))).toBeLessThan(0.1);
    report.reloadedBindings = await bindings();
    for (const name of ["triangles", "nodes", "emissionPixels"]) expect(report.reloadedBindings.distinct[name]).toBe(recordBaseline ? 2 : 1);
    report.diagnostics = await diagnostics();
    if (compareBaseline) expect(Object.keys(report.comparisons).length).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0);
    expect(report.errors).toEqual([]);
  } finally {
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    if (recordBaseline) { mkdirSync(baselineDir, { recursive: true }); writeFileSync(resolve(baselineDir, "report.json"), JSON.stringify(report, null, 2)); }
    await launched.close();
  }
});

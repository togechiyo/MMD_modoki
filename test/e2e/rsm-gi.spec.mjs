import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
for (const backend of ["classic", "frameGraph"]) test(`RSM GI ${backend} stops when off and supports textured Standard, MMD and PBR MultiMaterials`, async () => {
  const output = resolve(root, "artifacts/e2e/rsm-gi", backend);
  const launched = await launchMmdModoki(root), errors = [], report = {};
  mkdirSync(output, { recursive: true });
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(backend => localStorage.setItem("mmd_modoki.postEffectBackend", backend), backend);
    await page.reload();
    await page.waitForFunction(value => window.mmdModokiE2e?.getFrameGraphPostEffectsState().backend === value, backend);
    await page.evaluate(async () => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state);
      (await import("/test/e2e/helpers/rsm-gi-probe.mjs")).observeRsmGiController();
    });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.evaluate(async () => {
      await (await import("/test/e2e/helpers/rsm-gi-probe.mjs")).addRsmMultiMaterialProbe();
      window.mmdModokiE2e.setCameraPose({ x: 7, y: 6, z: -12 }, { x: 0, y: 1, z: 0 });
    });
    const read = (options = {}) => page.evaluate(async options => (await import("/test/e2e/helpers/rsm-gi-probe.mjs")).readRsmGiProbe(options), options);
    const toggle = enabled => page.evaluate(async enabled => (await import("/test/e2e/helpers/rsm-gi-probe.mjs")).setRsmGiEnabled(enabled), enabled);
    report.initialOff = await read();
    await toggle(false); report.offSettled = await read();
    await toggle(true); report.on = await read({ readTextures: true });
    await page.evaluate(async () => (await import("/test/e2e/helpers/rsm-gi-probe.mjs")).addRsmMultiMaterialProbe({ kinds: ["pbr"] }));
    await toggle(true); report.latePbr = await read({ readTextures: true });
    await expect(page.locator(".toast")).toHaveCount(0);
    await page.locator("#render-canvas").screenshot({ path: resolve(output, "gi-on.png") });
    await toggle(false); report.off = await read();
    await toggle(false); report.offAgain = await read();
    await toggle(true); report.resumed = await read({ readTextures: true });
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2));
    expect(report.initialOff.enabled).toBe(false);
    expect(report.initialOff.rsmEnabled).toBe(false);
    expect(report.initialOff.activeTargets).toEqual([]);
    expect(report.offSettled.rsmFrames).toBe(report.initialOff.rsmFrames);
    expect(report.on.enabled).toBe(true); expect(report.on.rsmEnabled).toBe(true);
    expect(report.on.rsmFrames).toBeGreaterThan(report.offSettled.rsmFrames);
    for (const state of [report.on, report.latePbr, report.resumed]) {
      expect(state.enabled).toBe(true); expect(state.rsmEnabled).toBe(true);
      expect(state.textures).toHaveLength(3);
      for (const texture of state.textures) expect(texture.signal, texture.name).toBeGreaterThan(0);
      for (const clone of state.clones.filter(clone => clone.children)) for (const child of clone.children) {
        expect(child.separate).toBe(true); expect(child.rsmPlugin).toBe(true); expect(child.originalPlugin).toBe(false);
      }
    }
    expect(report.off.enabled).toBe(false); expect(report.off.rsmEnabled).toBe(false);
    expect(report.off.activeTargets).toEqual([]);
    expect(report.offAgain.rsmFrames).toBe(report.off.rsmFrames);
    expect(report.resumed.enabled).toBe(true);
    expect(report.validation.count).toBe(0); expect(errors).toEqual([]);
  } finally { writeFileSync(resolve(output, "report.json"), JSON.stringify({ ...report, errors }, null, 2)); await launched.close(); }
});

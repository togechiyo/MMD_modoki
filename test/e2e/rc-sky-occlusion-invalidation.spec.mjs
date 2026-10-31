import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera } from "./helpers/rc-diffuse-gi-controls.mjs";
import { setRcLightingEnabled } from "./helpers/rc-lighting-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const browserProbe = "/test/e2e/helpers/rc-diffuse-gi-invalidation-probe.mjs";
const invoke = (page, name, value) => page.evaluate(async ({ name, value, module }) =>
  (await import(module))[name](value), { name, value, module: browserProbe });
const tasks = ["skyVisibilityCascade3", "skyVisibilityCascade2", "skyVisibilityCascade1", "skyVisibilityCascade0", "skyVisibilityIrradiance", "skyVisibilityNearestSurface"];

// Playwright's first callback parameter is a destructured fixtures object.
// eslint-disable-next-line no-empty-pattern
test("RC sky skips neutral strength/minimum work and refreshes the moved geometry on the first active draw", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), report = { errors: [], consoleErrors: [], samples: [] };
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async module => {
      await import(module);
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      state.lighting.rcSkyOcclusion = { enabled: false, strength: 0.75, minimum: 0.2, volume: { min: [-8, -2, -8], size: 16 } };
      await window.mmdModokiE2e.importProjectState(state);
    }, browserProbe);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    await camera(page, { tx: 0, ty: 1.5, ry: -38, camDistance: 31 });
    await setRcLightingEnabled(page, "rcSkyOcclusion", true);
    report.prepared = await invoke(page, "prepareSkyInvalidationProbe");
    const sample = async (action, refresh, sourceCalls) => {
      const result = await invoke(page, "measureSkyInvalidation", action); report.samples.push(result);
      expect(result.dispatches).toEqual(Object.fromEntries((refresh ? tasks : []).map(name => [name, 1])));
      if (sourceCalls !== undefined) expect(result.sourceCalls).toBe(sourceCalls);
      expect(result.nearest.finite).toBe(true); expect(result.irradiance.finite).toBe(true);
      expect(result.validation.count).toBe(0); expect(result.diagnostics.status).toBe("ready");
      return result;
    };
    const idle = await sample("idle", false);
    for (const [neutral, restored] of [["zero-strength", "strength-restored"], ["neutral-minimum", "minimum-restored"]]) {
      const disabled = await sample(neutral, false, 0);
      const moved = await sample("geometry", false, 0);
      expect(moved.after).toEqual(disabled.after);
      expect(moved.nearest).toEqual(disabled.nearest);
      const active = await sample(restored, true);
      expect(active.after.geometry).toBeGreaterThan(moved.after.geometry);
      expect(active.after.triangles).toBe(idle.after.triangles);
      await sample("idle", false);
    }
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    if (page && !page.isClosed()) await invoke(page, "disposeGiInvalidationProbe").catch(() => undefined);
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

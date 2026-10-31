import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, initialState, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixture = resolve(root, "test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx");
const browserProbe = "/test/e2e/helpers/rc-diffuse-gi-invalidation-probe.mjs";
const invoke = (page, name, value) => page.evaluate(async ({ name, value, module }) =>
  (await import(module))[name](value), { name, value, module: browserProbe });
const nearestTask = "rcDiffuseGiNearestSurface";
const lightingTasks = ["rcDiffuseGiCascade3", "rcDiffuseGiCascade2", "rcDiffuseGiCascade1", "rcDiffuseGiCascade0", "rcDiffuseGiIrradiance"];

// Playwright's first callback parameter is a destructured fixtures object.
// eslint-disable-next-line no-empty-pattern
test("RC GI reuses geometric guards for light/color edits and refreshes before neutral-to-active draws", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), report = { errors: [], consoleErrors: [], samples: [] };
  let page;
  try {
    page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    // Import first so settings reads during GUI setup capture this manager instance.
    await page.evaluate(module => import(module), browserProbe);
    await initialState(page); await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    await camera(page); await setGi(page, true);
    report.prepared = await invoke(page, "prepareGiInvalidationProbe");
    const sample = async (action, expected, sourceCalls) => {
      const result = await invoke(page, "measureGiInvalidation", action); report.samples.push(result);
      const names = expected === 6 ? [...lightingTasks, nearestTask] : expected === 5 ? lightingTasks : [];
      expect(result.dispatches).toEqual(Object.fromEntries(names.map(name => [name, 1])));
      if (sourceCalls !== undefined) expect(result.sourceCalls).toBe(sourceCalls);
      expect(result.nearest.finite).toBe(true); expect(result.irradiance.finite).toBe(true);
      expect(result.validation.count).toBe(0); expect(result.diagnostics.status).toBe("ready");
      return result;
    };
    const idle = await sample("idle", 0);
    const light = await sample("light", 5);
    expect(light.after.geometry).toBe(idle.after.geometry);
    expect(light.nearest).toEqual(idle.nearest);
    expect(light.irradiance.hash).not.toBe(idle.irradiance.hash);
    const color = await sample("color", 5);
    expect(color.after.source).toBeGreaterThan(light.after.source);
    expect(color.after.geometry).toBe(light.after.geometry);
    expect(color.nearest).toEqual(light.nearest);
    expect(color.irradiance.hash).not.toBe(light.irradiance.hash);
    const moved = await sample("geometry", 6);
    expect(moved.after.geometry).toBeGreaterThan(color.after.geometry);
    const dark = await sample("dark", 0, 0);
    expect(dark.diagnostics.reason).toBe("No direct light");
    const movedDark = await sample("geometry", 0, 0);
    expect(movedDark.after).toEqual(dark.after);
    const relit = await sample("light-restored", 6);
    expect(relit.after.geometry).toBeGreaterThan(movedDark.after.geometry);
    const volume = await sample("volume", 6);
    expect(volume.after.geometry).toBe(relit.after.geometry);
    const zero = await sample("zero-strength", 0, 0);
    expect(zero.diagnostics.reason).toBe("Zero strength");
    const movedZero = await sample("geometry", 0, 0);
    expect(movedZero.after).toEqual(zero.after);
    const restored = await sample("strength-restored", 6);
    expect(restored.after.geometry).toBeGreaterThan(movedZero.after.geometry);
    await sample("idle", 0);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    if (page && !page.isClosed()) await invoke(page, "disposeGiInvalidationProbe").catch(() => undefined);
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

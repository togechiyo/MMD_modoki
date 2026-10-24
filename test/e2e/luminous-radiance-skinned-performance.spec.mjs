import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";
import { luminousInstanceRow, luminousInstanceControl, setLuminousInstancePosition, getLuminousInstanceRuntime } from "./helpers/luminous-instance-controls.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
test("RC reuses a stationary dense pose but updates for bones and morphs", async ({}, testInfo) => {
  const launched = await launchMmdModoki(root), report = {}, errors = [];
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => { const state = window.mmdModokiE2e.exportProjectState();
      state.physics.enabled = false; state.viewport.groundVisible = false; state.viewport.skydomeVisible = false;
      await window.mmdModokiE2e.importProjectState(state); });
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), resolve(root, "test/fixtures/external-parent/tofu.pmx"));
    await page.locator("#btn-toggle-shader-panel").click(); await page.locator('[data-effect-tab="materials"]').click();
    await page.locator("#shader-preset-select").selectOption("wgsl-autoluminous"); await page.locator("#btn-shader-apply-all").click();
    await page.evaluate(async () => { const probe = await import("/test/e2e/helpers/luminous-radiance-probe.mjs");
      await probe.createRadianceProbe(); probe.createDenseRadianceProbe({ subdivisions: 384 }); probe.skinDenseRadianceProbe(); });
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: 0, ty: 1, tz: 0, rx: -25, ry: 0, rz: 0, camDistance: 11 })) {
      const field = page.locator(`#bone-controls input[data-control-key='${key}']`); await field.fill(String(value)); await field.press("Enter");
    }
    await page.locator('[data-effect-tab="post"]').click();
    if (!await luminousInstanceRow(page).count()) {
      await page.locator("#btn-effect-add-post").click(); await page.locator('[data-effect-add-post="luminous"]').click();
    }
    const control = key => luminousInstanceControl(page, key);
    for (const [key, value] of [["luminousIntensity", 2], ["luminousRadianceStrength", 100], ["luminousRadianceRange", 3]]) {
      await setLuminousInstancePosition(page, key, value);
    }
    await control("luminousRadianceEnabled").check();
    await page.waitForFunction(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().ready);
    await page.evaluate(async () => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).radianceProbeState({ blocker: false }));
    for (const [name, change] of [["stationary", undefined], ["bone", "bone"], ["morph", "morph"], ["morph-stationary", undefined]]) {
      report[name] = await page.evaluate(async change => (await import("/test/e2e/helpers/luminous-radiance-probe.mjs")).profileRadianceProbe(20, change), change);
    }
    await page.locator("#render-canvas").screenshot({ path: testInfo.outputPath("dense-pose.png") });
    writeFileSync(testInfo.outputPath("pose-performance-report.json"), JSON.stringify(report, null, 2));
    console.log(`RC pose profile: ${JSON.stringify(report)}`);
    if (process.env.MMD_RC_PROFILE_ONLY !== "1") {
      expect(report.stationary.positionCalls).toBe(0); expect(report.stationary.counts.cascades).toBe(0);
      for (const change of ["bone", "morph"]) { expect(report[change].positionCalls).toBe(1); expect(report[change].counts.cascades).toBe(4); }
      expect(report["morph-stationary"].positionCalls).toBe(0);
      if (process.env.MMD_RC_BASELINE_PNG) {
        expect(readFileSync(testInfo.outputPath("dense-pose.png"))).toEqual(readFileSync(process.env.MMD_RC_BASELINE_PNG));
      }
    }
    expect(await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics().count)).toBe(0); expect(errors).toEqual([]);
  } finally { await launched.close(); }
});

import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
const candidates = [
  { name: "legacy", nearDistance: 16 / 18, rejectOccludedProbes: false },
  { name: "near4", nearDistance: 4, rejectOccludedProbes: false },
  { name: "near8", nearDistance: 8, rejectOccludedProbes: false },
  { name: "reject-occluded", nearDistance: 16 / 18, rejectOccludedProbes: true },
  { name: "near8-reject-occluded", nearDistance: 8, rejectOccludedProbes: true },
  { name: "near16", nearDistance: 16, rejectOccludedProbes: false },
  { name: "endpoint4", nearDistance: 4, rejectOccludedProbes: false, sampleAtRayEnd: true },
  { name: "endpoint4-reject", nearDistance: 4, rejectOccludedProbes: true, sampleAtRayEnd: true },
  { name: "endpoint8", nearDistance: 8, rejectOccludedProbes: false, sampleAtRayEnd: true },
  { name: "endpoint8-reject", nearDistance: 8, rejectOccludedProbes: true, sampleAtRayEnd: true },
];
const invoke = (page, name, value) => page.evaluate(async ({ name, value }) =>
  (await import("/test/e2e/helpers/radiance-sky-reconstruction-probe.mjs"))[name](value), { name, value });

// One process per candidate, one worker. This is a small fixture cost comparison, not app FPS.
for (const candidate of candidates) test(`sky reconstruction GPU update cost: ${candidate.name}`, async ({}, testInfo) => {
  test.setTimeout(120000);
  const launched = await launchMmdModoki(root, { radianceLightingLab: true });
  const report = { candidate, errors: [], runs: [] };
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false; project.lighting.shadowEnabled = false;
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      await window.mmdModokiE2e.importProjectState(project);
    });
    await invoke(page, "initializeSkyReconstructionProbe");
    await page.locator('.app-menu-group:has([data-menu-command="tools.experimentalSettings"]) > .app-menu-trigger').click();
    await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
    const dialog = page.locator('[data-popup-id="experimental-settings"]');
    await dialog.locator('[name="radianceSkyEnabled"]').check();
    await expect.poll(async () => (await invoke(page, "skyReconstructionState")).diagnostics?.status).toBe("ready");
    await dialog.locator(".app-menu-dialog-close").click();
    const fixture = await invoke(page, "setSkyReconstructionFixture", "box-opening");
    await invoke(page, "setSkyReconstruction", { sampleAtRayEnd: false, ...candidate });
    await expect.poll(async () => (await invoke(page, "skyReconstructionState")).diagnostics.fieldRevision).toBeGreaterThan(fixture.fieldRevision);
    for (let i = 0; i < 2; i++) {
      const measured = await page.evaluate(async () => (await import("/test/e2e/helpers/radiance-sky-reconstruction-timing.mjs")).measureSkyReconstruction());
      report.runs.push(measured);
      expect(measured.dispatches).toBe(measured.forcedUpdates * 6);
      expect(measured.cpuPrepareMs.count).toBe(measured.frames);
    }
    report.completion = await page.evaluate(async () => (await import("/test/e2e/helpers/radiance-sky-reconstruction-timing.mjs")).measureSkyReconstructionCompletion());
    report.state = await invoke(page, "skyReconstructionState");
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.state.gpuErrors).toEqual([]); expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

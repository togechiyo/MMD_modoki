import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { integrateSkyReferencePoints } from "./helpers/radiance-sky-reference.mjs";

const root = resolve(import.meta.dirname, "../..");

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("Sky Ambient upper surfaces distinguish lower geometry from an overhead roof", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), report = { errors: [], consoleErrors: [] };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(() => window.mmdModokiE2e.setAutoRenderEnabled(false));
    report.contract = await page.evaluate(async () =>
      // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
      (await import("/test/e2e/helpers/rc-sky-upper-surface-probe.mjs")).measureSkyUpperSurfaces());
    const contract = report.contract;
    for (const item of contract.cases) {
      item.reference = integrateSkyReferencePoints(item.samples.map(sample => sample.point), item.boxes,
        { volumeMin: contract.volume.min, volumeSize: contract.volume.size, nearDistance: contract.volume.size / 2 });
      const expected = item.roofGap ? 0 : 1;
      for (const reference of item.reference) expect(reference.visibility, `${item.name}: independent reference`).toBe(expected);
      for (const sample of item.samples) {
        expect(Number.isFinite(sample.visibility), item.name).toBe(true);
        expect(sample.visibility, item.name).toBeGreaterThanOrEqual(0);
        expect(sample.visibility, item.name).toBeLessThanOrEqual(1);
      }
      item.meanError = item.samples.reduce((sum, sample) => sum + Math.abs(sample.visibility - expected), 0) / item.samples.length;
      if (item.roofGap) {
        // Removing lower probes must not increase the contribution of a probe
        // above a genuine roof, including when the normalized fraction rounds to zero.
        expect(item.maximum, `${item.name}: roof must block every receiver sample`).toBeLessThanOrEqual(.01);
      } else {
        // The existing parent-field interpolation remains approximate at probe
        // planes (~.76 at Y=2). This query fix targets the dark lower row just
        // after crossing a plane; those cases previously fell near .06.
        const justAbovePlane = item.top > 2 && item.top <= 4 || item.top > 6 && item.top < 6.5;
        expect(item.minimum, `${item.name}: open upper surface`).toBeGreaterThanOrEqual(justAbovePlane ? .95 : .75);
      }
    }
    const motion = contract.partialUpdate;
    expect(motion.shaderModes).toEqual(["full", "partial", "full"]);
    expect(motion.beforeState.triangleCount).toBe(5);
    expect(motion.movedState.meshIds).toEqual(motion.beforeState.meshIds);
    expect(motion.movedState.layout).toBe(motion.beforeState.layout);
    expect(motion.movedState.geometry).toBe(motion.beforeState.geometry + 1);
    expect(motion.movedState.updates).toBe(motion.beforeState.updates + 1);
    expect(motion.fullState).toEqual(motion.movedState);
    expect(motion.focusBefore).toEqual([1, 2, 3, 4]);
    expect(motion.focusPartial).toEqual([1, 2, 3, 5]);
    expect(motion.focusFull).toEqual(motion.focusPartial);
    expect(motion.comparison.texels).toBe(16 ** 3);
    expect(motion.comparison.changedTexels).toBeGreaterThan(0);
    expect(motion.comparison.outsideDirtyTexels).toBeGreaterThan(0);
    expect(motion.comparison.outsideDirtyChanged).toBe(0);
    expect(motion.comparison.invalidValues).toBe(0);
    expect(motion.comparison.mismatchedTexels, JSON.stringify(motion.comparison.mismatches)).toBe(0);
    for (const [index, sample] of motion.partialSamples.entries()) {
      expect(Number.isFinite(sample.visibility)).toBe(true);
      expect(sample.visibility).toBeGreaterThanOrEqual(0); expect(sample.visibility).toBeLessThanOrEqual(1);
      expect(sample.visibility).toBeCloseTo(motion.fullSamples[index].visibility, 6);
    }
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(contract.cases).toHaveLength(15);
    expect(contract.compilation.filter(message => message.type === "error")).toEqual([]);
    expect(contract.scopeError).toBeNull(); expect(contract.gpuErrors).toEqual([]);
    expect(report.validation.count).toBe(0); expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

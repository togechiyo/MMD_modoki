import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");

function maximumAdjacentDifference(values, width, height) {
  let maximum = 0;
  for (let y = 0; y < height; y++) for (let x = 1; x < width; x++) {
    maximum = Math.max(maximum, Math.abs(values[y * width + x] - values[y * width + x - 1]));
  }
  return maximum;
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
test("Sky screen filter softens coplanar bands while preserving surfaces and material fallback", async ({}, testInfo) => {
  test.setTimeout(120000);
  const launched = await launchMmdModoki(root), report = { errors: [], consoleErrors: [] };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    report.contract = await page.evaluate(async () =>
      // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
      (await import("/test/e2e/helpers/rc-sky-screen-probe.mjs")).measureSkyScreenContract());
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.contract.compilation.filter(message => message.type === "error")).toEqual([]);
    expect(report.contract.scopeError).toBeNull(); expect(report.contract.gpuErrors).toEqual([]);
    expect(report.contract.filters).toHaveLength(8);
    for (const item of report.contract.filters) {
      expect(item.normalMaxError, `${item.name}: surface normal`).toBe(0);
      expect(item.output).toHaveLength(item.width * item.height);
      for (const value of [...item.stage1, ...item.output]) {
        expect(Number.isFinite(value), item.name).toBe(true);
        expect(value, item.name).toBeGreaterThanOrEqual(-1);
        expect(value, item.name).toBeLessThanOrEqual(1);
      }
      if (item.name !== "coplanar-band") {
        item.output.forEach((value, index) => expect(value, `${item.name}: pixel ${index}`).toBeCloseTo(item.input[index], 4));
      }
    }
    const band = report.contract.filters.find(item => item.name === "coplanar-band"), center = 4 * band.width + 4;
    expect(band.input[center]).toBe(0);
    expect(band.output[center]).toBeGreaterThan(.25);
    expect(band.output[center]).toBeLessThan(.9);
    expect(band.output[center - 1]).toBeLessThan(.99);
    expect(maximumAdjacentDifference(band.stage1, band.width, band.height)).toBeLessThan(.75);
    expect(maximumAdjacentDifference(band.output, band.width, band.height)).toBeLessThan(.5);
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(Math.abs(mean(band.output) - mean(band.input))).toBeLessThan(.01);
    expect(report.contract.upsampling).toHaveLength(10);
    for (const item of report.contract.upsampling) expect(item.actual, item.name).toBeCloseTo(item.expected, 5);
    expect(report.validation.count).toBe(0);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

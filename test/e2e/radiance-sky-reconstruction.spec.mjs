import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { compareSkyReferenceGrid, integrateSkyReferenceGrid, integrateSkyReferencePoints } from "./helpers/radiance-sky-reference.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixtures = ["empty", "covered-bottom2", "covered-bottom4", "distant-bottom100", "finite-roof4x4", "thin-wall", "box-sealed", "box-opening"];
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
const referenceSamples = [8, 24, 32, 40, 56].flatMap(row => [8, 24, 32, 40, 56].map(column => ({
  index: row * 64 + column, point: [-8 + (column + 0.5) / 4, 0.05, -8 + (row + 0.5) / 4],
})));
const invoke = (page, name, value) => page.evaluate(async ({ name, value }) =>
  (await import("/test/e2e/helpers/radiance-sky-reconstruction-probe.mjs"))[name](value), { name, value });

async function waitReady(page, { fieldRevision = -1, settingsRevision = 0 } = {}) {
  await expect.poll(async () => {
    const info = (await invoke(page, "skyReconstructionState")).diagnostics;
    return info?.status === "ready" && info.fieldRevision > fieldRevision && info.settingsRevision >= settingsRevision;
  }, { timeout: 45000 }).toBe(true);
}

function measure(pixels, { x0 = 0, x1 = 64, y0 = 0, y1 = 64 } = {}) {
  const errors = [];
  const result = { pixels: 0, invalid: 0, nonFinite: 0, rcMean: 0, directMean: 0, absoluteMean: 0, absoluteMax: 0,
    signedBias: 0, positiveMean: 0, negativeMean: 0, positiveMax: 0, negativeMax: 0, rootMeanSquared: 0,
    differenceChannelMaxError: 0, absoluteAbove005: 0, absoluteP95: 0 };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const index = (y * 64 + x) * 4, [rc, direct, difference, valid] = pixels.slice(index, index + 4);
    result.pixels++;
    if (![rc, direct, difference, valid].every(Number.isFinite)) { result.nonFinite++; continue; }
    if (valid < 0.5 || rc < 0 || direct < 0) { result.invalid++; continue; }
    const signed = rc - direct, absolute = Math.abs(signed); errors.push(absolute);
    result.rcMean += rc; result.directMean += direct; result.absoluteMean += absolute;
    result.absoluteMax = Math.max(result.absoluteMax, absolute); result.signedBias += signed;
    result.positiveMean += Math.max(signed, 0); result.negativeMean += Math.max(-signed, 0);
    result.positiveMax = Math.max(result.positiveMax, signed); result.negativeMax = Math.max(result.negativeMax, -signed);
    result.rootMeanSquared += signed * signed;
    result.differenceChannelMaxError = Math.max(result.differenceChannelMaxError, Math.abs(difference - absolute));
    if (absolute > 0.05) result.absoluteAbove005++;
  }
  const validPixels = result.pixels - result.invalid - result.nonFinite;
  for (const key of ["rcMean", "directMean", "absoluteMean", "signedBias", "positiveMean", "negativeMean"]) result[key] /= validPixels || 1;
  result.rootMeanSquared = Math.sqrt(result.rootMeanSquared / (validPixels || 1));
  errors.sort((a, b) => a - b); result.absoluteP95 = errors[Math.max(0, Math.ceil(errors.length * 0.95) - 1)] ?? 0;
  return result;
}

function writeMaps(directory, pixels) {
  const outputs = {};
  for (const name of ["rc", "direct", "absolute-error", "signed-error"]) {
    const png = new PNG({ width: 64, height: 64 });
    for (let i = 0; i < pixels.length; i += 4) {
      const signed = pixels[i] - pixels[i + 1], value = name === "rc" ? pixels[i]
        : name === "direct" ? pixels[i + 1] : Math.abs(signed);
      const intensity = Math.round(Math.max(0, Math.min(1, value)) * 255);
      const color = pixels[i + 3] < 0.5 ? [255, 0, 255]
        : name !== "signed-error" ? [intensity, intensity, intensity]
          : signed >= 0 ? [intensity, 0, 0] : [0, 0, intensity];
      png.data.set([...color, 255], i);
    }
    outputs[name] = resolve(directory, `${name}.png`); writeFileSync(outputs[name], PNG.sync.write(png));
  }
  const raw = Float32Array.from(pixels);
  outputs.raw = resolve(directory, "diagnostic.rgba32f");
  writeFileSync(outputs.raw, Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength));
  return outputs;
}

test("sky reconstruction candidates report whole-field error and signed bias against direct visibility", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root, { radianceLightingLab: true });
  const report = { schema: 2, resolution: [64, 64], planeY: 0.05, volumeMin: [-8, 0, -8], volumeSize: 16,
    signedBiasMeaning: "RC minus direct: positive is light leaking, negative is excess occlusion",
    mapConvention: "Rows follow GPU readback order; grayscale linear [0,1], signed-error red=positive/blue=negative, magenta=invalid",
    gpuMilliseconds: null, candidates, errors: [], fixtures: [] };
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
    await dialog.locator('[name="radianceSkyEnabled"]').check(); await waitReady(page);
    await dialog.locator(".app-menu-dialog-close").click();
    for (const name of fixtures) {
      const fixture = await invoke(page, "setSkyReconstructionFixture", name);
      await waitReady(page, { fieldRevision: fixture.expectFieldChange ? fixture.fieldRevision : -1 });
      // Box intersections are computed independently on CPU, without Babylon or shader code.
      // Dense quadrature separates reconstruction error from the diagnostic's 16-ray angular error.
      const reference16 = integrateSkyReferenceGrid(fixture.boxes);
      const reference512 = integrateSkyReferencePoints(referenceSamples.map(sample => sample.point), fixture.boxes, { columns: 32, upperRows: 16 });
      const reference2048 = integrateSkyReferencePoints(referenceSamples.map(sample => sample.point), fixture.boxes, { columns: 64, upperRows: 32 });
      const values512 = reference512.map(sample => sample.visibility), values2048 = reference2048.map(sample => sample.visibility);
      const entry = { fixture, cpuReference: { grid16: reference16.totals, samples: referenceSamples,
        visibility512: values512, visibility2048: values2048,
        convergence512To2048: compareSkyReferenceGrid(values2048, values512, { channel: 0, stride: 1 }),
        endpointCountersByNearDistance: {} }, results: [] }; report.fixtures.push(entry);
      let baseline;
      for (const candidate of candidates) {
        const { nearDistance, rejectOccludedProbes, sampleAtRayEnd = false } = candidate;
        const changed = await invoke(page, "setSkyReconstruction", { nearDistance, rejectOccludedProbes, sampleAtRayEnd });
        await waitReady(page, { fieldRevision: changed.changed ? changed.previousFieldRevision : -1, settingsRevision: changed.settingsRevision });
        const state = await invoke(page, "skyReconstructionState"), pixels = await invoke(page, "readSkyReconstructionPixels");
        expect(pixels).not.toBeNull(); expect(pixels).toHaveLength(64 * 64 * 4);
        const directory = testInfo.outputPath(name, candidate.name); mkdirSync(directory, { recursive: true });
        const result = { candidate: candidate.name, state, all: measure(pixels), center16x16: measure(pixels, { x0: 24, x1: 40, y0: 24, y1: 40 }),
          centerPixel: pixels.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4), maps: writeMaps(directory, pixels), directMaxChangeFromLegacy: 0 };
        result.directAgainstCpu16 = compareSkyReferenceGrid(reference16.values, pixels);
        const sampledRc = referenceSamples.map(sample => pixels[sample.index * 4]);
        const sampledDirect = referenceSamples.map(sample => pixels[sample.index * 4 + 1]);
        result.rcAgainstCpu512 = compareSkyReferenceGrid(values512, sampledRc, { channel: 0, stride: 1 });
        result.rcAgainstCpu2048 = compareSkyReferenceGrid(values2048, sampledRc, { channel: 0, stride: 1 });
        result.directAgainstCpu2048 = compareSkyReferenceGrid(values2048, sampledDirect, { channel: 0, stride: 1 });
        if (sampleAtRayEnd && !entry.cpuReference.endpointCountersByNearDistance[nearDistance]) {
          entry.cpuReference.endpointCountersByNearDistance[nearDistance] = integrateSkyReferenceGrid(fixture.boxes, { nearDistance }).totals;
        }
        entry.results.push(result);
        expect(result.all.nonFinite).toBe(0); expect(result.all.invalid).toBe(0);
        expect(result.directAgainstCpu16.nonFinite).toBe(0);
        expect(result.directAgainstCpu16.absoluteMax).toBeLessThan(0.000001);
        expect(result.all.differenceChannelMaxError).toBeLessThan(0.000001);
        expect(state.diagnostics.emitterTriangles).toBe(0); expect(state.gpuErrors).toEqual([]);
        expect(state.diagnostics.reconstruction.nearDistance).toBeCloseTo(nearDistance, 5);
        expect(state.diagnostics.reconstruction.rejectOccludedProbes).toBe(rejectOccludedProbes);
        expect(state.diagnostics.reconstruction.sampleAtRayEnd).toBe(sampleAtRayEnd);
        result.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
        expect(result.validation.count).toBe(0);
        if (!baseline) baseline = pixels;
        for (let i = 1; i < pixels.length; i += 4) result.directMaxChangeFromLegacy = Math.max(result.directMaxChangeFromLegacy, Math.abs(pixels[i] - baseline[i]));
        expect(result.directMaxChangeFromLegacy).toBeLessThan(0.000001);
        // These exact values use the 16 center directions, not the continuous hemisphere integral.
        // Dense CPU results remain report-only: improvement is not uniform for every fixture.
        if (name === "empty") expect(result.all.directMean).toBeCloseTo(1, 5);
        if (name.startsWith("covered-") || name === "distant-bottom100") expect(result.all.directMean).toBeCloseTo(0, 5);
        if (name === "finite-roof4x4") expect(result.centerPixel[1]).toBeCloseTo(0.25, 5);
        if (name === "box-sealed") expect(result.center16x16.directMean).toBeCloseTo(0, 5);
      }
      const legacy = entry.results[0].all;
      for (const result of entry.results) result.changeFromLegacy = {
        absoluteMean: result.all.absoluteMean - legacy.absoluteMean, absoluteMax: result.all.absoluteMax - legacy.absoluteMax,
        signedBias: result.all.signedBias - legacy.signedBias,
      };
      const selected = entry.results.find(result => result.candidate === "endpoint8").all;
      const limits = { empty: [0.00001, 0.00001], "covered-bottom2": [0.00001, 0.00001],
        "covered-bottom4": [0.04, 0.09], "distant-bottom100": [0.00001, 0.00001],
        "finite-roof4x4": [0.002, 0.04], "thin-wall": [0.006, 0.04], "box-sealed": [0.004, 0.04], "box-opening": [0.004, 0.04] };
      expect(selected.absoluteMean).toBeLessThan(limits[name][0]);
      expect(selected.absoluteMax).toBeLessThan(limits[name][1]);
      expect(selected.negativeMean).toBeLessThanOrEqual(legacy.negativeMean + 0.00001);
    }
    expect(report.errors).toEqual([]);
  } finally {
    const page = launched.app.windows()[0];
    if (page && !page.isClosed()) {
      report.lastState = await invoke(page, "skyReconstructionState").catch(error => String(error));
      report.lastValidation = await page.evaluate(() => window.mmdModokiE2e?.getWebGpuValidationDiagnostics()).catch(error => String(error));
    }
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { camera, capture, closeGi, difference, giInput, giStatus, initialState, openGi, project, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";
import { exportRcPng } from "./helpers/rc-file-output.mjs";
import { createRcDiffuseGiStage } from "../../scripts/generate-rc-diffuse-gi-fixture.mjs";
import { writePmx } from "../../scripts/generate-external-parent-test-models.mjs";

const root = resolve(import.meta.dirname, "../..");
const tilt = .31;
const rotate = ([x, y, z]) => [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt), z];

function makeWallFixture() {
  // Stand the original receiver upright and shorten the cyan reflector to cast
  // a localized bounce. Tilt the geometry relative to the fixed world grid.
  const model = createRcDiffuseGiStage([.015, .85, .9]);
  for (const group of model.materialGroups) {
    const source = group.name === "GI Source";
    for (const index of new Set(group.indices)) {
      const vertex = model.vertices[index];
      const [x, y, z] = vertex.position;
      vertex.position = rotate([x * (source ? 8.3 : 12), z * (source ? 3.5 : 7), -y * 6]);
      const [nx, ny, nz] = vertex.normal;
      vertex.normal = rotate([nx, nz, -ny]);
    }
  }
  return writePmx(model);
}

function measureWall(off, on) {
  // The fixed camera faces the flat wall at Z=0. This inset contains only
  // untextured receiver pixels, with neither silhouettes nor directly visible cyan.
  function cyanBounce(x, y) {
    const i = 4 * (y * off.width + x);
    const delta = c => on.data[i + c] - off.data[i + c];
    return (delta(1) + delta(2)) / 2 - delta(0);
  }
  const jumps = [];
  let pixels = 0, cyan = 0, saturated = 0, spikes = 0;
  for (let y = 100; y < 260; y++) {
    for (let x = 202; x < 438; x++) {
      const center = cyanBounce(x, y);
      const left = cyanBounce(x - 1, y), right = cyanBounce(x + 1, y);
      const above = cyanBounce(x, y - 1), below = cyanBounce(x, y + 1);
      jumps.push(Math.abs(center - right), Math.abs(center - below));
      if (Math.abs(center - (left + right + above + below) / 4) > 4) spikes++;
      const i = 4 * (y * on.width + x);
      if (Math.max(on.data[i], on.data[i + 1], on.data[i + 2]) === 255) saturated++;
      cyan += center;
      pixels++;
    }
  }
  jumps.sort((a, b) => a - b);
  return { pixels, meanCyanGain: cyan / pixels, saturated, spikes,
    neighborJumpP99: jumps[Math.floor(jumps.length * .99)], maxNeighborJump: jumps.at(-1) };
}

function measureReflector(off, on) {
  const { width, height } = off;
  const neighbors = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1].map(step => step * 4);
  let count = 0, totalGain = 0, isolatedBright = 0, isolatedDark = 0;
  let largestExcursion = 0, worstPixel = null;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      // Identify the directly lit cyan reflector in the OFF image. Exclude every
      // pixel whose OFF neighborhood includes an edge or a different surface color.
      if (off.data[i + 3] !== 255 || off.data[i + 1] - off.data[i] < 60 || off.data[i + 2] - off.data[i] < 60) continue;
      if (!neighbors.every(step => [0, 1, 2, 3].every(c => off.data[i + step + c] === off.data[i + c]))) continue;
      count++;
      totalGain += (on.data[i + 1] - off.data[i + 1] + on.data[i + 2] - off.data[i + 2]) / 2;
      let above = 0, below = 0;
      for (let c = 0; c < 3; c++) {
        const values = neighbors.map(step => on.data[i + step + c]);
        above = Math.max(above, on.data[i + c] - Math.max(...values));
        below = Math.max(below, Math.min(...values) - on.data[i + c]);
      }
      // A continuous gradient or contour has another neighbor on its own side.
      if (above > 4) isolatedBright++;
      if (below > 4) isolatedDark++;
      if (Math.max(above, below) > largestExcursion) {
        largestExcursion = Math.max(above, below);
        worstPixel = { x, y, signedExcursion: above >= below ? above : -below };
      }
    }
  }
  return { pixels: count, meanGreenBlueGain: count ? totalGain / count : 0, isolatedBright, isolatedDark, largestExcursion, worstPixel };
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture parameter.
test("RC diffuse GI detail and near range independently change an untextured wall", async ({}, testInfo) => {
  test.setTimeout(240000);
  const launched = await launchMmdModoki(root);
  const report = { captures: {}, cases: {}, errors: [] };
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    await initialState(page, { fixed: false });
    const state = await project(page);
    state.viewport.antialiasEnabled = false;
    const [x, y, z] = rotate([-1, 0, 1]);
    Object.assign(state.lighting, { x, y, z });
    await page.evaluate(state => window.mmdModokiE2e.importProjectState(state), state);
    const path = resolve(launched.tempDir, "cyan-wall.pmx");
    writeFileSync(path, makeWallFixture());
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path)).not.toBeNull();
    report.camera = await camera(page, { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, camDistance: 95 });
    await page.evaluate(async () => {
      // eslint-disable-next-line import/no-unresolved -- Served by the fixture Vite server.
      window.rcGiWall = await import("/test/e2e/helpers/rc-window-room-probe.mjs");
    });
    await setGi(page, false);
    const off = await capture(page, testInfo, report, "gi-off");
    await setGi(page, true);
    const previous = {};
    const sample = async (name, grid, width) => {
      await openGi(page);
      const read = () => page.evaluate(() => window.rcGiWall.roomState().gi.diagnostics);
      await expect.poll(async () => {
        const { grid, volumes, status } = await read();
        return [status, grid, volumes.map(volume => volume.size)];
      }, { timeout: 60000 }).toEqual(["ready", grid, [width, 512, 2048, 32768]]);
      const { fieldRevision } = await read();
      await expect(giStatus(page)).toHaveAttribute("data-state", "ready");
      await closeGi(page);
      const image = await capture(page, testInfo, report, name);
      const surface = measureWall(off, image);
      report.cases[name] = { grid, width, fieldRevision, probeSpacing: width / grid, ...surface, reflector: measureReflector(off, image) };
      previous[name] = image;
    };
    const adjust = async (name, key) => {
      await openGi(page); await giInput(page, name).press(key); await closeGi(page);
    };
    await sample("standard", 16, 128);
    await adjust("Quality", "Home"); await sample("low", 8, 128);
    await adjust("Quality", "End"); await sample("high", 24, 128);
    await adjust("RangeScale", "Home"); await sample("high-narrow", 24, 64);
    await adjust("RangeScale", "End"); await sample("high-wide", 24, 256);
    const exported = await exportRcPng(launched, page, testInfo.outputPath("saved-high-wide.png"));
    report.exportDifference = difference(exported, previous["high-wide"]);
    expect(report.exportDifference).toBeLessThan(.2);
    await adjust("RangeScale", "Home"); // Reuse the same slider gesture as the first narrow measurement.
    await sample("narrow-restored", 24, 64);
    expect(difference(previous["high-narrow"], previous["narrow-restored"])).toBeLessThan(.15);
    report.qualityDifference = difference(previous.low, previous.high);
    report.rangeDifference = difference(previous["high-narrow"], previous["high-wide"]);
    expect(report.cases.standard.meanCyanGain).toBeGreaterThan(1);
    expect(report.cases.high.meanCyanGain).toBeGreaterThan(1);
    expect(report.qualityDifference).toBeGreaterThan(.1);
    expect(report.rangeDifference).toBeGreaterThan(.1);
    for (const [name, { reflector }] of Object.entries(report.cases)) {
      expect(reflector.pixels, name).toBeGreaterThan(1000);
      expect(reflector.meanGreenBlueGain, name).toBeGreaterThan(1);
      expect([reflector.isolatedBright, reflector.isolatedDark], name).toEqual([0, 0]);
    }
    expect(report.errors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

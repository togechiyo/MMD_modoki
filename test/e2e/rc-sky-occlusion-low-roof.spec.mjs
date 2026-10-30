import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki, selectCenterBone, selectTimelineTrack } from "./electron-app.mjs";
import { integrateSkyReferencePoints } from "./helpers/radiance-sky-reference.mjs";

const root = resolve(import.meta.dirname, "../.."), fixture = resolve(root, "test/fixtures/rc-sky-stage/rc-sky-stage.pmx");
const width = 1280, height = 720, volume = { min: [-12, -8, -12], size: 32 }, cell = volume.size / 16;
const poses = [{ name: "open", x: 16, bottom: 4 }, { name: "original", x: 0, bottom: 4 },
  ...[0.2, 0.5, 0.9].map(gapCells => ({ name: `gap-${gapCells}-cell`, x: 0, bottom: 1.5 + gapCells * cell, gapCells }))];
const dialog = page => page.locator('[data-popup-id="experimental-settings"]');
const section = page => dialog(page).locator('[data-experiment-section="rc-sky-occlusion"]');
async function open(page) {
  await page.locator('.app-menu-group:has([data-menu-command="tools.experimentalSettings"]) > .app-menu-trigger').click();
  await page.locator('[data-menu-command="tools.experimentalSettings"]').click();
}
async function close(page) { await dialog(page).locator(".app-menu-dialog-close").click(); }
// These seven opaque AABBs match generate-rc-sky-stage.mjs. Only the roof is bone-weighted;
// the gold marker originally above it stays at its authored height when the roof moves.
function boxes(pose) {
  return [
    { min: [-8, -0.2, -6], max: [8, 0, 6] },
    { min: [-7.5 + pose.x, pose.bottom, -3], max: [-0.5 + pose.x, pose.bottom + 0.2, 5] },
    { min: [-7.5, 0, -3], max: [-7.4, 4, 5] }, { min: [-7.5, 0, 4.9], max: [-0.5, 4, 5] },
    { min: [-4.75, 0, -0.75], max: [-3.25, 1.5, 0.75] },
    { min: [3.25, 0, -0.75], max: [4.75, 1.5, 0.75] },
    { min: [-4.75, 4.2, 0.25], max: [-3.25, 5.7, 1.75] },
  ];
}
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalized = vector => vector.map(value => value / Math.hypot(...vector));
function projection(camera, points) {
  const eye = Object.values(camera.position), target = Object.values(camera.target);
  const forward = normalized(subtract(target, eye)), right = normalized(cross([0, 1, 0], forward)), up = cross(forward, right);
  const tangent = Math.tan(camera.fov * Math.PI / 360);
  return points.map(point => { const delta = subtract(point, eye), depth = dot(delta, forward);
    return [width / 2 + dot(delta, right) / depth / tangent / (width / height) * width / 2,
      height / 2 - dot(delta, up) / depth / tangent * height / 2]; });
}
function inside(x, y, polygon) {
  let positive = false, negative = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], side = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    positive ||= side > 0; negative ||= side < 0;
  }
  return !(positive && negative);
}
function regionDifference(off, on, polygon, openOff = null) {
  let candidatePixels = 0, pixels = 0, absolute = 0, signed = 0, offMean = 0, onMean = 0, maximum = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!inside(x + 0.5, y + 0.5, polygon)) continue;
    candidatePixels++; const index = (y * width + x) * 4;
    if (off.data[index + 3] < 250 || Math.max(...off.data.subarray(index, index + 3)) < 15) continue;
    if (openOff && [0, 1, 2].some(channel => Math.abs(off.data[index + channel] - openOff.data[index + channel]) > 2)) continue;
    pixels++;
    for (let c = 0; c < 3; c++) {
      const change = off.data[index + c] - on.data[index + c];
      signed += change; absolute += Math.abs(change); maximum = Math.max(maximum, Math.abs(change));
      offMean += off.data[index + c]; onMean += on.data[index + c];
    }
  }
  return { polygon, candidatePixels, stablePixels: pixels, rgbAbsoluteMean: pixels ? absolute / (pixels * 3) : null,
    rgbSignedDarkening: pixels ? signed / (pixels * 3) : null, rgbAbsoluteMax: maximum,
    offMean: pixels ? offMean / (pixels * 3) : null, onMean: pixels ? onMean / (pixels * 3) : null,
    note: "Positive signed value means RC darkened the receiver. Color is not a linear visibility estimate." };
}

test("RC sky low-roof quality: 0.2 / 0.5 / 0.9-cell gaps above a fixed receiver", async ({}, testInfo) => {
  test.setTimeout(180000);
  const launched = await launchMmdModoki(root), report = { errors: [], cases: [], volume, cell,
    interpretation: "Quality comparison, not a claim that interpolation cannot leak. Fixed opaque original PMX, 0.2m roof thickness. Top CPU visibility oracle is independent of GPU; screenshot ROI reports shadow-side color change separately." };
  try {
    const page = await launched.app.firstWindow(); page.on("pageerror", error => report.errors.push(error.stack ?? error.message));
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async volume => {
      const state = window.mmdModokiE2e.exportProjectState(); state.physics.enabled = false;
      Object.assign(state.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      // Illuminate from below so upper receiver normals exercise the Toon shadow residual.
      Object.assign(state.lighting, { x: 0, y: 1, z: 0, intensity: 1, ambientIntensity: 0, shadowEnabled: false,
        rcSkyOcclusion: { enabled: false, strength: 1, minimum: 0, volume } });
      await window.mmdModokiE2e.importProjectState(state);
    }, volume);
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), fixture);
    const number = async (key, value) => { const field = page.locator(`#bone-controls input[data-control-key='${key}']`); await field.fill(String(value)); await field.press("Enter"); };
    await page.locator("#info-model-select").selectOption("__camera__");
    for (const [key, value] of Object.entries({ tx: -4, ty: 1, tz: 0, rx: -9, ry: 0, rz: 0, camDistance: 9.5 })) await number(key, value);
    report.camera = await page.evaluate(() => ({ ...window.mmdModokiE2e.exportProjectState().camera,
      position: window.mmdModokiE2e.getCameraPosition(), target: window.mmdModokiE2e.getCameraTarget() }));
    const topPolygon = projection(report.camera, [[-4.4, 1.5, -0.4], [-3.6, 1.5, -0.4], [-3.6, 1.5, 0.4], [-4.4, 1.5, 0.4]]);
    const frontPolygon = projection(report.camera, [[-4.4, 0.4, -0.75], [-3.6, 0.4, -0.75], [-3.6, 1.25, -0.75], [-4.4, 1.25, -0.75]]);
    await page.locator("#info-model-select").selectOption("0");
    const category = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks().find(track => track.name === "庇移動")?.category);
    expect(category).toBeTruthy();
    const points = Array.from({ length: 25 }, (_, i) => [-4.4 + (i % 5) * 0.2, 1.5, -0.4 + Math.floor(i / 5) * 0.2]);
    const referenceOptions = { volumeMin: volume.min, volumeSize: volume.size, nearDistance: volume.size / 2 };
    let openOff;
    for (const pose of poses) {
      await page.locator("#info-model-select").selectOption("0"); await selectTimelineTrack(page, category, "庇移動");
      await number("tx", pose.x); await number("ty", pose.bottom - 4);
      // Keep the authored preview without a seek; switching to camera hides bone gizmos.
      await page.locator("#info-model-select").selectOption("__camera__");
      const item = { pose, captures: {}, regions: {}, direct16: integrateSkyReferencePoints(points, boxes(pose), referenceOptions),
        direct2048: integrateSkyReferencePoints(points, boxes(pose), { ...referenceOptions, columns: 64, upperRows: 32 }) };
      report.cases.push(item);
      const images = {};
      for (const active of [false, true]) {
        await open(page); await section(page).locator('[name="rcSkyOcclusionEnabled"]').setChecked(active);
        await expect(section(page).locator("[data-rc-sky-occlusion-status]")).toHaveAttribute("data-state", active ? "ready" : "off", { timeout: 45000 });
        await close(page);
        const name = active ? "on" : "off", directory = testInfo.outputPath(`${pose.name}-${name}`); mkdirSync(directory, { recursive: true });
        const capture = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 1280, 720), directory);
        expect(capture.surfaceReleased).toBe(true); item.captures[name] = capture;
        images[name] = PNG.sync.read(readFileSync(capture.path));
        expect([images[name].width, images[name].height]).toEqual([width, height]);
      }
      if (pose.name === "open") openOff = images.off;
      item.regions.top = regionDifference(images.off, images.on, topPolygon, openOff);
      item.regions.front = regionDifference(images.off, images.on, frontPolygon, openOff);
      const roofPolygon = projection(report.camera, [[-4.4 + pose.x, pose.bottom + 0.2, -2.8], [-3.6 + pose.x, pose.bottom + 0.2, -2.8],
        [-3.6 + pose.x, pose.bottom + 0.2, -2.2], [-4.4 + pose.x, pose.bottom + 0.2, -2.2]]);
      item.regions.roofTop = regionDifference(images.off, images.on, roofPolygon);
      expect(item.regions.top.stablePixels).toBeGreaterThan(40);
      expect(item.regions.front.stablePixels).toBeGreaterThan(100);
      item.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
      expect(item.validation.count).toBe(0); expect(report.errors).toEqual([]);
    }
    const closeRoof = report.cases.find(item => item.pose.gapCells === 0.2);
    expect(closeRoof.direct16.every(point => point.visibility === 0)).toBe(true);
    // Record how the small-gap response differs from the same visible receiver with the roof moved away.
    report.comparison = report.cases.map(item => ({ name: item.pose.name,
      topDirect16: item.direct16.reduce((sum, point) => sum + point.visibility, 0) / item.direct16.length,
      topDirect2048: item.direct2048.reduce((sum, point) => sum + point.visibility, 0) / item.direct2048.length,
      topDarkening: item.regions.top.rgbSignedDarkening, frontDarkening: item.regions.front.rgbSignedDarkening,
      topDarkeningMinusOpen: item.regions.top.rgbSignedDarkening - report.cases[0].regions.top.rgbSignedDarkening }));
    // A fully blocked, sub-cell gap must not sample the open sky above the roof.
    // This rejected the fast five-lobe interpolation prototype despite its lower GPU cost.
    expect(closeRoof.regions.top.rgbSignedDarkening - report.cases[0].regions.top.rgbSignedDarkening).toBeGreaterThan(30);
    expect(closeRoof.regions.top.rgbSignedDarkening).toBeGreaterThanOrEqual(report.cases[1].regions.top.rgbSignedDarkening - 2);
    expect(report.cases.some(item => item.regions.front.rgbAbsoluteMean > 0.1)).toBe(true);
    // Rotate the original stage to expose non-axis-aligned normals to the five-lobe blend.
    // The independent AABB oracle above does not apply to this rotated geometry.
    await page.locator("#info-model-select").selectOption("0"); await selectTimelineTrack(page, category, "庇移動");
    await number("tx", 0); await number("ty", 0); await selectCenterBone(page); await number("ry", 45);
    await page.locator("#info-model-select").selectOption("__camera__");
    const rotated = { captures: {}, centerRotationDegrees: [0, 45, 0], oracle: "Not applied: rotated boxes are not AABBs" }, rotatedImages = {};
    report.rotated = rotated;
    for (const active of [false, true]) {
      await open(page); await section(page).locator('[name="rcSkyOcclusionEnabled"]').setChecked(active);
      await expect(section(page).locator("[data-rc-sky-occlusion-status]")).toHaveAttribute("data-state", active ? "ready" : "off", { timeout: 45000 });
      await close(page);
      const name = active ? "on" : "off", directory = testInfo.outputPath(`rotated-45-${name}`); mkdirSync(directory, { recursive: true });
      rotated.captures[name] = await page.evaluate(directory => window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, 1280, 720), directory);
      expect(rotated.captures[name].surfaceReleased).toBe(true);
      rotatedImages[name] = PNG.sync.read(readFileSync(rotated.captures[name].path));
    }
    rotated.wholeVisibleGeometry = regionDifference(rotatedImages.off, rotatedImages.on, [[0, 0], [width, 0], [width, height], [0, height]]);
    expect(rotated.wholeVisibleGeometry.stablePixels).toBeGreaterThan(1000);
    rotated.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(rotated.validation.count).toBe(0); expect(report.errors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true }); writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

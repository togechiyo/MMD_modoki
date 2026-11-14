import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki } from "./electron-app.mjs";
import { initialState, camera, capture, projectPoints } from "./helpers/rc-diffuse-gi-controls.mjs";
import { addRcLighting, setRcLightingEnabled, openRcLighting, closeRcLighting, rcLightingRow, rcLightingStatus } from "./helpers/rc-lighting-controls.mjs";
import { createRcSkyStage } from "../../scripts/generate-rc-sky-stage.mjs";
import { writePmx } from "../../scripts/generate-external-parent-test-models.mjs";

const root = resolve(import.meta.dirname, "../..");
const invoke = (page, name, value) => page.evaluate(async ({ name, value }) =>
  // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
  (await import("/test/e2e/helpers/rc-sky-wall-probe.mjs"))[name](value), { name, value });
function wallNoise(image, polygon, reference = null) {
  const inside = (x, y) => {
    let positive = false, negative = false;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const side = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      positive ||= side > 0; negative ||= side < 0;
    }
    return !(positive && negative);
  };
  const brightness = (source, x, y) => { const i = (y * source.width + x) * 4; return (source.data[i] + source.data[i + 1] + source.data[i + 2]) / 3; };
  const gray = (x, y) => brightness(image, x, y);
  const nearReferenceEdge = (x, y) => {
    if (!reference) return false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const value = brightness(reference, x + dx, y + dy);
      if (dx < 2 && Math.abs(value - brightness(reference, x + dx + 1, y + dy)) > 4
        || dy < 2 && Math.abs(value - brightness(reference, x + dx, y + dy + 1)) > 4) return true;
    }
    return false;
  };
  let pixels = 0, spikes = 0, variation = 0, sum = 0;
  for (let y = 2; y < image.height - 2; y++) for (let x = 2; x < image.width - 2; x++) {
    if (!inside(x + .5, y + .5) || !inside(x - 2, y - 2) || !inside(x + 2, y + 2)) continue;
    if (nearReferenceEdge(x, y)) continue;
    const center = gray(x, y), neighbors = [gray(x - 1, y), gray(x + 1, y), gray(x, y - 1), gray(x, y + 1)];
    const residual = Math.abs(center - neighbors.reduce((a, b) => a + b, 0) / 4);
    variation += residual; sum += center; spikes += Number(residual > 4); pixels++;
  }
  return { pixels, spikes, spikeFraction: spikes / pixels, meanResidual: variation / pixels, mean: sum / pixels };
}

// Each pose starts in a fresh process. No private model, texture or shadow-map change.
for (const pose of [
  { id: "small", scale: 1, yaw: .37, offset: [0, 0, 0] },
  { id: "stage", scale: 40, yaw: .37, offset: [130, 0, -240] },
  { id: "translated", scale: 40, yaw: .71, offset: [-3000, 0, 8000] },
// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
]) test(`Sky Ambient wall stability: ${pose.id}`, async ({}, testInfo) => {
  test.setTimeout(180000);
  const report = { pose, errors: [], consoleErrors: [], captures: {} }, launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page, { fixed: false });
    await page.evaluate(async () => {
      // eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
      await import("/test/e2e/helpers/rc-sky-wall-probe.mjs");
      const state = window.mmdModokiE2e.exportProjectState();
      state.viewport.antialiasEnabled = false;
      await window.mmdModokiE2e.importProjectState(state);
    });
    // Bake the authored variant: capture restores application-owned model transforms.
    const rotate = ([x, y, z]) => [x * Math.cos(pose.yaw) + z * Math.sin(pose.yaw), y,
      -x * Math.sin(pose.yaw) + z * Math.cos(pose.yaw)];
    const point = p => rotate(p).map((v, i) => v * pose.scale + pose.offset[i]);
    const model = createRcSkyStage();
    for (const vertex of model.vertices) { vertex.position = point(vertex.position); vertex.normal = rotate(vertex.normal); }
    mkdirSync(testInfo.outputDir, { recursive: true });
    const path = testInfo.outputPath("authored-wall.pmx"); writeFileSync(path, writePmx(model));
    await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path);
    const target = point([-3.5, 2.7, 4.9]);
    const view = await camera(page, { tx: target[0], ty: target[1], tz: target[2],
      rx: 0, ry: pose.yaw * 180 / Math.PI, rz: 0, camDistance: 11.9 * pose.scale });
    const geometry = { wall: [[-6, 1.9, 4.9], [-1.5, 1.9, 4.9], [-1.5, 3.5, 4.9], [-6, 3.5, 4.9]].map(point) };
    await addRcLighting(page, "rcSkyAmbient");
    await openRcLighting(page, "rcSkyAmbient");
    await expect(rcLightingRow(page, "rcSkyAmbient").locator('input[type="range"]')).toHaveCount(3);
    await expect(rcLightingRow(page, "rcSkyAmbient").locator('input[type="number"], [data-rc-volume-controls]')).toHaveCount(0);
    // Addition prepares the automatic field; no manual volume recalculation UI remains.
    await expect(rcLightingStatus(page, "rcSkyAmbient")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await closeRcLighting(page);
    report.geometry = geometry; report.view = view; report.polygon = projectPoints(view, geometry.wall);
    const on = await capture(page, testInfo, report, "on");
    report.on = wallNoise(on, report.polygon);
    report.settings = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting.rcSkyAmbient);
    report.field = await invoke(page, "wallFieldState");
    expect(report.field.screen?.renders).toBeGreaterThan(0);
    expect(report.field.screen?.ready).toBe(true);
    await invoke(page, "setWallScreenEnabled", false);
    const hard = await capture(page, testInfo, report, "hard");
    report.hard = wallNoise(hard, report.polygon);
    report.awayFromHardEdges = wallNoise(on, report.polygon, hard);
    await invoke(page, "setWallScreenEnabled", true);
    report.guard = await invoke(page, "checkWallConnectionGuard");
    for (const item of report.guard) expect(item.actual, item.name).toBe(item.expected);
    report.performance = await invoke(page, "measureWallFrames", {});
    await setRcLightingEnabled(page, "rcSkyAmbient", false);
    report.off = wallNoise(await capture(page, testInfo, report, "off"), report.polygon);
    expect(report.on.pixels).toBeGreaterThan(1000);
    expect(report.off.meanResidual).toBeLessThan(.5);
    expect(report.off.mean).toBeGreaterThan(20);
    // Pre-screen 1a16e20's outer volume already has oblique lighting boundaries
    // (hard residual .643, spike fraction .044). Check noise away from those
    // boundaries, plus total variation/brightness against the hard reference.
    const noise = pose.id === "translated" ? report.awayFromHardEdges : report.on;
    expect(noise.pixels).toBeGreaterThan(1000);
    expect(noise.spikeFraction).toBeLessThan(.002);
    expect(noise.meanResidual).toBeLessThan(.2);
    expect(report.on.meanResidual).toBeLessThan(Math.max(.2, report.hard.meanResidual + .05));
    expect(Math.abs(report.on.mean - report.hard.mean)).toBeLessThan(1);
    expect(report.performance.fieldUpdates).toBe(0);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

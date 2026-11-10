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
  (await import("/test/e2e/helpers/rc-sky-wall-probe.mjs"))[name](value), { name, value });
function wallNoise(image, polygon) {
  const inside = (x, y) => {
    let positive = false, negative = false;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const side = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      positive ||= side > 0; negative ||= side < 0;
    }
    return !(positive && negative);
  };
  const gray = (x, y) => { const i = (y * image.width + x) * 4; return (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3; };
  let pixels = 0, spikes = 0, variation = 0, brightness = 0;
  for (let y = 2; y < image.height - 2; y++) for (let x = 2; x < image.width - 2; x++) {
    if (!inside(x + .5, y + .5) || !inside(x - 2, y - 2) || !inside(x + 2, y + 2)) continue;
    const center = gray(x, y), neighbors = [gray(x - 1, y), gray(x + 1, y), gray(x, y - 1), gray(x, y + 1)];
    const residual = Math.abs(center - neighbors.reduce((a, b) => a + b, 0) / 4);
    variation += residual; brightness += center; spikes += Number(residual > 4); pixels++;
  }
  return { pixels, spikes, spikeFraction: spikes / pixels, meanResidual: variation / pixels, mean: brightness / pixels };
}

// Each pose starts in a fresh process. No private model, texture or shadow-map change.
for (const pose of [
  { id: "small", scale: 1, yaw: .37, offset: [0, 0, 0] },
  { id: "stage", scale: 40, yaw: .37, offset: [130, 0, -240] },
  { id: "translated", scale: 40, yaw: .71, offset: [-3000, 0, 8000] },
]) test(`Sky Ambient wall stability: ${pose.id}`, async ({}, testInfo) => {
  test.setTimeout(180000);
  const report = { pose, errors: [], consoleErrors: [], captures: {} }, launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await initialState(page, { fixed: false });
    await page.evaluate(async () => {
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
    await rcLightingRow(page, "rcSkyAmbient").getByRole("button", { name: /範囲を再計算|Recalculate volume/ }).click();
    await expect(rcLightingStatus(page, "rcSkyAmbient")).toHaveAttribute("data-state", "ready", { timeout: 45000 });
    await closeRcLighting(page);
    report.geometry = geometry; report.view = view; report.polygon = projectPoints(view, geometry.wall);
    const on = await capture(page, testInfo, report, "on");
    report.on = wallNoise(on, report.polygon);
    report.settings = await page.evaluate(() => window.mmdModokiE2e.exportProjectState().lighting.rcSkyAmbient);
    report.field = await invoke(page, "wallFieldState");
    report.guard = await invoke(page, "checkWallConnectionGuard");
    for (const item of report.guard) expect(item.actual, item.name).toBe(item.expected);
    report.performance = await invoke(page, "measureWallFrames", {});
    await setRcLightingEnabled(page, "rcSkyAmbient", false);
    report.off = wallNoise(await capture(page, testInfo, report, "off"), report.polygon);
    expect(report.on.pixels).toBeGreaterThan(1000);
    expect(report.off.meanResidual).toBeLessThan(.5);
    expect(report.off.mean).toBeGreaterThan(20);
    expect(report.on.spikeFraction).toBeLessThan(.002);
    expect(report.on.meanResidual).toBeLessThan(.2);
    expect(report.performance.fieldUpdates).toBe(0);
    expect(report.errors).toEqual([]); expect(report.consoleErrors).toEqual([]);
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

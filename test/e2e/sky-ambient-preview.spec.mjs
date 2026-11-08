import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";

const root = resolve(import.meta.dirname, "../..");
function average(image, point, radius = 4) {
  const x = Math.round(point.x * image.width), y = Math.round(point.y * image.height);
  let sum = 0, count = 0;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (x + dx < 0 || x + dx >= image.width || y + dy < 0 || y + dy >= image.height) continue;
    const i = ((y + dy) * image.width + x + dx) * 4;
    sum += (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3; count++;
  }
  return sum / count;
}

test("Sky ambient preview: independent colored sky, static occluders and moving receiver", async ({}, testInfo) => {
  test.setTimeout(180000);
  const report = { errors: [], consoleErrors: [], captures: {} };
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => { report.errors.push(error.stack ?? error.message); console.log(error.message); });
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      Object.assign(project.viewport, { groundVisible: false, skydomeVisible: false, backgroundDisplayMode: "black" });
      Object.assign(project.lighting, { intensity: 0, ambientIntensity: 0, shadowEnabled: false });
      project.lighting.rcSkyOcclusion.enabled = false;
      project.lighting.rcDiffuseGi.enabled = false;
      await window.mmdModokiE2e.importProjectState(project);
      const { createSkyAmbientPreview } = await import("/test/fixtures/sky-ambient-preview/scene.ts");
      window.skyAmbientPreview = await createSkyAmbientPreview();
      window.mmdModokiE2e.setCameraPose({ x: 8, y: 5.2, z: -14 }, { x: 0, y: 1.4, z: 1 });
    });
    const settle = async () => {
      const before = await page.evaluate(() => window.skyAmbientPreview.state().frames);
      await page.waitForFunction(before => window.skyAmbientPreview.state().frames > before + 8, before);
    };
    const capture = async name => {
      await settle();
      const path = testInfo.outputPath(`${name}.png`);
      // This procedural scene bypasses model loading; hide only the empty-model hint in captures.
      const buffer = await page.locator("#render-canvas").screenshot({ path,
        style: "#viewport-overlay { visibility: hidden !important; }" });
      report.captures[name] = path;
      return PNG.sync.read(buffer);
    };
    const open = await capture("unoccluded-sky");
    report.initial = await page.evaluate(() => window.skyAmbientPreview.state());
    await page.evaluate(() => window.skyAmbientPreview.setOcclusion(true));
    const occluded = await capture("occluded-sky");
    const points = await page.evaluate(() => window.skyAmbientPreview.samplePoints());
    report.samples = Object.fromEntries(Object.entries(points).map(([key, point]) => [key,
      { point, open: average(open, point), occluded: average(occluded, point) }]));
    expect(Math.abs(report.samples.tileA.open - report.samples.tileB.open)).toBeGreaterThan(15);
    expect(report.samples.porch.open - report.samples.porch.occluded).toBeGreaterThan(15);
    expect(report.samples.room.open - report.samples.room.occluded).toBeGreaterThan(20);
    // Compare each point against its own albedo: the room sample is a light tile,
    // whereas the outdoor sample is a dark tile in this checker texture.
    report.skyRatios = Object.fromEntries(["outside", "porch", "room"].map(key => [key,
      report.samples[key].occluded / report.samples[key].open]));
    expect(report.skyRatios.outside).toBeGreaterThan(report.skyRatios.room + 0.2);
    await page.evaluate(async () => {
      for (let frame = 1; frame <= 60; frame++) {
        window.skyAmbientPreview.moveReceiver(-2 + 5 * frame / 60, -3 + 5 * frame / 60);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    });
    const inside = await capture("receiver-inside");
    const insidePoint = await page.evaluate(() => window.skyAmbientPreview.samplePoints().receiver);
    report.receiverBrightness = { outside: average(occluded, points.receiver), inside: average(inside, insidePoint) };
    expect(report.receiverBrightness.outside - report.receiverBrightness.inside).toBeGreaterThan(10);
    report.receiverMoved = await page.evaluate(() => window.skyAmbientPreview.state());
    expect(report.receiverMoved.fieldUpdates).toBe(report.initial.fieldUpdates);
    expect(report.receiverMoved.sourceRevision).toBe(report.initial.sourceRevision);
    await page.evaluate(() => window.skyAmbientPreview.raiseAwning());
    await settle();
    report.casterMoved = await page.evaluate(() => window.skyAmbientPreview.state());
    expect(report.casterMoved.fieldUpdates).toBe(report.initial.fieldUpdates + 1);
    await page.evaluate(() => window.skyAmbientPreview.setStrength(0));
    const zero = await capture("zero-strength");
    report.zeroBrightness = average(zero, points.outside);
    expect(report.zeroBrightness).toBeLessThan(3);
    report.validation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.errors).toEqual([]);
    expect(report.validation.count).toBe(0);
    await page.evaluate(() => window.skyAmbientPreview.dispose());
  } finally {
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

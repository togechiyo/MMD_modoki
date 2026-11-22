import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { camera, capture, difference, initialState, numberControl, seek, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";
import { createRcGiStressScene, rcGiStressScene } from "../fixtures/rc-diffuse-gi-stage/stress-scene.mjs";
import { writePmx } from "../../scripts/generate-external-parent-test-models.mjs";

const root = resolve(import.meta.dirname, "../..");
const probeUrl = "/test/e2e/helpers/rc-combined-performance-probe.mjs";
const invoke = (page, method, value) => page.evaluate(async ({ probeUrl, method, value }) => {
  return (await import(probeUrl))[method](value);
}, { probeUrl, method, value });
const width = Number(process.env.MMD_RC_GI_STRESS_WIDTH ?? 1920);
const height = width * 9 / 16;
const modelCount = Number(process.env.MMD_RC_GI_STRESS_MODELS ?? 1);
const warmFrames = 30, frames = 120;

function placeStressScene(scale, x) {
  const model = createRcGiStressScene();
  if (scale === 1 && x === 0) return model;
  const point = ([px, py, pz]) => [px * scale + x, py * scale, pz * scale];
  for (const vertex of model.vertices) vertex.position = point(vertex.position);
  for (const bone of model.bones) bone.position = point(bone.position ?? [0, 0, 0]);
  for (const morph of model.vertexMorphs) {
    for (const entry of morph.offsets) entry.offset = entry.offset.map(value => value * scale);
  }
  return model;
}

async function keyStressMotion(page, modelIndex, scale) {
  const { boneNames, morphName } = rcGiStressScene;
  await page.locator("#info-model-select").selectOption(String(modelIndex));
  const tracks = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks());
  const morphKey = page.getByRole("button", { name: morphName + " keyframe", exact: true });
  const slider = page.locator("#morph-controls .morph-slider-row").filter({ has: morphKey }).locator('input[type="range"]');
  const poses = [[0, 0], [60, 1], [180, -1], [600, 1]];
  for (const [frame, amount] of poses) {
    await seek(page, frame);
    for (const [name, control, amplitude] of [[boneNames.root, "tx", 4 * scale], [boneNames.left, "rz", 12], [boneNames.right, "rz", -12]]) {
      const track = tracks.find(track => track.name === name);
      expect(track, name).toBeTruthy();
      await selectTimelineTrack(page, track.category, name);
      await numberControl(page, control, amplitude * amount);
      await page.locator("#btn-bone-keyframe").click();
    }
    await slider.focus();
    await slider.press(amount > 0 ? "End" : "Home");
    await expect(slider).toHaveValue(amount > 0 ? "1" : "0");
    await morphKey.click();
  }
  const keyed = await page.evaluate(() => window.mmdModokiE2e.getTimelineTracks());
  for (const name of [...Object.values(boneNames), morphName]) {
    expect(keyed.find(track => track.name === name)?.frames, name).toEqual(poses.map(([frame]) => frame));
  }
  await seek(page, 0);
}

for (const enabled of [false, true]) {
  const id = `gi-${enabled ? "on" : "off"}-${width}x${height}${modelCount === 1 ? "" : "-" + modelCount + "models"}`;
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
  test(`GI stress playback: GI ${enabled ? "on" : "off"}`, async ({}, testInfo) => {
    test.skip(process.env.MMD_RC_GI_STRESS !== "1", "Opt in to the high-load local WebGPU benchmark");
    test.setTimeout(300000);
    expect([1280, 1920]).toContain(width);
    expect([1, 3]).toContain(modelCount);
    const xOffsets = modelCount === 3 ? [-38, 0, 38] : [0];
    const scale = modelCount === 3 ? 0.55 : 1;
    const triangleCount = modelCount * rcGiStressScene.triangleCount;
    const launched = await launchMmdModoki(root);
    const directory = process.env.MMD_RC_GI_STRESS_OUTPUT ? resolve(process.env.MMD_RC_GI_STRESS_OUTPUT) : testInfo.outputDir;
    const report = { id, fixture: rcGiStressScene, modelCount, triangleCount, xOffsets, scale,
      enabled, width, height, warmFrames, frames, errors: [], consoleErrors: [], captures: {} };
    try {
      const page = await launched.app.firstWindow();
      await page.addInitScript(() => {
        const proto = window.GPUAdapter?.prototype;
        if (!proto) return;
        const requestDevice = proto.requestDevice;
        proto.requestDevice = function (descriptor = {}) {
          const features = new Set(descriptor.requiredFeatures);
          if (this.features.has("timestamp-query")) features.add("timestamp-query");
          return requestDevice.call(this, { ...descriptor, requiredFeatures: [...features] });
        };
      });
      await page.reload();
      page.on("pageerror", error => report.errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
      await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
      await page.evaluate(url => import(url).then(() => true), probeUrl);
      await initialState(page, { fixed: false });
      for (const [index, x] of xOffsets.entries()) {
        const modelPath = resolve(launched.tempDir, modelCount === 1 ? "rc-gi-stress.pmx" : `rc-gi-stress-${index}.pmx`);
        writeFileSync(modelPath, writePmx(placeStressScene(scale, x)));
        expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
        await keyStressMotion(page, index, scale);
      }
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models.length)).toBe(modelCount);
      const cameraPose = modelCount === 3 ? { ...rcGiStressScene.camera, ty: 5, ry: 0, camDistance: 135 } : rcGiStressScene.camera;
      report.camera = await camera(page, cameraPose);
      await setGi(page, enabled);
      report.prepared = await invoke(page, "prepareCombinedPerformance", { width, height });
      expect(report.prepared.size).toEqual([width, height]);
      expect(report.prepared.gi.status).toBe(enabled ? "ready" : "off");
      if (enabled) {
        expect(report.prepared.gi.triangleCount).toBe(triangleCount);
        expect(report.prepared.gi.volumes).toHaveLength(4);
      }

      const play = page.locator("#viewport-seek-play-toggle");
      await play.click();
      report.ordinary = await invoke(page, "measurePlaybackCadence", { warmFrames, frames });
      expect(report.ordinary.playing).toBe(true);
      expect(report.ordinary.lastFrame - report.ordinary.firstFrame).toBeGreaterThan(5);
      expect(report.ordinary.size).toEqual([width, height]);
      await play.click();
      await seek(page, 0);
      await play.click();
      report.diagnostic = await invoke(page, "measureCombinedPerformance", { warmFrames, frames, completionFrames: 0 });
      const { realtime } = report.diagnostic;
      expect(realtime.state.size).toEqual([width, height]);
      expect(realtime.samples.at(-1).frame - realtime.samples[0].frame).toBeGreaterThan(5);
      expect(realtime.validation.count).toBe(0);
      expect(report.diagnostic.validationAfterCleanup.count).toBe(0);
      if (realtime.state.deviceTimestampQuery) expect(realtime.gpu.completeFrames).toBe(frames);
      if (enabled) {
        expect(realtime.state.gi.triangleCount).toBe(triangleCount);
        expect(realtime.counts.sourceUpdates).toBeGreaterThan(5);
        expect(realtime.counts.computeDispatches).toBeGreaterThan(0);
      } else {
        expect(realtime.counts.sourceUpdates ?? 0).toBe(0);
        expect(realtime.counts.computeDispatches ?? 0).toBe(0);
      }
      await play.click();
      const images = [];
      for (const frame of [0, 60]) {
        await invoke(page, "setCombinedReferencePose", frame);
        images.push(await capture(page, testInfo, report, "frame-" + frame));
      }
      report.motionImageMae = difference(...images);
      expect(report.motionImageMae, "The keyed surfaces must visibly move in the measured camera").toBeGreaterThan(0.1);
      expect(report.errors).toEqual([]);
      expect(report.consoleErrors).toEqual([]);
    } finally {
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, id + ".json"), JSON.stringify(report, null, 2));
      await launched.close();
    }
  });
}

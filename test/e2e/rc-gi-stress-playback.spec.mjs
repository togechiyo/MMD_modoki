import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { launchMmdModoki, selectTimelineTrack } from "./electron-app.mjs";
import { camera, capture, difference, initialState, numberControl, seek, setGi } from "./helpers/rc-diffuse-gi-controls.mjs";
import { aliciaDanceFiles, hasAliciaDance, loadAliciaDance } from "./helpers/rc-alicia-dance.mjs";
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
const ensemble = process.env.MMD_RC_GI_STRESS_ALICIA === "ensemble";
const alicia = ensemble || process.env.MMD_RC_GI_STRESS_ALICIA === "1";
const aliciaFiles = aliciaDanceFiles(root);

function placeStressScene(scale, x, z) {
  const model = createRcGiStressScene();
  if (scale === 1 && x === 0 && z === 0) return model;
  const point = ([px, py, pz]) => [px * scale + x, py * scale, pz * scale + z];
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

async function prepareStressFixture(launched, page) {
  if (alicia && !ensemble) {
    const stage = resolve(root, "test/fixtures/rc-diffuse-gi-stage/rc-diffuse-gi-red.pmx");
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), stage)).not.toBeNull();
    await loadAliciaDance(launched, page, aliciaFiles);
    await seek(page, 0);
    return { fixture: { character: basename(aliciaFiles.character), motion: basename(aliciaFiles.motion), stage: basename(stage), stageTriangles: 36 },
      modelCount: 2, camera: await camera(page, { tx: 0, ty: 9, rx: -4, ry: 10, camDistance: 44 }) };
  }
  expect([1, 3]).toContain(modelCount);
  const xOffsets = modelCount === 3 ? [-38, 0, 38] : [0];
  const scale = modelCount === 3 ? 0.55 : 1;
  // The camera looks from negative Z. Put the rooms behind the dancer and inside the nearest GI volume.
  const zOffset = ensemble ? 27 : 0;
  for (const [index, x] of xOffsets.entries()) {
    const modelPath = resolve(launched.tempDir, modelCount === 1 ? "rc-gi-stress.pmx" : `rc-gi-stress-${index}.pmx`);
    writeFileSync(modelPath, writePmx(placeStressScene(scale, x, zOffset)));
    expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), modelPath)).not.toBeNull();
    await keyStressMotion(page, index, scale);
  }
  const cameraPose = modelCount === 3 ? { ...rcGiStressScene.camera, ty: 5, ry: 0, camDistance: 135 } : rcGiStressScene.camera;
  if (ensemble) {
    await loadAliciaDance(launched, page, aliciaFiles);
    await seek(page, 0);
    const fixture = { character: basename(aliciaFiles.character), motion: basename(aliciaFiles.motion),
      stageRooms: modelCount, stageTriangles: modelCount * rcGiStressScene.triangleCount,
      movingStageTriangles: modelCount * rcGiStressScene.movingTriangles };
    const view = { ...cameraPose, ty: 9, rx: -5, ry: 0, camDistance: modelCount === 3 ? 115 : 75 };
    return { fixture, modelCount: modelCount + 1, xOffsets, zOffset, scale, camera: await camera(page, view) };
  }
  return { fixture: rcGiStressScene, modelCount, xOffsets, scale, triangleCount: modelCount * rcGiStressScene.triangleCount,
    camera: await camera(page, cameraPose) };
}

for (const enabled of [false, true]) {
  const roomSuffix = ensemble || (!alicia && modelCount !== 1) ? `-${modelCount}models` : "";
  const suffix = roomSuffix + (alicia ? "-alicia" : "");
  const id = `gi-${enabled ? "on" : "off"}-${width}x${height}${suffix}`;
  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture argument.
  test(`GI stress playback: GI ${enabled ? "on" : "off"}`, async ({}, testInfo) => {
    test.skip(process.env.MMD_RC_GI_STRESS !== "1", "Opt in to the high-load local WebGPU benchmark");
    test.skip(alicia && !hasAliciaDance(aliciaFiles), "Optional Alicia PMX and bundled motion are not installed");
    test.setTimeout(300000);
    expect([1280, 1920]).toContain(width);
    const launched = await launchMmdModoki(root);
    const directory = process.env.MMD_RC_GI_STRESS_OUTPUT ? resolve(process.env.MMD_RC_GI_STRESS_OUTPUT) : testInfo.outputDir;
    const report = { id, enabled, width, height, warmFrames, frames, errors: [], consoleErrors: [], captures: {}, rgbaSha256: {} };
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
      Object.assign(report, await prepareStressFixture(launched, page));
      expect(await page.evaluate(() => window.mmdModokiE2e.exportProjectState().scene.models.length)).toBe(report.modelCount);
      await setGi(page, enabled);
      report.prepared = await invoke(page, "prepareCombinedPerformance", { width, height });
      expect(report.prepared.size).toEqual([width, height]);
      expect(report.prepared.gi.status).toBe(enabled ? "ready" : "off");
      if (enabled) {
        if (alicia) {
          // Translucent character surfaces do not participate in the GI producer.
          expect(report.prepared.gi.triangleCount).toBeGreaterThan(report.fixture.stageTriangles);
          report.triangleCount = report.prepared.gi.triangleCount;
        } else expect(report.prepared.gi.triangleCount).toBe(report.triangleCount);
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
        expect(realtime.state.gi.triangleCount).toBe(report.triangleCount);
        expect(realtime.counts.sourceUpdates).toBeGreaterThan(5);
        expect(realtime.counts.computeDispatches).toBeGreaterThan(0);
      } else {
        expect(realtime.counts.sourceUpdates ?? 0).toBe(0);
        expect(realtime.counts.computeDispatches ?? 0).toBe(0);
      }
      await play.click();
      const images = [];
      const dancerPositions = [];
      for (const frame of [0, 60]) {
        await invoke(page, "setCombinedReferencePose", frame);
        const image = await capture(page, testInfo, report, "frame-" + frame);
        report.rgbaSha256[frame] = createHash("sha256").update(image.data).digest("hex");
        images.push(image);
        if (ensemble) {
          const center = await page.evaluate(index => window.mmdModokiE2e.getModelBoneRenderedPosition(index, "センター"), modelCount);
          expect(center).not.toBeNull();
          dancerPositions.push(center);
        }
      }
      report.motionImageMae = difference(...images);
      expect(report.motionImageMae, "The animation must visibly move in the measured camera").toBeGreaterThan(0.1);
      if (ensemble) {
        const [a, b] = dancerPositions;
        report.dancerCenterDistance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        expect(report.dancerCenterDistance, "The VMD must move Alicia alongside the animated stage").toBeGreaterThan(0.05);
      }
      if (alicia) {
        await invoke(page, "setCombinedReferencePose", 0);
        const rewound = await capture(page, testInfo, report, "frame-0-rewind");
        report.rewindSha256 = createHash("sha256").update(rewound.data).digest("hex");
        expect(report.rewindSha256).toBe(report.rgbaSha256[0]);
      }
      expect(report.errors).toEqual([]);
      expect(report.consoleErrors).toEqual([]);
    } finally {
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, id + ".json"), JSON.stringify(report, null, 2));
      await launched.close();
    }
  });
}

import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "./electron-app.mjs";
import { createCsmRoofFixture } from "./helpers/csm-roof-fixture.mjs";

const root = resolve(import.meta.dirname, "../..");
const stagePath = resolve(root, "test/fixtures/shadow-stage/shadow-stage-wide.pmx");
const pose = { position: { x: 80, y: 80, z: -100 }, target: { x: -114, y: 80, z: 350 },
  direction: { x: -1, y: -.2, z: 1 }, roof: false };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function installExportObservers(page) {
  await page.evaluate(() => {
    const events = { png: {}, webm: {}, webmProgress: {} };
    window.__csmFadeExports = events;
    // Ordinary PNG jobs report saved progress, but do not emit the automation-only result event.
    window.electronAPI.onPngSequenceExportProgress(progress => { events.png[progress.jobId] = progress; });
    window.electronAPI.onWebmExportResult(result => { events.webm[result.jobId] = result; });
    window.electronAPI.onWebmExportProgress(progress => { events.webmProgress[progress.jobId] = progress; });
  });
}

async function exportPng(page, project, directory, prefix, dimensions) {
  const launch = await page.evaluate(({ project, directory, prefix, dimensions }) =>
    window.electronAPI.startPngSequenceExportWindow({ project, externalLut: null,
      outputDirectoryPath: directory, prefix, startFrame: 0, endFrame: 0, step: 1,
      fps: 30, precision: 1, outputWidth: dimensions.width, outputHeight: dimensions.height,
      transparentBackground: false }), { project, directory, prefix, dimensions });
  expect(launch.jobId, JSON.stringify(launch)).toBeTruthy();
  await expect.poll(() => page.evaluate(jobId => window.__csmFadeExports.png[jobId]?.saved, launch.jobId),
    { timeout: 90000 }).toBe(1);
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
  const path = resolve(directory, `${prefix}_0000.png`);
  const progress = await page.evaluate(jobId => window.__csmFadeExports.png[jobId], launch.jobId);
  expect(progress).toMatchObject({ saved: 1, total: 1 });
  const image = PNG.sync.read(readFileSync(path));
  expect([image.width, image.height]).toEqual([dimensions.width, dimensions.height]);
  return { path, progress };
}

async function exportWebm(page, project, directory, name, dimensions) {
  const path = resolve(directory, `${name}.webm`);
  const launch = await page.evaluate(({ project, path, dimensions }) =>
    window.electronAPI.startWebmExportWindow({ project, externalLut: null, outputFilePath: path,
      startFrame: 0, endFrame: 0, fps: 30, outputWidth: dimensions.width, outputHeight: dimensions.height,
      includeAudio: false, preferredVideoCodec: "vp8", captureMode: "rgba-surface" }),
  { project, path, dimensions });
  expect(launch.jobId, JSON.stringify(launch)).toBeTruthy();
  await expect.poll(() => page.evaluate(jobId => Boolean(window.__csmFadeExports.webm[jobId]), launch.jobId),
    { timeout: 90000 }).toBe(true);
  const result = await page.evaluate(jobId => window.__csmFadeExports.webm[jobId], launch.jobId);
  expect(result, JSON.stringify(result)).toMatchObject({ status: "completed" });
  const progress = await page.evaluate(jobId => window.__csmFadeExports.webmProgress[jobId], launch.jobId);
  expect(progress).toMatchObject({ encoded: 1, total: 1 });
  await expect(page.locator("#app")).not.toHaveClass(/ui-export-lock/, { timeout: 30000 });
  // Decode the actual hidden-exporter file, not a viewport recording. Wait for presentation,
  // because loadeddata alone does not guarantee that drawImage can read the decoded frame.
  const decoded = await page.evaluate(async path => {
    const bytes = await window.electronAPI.readBinaryFile(path);
    if (!bytes) throw new Error("WebM output unavailable");
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
    const video = document.createElement("video");
    video.muted = true;
    try {
      await new Promise((resolveLoaded, rejectLoaded) => {
        const timer = setTimeout(() => rejectLoaded(new Error("WebM first-frame decode timeout")), 15000);
        video.addEventListener("loadeddata", () => { clearTimeout(timer); resolveLoaded(); }, { once: true });
        video.addEventListener("error", () => { clearTimeout(timer); rejectLoaded(new Error("WebM decode failed")); }, { once: true });
        video.src = url;
        video.load();
      });
      await new Promise((resolveSeeked, rejectSeeked) => {
        const timer = setTimeout(() => rejectSeeked(new Error("WebM first-frame seek timeout")), 15000);
        video.addEventListener("seeked", () => { clearTimeout(timer); resolveSeeked(); }, { once: true });
        video.addEventListener("error", () => { clearTimeout(timer); rejectSeeked(new Error("WebM seek failed")); }, { once: true });
        video.currentTime = Math.min(.001, Number.isFinite(video.duration) ? video.duration / 2 : .001);
      });
      if (typeof video.requestVideoFrameCallback !== "function") throw new Error("Video frame presentation callback unavailable");
      const presented = await new Promise((resolveFrame, rejectFrame) => {
        const timer = setTimeout(() => {
          video.cancelVideoFrameCallback(callbackId);
          rejectFrame(new Error("WebM first-frame presentation timeout"));
        }, 15000);
        const callbackId = video.requestVideoFrameCallback((_now, metadata) => {
          clearTimeout(timer);
          resolveFrame({ mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames,
            width: metadata.width, height: metadata.height });
        });
        video.play().catch(error => {
          clearTimeout(timer); video.cancelVideoFrameCallback(callbackId); rejectFrame(error);
        });
      });
      video.pause();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      return { width: canvas.width, height: canvas.height, duration: video.duration, presented,
        png: canvas.toDataURL("image/png").split(",")[1] };
    } finally {
      video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
    }
  }, path);
  expect([decoded.width, decoded.height]).toEqual([dimensions.width, dimensions.height]);
  const decodedPath = resolve(directory, `${name}-decoded.png`);
  writeFileSync(decodedPath, Buffer.from(decoded.png, "base64"));
  return { path, decodedPath, result, progress, width: decoded.width, height: decoded.height,
    duration: decoded.duration, presented: decoded.presented };
}

function measureFade(actualPath, clearPath, state) {
  const actual = PNG.sync.read(readFileSync(actualPath)), clear = PNG.sync.read(readFileSync(clearPath));
  expect([actual.width, actual.height]).toEqual([clear.width, clear.height]);
  const gray = (image, x, y) => {
    const index = (y * image.width + x) * 4;
    return (image.data[index] + image.data[index + 1] + image.data[index + 2]) / 3;
  };
  const end = state.splits.at(-1), rows = [];
  for (const sample of state.samples) {
    const x = Math.round(sample.x * actual.width / state.width), y = Math.round(sample.y * actual.height / state.height);
    if (x < 0 || y < 0 || x >= actual.width || y >= actual.height) continue;
    const reference = gray(clear, x, y);
    if (reference < 20) continue;
    rows.push({ height: sample.height, z: sample.z, depth: sample.depth, pixel: [x, y],
      ratio: gray(actual, x, y) / reference });
  }
  const near = rows.filter(row => row.depth >= end * .3 && row.depth <= end * .6);
  const tail = rows.filter(row => row.depth >= end * .7 && row.depth <= end + 50);
  const beyond = rows.filter(row => row.depth >= end + 20 && row.depth <= end + 100);
  const previousByHeight = new Map(), steps = [];
  for (const row of tail) {
    const previous = previousByHeight.get(row.height);
    if (previous && row.z - previous.z === 5 && row.pixel.join(",") !== previous.pixel.join(",")) {
      steps.push(Math.abs(row.ratio - previous.ratio));
    }
    previousByHeight.set(row.height, row);
  }
  const nearRatio = near.length ? median(near.map(row => row.ratio)) : null;
  const transition = tail.filter(row => row.depth < end && row.ratio > nearRatio + .04 && row.ratio < .97);
  return { end, nearSamples: near.length, nearRatio, beyondSamples: beyond.length,
    beyondRange: beyond.length ? [Math.min(...beyond.map(row => row.ratio)), Math.max(...beyond.map(row => row.ratio))] : [],
    stepCount: steps.length, maxStep: steps.length ? Math.max(...steps) : null,
    transitionPixels: new Set(transition.map(row => row.pixel.join(","))).size,
    transitionDepths: new Set(transition.map(row => row.z)).size, rows };
}

function expectFade(profile, label, stepLimit) {
  expect(profile.nearSamples, `${label}: near coverage`).toBeGreaterThan(100);
  expect(profile.nearRatio, `${label}: preserve nearby shadow`).toBeGreaterThan(.7);
  expect(profile.nearRatio, `${label}: preserve nearby shadow`).toBeLessThan(.9);
  expect(profile.beyondSamples, `${label}: beyond-distance coverage`).toBeGreaterThan(25);
  expect(profile.beyondRange[0], `${label}: fully faded`).toBeGreaterThan(.97);
  expect(profile.beyondRange[1], `${label}: no overshoot`).toBeLessThan(1.03);
  expect(profile.stepCount, `${label}: distinct adjacent pixels`).toBeGreaterThan(20);
  expect(profile.maxStep, `${label}: smooth final-distance transition`).toBeLessThan(stepLimit);
  expect(profile.transitionPixels, `${label}: multiple transition pixels`).toBeGreaterThan(10);
  expect(profile.transitionDepths, `${label}: multiple transition depths`).toBeGreaterThan(3);
}

test("CSM final-distance fade matches hidden PNG and WebM exports: frameGraph, penumbra=false", async ({}, testInfo) => {
  test.skip(process.env.MMD_CSM_EXPORT_INVESTIGATION !== "1",
    "Opt-in: this one-frame fixture also loses WebM shadows before the distance-fade fix; see the CSM investigation note");
  test.setTimeout(360000);
  mkdirSync(testInfo.outputDir, { recursive: true });
  const roofPath = testInfo.outputPath("csm-distance-roof.pmx");
  writeFileSync(roofPath, createCsmRoofFixture());
  const report = { errors: [], consoleErrors: [], exports: {},
    interpretation: "Self-authored wall and generated roof PMX are loaded through the normal model loader and preserved in the saved project. Both hidden exporters reload both PMX files; no runtime-only roof is used. Shadow ON/OFF ratios remove codec/color offsets. This single frameGraph/None/distance1000 case checks exported fade fidelity, not GUI authoring or every codec." };
  const launched = await launchMmdModoki(root);
  try {
    const page = await launched.app.firstWindow();
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.consoleErrors.push(message.text()); });
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(() => localStorage.setItem("mmd_modoki.postEffectBackend", "frameGraph"));
    await page.reload();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
    await page.evaluate(async () => {
      const project = window.mmdModokiE2e.exportProjectState();
      project.physics.enabled = false;
      Object.assign(project.lighting, { shadowEnabled: true, shadowMode: "cascaded", shadowPenumbraEnabled: false,
        shadowMaxZ: 1000, shadowDistanceMultiplier: 1 });
      await window.mmdModokiE2e.importProjectState(project);
    });
    for (const path of [stagePath, roofPath]) {
      expect(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path)).not.toBeNull();
    }
    // Author the saved orbit pose through the normal importer. The diagnostic hook sets
    // viewport eye then target separately; an unchanged MmdCamera eye can skip recomputing
    // its orbit parameters when only the target changes. Hidden exporters need the saved pose.
    const offset = ["x", "y", "z"].map(axis => pose.position[axis] - pose.target[axis]);
    const distance = Math.hypot(...offset);
    report.cameraFixture = { position: pose.position, target: pose.target, distance,
      rotation: { x: Math.asin(-offset[1] / distance) * 180 / Math.PI,
        y: Math.atan2(offset[0], -offset[2]) * 180 / Math.PI, z: 0 } };
    const imported = await page.evaluate(async camera => {
      const project = window.mmdModokiE2e.exportProjectState();
      Object.assign(project.camera, camera);
      return await window.mmdModokiE2e.importProjectState(project);
    }, report.cameraFixture);
    expect(imported).toMatchObject({ loadedModels: 2, warnings: [] });
    await page.locator("#info-model-select").selectOption("__camera__");
    report.backend = await page.evaluate(() => window.mmdModokiE2e.getFrameGraphPostEffectsState().backend);
    expect(report.backend).toBe("frameGraph");
    report.runtime = await page.evaluate(() => window.mmdModokiE2e.getShadowRuntimeDiagnostics());
    expect(report.runtime).toMatchObject({ engine: "WebGPU", effectiveMode: "cascaded", filter: "none" });
    report.state = await page.evaluate(async args =>
      (await import("/test/e2e/helpers/csm-wall-band-probe.mjs")).inspectCsmWallBand(args), pose);
    expect(report.state.splits.at(-1)).toBeCloseTo(1000, 4);
    const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
    expect(project.scene.models.map(model => model.path)).toEqual([stagePath, roofPath]);
    expect(project.lighting).toMatchObject({ shadowEnabled: true, shadowMode: "cascaded", shadowPenumbraEnabled: false,
      shadowMaxZ: 1000, shadowDistanceMultiplier: 1, ...pose.direction });
    for (const [index, axis] of ["x", "y", "z"].entries()) {
      expect(project.camera.position[axis]).toBeCloseTo(report.state.position[index], 4);
      expect(project.camera.target[axis]).toBeCloseTo(report.state.target[index], 4);
    }
    writeFileSync(testInfo.outputPath("export-project.json"), JSON.stringify(project, null, 2));
    // VP8 output uses even dimensions; keep the viewport aspect for projected wall samples.
    const dimensions = { width: 1280, height: 720 };
    expect(report.state.width / report.state.height).toBeCloseTo(dimensions.width / dimensions.height, 4);
    await installExportObservers(page);
    for (const enabled of [true, false]) {
      const exportProject = structuredClone(project);
      exportProject.lighting.shadowEnabled = enabled;
      const label = enabled ? "shadow" : "clear";
      const png = await exportPng(page, exportProject, testInfo.outputDir, label, dimensions);
      const webm = await exportWebm(page, exportProject, testInfo.outputDir, label, dimensions);
      report.exports[label] = { png, webm };
    }
    report.png = measureFade(report.exports.shadow.png.path, report.exports.clear.png.path, report.state);
    report.webm = measureFade(report.exports.shadow.webm.decodedPath, report.exports.clear.webm.decodedPath, report.state);
    const webmRows = new Map(report.webm.rows.map(row => [`${row.height}:${row.z}`, row]));
    const differences = report.png.rows.filter(row => row.depth >= 700 && row.depth <= 1050)
      .flatMap(row => {
        const other = webmRows.get(`${row.height}:${row.z}`);
        return other ? [Math.abs(row.ratio - other.ratio)] : [];
      });
    report.comparison = { samples: differences.length,
      mean: differences.reduce((sum, value) => sum + value, 0) / differences.length, maximum: Math.max(...differences) };
    expectFade(report.png, "hidden PNG", .04);
    // VP8 is lossy; retain the PNG criterion and allow a small codec allowance for decoded video.
    expectFade(report.webm, "hidden WebM", .05);
    expect(report.comparison.samples).toBeGreaterThan(100);
    expect(report.comparison.mean).toBeLessThan(.025);
    expect(report.comparison.maximum).toBeLessThan(.07);
    report.editorValidation = await page.evaluate(() => window.mmdModokiE2e.getWebGpuValidationDiagnostics());
    expect(report.editorValidation.count).toBe(0);
    expect(report.errors).toEqual([]);
    expect(report.consoleErrors).toEqual([]);
  } finally {
    writeFileSync(testInfo.outputPath("report.json"), JSON.stringify(report, null, 2));
    await launched.close();
  }
});

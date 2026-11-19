import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PNG } from "playwright-core/lib/utilsBundle";
import { launchMmdModoki } from "../test/e2e/electron-app.mjs";
import { decodeFirstVideoFrame } from "../test/e2e/video-first-frame.mjs";
import { generateLuminousStage } from "./generate-luminous-stage-fixture.mjs";
import { benchmarkOutputs } from "./lib/backend-output-benchmark.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: {
  backend: { type: "string" }, preset: { type: "string", default: "fixture" },
  run: { type: "string", default: "1" }, output: { type: "string" },
} });
assert.ok(["webgl2", "webgpu"].includes(values.backend), "--backend webgl2|webgpu is required");
assert.ok(["fixture", "heavy"].includes(values.preset), "--preset fixture|heavy");
const run = Number(values.run);
assert.ok(Number.isInteger(run) && run > 0, "--run must be a positive integer");
const directory = resolve(values.output ?? resolve(root, ".tmp/backend-performance", `${values.preset}-${values.backend}-${run}`));
assert.ok(!existsSync(resolve(directory, "report.json")), "Refusing to overwrite a completed measurement");
mkdirSync(directory, { recursive: true });
const width = 1920, height = 1080, frames = 100, fps = 30;
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const source = { commit: git("rev-parse", "HEAD").trim(),
  productDiffSha256: createHash("sha256").update(git("diff", "--", "src")).digest("hex"),
  modifiedProductFiles: git("diff", "--name-only", "--", "src").trim().split("\n").filter(Boolean) };
const stage = values.preset === "fixture"
  ? resolve(root, "test/fixtures/luminous-stage/luminous-stage-fixture.pmx")
  : resolve(root, "local-references/backend-benchmark/heavy/luminous-stage-heavy.pmx");
if (!existsSync(stage)) {
  assert.equal(values.preset, "heavy");
  await generateLuminousStage({ preset: "heavy", output: stage });
}
const manifest = JSON.parse(readFileSync(`${stage}.json`, "utf8"));
assert.equal(createHash("sha256").update(readFileSync(stage)).digest("hex"), manifest.sha256);
const tofu = resolve(root, "test/fixtures/external-parent/tofu.pmx");

function motion(index) {
  const frameNumbers = Array.from({ length: 61 }, (_, i) => i * 30);
  const x = index % 2 ? 8 : -8, z = index < 2 ? -8 : 8;
  return { name: `benchmark-${index}`, boneTracks: [], movableBoneTracks: [{
    name: "センター", frameNumbers,
    positions: frameNumbers.flatMap(f => [x + 3 * Math.sin(f / 30 + index), 2, z]),
    rotations: frameNumbers.flatMap(f => [0, Math.sin(f / 120), 0, Math.cos(f / 120)]),
    positionInterpolations: frameNumbers.flatMap(() => Array(3).fill([20, 107, 20, 107]).flat()),
    rotationInterpolations: frameNumbers.flatMap(() => [20, 107, 20, 107]),
    physicsToggles: frameNumbers.map(() => 1),
  }], morphTracks: [], propertyTrack: { frameNumbers: [], visibles: [], ikBoneNames: [], ikStates: [] } };
}

process.env.MMD_MODOKI_RENDERER = values.backend;
process.env.MMD_E2E_VITE_CACHE_DIR ??= resolve(root, ".tmp/backend-performance-vite");
const launched = await launchMmdModoki(root);
const messages = [];
const watch = page => {
  page.on("console", message => {
    if (["error", "warning"].includes(message.type())) messages.push({ url: page.url(), type: message.type(), text: message.text() });
  });
  page.on("pageerror", error => messages.push({ url: page.url(), type: "pageerror", text: error.message }));
};
launched.app.on("window", watch);
let page;
try {
  page = await launched.app.firstWindow(); watch(page);
  await page.waitForFunction(() => Boolean(window.mmdModokiE2e));
  for (const path of [stage, tofu, tofu, tofu, tofu]) {
    assert.notEqual(await page.evaluate(path => window.mmdModokiE2e.loadModel(path), path), null);
  }
  const project = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  project.viewport.groundVisible = false; project.viewport.skydomeVisible = false;
  project.viewport.backgroundBlack = true; project.viewport.backgroundDisplayMode = "black";
  project.physics.enabled = false;
  project.camera.target = { x: 0, y: 5, z: 0 };
  project.camera.rotation = { x: -25, y: -35, z: 0 };
  project.camera.distance = 115; project.camera.fov = 40;
  project.effects.frameGraphPostStack = [];
  project.effects.frameGraphInstances = { version: 1, instances: [], order: [] };
  for (let i = 0; i < 4; i++) project.keyframes.modelAnimations[i + 1].animation = motion(i);
  const imported = await page.evaluate(value => window.mmdModokiE2e.importProjectState(value), project);
  assert.deepEqual(imported.warnings, []);
  await page.evaluate(() => window.mmdModokiE2e.seekTo(0));
  const probePath = "/test/e2e/helpers/backend-performance-probe.mjs";
  const probe = await page.evaluate(async ({ probePath, width, height }) => {
    const { prepareBackendProbe } = await import(probePath);
    const result = await prepareBackendProbe({ width, height });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return result;
  }, { probePath, width, height });
  assert.equal(probe.engine, values.backend === "webgpu" ? "WebGPU" : "WebGL2");
  assert.deepEqual(probe.renderSize, [width, height]);
  assert.deepEqual(probe.sceneColorRenderSize, [width, height]);
  const finalProject = await page.evaluate(() => window.mmdModokiE2e.exportProjectState());
  writeFileSync(resolve(directory, "project.json"), JSON.stringify(finalProject, null, 2));
  console.log(`BENCHMARK_START ${values.preset} ${values.backend} run ${run}`);
  await page.locator("#viewport-seek-play-toggle").click();
  const playback = await page.evaluate(async probePath => {
    const { measureBackendPlayback } = await import(probePath);
    return await measureBackendPlayback({ warmFrames: 60, frames: 180 });
  }, probePath);
  await page.locator("#viewport-seek-play-toggle").click();
  assert.ok(playback.timeline.last > playback.timeline.first, "Timeline must advance during playback");
  assert.deepEqual(playback.renderSizeAfter, [width, height]);
  await page.evaluate(() => window.mmdModokiE2e.seekTo(0));
  const runtime = await page.evaluate(() => ({
    performance: window.mmdModokiDiagnostics.dumpPerformanceSnapshot(),
    postEffects: window.mmdModokiE2e.getFrameGraphPostEffectsState(),
    configuredFpsLimit: Number(localStorage.getItem("mmd_modoki.render.fpsLimit") ?? 60),
  }));
  const order = run % 2 ? ["png", "webm"] : ["webm", "png"];
  const outputs = await benchmarkOutputs(page, directory, finalProject, { width, height, frames, fps, order });
  assert.ok(outputs.png.verification.firstLastDifferentPixels > 0, "Animated objects must change the output");
  const decoded = await decodeFirstVideoFrame(page, outputs.webm.files.path);
  const decodedBytes = Buffer.from(decoded.png, "base64");
  writeFileSync(resolve(directory, "webm-presented.png"), decodedBytes);
  const image = PNG.sync.read(decodedBytes);
  assert.equal(image.width, width); assert.equal(image.height, height);
  let lit = 0;
  for (let i = 0; i < image.data.length; i += 4) if (image.data[i] + image.data[i + 1] + image.data[i + 2] > 60) lit++;
  assert.ok(lit > width * height * .1, "Decoded WebM must contain the stage");
  const system = await launched.app.evaluate(async ({ app }) => ({
    versions: process.versions, gpu: await app.getGPUInfo("basic"),
  }));
  const log = await page.evaluate(() => window.electronAPI.getLogFileInfo());
  const logText = readFileSync(log.path, "utf8");
  const exporterEngines = [...logText.matchAll(/export render surface prepared \{[^}]*?engine: '([^']+)'/g)]
    .map(match => match[1]);
  assert.deepEqual(exporterEngines, [probe.engine, probe.engine], "Both exporters must use the requested backend");
  const report = { measuredAt: new Date().toISOString(), backend: values.backend, preset: values.preset, run,
    conditions: { width, height, frames, fps, order, physics: false, effects: [], warmFrames: 60, measuredFrames: 180 },
    fixture: manifest, system: { ...system, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
    source, exporterEngines, probe, playback, runtime, outputs,
    decodedVideo: { width, height, litPixels: lit, presented: decoded.presented }, messages };
  writeFileSync(resolve(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`BENCHMARK_RESULT ${JSON.stringify({ preset: values.preset, backend: values.backend, run, fps: playback.fps,
    pngMs: outputs.png.requestWallMs, webmMs: outputs.webm.requestWallMs, directory })}`);
} finally {
  writeFileSync(resolve(directory, "messages.json"), `${JSON.stringify(messages, null, 2)}\n`);
  if (page && !page.isClosed()) {
    const log = await page.evaluate(() => window.electronAPI.getLogFileInfo()).catch(() => null);
    if (log?.path && existsSync(log.path)) copyFileSync(log.path, resolve(directory, "main.log"));
  }
  await launched.close();
}

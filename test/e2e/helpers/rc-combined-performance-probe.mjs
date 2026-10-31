import { MmdManager } from "../../../src/mmd-manager.ts";
import { LuminousRadianceSceneSource } from "../../../src/render/luminous-radiance-scene.ts";
import { LuminousRadiancePoseCache } from "../../../src/render/luminous-radiance-pose-cache.ts";
import { MeshRadianceBvh } from "../../../src/render/mesh-radiance-bvh.ts";
import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import { WebGPUPerfCounter } from "@babylonjs/core/Engines/WebGPU/webgpuPerfCounter";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createDenseRadianceProbe, skinDenseRadianceProbe } from "./luminous-radiance-probe.mjs";

let manager = null, dense = null;
const originalSettings = MmdManager.prototype.getRcDiffuseGiSettings;
// eslint-disable-next-line @typescript-eslint/no-this-alias -- Capture the real editor host only in this test observer.
MmdManager.prototype.getRcDiffuseGiSettings = function (...args) { manager = this; return originalSettings.apply(this, args); };
const summary = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], min: sorted[0], max: sorted.at(-1) };
};
function context() {
  if (!manager) throw new Error("Open the GI card after importing the combined performance helper");
  const post = manager.frameGraphPostEffectsController, sky = manager.rcSkyOcclusionController, gi = manager.rcDiffuseGiController;
  const groups = [...(post?.instanceTasks?.values() ?? [])].filter(group => group.type === "luminousRadiance");
  const sources = new Map();
  for (const [name, source] of [["sky", sky?.field?.source], ["gi", gi?.field?.source],
    ...groups.map((group, index) => [`luminous${index}`, group.radianceData?.source])]) {
    if (source) sources.set(source, [...(sources.get(source) ?? []), name]);
  }
  const graphs = [...new Set([post?.frameGraph, sky?.field?.graph, gi?.field?.graph].filter(Boolean))];
  return { scene: manager.scene, engine: manager.engine, post, sky, gi, groups, sources, graphs };
}
export function combinedPerformanceState() {
  const { scene, engine, sky, gi, post, sources, graphs } = context();
  return { size: [engine.getRenderWidth(), engine.getRenderHeight()], sceneFrameId: scene.getFrameId(), frame: manager.currentFrame,
    sky: sky?.diagnostics ?? null, gi: gi?.diagnostics ?? null, luminous: post?.getDiagnosticsSnapshot().instances.filter(value => value.type === "luminousRadiance") ?? [],
    sources: [...sources].map(([source, consumers]) => ({ consumers, triangles: source.bvh.triangleCount, revision: source.revision, updates: source.updates })),
    distinctSources: sources.size, distinctTriangleBuffers: new Set([...sources.keys()].map(source => source.triangleBuffer)).size,
    graphTasks: graphs.map(graph => ({ name: graph.name, tasks: graph.tasks.map(task => task.name) })),
    deviceTimestampQuery: engine._device.features.has("timestamp-query"), gpuTimingEnabled: engine.enableGPUTimingMeasurements,
    adapter: engine._adapter?.info ? { vendor: engine._adapter.info.vendor, architecture: engine._adapter.info.architecture,
      device: engine._adapter.info.device, description: engine._adapter.info.description } : null };
}
export async function createCombinedDenseFixture({ subdivisions = 96 } = {}) {
  const { scene } = context(), material = scene.materials.find(value => value.name === "GI Receiver");
  if (!material) throw new Error("Original PMX GI Receiver material is missing");
  const anchor = CreateGround("rc-floor", { width: 1, height: 1 }, scene); anchor.material = material;
  const triangles = createDenseRadianceProbe({ subdivisions }); skinDenseRadianceProbe();
  dense = scene.getMeshByName("rc-dense-floor"); dense.position.y = -.7;
  anchor.dispose(); await scene.whenReadyAsync();
  return { subdivisions, triangles, vertices: dense.getTotalVertices(), bones: dense.skeleton.bones.length,
    morphTargets: dense.morphTargetManager.numTargets, material: dense.material.name, materialClass: dense.material.getClassName() };
}
function pose(frame) {
  manager.seekTo(frame);
  if (!dense) return;
  const phase = frame * .04;
  dense.skeleton.bones[0].setPosition(new Vector3(Math.sin(phase) * .4, 0, 0));
  dense.skeleton.bones[1].setRotation(new Vector3(0, 0, Math.sin(phase * .7) * .08));
  dense.morphTargetManager.getTarget(0).influence = frame === 0 ? 0 : (Math.sin(phase * .8) + 1) * .25;
}
export function setCombinedReferencePose(frame) { manager.setAutoRenderEnabled(false); pose(frame); return combinedPerformanceState(); }
export async function prepareCombinedPerformance({ width = 1280, height = 720 } = {}) {
  const { engine } = context(); manager.setAutoRenderEnabled(false); manager.setRenderFpsLimit(0); engine.setSize(width, height); pose(0);
  await manager.waitForPostEffectBackendReadyForCapture();
  engine.beginFrame(); manager.renderOnceForCapture(0); engine.endFrame(); await engine._device.queue.onSubmittedWorkDone();
  manager.setAutoRenderEnabled(true); return combinedPerformanceState();
}

/** Observes normal render/seek work. Never forces a dirty field or a full receiver update. */
export async function measureCombinedPerformance({ moving = false, warmFrames = 12, frames = 40, completionFrames = 12 } = {}) {
  const { scene, engine, post, sky, gi, graphs, sources } = context(), restores = [], loops = engine.activeRenderLoops.slice();
  const wasAuto = manager.isAutoRenderEnabled(), gpuNames = new Map(), sourceNames = new Map([...sources].map(([source, names]) => [source, names.join("+")]));
  let current = null, rows = [], byFrame = new Map(), phase = null, observed = 0, motionStep = 0, previousStart = null;
  let activeSource = null, pendingSeekMs = 0, resolveWindow = null, measurement = null;
  const add = (name, value = 1) => { if (current) current.counts[name] = (current.counts[name] ?? 0) + value; };
  const time = (name, duration) => { if (current) current.cpu[name] = (current.cpu[name] ?? 0) + duration; };
  const wrap = (object, key, replacement) => { const original = object[key]; object[key] = replacement(original); restores.push(() => { object[key] = original; }); };
  const timed = (object, key, name) => { if (object) wrap(object, key, original => function (...args) {
    const start = performance.now(); try { return original.apply(this, args); } finally { time(name, performance.now() - start); add(`${name}Calls`); }
  }); };
  if (engine._device.features.has("timestamp-query")) engine.enableGPUTimingMeasurements = true;
  for (const task of new Set(graphs.flatMap(graph => graph.tasks))) {
    if (!task.computeShader) continue;
    const shader = task.computeShader, counter = new WebGPUPerfCounter(); shader.gpuTimeInFrame = counter; gpuNames.set(counter, task.name);
    // Babylon 9.2 retains timestampWrites in cached descriptors. Keep QuerySet/counters
    // alive through the reference PNGs, until this dedicated diagnostic process closes.
    wrap(shader, "dispatch", original => function (...args) {
      if (args.every(value => typeof value !== "number" || value > 0)) { add("computeDispatches"); add(`dispatch:${task.name}`); }
      return original.apply(this, args);
    });
  }
  wrap(engine._timestampQuery, "endPass", original => function (index, counter) {
    const row = byFrame.get(engine.frameId), name = gpuNames.get(counter) ?? "render";
    if (!row || !engine.enableGPUTimingMeasurements) return original.call(this, index, counter);
    row.expectedGpuPasses++;
    return original.call(this, index, { _addDuration(frame, duration) {
      row.receivedGpuPasses++; if (duration > 0) row.gpuPassMs[name] = (row.gpuPassMs[name] ?? 0) + duration / 1e6;
      counter?._addDuration(frame, duration);
    } });
  });
  timed(sky, "prepareFrame", "skyController"); timed(gi, "prepareFrame", "giController"); timed(post, "execute", "postExecute");
  for (const [name, field] of [["skyField", sky?.field], ["giField", gi?.field]]) timed(field, "execute", name);
  wrap(LuminousRadianceSceneSource.prototype, "update", original => function (...args) {
    const previous = activeSource, name = sourceNames.get(this) ?? "other", start = performance.now(), updates = this.updates;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- Attribute nested deformation/upload work to its calling source.
    activeSource = this; add("sourceCalls"); add(`sourceCalls:${name}`);
    try { return original.apply(this, args); } finally {
      time("source", performance.now() - start); time(`source:${name}`, performance.now() - start);
      add("sourceUpdates", this.updates - updates); activeSource = previous;
    }
  });
  wrap(LuminousRadiancePoseCache.prototype, "read", original => function (...args) {
    const start = performance.now(); try { return original.apply(this, args); } finally { time("poseRead", performance.now() - start); add("poseReadCalls"); }
  });
  for (const mesh of scene.meshes) if (typeof mesh.getPositionData === "function") wrap(mesh, "getPositionData", original => function (...args) {
    const source = activeSource, start = performance.now(); try { return original.apply(this, args); } finally {
      if (source) { time("poseDeformation", performance.now() - start); add("poseDeformations"); add(`poseDeformations:${mesh.name}`); }
    }
  });
  wrap(MeshRadianceBvh.prototype, "update", original => function (...args) {
    const start = performance.now(); try { return original.apply(this, args); } finally { time("bvh", performance.now() - start); add("bvhUpdates"); }
  });
  wrap(StorageBuffer.prototype, "update", original => function (data, offset, length) {
    if (activeSource && [activeSource.triangleBuffer, activeSource.nodeBuffer, activeSource.emissionBuffer].includes(this)) {
      add("bufferUploads"); add("uploadedBytes", length ?? data.byteLength);
    }
    return original.call(this, data, offset, length);
  });
  const before = scene.onBeforeRenderObservable.add(() => {
    current = null; if (!phase || observed >= warmFrames + phase.frames) return;
    const start = performance.now(); if (observed++ >= warmFrames) {
      current = { engineFrameId: engine.frameId, sceneFrameId: scene.getFrameId(), frame: manager.currentFrame, start,
        intervalMs: previousStart === null ? null : start - previousStart, cpu: { seek: pendingSeekMs }, counts: {}, gpuPassMs: {}, expectedGpuPasses: 0, receivedGpuPasses: 0 };
      rows.push(current); byFrame.set(engine.frameId, current);
    }
    previousStart = start;
  });
  const after = scene.onAfterRenderObservable.add(() => { if (current) current.cpu.scene = performance.now() - current.start; });
  const begin = engine.onBeginFrameObservable.add(() => {
    current = null; pendingSeekMs = 0;
    if (phase && moving) { const cycle = (motionStep++ * 3) % 120, start = performance.now(); pose(cycle <= 60 ? cycle : 120 - cycle); pendingSeekMs = performance.now() - start; }
  });
  const end = engine.onEndFrameObservable.add(() => { if (current) current.cpu.renderSubmit = performance.now() - current.start; if (phase && rows.length === phase.frames) resolveWindow?.(); });
  restores.push(() => { scene.onBeforeRenderObservable.remove(before); scene.onAfterRenderObservable.remove(after); engine.onBeginFrameObservable.remove(begin); engine.onEndFrameObservable.remove(end); });
  const reset = count => { current = null; rows = []; byFrame = new Map(); observed = 0; motionStep = 0; previousStart = null; phase = { frames: count }; };
  const result = () => {
    const cpuKeys = [...new Set(rows.flatMap(row => Object.keys(row.cpu)))], countKeys = [...new Set(rows.flatMap(row => Object.keys(row.counts)))];
    const complete = rows.filter(row => row.expectedGpuPasses > 0 && row.receivedGpuPasses === row.expectedGpuPasses && Object.keys(row.gpuPassMs).length);
    const passKeys = [...new Set(complete.flatMap(row => Object.keys(row.gpuPassMs)))];
    return { frames: rows.length, warmFrames, state: combinedPerformanceState(),
      cpuMs: Object.fromEntries(cpuKeys.map(key => [key, summary(rows.map(row => row.cpu[key] ?? 0))])),
      intervalMs: summary(rows.flatMap(row => row.intervalMs === null ? [] : [row.intervalMs])),
      completionWallMs: summary(rows.flatMap(row => row.completionWallMs === undefined ? [] : [row.completionWallMs])),
      counts: Object.fromEntries(countKeys.map(key => [key, rows.reduce((sum, row) => sum + (row.counts[key] ?? 0), 0)])),
      gpu: { available: engine.enableGPUTimingMeasurements, completeFrames: complete.length,
        passSumMs: summary(complete.map(row => Object.values(row.gpuPassMs).reduce((sum, value) => sum + value, 0))),
        renderPassMs: summary(complete.map(row => row.gpuPassMs.render ?? 0)),
        computePassMs: summary(complete.map(row => Object.entries(row.gpuPassMs).reduce((sum, [name, value]) => sum + (name === "render" ? 0 : value), 0))),
        byPassMs: Object.fromEntries(passKeys.map(name => [name, summary(complete.map(row => row.gpuPassMs[name] ?? 0))])) },
      samples: rows.map(row => { const sample = { ...row }; delete sample.start; return sample; }), validation: window.mmdModokiE2e.getWebGpuValidationDiagnostics() };
  };
  try {
    reset(frames); manager.setAutoRenderEnabled(true);
    await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error(`Combined performance stalled at ${rows.length}/${frames}`)), 90000);
      resolveWindow = () => { clearTimeout(timeout); resolve(); }; });
    phase = null; current = null; resolveWindow = null; await engine._device.queue.onSubmittedWorkDone();
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const realtime = result();
    manager.setAutoRenderEnabled(false); engine.stopRenderLoop(); engine.flushFramebuffer(); await engine._device.queue.onSubmittedWorkDone();
    reset(completionFrames);
    for (let i = 0; i < warmFrames + completionFrames; i++) {
      const start = performance.now(); engine.beginFrame(); manager.renderOnceForCapture(0); engine.endFrame(); await engine._device.queue.onSubmittedWorkDone();
      if (current) current.completionWallMs = performance.now() - start;
    }
    phase = null; current = null; for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    measurement = { realtime, completion: result(), validationAfterCleanup: null,
      timestampLifetime: "Counters and timing remain alive through PNG until engine disposal" }; return measurement;
  } finally {
    phase = null; current = null; manager.setAutoRenderEnabled(false); engine.stopRenderLoop();
    for (const restore of restores.reverse()) restore(); await engine._device.queue.onSubmittedWorkDone();
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (measurement) measurement.validationAfterCleanup = window.mmdModokiE2e.getWebGpuValidationDiagnostics();
    manager.setAutoRenderEnabled(wasAuto); for (const loop of loops) if (!engine.activeRenderLoops.includes(loop)) engine.runRenderLoop(loop);
  }
}
export function disposeCombinedPerformanceProbe() { MmdManager.prototype.getRcDiffuseGiSettings = originalSettings; manager = null; dense = null; }

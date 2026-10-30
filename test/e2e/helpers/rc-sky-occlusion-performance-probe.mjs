import { MmdManager } from "/src/mmd-manager.ts";
import { WebGPUPerfCounter } from "@babylonjs/core/Engines/WebGPU/webgpuPerfCounter";

// Test-only access to the real editor scene. No alternate engine, shader or forced dirty flag.
let manager = null;
const settings = MmdManager.prototype.getRcSkyOcclusionSettings;
MmdManager.prototype.getRcSkyOcclusionSettings = function (...args) {
  manager = this; return settings.apply(this, args);
};
const summary = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], min: sorted[0], max: sorted.at(-1) };
};
function context() {
  if (!manager) throw new Error("Open the RC settings after installing the performance probe");
  return { manager, scene: manager.scene, engine: manager.engine, controller: manager.rcSkyOcclusionController };
}
export function rcSkyPerformanceState() {
  const { scene, engine, controller } = context();
  return { size: [engine.getRenderWidth(), engine.getRenderHeight()], sceneFrameId: scene.getFrameId(),
    diagnostics: controller?.diagnostics ?? null, sourceRevision: controller?.field?.source.revision ?? null,
    deviceTimestampQuery: engine._device.features.has("timestamp-query"), gpuTimingEnabled: engine.enableGPUTimingMeasurements,
    adapterInfo: engine._adapter?.info ? { vendor: engine._adapter.info.vendor, architecture: engine._adapter.info.architecture,
      device: engine._adapter.info.device, description: engine._adapter.info.description } : null,
    renderFpsLimit: manager.getRenderFpsLimit(), engine: engine.getClassName() };
}
export async function prepareRcSkyPerformance({ width, height }) {
  const { engine } = context();
  manager.setAutoRenderEnabled(false);
  engine.setSize(width, height);
  manager.setRenderFpsLimit(0);
  await manager.waitForPostEffectBackendReadyForCapture();
  // Exercise the actual scene/post-effect path after the resize before warm samples.
  engine.beginFrame(); manager.renderOnceForCapture(0); engine.endFrame();
  await engine._device.queue.onSubmittedWorkDone();
  manager.setAutoRenderEnabled(true);
  return rcSkyPerformanceState();
}

/** GPU pass sums exclude queue wait/gaps. Completion wall includes JS + submission + GPU wait. */
export async function measureRcSkyPerformance({ moving = false, warmFrames = 12, frames = 60, completionFrames = 24 } = {}) {
  const { scene, engine, controller } = context(), restores = [], loops = engine.activeRenderLoops.slice();
  const wasAuto = manager.isAutoRenderEnabled();
  const field = controller?.field, source = field?.source;
  let rows = [], byFrame = new Map(), phase = null, observed = 0, motionStep = 0, current = null, previousStart = null;
  let measurement = null;
  let pendingSeekMs = 0, resolveWindow;
  const gpuNames = new Map();
  if (engine._device.features.has("timestamp-query")) engine.enableGPUTimingMeasurements = true;
  for (const task of field?.graph.tasks ?? []) {
    if (!task.computeShader) continue;
    const counter = new WebGPUPerfCounter();
    task.computeShader.gpuTimeInFrame = counter; gpuNames.set(counter, task.name);
    // Keep the diagnostic counter until this process closes. Babylon 9.2 reuses one
    // ComputePassDescriptor and only refreshes timestampWrites when a counter exists.
    // Restoring undefined would leave its old QuerySet reference in later PNG dispatches.
    const dispatch = task.computeShader.dispatch;
    task.computeShader.dispatch = function (...args) {
      if (current && args[0] > 0 && args[1] > 0 && args[2] > 0) current.computeDispatches++;
      return dispatch.apply(this, args);
    };
    restores.push(() => { task.computeShader.dispatch = dispatch; });
  }
  const query = engine._timestampQuery, endPass = query.endPass;
  query.endPass = function (index, counter) {
    const passName = gpuNames.get(counter) ?? "render", frameId = engine.frameId;
    const row = byFrame.get(frameId);
    if (!row || !engine.enableGPUTimingMeasurements) return endPass.call(this, index, counter);
    row.expectedGpuPasses++;
    return endPass.call(this, index, { _addDuration(frame, duration) {
      row.receivedGpuPasses++;
      if (duration > 0) row.gpuPassMs[passName] = (row.gpuPassMs[passName] ?? 0) + duration / 1e6;
      counter?._addDuration(frame, duration);
    } });
  };
  restores.push(() => { query.endPass = endPass; });
  const timed = (object, key, metric, count) => {
    if (!object) return;
    const original = object[key];
    object[key] = function (...args) {
      const start = performance.now(), row = current;
      try { return original.apply(this, args); }
      finally { if (row) { row[metric] += performance.now() - start; if (count) row[count]++; } }
    };
    restores.push(() => { object[key] = original; });
  };
  timed(controller, "prepareFrame", "controllerCpuMs", "controllerCalls");
  timed(source, "update", "sourceCpuMs", "sourceCalls");
  timed(field, "execute", "fieldSubmitCpuMs", "fieldUpdates");
  const before = scene.onBeforeRenderObservable.add(() => {
    current = null;
    if (!phase || observed >= warmFrames + phase.frames) return;
    const start = performance.now(), measured = observed++ >= warmFrames;
    if (measured) {
      current = { engineFrameId: engine.frameId, sceneFrameId: scene.getFrameId(), start,
        intervalMs: previousStart === null ? null : start - previousStart, seekCpuMs: pendingSeekMs,
        controllerCpuMs: 0, controllerCalls: 0, sourceCpuMs: 0, sourceCalls: 0,
        fieldSubmitCpuMs: 0, fieldUpdates: 0, computeDispatches: 0,
        gpuPassMs: {}, expectedGpuPasses: 0, receivedGpuPasses: 0 };
      rows.push(current); byFrame.set(engine.frameId, current);
    }
    previousStart = start;
  });
  const afterScene = scene.onAfterRenderObservable.add(() => { if (current) current.sceneCpuMs = performance.now() - current.start; });
  const begin = engine.onBeginFrameObservable.add(() => {
    pendingSeekMs = 0;
    if (phase && moving) {
      const cycle = (motionStep++ * 3) % 120, frame = cycle <= 60 ? cycle : 120 - cycle;
      const start = performance.now(); manager.seekTo(frame); pendingSeekMs = performance.now() - start;
    }
  });
  const end = engine.onEndFrameObservable.add(() => {
    if (current) current.renderSubmitCpuMs = performance.now() - current.start;
    if (phase && rows.length === phase.frames) resolveWindow?.();
  });
  restores.push(() => { scene.onBeforeRenderObservable.remove(before); scene.onAfterRenderObservable.remove(afterScene);
    engine.onBeginFrameObservable.remove(begin); engine.onEndFrameObservable.remove(end); });
  const reset = count => { rows = []; byFrame = new Map(); observed = 0; motionStep = 0; previousStart = null; current = null; phase = { frames: count }; };
  const result = () => {
    const metrics = ["intervalMs", "seekCpuMs", "sceneCpuMs", "renderSubmitCpuMs", "controllerCpuMs", "sourceCpuMs", "fieldSubmitCpuMs", "completionWallMs"];
    const gpuComplete = rows.filter(row => row.expectedGpuPasses > 0 && row.receivedGpuPasses === row.expectedGpuPasses && Object.keys(row.gpuPassMs).length);
    return { frames: rows.length, warmFrames, metrics: Object.fromEntries(metrics.map(key => [key, summary(rows.flatMap(row => Number.isFinite(row[key]) ? [row[key]] : []))])),
      counts: Object.fromEntries(["controllerCalls", "sourceCalls", "fieldUpdates", "computeDispatches"].map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)])),
      gpu: { available: engine.enableGPUTimingMeasurements, completeFrames: gpuComplete.length,
        passSumMs: summary(gpuComplete.map(row => Object.values(row.gpuPassMs).reduce((a, b) => a + b, 0))),
        renderPassMs: summary(gpuComplete.map(row => row.gpuPassMs.render ?? 0)),
        computePassMs: summary(gpuComplete.map(row => Object.entries(row.gpuPassMs).reduce((sum, [key, value]) => sum + (key === "render" ? 0 : value), 0))) },
      samples: rows.map(({ start, ...row }) => row), state: rcSkyPerformanceState(),
      validation: window.mmdModokiE2e.getWebGpuValidationDiagnostics() };
  };
  try {
    reset(frames); manager.setAutoRenderEnabled(true);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`RC performance window stalled at ${rows.length}/${frames} frames`)), 60000);
      resolveWindow = () => { clearTimeout(timeout); resolve(); };
    });
    phase = null; current = null; resolveWindow = null;
    await engine._device.queue.onSubmittedWorkDone();
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const realtime = result();
    manager.setAutoRenderEnabled(false); engine.stopRenderLoop();
    engine.flushFramebuffer(); await engine._device.queue.onSubmittedWorkDone();
    reset(completionFrames);
    for (let i = 0; i < warmFrames + completionFrames; i++) {
      const start = performance.now();
      engine.beginFrame(); manager.renderOnceForCapture(0); engine.endFrame();
      await engine._device.queue.onSubmittedWorkDone();
      if (current) current.completionWallMs = performance.now() - start;
    }
    phase = null; current = null;
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    measurement = { realtime, completion: result(), validationAfterCleanup: null,
      timestampLifetime: "Diagnostic timing and compute counters remain enabled through reference PNG until engine disposal" };
    return measurement;
  } finally {
    phase = null; current = null;
    manager.setAutoRenderEnabled(false); engine.stopRenderLoop();
    for (const restore of restores.reverse()) restore();
    try {
      // Do not destroy the QuerySet between a measured moving frame and the PNG's
      // dirty-field dispatch. This is a dedicated diagnostic device, disposed at app close.
      await engine._device.queue.onSubmittedWorkDone();
      // Give uncaptured-error events time to arrive before restarting the viewport.
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (measurement) measurement.validationAfterCleanup = window.mmdModokiE2e.getWebGpuValidationDiagnostics();
    } finally {
      manager.setAutoRenderEnabled(wasAuto);
      for (const loop of loops) if (!engine.activeRenderLoops.includes(loop)) engine.runRenderLoop(loop);
    }
  }
}
export function disposeRcSkyPerformanceProbe() { MmdManager.prototype.getRcSkyOcclusionSettings = settings; manager = null; }

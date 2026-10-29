import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { WebGPUPerfCounter } from "@babylonjs/core/Engines/WebGPU/webgpuPerfCounter";
import { getSkyReconstructionContext } from "./radiance-sky-reconstruction-probe.mjs";

const summary = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * 0.95) - 1] };
};

// Test-only instrumentation. Force a dirty field at identical geometry/settings to measure update
// cost; normal static frames intentionally skip dispatch. Timestamp sums exclude source CPU and draw.
export async function measureSkyReconstruction({ warmFrames = 12, frames = 40 } = {}) {
  const { lab, scene } = getSkyReconstructionContext(), engine = scene.getEngine();
  const tasks = [...lab.field.graph.tasks], instrumentation = new EngineInstrumentation(engine);
  const measuredFrames = new Set(), durations = new Map(), cpu = [], undo = [];
  instrumentation.captureGPUFrameTime = true;
  let rendered = 0;
  if (engine.enableGPUTimingMeasurements) for (const task of tasks) {
    const previous = task.computeShader.gpuTimeInFrame, counter = new WebGPUPerfCounter(), add = counter._addDuration;
    counter._addDuration = function (frame, duration) {
      if (measuredFrames.has(frame) && duration > 0) {
        const sample = durations.get(frame) ?? {}; sample[task.name] = duration / 1e6; durations.set(frame, sample);
      }
      return add.call(this, frame, duration);
    };
    task.computeShader.gpuTimeInFrame = counter;
    undo.push(() => { task.computeShader.gpuTimeInFrame = previous; });
  }
  const prepare = lab.prepareFrame;
  lab.prepareFrame = function (...args) {
    const start = performance.now();
    try { return prepare.apply(this, args); }
    finally { if (measuredFrames.has(engine.frameId)) cpu.push(performance.now() - start); }
  };
  undo.push(() => { lab.prepareFrame = prepare; });
  const observer = scene.onBeforeRenderObservable.add(() => {
    if (rendered >= warmFrames + frames) return;
    if (rendered++ >= warmFrames) measuredFrames.add(engine.frameId);
    lab.sourceRevision = -1;
  });
  undo.push(() => scene.onBeforeRenderObservable.remove(observer));
  const beforeDispatch = lab.diagnostics.dispatchCount;
  try {
    while (rendered < warmFrames + frames) await new Promise(resolve => requestAnimationFrame(resolve));
    // Allow asynchronous timestamp mapping to arrive; no diagnostic readback in the measured window.
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const samples = [...durations.values()], complete = samples.filter(sample => tasks.every(task => task.name in sample));
    return { forcedUpdates: rendered, dispatches: lab.diagnostics.dispatchCount - beforeDispatch,
      warmFrames, frames, measuredFrames: measuredFrames.size, completeTimestampFrames: complete.length,
      gpuTimingEnabled: engine.enableGPUTimingMeasurements, cpuPrepareMs: summary(cpu),
      gpuSixPassMs: summary(complete.map(sample => Object.values(sample).reduce((a, b) => a + b, 0))),
      gpuPassMs: Object.fromEntries(tasks.map(task => [task.name, summary(samples.flatMap(sample => sample[task.name] === undefined ? [] : [sample[task.name]]))])) };
  } finally {
    for (const restore of undo.reverse()) restore();
    instrumentation.captureGPUFrameTime = false; instrumentation.dispose();
  }
}

// The normal editor device does not request timestamp-query. Keep timestamps N/A above;
// measure this separate dispatch+submission+completion wall clock, never label it GPU time.
export async function measureSkyReconstructionCompletion({ warmFrames = 5, frames = 24 } = {}) {
  const { lab, scene } = getSkyReconstructionContext(), engine = scene.getEngine(), field = lab.field;
  const loops = engine.activeRenderLoops.slice(), samples = [];
  engine.stopRenderLoop();
  try {
    engine.flushFramebuffer(); await engine._device.queue.onSubmittedWorkDone();
    for (let i = 0; i < warmFrames + frames; i++) {
      const start = performance.now(); engine.beginFrame();
      field.execute(0, true, lab.diagnostics.reconstruction);
      engine.endFrame(); await engine._device.queue.onSubmittedWorkDone();
      if (i >= warmFrames) samples.push(performance.now() - start);
    }
    return { warmFrames, frames, dispatchCount: (warmFrames + frames) * 6, completionWallMs: summary(samples) };
  } finally {
    for (const loop of loops) engine.runRenderLoop(loop);
  }
}

import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";

/** Local diagnostic, not a hardware-dependent CI performance assertion. */
export async function probePerformance(fullHd = false) {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const engine = scene.getEngine();
  const size = [engine.getRenderWidth(), engine.getRenderHeight()];
  if (fullHd) engine.setSize(1920, 1080);
  const instrumentation = new EngineInstrumentation(engine);
  instrumentation.captureGPUFrameTime = true;
  const originals = scene.meshes.map(mesh => [mesh, mesh.getPositionData]);
  let positionsMs = 0, calls = 0, begin = 0, cpuMs = 0, frameCount = 0;
  for (const [mesh, original] of originals) mesh.getPositionData = function (...args) {
    const start = performance.now();
    try { return original.apply(this, args); }
    finally { positionsMs += performance.now() - start; calls++; }
  };
  const before = scene.onBeforeRenderObservable.add(() => { begin = performance.now(); });
  const after = scene.onAfterRenderObservable.add(() => { cpuMs += performance.now() - begin; frameCount++; });
  try {
    for (let i = 0; i < 30; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    positionsMs = calls = cpuMs = frameCount = 0;
    const intervals = [], gpu = [];
    let previous = performance.now();
    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const now = performance.now(); intervals.push(now - previous); previous = now;
      const value = instrumentation.gpuFrameTimeCounter?.current;
      if (value > 0) gpu.push(value / 1e6);
    }
    const mean = values => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    return { width: engine.getRenderWidth(), height: engine.getRenderHeight(), frameMs: mean(intervals),
      cpuMs: cpuMs / frameCount, positionsMs: positionsMs / frameCount, positionCalls: calls / frameCount,
      gpuMs: gpu.length ? mean(gpu) : null };
  } finally {
    scene.onBeforeRenderObservable.remove(before); scene.onAfterRenderObservable.remove(after);
    for (const [mesh, original] of originals) mesh.getPositionData = original;
    instrumentation.captureGPUFrameTime = false; instrumentation.dispose();
    if (fullHd) engine.setSize(...size);
  }
}

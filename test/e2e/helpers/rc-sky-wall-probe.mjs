import { MmdManager } from "/src/mmd-manager.ts";
import { MMD_RADIANCE_SKY_QUERY_WGSL } from "/src/render/mmd-radiance-sky-query-wgsl.ts";

// Test-only access to the app's renderer and the repository-authored stage.
let manager;
const getSettings = MmdManager.prototype.getRcSkyAmbientSettings;
MmdManager.prototype.getRcSkyAmbientSettings = function (...args) {
  manager = this; return getSettings.apply(this, args);
};

export function wallFieldState() { return manager.rcSkyAmbientController.diagnostics; }

export async function checkWallConnectionGuard() {
  // Compile the actual receiver guard, not a JavaScript reimplementation.
  const source = MMD_RADIANCE_SKY_QUERY_WGSL.slice(MMD_RADIANCE_SKY_QUERY_WGSL.indexOf("struct RcSkyTriangle"),
    MMD_RADIANCE_SKY_QUERY_WGSL.indexOf("fn rcSkyVisibility("))
    .replace("var<storage, read> rcSkyTriangles", "@group(0) @binding(0) var<storage, read> rcSkyTriangles")
    .replace(/var rcSky(?:Field|NearestSurface): texture_2d<f32>;\s*/g, "");
  const triangle = [[-300, 0, -300], [300, 0, -300], [0, 0, 300]];
  const cases = [
    { name: "own-plane", origin: [0, 0, 0], probe: [0, 1, 0], expected: 0 },
    { name: "grazing-roundoff", origin: [0, -.00005, 0], probe: [1, .001, 0], expected: 0 },
    { name: "separate-thin-roof", origin: [0, -.01, 0], probe: [0, .1, 0], expected: 1 },
    { name: "probe-on-surface", origin: [0, -.1, 0], probe: [0, 0, 0], expected: 1 },
    { name: "away-from-surface", origin: [0, -.1, 0], probe: [0, -1, 0], expected: 0 },
    { name: "outside-triangle", origin: [1000, -.1, 0], probe: [1000, 1, 0], expected: 0 },
    { name: "large-coordinate-roundoff", origin: [10300, 399.999, -300], probe: [10301, 400.01, -300],
      triangle: [[10000, 400, -600], [10600, 400, -600], [10300, 400, 0]], expected: 0 },
    { name: "large-coordinate-near-wall", origin: [10300, 399.98, -300], probe: [10300, 400.1, -300],
      triangle: [[10000, 400, -600], [10600, 400, -600], [10300, 400, 0]], expected: 1 },
  ];
  const device = manager.engine._device, buffers = [];
  const buffer = (data, usage) => {
    const result = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(result, 0, data); buffers.push(result); return result;
  };
  const triangles = new Float32Array(cases.length * 24), points = new Float32Array(cases.length * 8);
  cases.forEach((item, i) => {
    (item.triangle ?? triangle).forEach((p, vertex) => triangles.set(p, i * 24 + vertex * 4));
    points.set([...item.origin, 0, ...item.probe, i + 1], i * 8);
  });
  try {
    const triangleBuffer = buffer(triangles, GPUBufferUsage.STORAGE), pointBuffer = buffer(points, GPUBufferUsage.STORAGE);
    const output = buffer(new Uint32Array(cases.length), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const readback = device.createBuffer({ size: cases.length * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    buffers.push(readback);
    const module = device.createShaderModule({ code: source + `
struct Point { origin: vec4f, probe: vec4f };
@group(0) @binding(1) var<storage, read> points: array<Point>;
@group(0) @binding(2) var<storage, read_write> answers: array<u32>;
@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3u) {
    let p = points[id.x];
    answers[id.x] = select(0u, 1u, rcSkyProbeBlocked(p.origin.xyz, p.probe.xyz, vec2f(p.probe.w, 0.0)));
}` });
    const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [triangleBuffer, pointBuffer, output]
      .map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(cases.length); pass.end();
    encoder.copyBufferToBuffer(output, 0, readback, 0, cases.length * 4); device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const values = Array.from(new Uint32Array(readback.getMappedRange())); readback.unmap();
    return cases.map((item, i) => ({ name: item.name, expected: item.expected, actual: values[i] }));
  } finally { for (const buffer of buffers) buffer.destroy(); }
}

export async function measureWallFrames({ width = 1280, height = 720, warm = 5, frames = 24 } = {}) {
  const engine = manager.engine, controller = manager.rcSkyAmbientController;
  const auto = manager.isAutoRenderEnabled(), loops = engine.activeRenderLoops.slice();
  const size = [engine.getRenderWidth(), engine.getRenderHeight()];
  manager.setAutoRenderEnabled(false); engine.stopRenderLoop(); engine.setSize(width, height);
  try {
    await manager.waitForPostEffectBackendReadyForCapture();
    const before = controller?.diagnostics.fieldRevision;
    const values = [];
    for (let i = 0; i < warm + frames; i++) {
      const start = performance.now();
      engine.beginFrame(); manager.renderOnceForCapture(0); engine.endFrame();
      await engine._device.queue.onSubmittedWorkDone();
      if (i >= warm) values.push(performance.now() - start);
    }
    values.sort((a, b) => a - b);
    return { width, height, frames, median: values[Math.floor(values.length / 2)], p95: values[Math.ceil(values.length * .95) - 1],
      fieldUpdates: controller?.diagnostics.fieldRevision - before,
      meaning: "CPU + submission + GPU completion wall milliseconds; warmed static authored fixture" };
  } finally {
    engine.setSize(...size); manager.setAutoRenderEnabled(auto);
    for (const loop of loops) engine.runRenderLoop(loop);
  }
}

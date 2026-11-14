import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { volume, poses, boxesFor, candidateMotion } from "../../fixtures/rc-sky-upper-surface/scene.mjs";
// eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
import { RadianceSkyVisibilityField } from "/src/render/radiance-sky-visibility-field.ts";
// eslint-disable-next-line import/no-unresolved -- Served by the local test application's Vite server.
import { createMmdRadianceSkyQueryWgsl } from "/src/render/mmd-radiance-sky-query-wgsl.ts";

export async function measureSkyUpperSurfaces(queryOverride = null) {
  const scene = EngineStore.LastCreatedScene, engine = scene?.getEngine(), device = engine?._device;
  if (!device) throw new Error("Upper-surface probe requires the application's WebGPU device");
  const { GPUBufferUsage, GPUMapMode, GPUShaderStage } = window;
  const result = { volume, quality: "standard", cell: 4, cases: [], compilation: [], gpuErrors: [], scopeError: null };
  const loops = engine.activeRenderLoops.slice(), meshes = [], resources = [];
  const onError = event => result.gpuErrors.push(event.error.message);
  device.addEventListener("uncapturederror", onError); device.pushErrorScope("validation");
  engine.stopRenderLoop(); engine.flushFramebuffer();
  const material = new StandardMaterial("sky-upper-surface-fixture", scene);
  material.diffuseColor.set(.8, .8, .8); material.specularColor.set(0, 0, 0);
  const field = new RadianceSkyVisibilityField(scene, { volume, quality: "standard", diagnostic: false,
    materialIrradiance: true, nearestSurfaceCandidates: queryOverride ? 2 : 4,
    opaqueOccludersOnly: true, acceptsMesh: mesh => meshes.includes(mesh) });
  const buffer = (data, usage) => {
    const value = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(value, 0, data); resources.push(value); return value;
  };
  try {
    const query = (queryOverride ?? createMmdRadianceSkyQueryWgsl(true))
      .replace(/^\s*#ifdef RC_SKY_OCCLUSION\s*\n/, "").replace(/\n#endif\s*$/, "")
      .replaceAll("uniforms.", "params.")
      .replace("var<storage, read> rcSkyTriangles", "@group(0) @binding(1) var<storage, read> rcSkyTriangles")
      .replace("var rcSkyField", "@group(0) @binding(2) var rcSkyField")
      .replace("var rcSkyNearestSurface", "@group(0) @binding(3) var rcSkyNearestSurface");
    const module = device.createShaderModule({ label: "sky-upper-surface-query", code: `
struct Params { rcSkyVolume: vec4f, rcSkyVolume1: vec4f, rcSkyVolume2: vec4f, rcSkyVolume3: vec4f, rcSkySpatial: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(4) var<storage, read> points: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> answers: array<vec4f>;
${query}
@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3u) {
    let position = points[id.x].xyz;
    let grid = textureDimensions(rcSkyField, 0).x / 2u;
    let coordinate = clamp((position - params.rcSkyVolume.xyz) / params.rcSkyVolume.w * f32(grid) - .5,
        vec3f(0.0), vec3f(f32(grid - 1u)));
    let low = vec3u(floor(coordinate)); let high = min(low + vec3u(0u, 1u, 0u), vec3u(grid - 1u));
    let lowValue = textureLoad(rcSkyField, vec2i(i32(low.x), i32(low.z * grid + low.y)), 0).z;
    let highValue = textureLoad(rcSkyField, vec2i(i32(high.x), i32(high.z * grid + high.y)), 0).z;
    answers[id.x] = vec4f(rcSkyVisibilityValidated(position, vec3f(0.0, 1.0, 0.0)),
        lowValue, highValue, fract(coordinate.y));
}` });
    result.compilation = (await module.getCompilationInfo()).messages.map(message => ({ type: message.type,
      message: message.message, line: message.lineNum, column: message.linePos }));
    if (result.compilation.some(message => message.type === "error")) return result;
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ] });
    const pipeline = await device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module, entryPoint: "main" } });
    const params = buffer(new Float32Array([...Array.from({ length: 4 }, () => [...volume.min, volume.size]).flat(), 1, 0, 0, 0]), GPUBufferUsage.UNIFORM);
    const samplePoints = async points => {
      const input = buffer(new Float32Array(points.flatMap(point => [...point, 0])), GPUBufferUsage.STORAGE);
      const output = buffer(new Float32Array(points.length * 4), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const mapped = device.createBuffer({ size: points.length * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      resources.push(mapped);
      const nativeTexture = texture => texture.getInternalTexture()._hardwareTexture.underlyingResource.createView();
      const bind = device.createBindGroup({ layout, entries: [
        { binding: 0, resource: { buffer: params } },
        { binding: 1, resource: { buffer: field.source.triangleBuffer.getBuffer().underlyingResource } },
        { binding: 2, resource: nativeTexture(field.irradianceField) },
        { binding: 3, resource: nativeTexture(field.nearestSurfaceField) },
        { binding: 4, resource: { buffer: input } }, { binding: 5, resource: { buffer: output } },
      ] });
      const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(points.length); pass.end();
      encoder.copyBufferToBuffer(output, 0, mapped, 0, points.length * 16); device.queue.submit([encoder.finish()]);
      await mapped.mapAsync(GPUMapMode.READ);
      const values = new Float32Array(mapped.getMappedRange());
      const samples = points.map((point, index) => ({ point, visibility: values[index * 4],
        lowerProbeVisibility: values[index * 4 + 1], upperProbeVisibility: values[index * 4 + 2], coordinateFractionY: values[index * 4 + 3] }));
      mapped.unmap();
      return samples;
    };
    const execute = () => {
      field.execute(0, true, { nearDistance: volume.size * .5, rejectOccludedProbes: false, sampleAtRayEnd: true });
      engine.flushFramebuffer();
    };
    await field.graph.buildAsync(false); await field.graph.whenReadyAsync();
    for (const pose of poses) {
      while (meshes.length) meshes.pop().dispose();
      const boxes = boxesFor(pose);
      for (const box of boxes) {
        const size = box.max.map((value, axis) => value - box.min[axis]);
        const mesh = CreateBox(`sky-upper-${box.name}`, { width: size[0], height: size[1], depth: size[2] }, scene);
        mesh.position.set(...box.min.map((value, axis) => (value + box.max[axis]) / 2));
        mesh.material = material; mesh.computeWorldMatrix(true); meshes.push(mesh);
      }
      field.source.update();
      if (field.source.error) throw new Error(field.source.error);
      execute();
      const points = Array.from({ length: 25 }, (_, index) => [-1 + index % 5 * .5, pose.top, -1 + Math.floor(index / 5) * .5]);
      const samples = await samplePoints(points);
      result.cases.push({ ...pose, boxes, triangleCount: field.source.bvh.triangleCount, samples,
        mean: samples.reduce((sum, item) => sum + item.visibility, 0) / samples.length,
        minimum: Math.min(...samples.map(item => item.visibility)), maximum: Math.max(...samples.map(item => item.visibility)) });
    }
    if (!queryOverride) {
      // Keep mesh and triangle IDs stable while the old fourth candidate moves
      // away. The fifth triangle must enter even though it lay outside the old
      // fourth-distance bound. Recreating meshes would only test a full rebuild.
      while (meshes.length) meshes.pop().dispose();
      for (const [index, height] of candidateMotion.heights.entries()) {
        const mesh = new Mesh(`sky-candidate-${index + 1}`, scene);
        mesh.setVerticesData("position", candidateMotion.positions);
        mesh.setVerticesData("normal", candidateMotion.normals);
        mesh.setIndices(candidateMotion.indices); mesh.position.y = height;
        mesh.material = material; mesh.computeWorldMatrix(true); meshes.push(mesh);
      }
      const state = () => ({ layout: field.source.bvh.layoutRevision, geometry: field.source.geometryRevision,
        updates: field.source.updates, triangleCount: field.source.bvh.triangleCount, meshIds: meshes.map(mesh => mesh.uniqueId) });
      const updateSource = () => {
        field.source.update();
        if (field.source.error) throw new Error(field.source.error);
      };
      const readAtlas = async () => {
        const pixels = await field.nearestSurfaceField.readPixels();
        if (!(pixels instanceof Float32Array)) throw new Error("Nearest-surface atlas must return raw RGBA32F IDs");
        return pixels.slice();
      };
      // Test-only instrumentation observes the actual shader mode. Invalidating
      // completed below forces the reference pass without changing geometry IDs.
      const guard = field.nearestTasks[0], updateFloat4 = guard.params.updateFloat4, shaderModes = [];
      guard.params.updateFloat4 = function(name, x, y, z, w) {
        if (name === "dirtyMin") shaderModes.push(w > .5 ? "partial" : "full");
        return updateFloat4.call(this, name, x, y, z, w);
      };
      try {
        updateSource(); const beforeState = state(); execute(); const before = await readAtlas();
        meshes[candidateMotion.movedIndex].position.y = candidateMotion.movedHeight;
        meshes[candidateMotion.movedIndex].computeWorldMatrix(true);
        updateSource(); const movedState = state();
        const dirtyMin = [...field.source.bvh.changedMin], dirtyMax = [...field.source.bvh.changedMax];
        execute(); const partial = await readAtlas();
        const points = candidateMotion.receiverPoints;
        const partialSamples = await samplePoints(points);
        guard.completed = null; execute(); const full = await readAtlas(), fullState = state();
        const fullSamples = await samplePoints(points), grid = field.probeGrid, cell = volume.size / grid;
        const comparison = { texels: partial.length / 4, mismatchedTexels: 0, changedTexels: 0,
          outsideDirtyTexels: 0, outsideDirtyChanged: 0, invalidValues: 0, mismatches: [] };
        for (let index = 0; index < partial.length / 4; index++) {
          const offset = index * 4, values = Array.from(partial.subarray(offset, offset + 4));
          const mismatch = values.some((value, channel) => value !== full[offset + channel]);
          const changed = values.some((value, channel) => value !== before[offset + channel]);
          const coordinate = [index % grid, Math.floor(index / grid) % grid, Math.floor(index / (grid * grid))];
          const outside = coordinate.some((value, axis) => {
            const world = volume.min[axis] + (value + .5) * cell;
            return world < dirtyMin[axis] - 2 * cell || world > dirtyMax[axis] + 2 * cell;
          });
          comparison.invalidValues += values.filter(value => !Number.isInteger(value) || value < 0 || value > meshes.length).length;
          comparison.changedTexels += Number(changed); comparison.mismatchedTexels += Number(mismatch);
          comparison.outsideDirtyTexels += Number(outside); comparison.outsideDirtyChanged += Number(outside && changed);
          if (mismatch && comparison.mismatches.length < 8) comparison.mismatches.push({ coordinate, partial: values,
            full: Array.from(full.subarray(offset, offset + 4)) });
        }
        const [x, y, z] = candidateMotion.focusProbe.map((value, axis) => Math.round((value - volume.min[axis]) / cell - .5));
        const focus = (z * grid * grid + y * grid + x) * 4;
        result.partialUpdate = { beforeState, movedState, fullState, shaderModes, dirtyMin, dirtyMax, comparison,
          focusBefore: Array.from(before.subarray(focus, focus + 4)), focusPartial: Array.from(partial.subarray(focus, focus + 4)),
          focusFull: Array.from(full.subarray(focus, focus + 4)), partialSamples, fullSamples };
      } finally { guard.params.updateFloat4 = updateFloat4; }
    }
    return result;
  } finally {
    result.scopeError = (await device.popErrorScope())?.message ?? null;
    field.dispose(); while (meshes.length) meshes.pop().dispose(); material.dispose();
    for (const value of resources) value.destroy();
    device.removeEventListener("uncapturederror", onError);
    for (const loop of loops) engine.runRenderLoop(loop);
  }
}

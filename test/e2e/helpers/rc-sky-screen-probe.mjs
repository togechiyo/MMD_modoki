import { EngineStore } from "@babylonjs/core/Engines/engineStore";
// eslint-disable-next-line import/no-unresolved -- Served by the test application's Vite server.
import { SKY_SCREEN_FILTER_WGSL } from "/src/render/rc-sky-ambient-screen-shaders.ts";
// eslint-disable-next-line import/no-unresolved -- Served by the test application's Vite server.
import { MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL } from "/src/render/mmd-radiance-sky-ambient-query-wgsl.ts";

function toHalf(value) {
  if (value === 0) return 0;
  const sign = value < 0 ? 0x8000 : 0, magnitude = Math.abs(value);
  const exponent = Math.floor(Math.log2(magnitude));
  if (exponent < -14) return sign | Math.round(magnitude / 2 ** -24);
  const mantissa = Math.round((magnitude / 2 ** exponent - 1) * 1024);
  return sign | ((exponent + 15) * 1024 + mantissa);
}

function fromHalf(value) {
  const sign = value & 0x8000 ? -1 : 1, exponent = (value >>> 10) & 31, fraction = value & 1023;
  return sign * (exponent === 0 ? fraction * 2 ** -24 : exponent === 31 ? Infinity : (1 + fraction / 1024) * 2 ** (exponent - 15));
}

function shaderFunction(source, name) {
  const start = source.indexOf(`fn ${name}(`);
  if (start < 0) throw new Error(`Missing production shader function: ${name}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed production shader function: ${name}`);
}

function filterCases() {
  const width = 9, height = 9, center = 4;
  const create = (name, sample, radius = .8) => {
    const light = [], positions = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const value = sample(x, y);
      light.push(...value.normal ?? [0, 1, 0], value.irradiance);
      positions.push(...value.position ?? [(x - center) * .1, 0, (y - center) * .1], value.valid ?? 1);
    }
    return { name, width, height, radius, light, positions };
  };
  return [
    create("coplanar-band", x => ({ irradiance: x === center ? 0 : 1 })),
    create("constant", () => ({ irradiance: .375 })),
    ...[0, 20000].map(offset => create(`parallel-roof-${offset}`, (x, y) => ({
      irradiance: x >= center ? 1 : 0,
      position: [offset + (x - center) * .1, offset + (x >= center ? .01 : 0), -offset + (y - center) * .1],
    }))),
    create("opposite-faces", x => ({ irradiance: x >= center ? 1 : 0, normal: x >= center ? [0, -1, 0] : [0, 1, 0] })),
    create("invalid-center", (x, y) => ({ irradiance: x === center && y === center ? -1 : .375 })),
    create("zero-radius", x => ({ irradiance: x === center ? 0 : 1 }), 0),
    create("outside-world-radius", (x, y) => ({ irradiance: x === center ? 0 : 1,
      position: [(x - center) * 2, 0, (y - center) * 2] })),
  ];
}

function upsampleCases() {
  const base = { position: [0, 0, 0], normal: [0, 0, 1], surfaceZ: 0,
    surfaceNormal: [0, 0, 1], light: [0, .25, .75, 1], enabled: true, valid: 1 };
  return [
    { ...base, name: "same-surface", expected: .5 },
    { ...base, name: "same-surface-large-offset", position: [0, 0, 20000], surfaceZ: 20000, expected: .5 },
    { ...base, name: "wrong-plane", surfaceZ: .01, expected: -1 },
    { ...base, name: "wrong-plane-large-offset", position: [0, 0, 20000], surfaceZ: 20000.01, expected: -1 },
    { ...base, name: "opposite-face", surfaceNormal: [0, 0, -1], expected: -1 },
    { ...base, name: "invalid-samples", light: [-1, -1, -1, -1], expected: -1 },
    { ...base, name: "invalid-position", valid: 0, expected: -1 },
    { ...base, name: "single-valid-tap", light: [-1, .25, -1, -1], expected: .25 },
    { ...base, name: "disabled", enabled: false, expected: -1 },
    { ...base, name: "outside-viewport", position: [3, 0, 0], expected: -1 },
  ];
}

// The actual production filter and material gather run on the application's
// device, with synthetic inputs. No scene assets, settings or bindings change.
export async function measureSkyScreenContract() {
  const device = EngineStore.LastCreatedScene?.getEngine()._device;
  if (!device) throw new Error("Sky screen contract requires the initialized WebGPU device");
  const { GPUBufferUsage, GPUTextureUsage, GPUShaderStage, GPUMapMode } = window;
  const resources = [], result = { filters: [], upsampling: [], compilation: [], gpuErrors: [], scopeError: null };
  const onError = event => result.gpuErrors.push(event.error.message);
  device.addEventListener("uncapturederror", onError);
  device.pushErrorScope("validation");
  const buffer = (data, usage) => {
    const value = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(value, 0, data); resources.push(value); return value;
  };
  const readback = size => {
    const value = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    resources.push(value); return value;
  };
  const texture = (width, height, format, values) => {
    const value = device.createTexture({ size: [width, height], format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST });
    resources.push(value);
    if (values) {
      const data = format === "rgba16float" ? Uint16Array.from(values, toHalf) : Float32Array.from(values);
      device.queue.writeTexture({ texture: value }, data, { bytesPerRow: width * (format === "rgba16float" ? 8 : 16) }, [width, height]);
    }
    return value;
  };
  const module = async (label, code) => {
    const value = device.createShaderModule({ label, code });
    const messages = (await value.getCompilationInfo()).messages.map(message => ({
      label, type: message.type, message: message.message, line: message.lineNum, column: message.linePos,
    }));
    result.compilation.push(...messages);
    return messages.some(message => message.type === "error") ? null : value;
  };
  try {
    const filterModule = await module("sky-screen-filter-contract", SKY_SCREEN_FILTER_WGSL);
    const upsampleModule = await module("sky-screen-upsample-contract", `
struct Params { rcSkyAmbientScreen: vec4f, rcSkyAmbientScreenViewProjection: mat4x4f, position: vec4f, normal: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var rcSkyAmbientScreenLight: texture_2d<f32>;
@group(0) @binding(2) var rcSkyAmbientScreenPosition: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> answer: vec4f;
${shaderFunction(MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL, "rcSkyAmbientScreenIrradiance").replaceAll("uniforms.", "params.")}
@compute @workgroup_size(1) fn main() {
    answer = vec4f(rcSkyAmbientScreenIrradiance(params.position.xyz, params.normal.xyz), 0.0, 0.0, 0.0);
}`);
    if (!filterModule || !upsampleModule) return result;
    const commonEntries = [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
    ];
    const filterLayout = device.createBindGroupLayout({ entries: [...commonEntries,
      { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: "rgba16float" } }] });
    const filterPipeline = await device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [filterLayout] }),
      compute: { module: filterModule, entryPoint: "main" } });

    for (const item of filterCases()) {
      const position = texture(item.width, item.height, "rgba32float", item.positions);
      const lights = [texture(item.width, item.height, "rgba16float", item.light),
        texture(item.width, item.height, "rgba16float"), texture(item.width, item.height, "rgba16float")];
      const encoder = device.createCommandEncoder();
      for (let index = 0; index < 2; index++) {
        const params = buffer(new Float32Array([index + 1, item.radius, 0, 0]), GPUBufferUsage.UNIFORM);
        const bind = device.createBindGroup({ layout: filterLayout, entries: [
          { binding: 0, resource: { buffer: params } }, { binding: 1, resource: lights[index].createView() },
          { binding: 2, resource: position.createView() }, { binding: 3, resource: lights[index + 1].createView() },
        ] });
        const pass = encoder.beginComputePass();
        pass.setPipeline(filterPipeline); pass.setBindGroup(0, bind);
        pass.dispatchWorkgroups(Math.ceil(item.width / 8), Math.ceil(item.height / 8)); pass.end();
      }
      const pitch = Math.ceil(item.width * 8 / 256) * 256, stageBytes = pitch * item.height;
      const mapped = readback(stageBytes * 2);
      for (let index = 0; index < 2; index++) encoder.copyTextureToBuffer({ texture: lights[index + 1] },
        { buffer: mapped, offset: stageBytes * index, bytesPerRow: pitch }, [item.width, item.height]);
      device.queue.submit([encoder.finish()]);
      await mapped.mapAsync(GPUMapMode.READ);
      const words = new Uint16Array(mapped.getMappedRange()), stages = [[], []];
      let normalMaxError = 0;
      for (let index = 0; index < 2; index++) for (let y = 0; y < item.height; y++) for (let x = 0; x < item.width; x++) {
        const offset = (index * stageBytes + y * pitch) / 2 + x * 4;
        stages[index].push(fromHalf(words[offset + 3]));
        for (let axis = 0; axis < 3; axis++) normalMaxError = Math.max(normalMaxError,
          Math.abs(fromHalf(words[offset + axis]) - item.light[(y * item.width + x) * 4 + axis]));
      }
      mapped.unmap();
      result.filters.push({ name: item.name, width: item.width, height: item.height,
        input: item.light.filter((_, index) => index % 4 === 3), stage1: stages[0], output: stages[1], normalMaxError });
    }

    const upsampleLayout = device.createBindGroupLayout({ entries: [...commonEntries,
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }] });
    const upsamplePipeline = await device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [upsampleLayout] }),
      compute: { module: upsampleModule, entryPoint: "main" } });
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const item of upsampleCases()) {
      const lights = texture(2, 2, "rgba16float", item.light.flatMap(value => [...item.surfaceNormal, value]));
      const positions = texture(2, 2, "rgba32float", [-.5, .5].flatMap(y => [-.5, .5].flatMap(x => [x, y, item.surfaceZ, item.valid])));
      const params = buffer(new Float32Array([2, 2, item.enabled ? 1 : 0, 0, ...identity, ...item.position, 0, ...item.normal, 0]), GPUBufferUsage.UNIFORM);
      const output = buffer(new Float32Array(4), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC), mapped = readback(16);
      const bind = device.createBindGroup({ layout: upsampleLayout, entries: [
        { binding: 0, resource: { buffer: params } }, { binding: 1, resource: lights.createView() },
        { binding: 2, resource: positions.createView() }, { binding: 3, resource: { buffer: output } },
      ] });
      const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
      pass.setPipeline(upsamplePipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(1); pass.end();
      encoder.copyBufferToBuffer(output, 0, mapped, 0, 16); device.queue.submit([encoder.finish()]);
      await mapped.mapAsync(GPUMapMode.READ);
      result.upsampling.push({ name: item.name, expected: item.expected, actual: new Float32Array(mapped.getMappedRange())[0] });
      mapped.unmap();
    }
    return result;
  } finally {
    result.scopeError = (await device.popErrorScope())?.message ?? null;
    for (const value of resources) value.destroy();
    device.removeEventListener("uncapturederror", onError);
  }
}

import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RADIANCE_PROBE_INTERPOLATION_WGSL, LUMINOUS_RADIANCE_RECEIVER_WGSL } from "/src/render/luminous-radiance-shaders.ts";
import { radianceTask, forceRadianceReceiverFull } from "./luminous-radiance-probe.mjs";

function scene() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const current = texture.getScene(); texture.dispose(); return current;
}

// Exercise the production WGSL, independently of camera/depth quantization and contact-ray changes.
export async function measureHermiteProbeContract() {
  const current = scene(), engine = current.getEngine(), grid = 4;
  // Reuse the loaded runtime class; a new bare import can make Vite reload mid-test.
  const ComputeShader = radianceTask("luminousRadianceReceiver").computeShader.constructor;
  const sequence = [0.25, 1.5, 4, 0.5], pixels = new Float32Array(grid ** 3 * 4);
  for (let z = 0; z < grid; z++) for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    pixels.set([sequence[x], sequence[y] * 2, sequence[z] * 0.5, 1], ((z * grid + y) * grid + x) * 4);
  }
  const coordinates = [-1, 0, 0.25, 0.5, 0.75, 0.99, 1, 1.01, 1.25, 1.5, 1.75, 2, 3, 4];
  const positions = [];
  for (let axis = 0; axis < 3; axis++) for (const coordinate of coordinates) {
    const point = [1, 1, 1]; point[axis] = coordinate;
    positions.push(...point.map(value => (value + 0.5) / grid), 0);
  }
  const field = RawTexture.CreateRGBATexture(pixels, grid, grid * grid, current, false, false, Texture.NEAREST_SAMPLINGMODE, Constants.TEXTURETYPE_FLOAT);
  const input = new StorageBuffer(engine, positions.length * 4), output = new StorageBuffer(engine, positions.length * 8);
  input.update(new Float32Array(positions));
  const shader = new ComputeShader("hermite-contract", engine, { computeSource: `
struct Params { volumeMin: vec4f, volumeSize: vec4f };
const params = Params(vec4f(0.0), vec4f(1.0));
@group(0) @binding(0) var field: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> positions: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> result: array<vec4f>;
${RADIANCE_PROBE_INTERPOLATION_WGSL}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if (id.x >= arrayLength(&positions)) { return; }
    result[id.x * 2u] = interpolate(field, positions[id.x].xyz, vec2u(0), 4u, 1u, 1u, false);
    result[id.x * 2u + 1u] = interpolate(field, positions[id.x].xyz, vec2u(0), 4u, 1u, 1u, true);
}` }, { bindingsMapping: { field: { group: 0, binding: 0 }, positions: { group: 0, binding: 1 }, result: { group: 0, binding: 2 } } });
  shader.setTexture("field", field, false); shader.setStorageBuffer("positions", input); shader.setStorageBuffer("result", output);
  try {
    const dispatch = async () => {
      await shader.dispatchWhenReady(Math.ceil(positions.length / 4 / 64), 1, 1);
      return await output.read(0, undefined, new Float32Array(positions.length * 2), true);
    };
    const values = await dispatch();
    const axes = [0, 1, 2].map(axis => {
      const samples = coordinates.map((coordinate, index) => {
        const offset = (axis * coordinates.length + index) * 8;
        return { coordinate, linear: values[offset + axis], hermite: values[offset + 4 + axis], alpha: values[offset + 7] };
      });
      const left = samples.find(item => item.coordinate === 0.99), middle = samples.find(item => item.coordinate === 1), right = samples.find(item => item.coordinate === 1.01);
      const jump = key => Math.abs(right[key] - 2 * middle[key] + left[key]) / 0.01;
      return { samples, linearSlopeJump: jump("linear"), hermiteSlopeJump: jump("hermite") };
    });
    pixels.fill(2); field.update(pixels);
    const constant = await dispatch();
    return { axes, constantMaxError: Math.max(...constant.map(value => Math.abs(value - 2))) };
  } finally { field.dispose(); input.dispose(); output.dispose(); }
}

const receivers = new WeakMap();
export async function useLinearReceiverBaseline(linear) {
  const task = radianceTask("luminousRadianceReceiver");
  let pair = receivers.get(task);
  if (!pair) {
    const original = task.computeShader;
    const ComputeShader = original.constructor;
    const source = LUMINOUS_RADIANCE_RECEIVER_WGSL.replace("const RADIANCE_RECEIVER_HERMITE = true;", "const RADIANCE_RECEIVER_HERMITE = false;");
    if (source === LUMINOUS_RADIANCE_RECEIVER_WGSL) throw new Error("Receiver baseline marker missing");
    const baseline = new ComputeShader("receiver-linear-baseline", scene().getEngine(), { computeSource: source }, original.options);
    for (const [name, binding] of Object.entries(original._bindings)) {
      if (binding.type === 2) baseline.setUniformBuffer(name, binding.object);
      else if (binding.type === 3) baseline.setStorageBuffer(name, binding.object);
      else if (binding.type === 8) baseline.setInternalTexture(name, binding.object);
      else throw new Error(`Unexpected receiver binding ${name}: ${binding.type}`);
    }
    pair = { original, baseline }; receivers.set(task, pair);
    for (let frame = 0; !baseline.isReady(); frame++) {
      if (frame > 180) throw new Error("Receiver baseline shader is not ready");
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }
  // Baseline and production must never share a cached receiver result across the switch.
  forceRadianceReceiverFull(true); task._cs = linear ? pair.baseline : pair.original;
}
export function restoreHermiteReceiver() {
  const task = radianceTask("luminousRadianceReceiver"), pair = receivers.get(task);
  if (pair) task._cs = pair.original;
  forceRadianceReceiverFull(false);
}
export async function radianceFieldFingerprint() {
  const texture = radianceTask("luminousRadianceReceiver").computeShader._bindings.radianceField.object;
  const pixels = await scene().getEngine()._readTexturePixels(texture, texture.width, texture.height, -1, 0, null, true, false);
  const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  let hash = 2166136261;
  for (const value of bytes) hash = Math.imul(hash ^ value, 16777619) >>> 0;
  return { hash, bytes: bytes.length, cascadesCached: radianceTask("luminousRadianceCascade0").disabled };
}

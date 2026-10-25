import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { LuminousRadianceScene } from "/src/render/luminous-radiance-scene.ts";

function scene() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const current = handle.getScene(); handle.dispose(); return current;
}

export async function setLuminousColorReference({ color, textureColor, preserveChroma = false }) {
  const current = scene(), material = current.getMeshByName("rc-emitter").material;
  material.mmdLuminousPreserveChroma = preserveChroma;
  material.diffuseColor.set(...color); material.emissiveColor.set(...color);
  material.diffuseTexture?.dispose(); material.diffuseTexture = null;
  if (textureColor) {
    material.diffuseTexture = RawTexture.CreateRGBATexture(new Uint8Array([...textureColor, 255]), 1, 1, current, false, false);
    material.diffuseTexture.gammaSpace = true;
  }
  current.getMeshByName("rc-blocker").setEnabled(false);
  await current.whenReadyAsync();
  for (let frame = 0; frame < 12; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
}

// Read the actual 2D mask and the RC triangle/texture data, outside the render/measurement window.
export async function readLuminousColorReference() {
  const current = scene(), source = current.getMeshByName("rc-emitter");
  let data;
  const update = LuminousRadianceScene.prototype.update;
  LuminousRadianceScene.prototype.update = function (...args) { data = this; return update.apply(this, args); };
  try { await new Promise(resolve => current.onAfterRenderObservable.addOnce(resolve)); }
  finally { LuminousRadianceScene.prototype.update = update; }
  if (!data) throw new Error("Active RC source was not observed");
  const entry = data.bvh.entries.find(entry => entry.key === source);
  if (!entry) throw new Error("RC source mesh is missing from the BVH");
  const triangle = data.bvh.triangles.subarray(entry.triangleOffset * 24, (entry.triangleOffset + 1) * 24);
  const emission = Array.from(triangle.subarray(12, 15), value => value / 8);
  if (triangle[22] >= 0) {
    const bytes = await data.emissionBuffer.read();
    const pixels = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    const offset = triangle[22] * 64 * 64 * 4;
    for (let channel = 0; channel < 3; channel++) emission[channel] *= pixels[offset + channel] * pixels[offset + 3];
  }
  const mask = current.activeCamera.customRenderTargets.find(target => target.name === "frameGraphPostEffectsLuminousMask");
  if (!mask) return { emission, mask: null };
  const pixels = await mask.readPixels();
  if (!pixels) throw new Error("2D luminous mask readback failed");
  let best = -1, rgb = [0, 0, 0];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const sum = pixels[offset] + pixels[offset + 1] + pixels[offset + 2];
    if (sum > best) { best = sum; rgb = Array.from(pixels.subarray(offset, offset + 3)); }
  }
  const material = current.getMaterialByName("frameGraphPostEffectsLuminousMaskMaterial");
  const linear = material.getEffect()?.defines.includes("#define IMAGEPROCESSINGPOSTPROCESS") ?? false;
  const normalized = rgb.map(value => value / (pixels instanceof Float32Array ? 1 : 255));
  return { emission, mask: normalized, maskLinear: linear, linearMask: normalized.map(value => linear ? value : value ** 2.2) };
}

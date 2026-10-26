import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createRadianceProbe, radianceTask } from "./luminous-radiance-probe.mjs";

function scene() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const current = handle.getScene(); handle.dispose(); return current;
}
export async function createLuminousSoftnessProbe({ nearReceiver = false } = {}) {
  await createRadianceProbe();
  const current = scene(), luminous = current.getMeshByName("rc-emitter").material;
  for (const mesh of current.meshes) mesh.setEnabled(false);
  const receiver = new StandardMaterial("softness-receiver", current);
  receiver.diffuseColor.set(0.6, 0.6, 0.6); receiver.specularColor.set(0, 0, 0);
  function box(name, size, position, material) {
    const mesh = CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, current);
    mesh.position.set(...position); mesh.material = material; return mesh;
  }
  box("softness-ceiling", [10, 0.1, 10], [0, 3, 0], receiver);
  box("softness-pillar", [0.3, 3, 0.3], [0, 1.5, 0], receiver);
  if (nearReceiver) box("softness-near-ceiling", [2.2, 0.05, 2.2], [0, 1.6, 0], receiver);
  for (let index = 0; index < 48; index++) {
    const angle = index / 48 * Math.PI * 2;
    const mesh = box(`softness-ring-${index}`, [0.13, 0.06, 0.04], [Math.cos(angle) * 0.9, 1.4, Math.sin(angle) * 0.9], luminous);
    mesh.rotation.y = -angle + Math.PI / 2;
  }
  await current.whenReadyAsync();
}

export async function readLuminousSoftnessProbe() {
  const current = scene();
  for (let frame = 0; frame < 8; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
  const receiver = radianceTask("luminousRadianceReceiver"), filter = radianceTask("luminousRadianceSoften4");
  const bindings = receiver.computeShader._bindings;
  const original = bindings.outputGi.object, output = filter.disabled ? original : filter.computeShader._bindings.outputLight.object;
  const read = texture => current.getEngine()._readTexturePixels(texture, texture.width, texture.height, -1, 0, null, true, false);
  const [light, geometry] = await Promise.all([read(output), read(bindings.outputGeometry.object)]);
  const normal = Vector3.TransformNormal(new Vector3(0, -1, 0), current.activeCamera.getViewMatrix()).normalize();
  const width = output.width, height = output.height;
  const ceiling = index => Math.abs(geometry[index]) > 0.000001 &&
    geometry[index + 1] * normal.x + geometry[index + 2] * normal.y + geometry[index + 3] * normal.z > 0.99;
  let energy = 0, variation = 0, detail = 0, samples = 0, backgroundMax = 0, peak = 0;
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const index = (y * width + x) * 4;
    if (Math.abs(geometry[index]) < 0.000001) backgroundMax = Math.max(backgroundMax, light[index], light[index + 1], light[index + 2]);
    if (![index, index - 4, index + 4, index - width * 4, index + width * 4].every(ceiling)) continue;
    const value = light[index]; energy += value; samples++; peak = Math.max(peak, value);
    variation += Math.abs(value - light[index + 4]) + Math.abs(value - light[index + width * 4]);
    detail += Math.abs(4 * value - light[index - 4] - light[index + 4] - light[index - width * 4] - light[index + width * 4]);
  }
  return { samples, mean: energy / samples, roughness: variation / Math.max(energy, 1e-8), detail: detail / Math.max(energy, 1e-8), peak, backgroundMax,
    filtering: !filter.disabled, receiverUpdates: radianceTask("luminousRadianceCascade0").disabled ? "cached" : "updated" };
}

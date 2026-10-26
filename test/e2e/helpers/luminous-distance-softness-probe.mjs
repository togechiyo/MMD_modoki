import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { radianceTask, forceRadianceReceiverFull } from "./luminous-radiance-probe.mjs";

const captures = new Map();
function engine() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const result = texture.getScene().getEngine(); texture.dispose(); return result;
}
export function shiftSoftnessRing(offset) {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const current = texture.getScene(); texture.dispose();
  for (const mesh of current.meshes) if (mesh.name.startsWith("softness-ring-")) mesh.position.y = 1.4 + offset;
}
export async function captureDistanceSoftness(name) {
  for (let frame = 0; frame < 8; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
  const receiver = radianceTask("luminousRadianceReceiver"), filter = radianceTask("luminousRadianceSoften4");
  const bindings = receiver.computeShader._bindings, device = engine();
  const read = texture => device._readTexturePixels(texture, texture.width, texture.height, -1, 0, null, true, false);
  const settings = window.mmdModokiE2e.exportProjectState().effects.frameGraphInstances.instances.find(item => item.type === "luminousRadiance").fixedSettings.radiance;
  const [raw, nearInput, light, geometry] = await Promise.all([
    read(bindings.outputGi.object), settings.distanceSoftness && settings.softness > 0 ? read(bindings.outputNear.object) : Promise.resolve(null),
    read(filter.disabled ? bindings.outputGi.object : filter.computeShader._bindings.outputLight.object), read(bindings.outputGeometry.object),
  ]);
  const near = nearInput ?? new Float32Array(raw.length);
  captures.set(name, { raw, near, light, geometry });
  let nearEnergy = 0, energy = 0, reused = 0, backgroundMax = 0;
  for (let index = 0; index < raw.length; index += 4) {
    energy += raw[index]; nearEnergy += near[index];
    if (raw[index + 3] < 0) reused++;
    if (Math.abs(geometry[index]) < 0.000001) backgroundMax = Math.max(backgroundMax, ...light.slice(index, index + 3));
  }
  return { energy, nearEnergy, reused, backgroundMax, filtering: !filter.disabled,
    cascadesCached: radianceTask("luminousRadianceCascade0").disabled };
}
export function compareDistanceSoftness(fixedName, distanceName) {
  const fixed = captures.get(fixedName), distance = captures.get(distanceName);
  const near = { samples: 0, energy: 0, fixedError: 0, distanceError: 0 };
  const far = { samples: 0, energy: 0, difference: 0 };
  let rawDifference = 0;
  for (let index = 0; index < distance.raw.length; index += 4) {
    const value = distance.raw[index]; rawDifference = Math.max(rawDifference, Math.abs(value - fixed.raw[index]));
    if (value > 0.02 && distance.near[index] / value > 0.75) {
      near.samples++; near.energy += value;
      near.fixedError += Math.abs(fixed.light[index] - value); near.distanceError += Math.abs(distance.light[index] - value);
    }
    if (value > 0.02 && distance.near[index] < 0.00001) {
      far.samples++; far.energy += value; far.difference += Math.abs(distance.light[index] - fixed.light[index]);
    }
  }
  return { rawDifference, near: { ...near, fixedError: near.fixedError / near.energy, distanceError: near.distanceError / near.energy },
    far: { ...far, difference: far.difference / far.energy } };
}

// Includes JS dispatch, submission and GPU completion; this is not a GPU timestamp or whole-app FPS.
export async function profileDistanceSoftnessCompletion(full = false) {
  const device = engine(), loops = device.activeRenderLoops.slice(), samples = [];
  const tasks = [radianceTask("luminousRadianceReceiver"), ...[0, 1, 2, 3, 4].map(index => radianceTask(`luminousRadianceSoften${index}`))];
  forceRadianceReceiverFull(full); device.stopRenderLoop();
  try {
    device.flushFramebuffer(); await device._device.queue.onSubmittedWorkDone();
    for (let index = 0; index < 24; index++) {
      const start = performance.now(); device.beginFrame();
      for (const task of tasks) task._execute();
      device.endFrame(); await device._device.queue.onSubmittedWorkDone();
      if (index >= 4) samples.push(performance.now() - start);
    }
    return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  } finally { forceRadianceReceiverFull(false); for (const loop of loops) device.runRenderLoop(loop); }
}

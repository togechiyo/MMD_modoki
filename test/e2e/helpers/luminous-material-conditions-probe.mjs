import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

function scene() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const current = handle.getScene(); handle.dispose(); return current;
}

const samples = {
  front: [-2, 2, -1], rearBorder: [-2, 3.5, 1],
  boundary: [0.6, 2, -1], specular: [2.2, 2, -1],
};

/** Read-only observation of the loaded original PMX and the actual 2D emission RT. */
export async function readLuminousMaterialConditions({ mask = true } = {}) {
  const current = scene(), camera = current.activeCamera;
  await current.whenReadyAsync();
  await new Promise(resolve => current.onAfterRenderObservable.addOnce(resolve));
  const names = new Set(["Panel A", "Panel B", "Panel C", "Panel D", "Receiver"]);
  const materials = current.materials.filter(material => names.has(material.name)).map(material => ({
    name: material.name, shininess: material.specularPower, specular: material.specularColor.asArray(),
    diffuse: material.diffuseColor.asArray(), ambient: material.ambientColor.asArray(), alpha: material.alpha,
  }));
  const result = { materials, engine: current.getEngine().isWebGPU ? "WebGPU" : current.getEngine().getClassName(),
    camera: { position: camera.position.asArray(), target: camera.getTarget().asArray() }, mask: null,
    glowLayers: current.effectLayers.filter(layer => ["luminousGlow", "luminousGlowCore"].includes(layer.name))
      .map(layer => ({ name: layer.name, enabled: layer.isEnabled, intensity: layer.intensity })) };
  if (!mask) return result;
  const target = camera.customRenderTargets.find(value => value.name === "frameGraphPostEffectsLuminousMask");
  if (!target) throw new Error("The enabled 2D Luminous effect has no emission mask target");
  const pixels = await target.readPixels();
  if (!pixels) throw new Error("Luminous mask readback was unavailable");
  const { width, height } = target.getSize(), divisor = pixels instanceof Float32Array ? 1 : 255;
  const viewport = camera.viewport.toGlobal(width, height), measurements = {};
  for (const [name, point] of Object.entries(samples)) {
    const projected = Vector3.Project(Vector3.FromArray(point), Matrix.Identity(), camera.getTransformationMatrix(), viewport);
    // Babylon WebGPU flips clip-space Y while drawing a render target; raw
    // readPixels rows are not flipped back into Vector3.Project's screen space.
    const x = Math.round(projected.x), y = height - 1 - Math.round(projected.y);
    if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) throw new Error(`Fixture ROI is outside the mask: ${name}`);
    const rgb = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const offset = ((y + dy) * width + x + dx) * 4;
      for (let channel = 0; channel < 3; channel++) rgb[channel] += pixels[offset + channel] / divisor / 25;
    }
    measurements[name] = { point, pixel: [x, y], rgb };
  }
  result.mask = { width, height, pixelType: pixels.constructor.name, samples: measurements };
  return result;
}

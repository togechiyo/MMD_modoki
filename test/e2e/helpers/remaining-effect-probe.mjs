import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";

// Original fixture geometry. The PMX emitter receives its shader through the GUI.
export async function createRemainingEffectProbe() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = texture.getScene(); texture.dispose();
  const floor = new StandardMaterial("remaining-floor", scene);
  floor.diffuseColor.set(0.45, 0.45, 0.45); floor.specularColor.set(1, 1, 1); floor.specularPower = 128;
  const red = new StandardMaterial("remaining-red", scene);
  red.diffuseColor.set(0.9, 0.06, 0.02); red.emissiveColor.set(0.3, 0.01, 0); red.specularColor.set(1, 1, 1);
  for (const [name, width, height, depth, x, y, z, material] of [
    ["remaining-floor", 14, 0.2, 12, 0, -0.1, 0, floor],
    ["remaining-wall", 14, 4, 0.2, 0, 2, 3, floor],
    ["remaining-cube", 1.5, 2, 1.5, -2, 1, 0, red],
  ]) {
    const mesh = CreateBox(name, { width, height, depth }, scene); mesh.position.set(x, y, z); mesh.material = material;
  }
  await scene.whenReadyAsync();
}

export function removeRemainingEffectProbe() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = texture.getScene(); texture.dispose();
  for (const mesh of [...scene.meshes]) if (mesh.name.startsWith("remaining-")) mesh.dispose();
  for (const material of [...scene.materials]) if (material.name.startsWith("remaining-")) material.dispose();
}

import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

export async function outlineProbe() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  await scene.whenReadyAsync();
  for (let i = 0; i < 12; i++) await new Promise(resolve => requestAnimationFrame(resolve));
  return scene.materials.filter(material => "toonTexture" in material).map(material => ({
    name: material.name, outline: material.renderOutline, width: material.outlineWidth,
    alpha: material.alpha, mode: material.transparencyMode, texture: material.diffuseTexture?.name,
    outlineAlpha: material.outlineAlpha, color: material.outlineColor?.asArray(),
  }));
}

import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

export async function lightColorProbe() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  await scene.whenReadyAsync();
  for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
  return scene.getLightByName("dirLight")?.diffuse.asArray()
    ?? scene.lights.find(light => light.getClassName() === "DirectionalLight")?.diffuse.asArray();
}

import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

export function readPbrShader() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4),1,1,undefined,false,false);
  const scene = handle.getScene(); handle.dispose();
  const target = scene.textures.find(item => item.name === "owned-sss-position");
  const sub = target.renderList.flatMap(mesh => mesh.subMeshes).find(sub => sub.effect);
  return sub?.effect?.fragmentSourceCode ?? "";
}

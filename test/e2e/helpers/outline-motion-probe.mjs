import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

// Animate only the repository fixture, after runtime pose updates, to exercise velocity.
export function startOutlineMotion() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const meshes = scene.meshes.filter(mesh => mesh.material &&
    ("toonTexture" in mesh.material || mesh.material.subMaterials?.some(mat => mat && "toonTexture" in mat)));
  let frame = 0;
  scene.onBeforeRenderObservable.add(() => {
    frame++;
    for (const mesh of meshes) mesh.position.x = Math.sin(frame * 0.12) * 1.5;
  });
  return meshes.map(mesh => mesh.name);
}

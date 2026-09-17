import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

export async function inspectLightShadowAudit() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  await scene.whenReadyAsync();
  for (let i = 0; i < 6; i++) await new Promise(resolve => requestAnimationFrame(resolve));
  return {
    lights: scene.lights.map(light => ({
      name: light.name, type: light.getClassName(), intensity: light.intensity,
      diffuse: light.diffuse.asArray(), specular: light.specular.asArray(),
      direction: light.direction?.asArray(), groundColor: light.groundColor?.asArray(),
      shadowEnabled: light.shadowEnabled,
      darkness: light.getShadowGenerator(scene.activeCamera)?.darkness,
    })),
    environment: Boolean(scene.environmentTexture),
    environmentIntensity: scene.environmentIntensity,
    meshes: scene.meshes.filter(mesh => mesh.skeleton && mesh.getTotalVertices() > 0).map(mesh => ({
      name: mesh.name, receives: mesh.receiveShadows,
      material: mesh.material?.getClassName(),
      defines: mesh.subMeshes.map(sub => String(sub.materialDefines ?? sub._materialDefines ?? "")),
    })),
  };
}

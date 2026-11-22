import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

/** Capture the normal shadow receiver on the identical opaque test geometry. */
let restore;
export async function setPlainShadowReceiver(enabled) {
  const scene = EngineStore.LastCreatedScene;
  if (!enabled) {
    restore();
    restore = null;
  } else {
    const light = scene.lights.find(light => light.getClassName() === "DirectionalLight");
    if (!light) throw new Error("Expected the scene's directional light");
    const diagnostic = new StandardMaterial("Diagnostic shadow receiver", scene);
    diagnostic.diffuseColor.set(.65,.65,.65);
    diagnostic.ambientColor.set(0,0,0);
    diagnostic.specularColor.set(0,0,0);
    diagnostic.backFaceCulling = false;
    const meshes = new Map();
    for (const mesh of scene.meshes) {
      if (!(mesh.subMeshes ?? []).some(sub => /^(White|Gray) (back|side)$/.test(sub.getMaterial()?.name ?? ""))) continue;
      meshes.set(mesh, mesh.material);
      mesh.material = diagnostic;
    }
    if (!meshes.size) throw new Error("Missing procedural receiver meshes");
    const otherLights = scene.lights.filter(other => other !== light && other.isEnabled());
    for (const other of otherLights) other.setEnabled(false);
    restore = () => {
      for (const [mesh, material] of meshes) mesh.material = material;
      for (const other of otherLights) other.setEnabled(true);
      diagnostic.dispose();
    };
  }
  await scene.whenReadyAsync();
}

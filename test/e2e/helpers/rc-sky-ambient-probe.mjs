import { EngineStore } from "@babylonjs/core/Engines/engineStore";

// Test-only observation of the exact material program used by the fixture.
// A ready field alone does not prove that the common Toon hooks were reached.
export function inspectSkyAmbientMaterials() {
  const scene = EngineStore.LastCreatedScene;
  return scene.meshes.filter(mesh => mesh.skeleton && mesh.getTotalVertices() > 0).flatMap(mesh =>
    mesh.subMeshes.map(sub => {
      const material = sub.getMaterial(), effect = sub.effect;
      return {
        mesh: mesh.name, material: material?.name,
        toon: material?.toonTexture?.name ?? null,
        toonReady: material?.toonTexture?.isReady() ?? false,
        defines: String(sub.materialDefines ?? ""),
        fragment: effect?.fragmentSourceCode ?? "",
      };
    }));
}

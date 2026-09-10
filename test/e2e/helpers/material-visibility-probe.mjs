import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

// Read-only model diagnostics, loaded only by the local E2E renderer.
export function inspectMaterialVisibility() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  const root = scene.meshes.find(mesh => Array.isArray(mesh.metadata?.materials)
    && Array.isArray(mesh.metadata?.meshes));
  return {
    engine: scene.getEngine().isWebGPU ? "WebGPU" : "other",
    materials: (root?.metadata.materials ?? []).map(material => ({
      name: material.name,
      type: material.getClassName(),
      alpha: material.alpha,
      transparencyMode: material.transparencyMode,
      blend: material.needAlphaBlending(),
      alphaTest: material.needAlphaTesting(),
      renderOutline: material.renderOutline ?? null,
      meshes: root.metadata.meshes.filter(mesh => mesh.material === material).map(mesh => ({
        name: mesh.name, visible: mesh.isVisible, enabled: mesh.isEnabled(),
        visibility: mesh.visibility, vertices: mesh.getTotalVertices(),
        drawRangeCount: mesh.subMeshes.length,
      })),
    })),
  };
}

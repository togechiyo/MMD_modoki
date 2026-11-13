// eslint-disable-next-line import/no-unresolved -- Loaded by the local test application's Vite server.
import { MmdManager } from "/src/mmd-manager.ts";

let manager;
const previous = MmdManager.prototype.getRcDiffuseGiSettings;
function observeManager(...args) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Observe the real manager, without creating another runtime.
  manager = this;
  return previous.apply(this, args);
}
MmdManager.prototype.getRcDiffuseGiSettings = observeManager;

function controllerState(controller) {
  const source = controller?.field?.source;
  return { diagnostics: controller?.diagnostics ?? null, view: Boolean(controller?.view),
    volumeCount: controller?.field?.volumeCount ?? null,
    irradianceSize: controller?.field?.irradianceField?.getSize() ?? null,
    nearestSize: controller?.field?.nearestSurfaceField?.getSize() ?? null,
    sourceRevision: source?.revision ?? null, sourceReady: source?.ready ?? null,
    sourceError: source?.error ?? null,
    chunks: (source?.chunks ?? []).map(chunk => ({ name: chunk.key.name, triangles: chunk.triangles.length / 24 })) };
}

function worldBounds(mesh) {
  const positions=mesh.getPositionData?.(true,true) ?? mesh.getVerticesData?.("position");
  const matrix=mesh.computeWorldMatrix(true).m, min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;positions && i<positions.length;i+=3) {
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    for(let axis=0;axis<3;axis++) {
      const value=x*matrix[axis]+y*matrix[4+axis]+z*matrix[8+axis]+matrix[12+axis];
      min[axis]=Math.min(min[axis],value); max[axis]=Math.max(max[axis],value);
    }
  }
  return {min,max};
}

// Observation only: no material, mesh, light, field or render-path changes.
export function roomState() {
  if (!manager) throw new Error("Read GI settings after loading the room probe");
  const materials = new Map();
  const meshes = manager.scene.meshes.filter(mesh => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0)
    .flatMap(mesh => {
      const surfaces = (mesh.subMeshes ?? []).map(sub => {
        const material = sub.getMaterial();
        if (!material) return null;
        const preset = manager.materialShaderPresetByMaterial.get(material);
        if (!preset) return null;
        if (!materials.has(material.uniqueId)) materials.set(material.uniqueId, {
          id: material.uniqueId, name: material.name, preset, className: material.getClassName(),
          alpha: material.alpha, alphaTesting: material.needAlphaTesting(), alphaBlending: material.needAlphaBlending(),
          transparencyMode: material.transparencyMode, alphaCutOff: material.alphaCutOff,
          useAlphaFromDiffuseTexture: material.useAlphaFromDiffuseTexture,
          giReceiver: manager.acceptsRcDiffuseGiMaterial(material), giSource: manager.acceptsRcDiffuseGiMaterial(material, true),
          skyReceiver: manager.rcSkyOcclusionController?.acceptsMaterial(material) ?? false,
          skyAmbientReceiver: manager.rcSkyAmbientController?.acceptsMaterial(material) ?? false,
          diffuse: material.diffuseColor?.asArray?.(), textureReady: material.diffuseTexture?.isReady() ?? null,
          textureHasAlpha: material.diffuseTexture?.hasAlpha ?? null,
          textureUrl: material.diffuseTexture?.url ?? null,
          toonTexture: Boolean(material.toonTexture),
        });
        return { materialId: material.uniqueId, triangles: sub.indexCount / 3 };
      }).filter(Boolean);
      return surfaces.length ? [{ name: mesh.name, surfaces, bounds:worldBounds(mesh) }] : [];
    });
  return { gi: controllerState(manager.rcDiffuseGiController), sky: controllerState(manager.rcSkyOcclusionController),
    skyAmbient: controllerState(manager.rcSkyAmbientController),
    materials: [...materials.values()], meshes,
    light: { direction: manager.dirLight.direction.asArray(), intensity: manager.dirLight.getScaledIntensity() } };
}

/** Observe actual render events; never request a render or invalidate a producer. */
export async function observeStaticRoomFrames(frameCount = 30) {
  if (!manager) throw new Error("Room manager is not observed");
  const snapshots = [];
  const snapshot = () => Object.fromEntries([["gi", manager.rcDiffuseGiController], ["sky", manager.rcSkyOcclusionController]]
    .map(([name, controller]) => [name, { fieldRevision: controller?.diagnostics.fieldRevision ?? null,
      sourceRevision: controller?.field?.source?.revision ?? null }]));
  const before = snapshot();
  await new Promise(resolve => {
    const observer = manager.scene.onAfterRenderObservable.add(() => {
      snapshots.push(snapshot());
      if (snapshots.length >= frameCount) { manager.scene.onAfterRenderObservable.remove(observer); resolve(); }
    });
  });
  return { frames: snapshots.length, before, after: snapshot(), snapshots };
}

export function disposeRoomProbe() {
  if (MmdManager.prototype.getRcDiffuseGiSettings === observeManager) MmdManager.prototype.getRcDiffuseGiSettings = previous;
  manager = null;
}

import { RcSkyOcclusionController } from "/src/render/rc-sky-occlusion-controller.ts";

// Test-only observation: normal PMX loading, GUI keys and the real producer remain intact.
let owner = null, trace = null;
const observed = new WeakSet(), observers = [];
const prepare = RcSkyOcclusionController.prototype.prepareFrame;

export function rcSkyMotionState() {
  if (!owner) return null;
  const scene = owner.scene;
  const bone = scene.skeletons.flatMap(skeleton => skeleton.bones).find(bone => bone.name === "庇移動");
  const morphs = scene.meshes.flatMap(mesh => {
    const manager = mesh.morphTargetManager, values = [];
    if (manager) for (let i = 0; i < manager.numTargets; i++) {
      const target = manager.getTarget(i);
      if (target.name === "庇移動モーフ") values.push(target.influence);
    }
    return values;
  });
  return { frame: Number(document.querySelector("#current-frame").value), sceneFrameId: scene.getFrameId(),
    diagnostics: { ...owner.diagnostics }, sourceRevision: owner.field?.source.revision ?? null,
    preparedSourceRevision: owner.sourceRevision, providerReady: Boolean(owner.view),
    boneX: bone?.getLocalMatrix().m[12] ?? null, morphWeights: morphs };
}
function record(kind) { if (trace) trace.push({ kind, ...rcSkyMotionState() }); }

RcSkyOcclusionController.prototype.prepareFrame = function (...args) {
  owner = this; record("prepare-start");
  const result = prepare.apply(this, args); record("prepare-end");
  for (const mesh of this.scene.meshes) {
    if (observed.has(mesh) || !(mesh.subMeshes ?? []).some(sub =>
      sub.getMaterial()?.pluginManager?.getPlugin("MmdRadianceSkyOcclusion"))) continue;
    observed.add(mesh);
    const observer = mesh.onBeforeDrawObservable.add(() => record("material-draw"));
    observers.push(() => mesh.onBeforeDrawObservable.remove(observer));
  }
  return result;
};

export function beginRcSkyMotionTrace() { trace = []; }
export function endRcSkyMotionTrace() { const result = trace; trace = null; return result; }
export function disposeRcSkyMotionProbe() {
  RcSkyOcclusionController.prototype.prepareFrame = prepare;
  for (const dispose of observers.splice(0)) dispose();
  owner = null; trace = null;
}

import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { RadianceSkyVisibilityLab } from "/src/render/radiance-sky-visibility-lab.ts";

let lab, roof, bone, morph, target, targetKind, poseObserver, currentScene;
let trace = null;
const observedReceivers = new WeakSet(), gpuErrors = [];
function scene() {
  if (currentScene && !currentScene.isDisposed) return currentScene;
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  currentScene = texture.getScene(); texture.dispose(); return currentScene;
}
function event(kind) {
  if (trace) trace.push({ kind, sceneFrameId: scene().getFrameId(), frame: Number(document.querySelector("#current-frame").value),
    diagnostics: lab ? { ...lab.diagnostics } : null, boneX: bone?.position.x ?? null, morph: morph?.influence ?? null });
}
const prepareFrame = RadianceSkyVisibilityLab.prototype.prepareFrame;
RadianceSkyVisibilityLab.prototype.prepareFrame = function (...args) {
  lab = this; event("prepare-start");
  const result = prepareFrame.apply(this, args);
  event("prepare-end");
  const receiver = scene().getMeshByName("rc-sky-visibility-receiver");
  if (receiver && !observedReceivers.has(receiver)) {
    observedReceivers.add(receiver);
    receiver.onBeforeDrawObservable.add(() => event("receiver-draw"));
  }
  return result;
};
const setEnabled = RadianceSkyVisibilityLab.prototype.setEnabled;
RadianceSkyVisibilityLab.prototype.setEnabled = function (...args) { lab = this; return setEnabled.apply(this, args); };

// Small original geometry only. No model asset, luminous material, or normal material adapter is involved.
export async function createSkyVisibilityProbe() {
  const current = scene();
  for (const mesh of [...current.meshes]) if (mesh.name.startsWith("sky-fixture-")) mesh.dispose();
  const material = new StandardMaterial("sky-fixture-material", current);
  material.diffuseColor.set(0.08, 0.08, 0.08); material.specularColor.set(0, 0, 0);
  const floor = CreateBox("sky-fixture-floor", { width: 16, height: 0.2, depth: 16 }, current);
  floor.position.y = -0.1; floor.material = material;
  roof = CreateBox("sky-fixture-roof", { width: 4, height: 0.2, depth: 4 }, current);
  roof.position.y = 2.1; roof.material = material; roof.setEnabled(false);
  const skeleton = new Skeleton("sky-fixture-skeleton", "sky-fixture-skeleton", current);
  bone = new Bone("sky-fixture-bone", skeleton, null, Matrix.Identity());
  const indices = new Float32Array(roof.getTotalVertices() * 4), weights = new Float32Array(indices.length);
  for (let i = 0; i < weights.length; i += 4) weights[i] = 1;
  roof.setVerticesData(VertexBuffer.MatricesIndicesKind, indices);
  roof.setVerticesData(VertexBuffer.MatricesWeightsKind, weights);
  roof.skeleton = skeleton;
  morph = new MorphTarget("sky-fixture-morph", 0, current);
  const positions = Float32Array.from(roof.getVerticesData(VertexBuffer.PositionKind));
  for (let i = 0; i < positions.length; i += 3) positions[i] += 16;
  morph.setPositions(positions);
  roof.morphTargetManager = new MorphTargetManager(current);
  roof.morphTargetManager.addTarget(morph);
  const device = current.getEngine()._device;
  device.addEventListener("uncapturederror", error => gpuErrors.push(error.error.message));
  skyCamera("overview");
  await current.whenReadyAsync();
}

export function skyFixture(kind) {
  const revision = lab?.diagnostics.fieldRevision ?? 0;
  if (poseObserver) { scene().onBeforeRenderObservable.remove(poseObserver); poseObserver = null; }
  bone.setPosition(Vector3.Zero()); morph.influence = 0;
  roof.setEnabled(kind !== "open"); roof.scaling.set(1, 1, 1); roof.position.set(0, 2.1, 0);
  if (kind === "covered") roof.scaling.set(2500, 1, 2500);
  if (kind === "distant") { roof.scaling.set(2500, 1, 2500); roof.position.y = 100.1; }
  roof.computeWorldMatrix(true);
  return revision;
}

export function skyCamera(kind) {
  const current = scene(), camera = current.activeCamera;
  if (kind === "low") {
    window.mmdModokiE2e.setCameraPose({ x: 0, y: 0.4, z: -3 }, { x: 0, y: 0.05, z: 0 }); camera.fov = 0.35;
  } else {
    window.mmdModokiE2e.setCameraPose({ x: 0, y: 12, z: -12 }, { x: 0, y: 0.05, z: 0 }); camera.fov = 0.8;
  }
  current.updateTransformMatrix(true);
}

export function skyState() {
  const current = scene();
  // Babylon may retain a conservative skinned/morphed bounding volume after the giant-roof case.
  // A common separating frustum plane for every actual deformed world vertex proves the geometry
  // is outside independently of that render-culling approximation; never change its culling strategy.
  const roofFrustum = { maxPlaneDistances: current.frustumPlanes.map(() => -Infinity),
    worldMin: [Infinity, Infinity, Infinity], worldMax: [-Infinity, -Infinity, -Infinity],
    cullingStrategy: roof?.cullingStrategy ?? null, outsidePlane: -1 };
  if (roof) {
    const positions = roof.getPositionData(true, true), world = roof.computeWorldMatrix(true), point = Vector3.Zero();
    for (let i = 0; i < positions.length; i += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(positions[i], positions[i + 1], positions[i + 2], world, point);
      for (const [index, value] of point.asArray().entries()) {
        roofFrustum.worldMin[index] = Math.min(roofFrustum.worldMin[index], value);
        roofFrustum.worldMax[index] = Math.max(roofFrustum.worldMax[index], value);
      }
      for (const [index, plane] of current.frustumPlanes.entries()) {
        roofFrustum.maxPlaneDistances[index] = Math.max(roofFrustum.maxPlaneDistances[index], plane.dotCoordinate(point));
      }
    }
    roofFrustum.outsidePlane = roofFrustum.maxPlaneDistances.findIndex(value => value < -0.00001);
  }
  return { enabled: lab?.enabled ?? false, mode: lab?.mode ?? "cascade", diagnostics: lab?.diagnostics ?? null, sceneFrameId: current.getFrameId(),
    receiverCount: current.meshes.filter(mesh => mesh.name === "rc-sky-visibility-receiver").length,
    roofInFrustum: roof?.isInFrustum(current.frustumPlanes) ?? false,
    roofFrustum, camera: { position: current.activeCamera.position.asArray(), fov: current.activeCamera.fov },
    gpuErrors: [...gpuErrors] };
}

export async function skyDiagnostic() {
  const data = await lab.readDiagnostic();
  if (!data) return null;
  const result = { pixels: data.length / 4, nonFinite: 0, invalid: 0, rc: 0, direct: 0, difference: 0, maxDifference: 0,
    center: Array.from(data.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4)) };
  for (let i = 0; i < data.length; i += 4) {
    if (![data[i], data[i + 1], data[i + 2], data[i + 3]].every(Number.isFinite)) result.nonFinite++;
    if (data[i + 3] < 0.5 || data[i] < 0 || data[i + 1] < 0) result.invalid++;
    result.rc += data[i]; result.direct += data[i + 1]; result.difference += data[i + 2];
    result.maxDifference = Math.max(result.maxDifference, data[i + 2]);
  }
  for (const key of ["rc", "direct", "difference"]) result[key] /= result.pixels;
  return result;
}

export function skyRenderTarget(kind) {
  const current = scene();
  if (target) {
    const list = targetKind === "scene" ? current.customRenderTargets : current.activeCamera.customRenderTargets;
    const index = list.indexOf(target); if (index >= 0) list.splice(index, 1);
    target.dispose(); target = null;
  }
  if (kind === "none") return;
  targetKind = kind;
  target = new RenderTargetTexture("sky-fixture-target", 32, current);
  target.activeCamera = current.activeCamera;
  target.renderList = current.meshes.filter(mesh => mesh.name === "sky-fixture-floor" || mesh.name === "rc-sky-visibility-receiver");
  if (kind === "scene") current.customRenderTargets.push(target);
  else { current.activeCamera.customRenderTargets ??= []; current.activeCamera.customRenderTargets.push(target); }
}

// Apply a synthetic skeletal/morph fixture at Babylon's pose-update phase, before the manager producer hook.
// The manager's committed timeline frame is the input; no pre-render or settling frames are inserted by the test.
export function skyAnimateRoof() {
  skyFixture("roof");
  poseObserver = scene().onBeforeRenderObservable.add(() => {
    const frame = window.mmdModokiE2e.exportProjectState().scene.currentFrame;
    bone.setPosition(new Vector3(frame === 10 ? 16 : 0, 0, 0));
    morph.influence = frame === 20 ? 1 : 0;
    event("pose");
  });
}
export function beginSkyTrace() { trace = []; }
export function endSkyTrace() { const result = trace; trace = null; return result; }

import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { RadianceSkyVisibilityLab } from "/src/render/radiance-sky-visibility-lab.ts";

let currentScene, lab, material;
const meshes = [], gpuErrors = [];
function scene() {
  if (currentScene && !currentScene.isDisposed) return currentScene;
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  currentScene = texture.getScene(); texture.dispose(); return currentScene;
}
const setEnabled = RadianceSkyVisibilityLab.prototype.setEnabled;
RadianceSkyVisibilityLab.prototype.setEnabled = function (...args) {
  lab = this; return setEnabled.apply(this, args);
};
const prepareFrame = RadianceSkyVisibilityLab.prototype.prepareFrame;
RadianceSkyVisibilityLab.prototype.prepareFrame = function (...args) {
  lab = this; return prepareFrame.apply(this, args);
};

export async function initializeSkyReconstructionProbe() {
  const current = scene();
  material = new StandardMaterial("sky-reconstruction-material", current);
  material.diffuseColor.set(0.08, 0.08, 0.08); material.specularColor.set(0, 0, 0);
  current.getEngine()._device.addEventListener("uncapturederror", event => gpuErrors.push(event.error.message));
  window.mmdModokiE2e.setCameraPose({ x: 0, y: 12, z: -12 }, { x: 0, y: 0.05, z: 0 });
  current.activeCamera.fov = 0.8;
  await current.whenReadyAsync();
}

// Original opaque boxes only. Descriptions contain exact dimensions for independent analysis.
export function setSkyReconstructionFixture(name) {
  const before = lab.diagnostics, hadMeshes = meshes.length > 0, boxes = [];
  while (meshes.length) meshes.pop().dispose();
  const box = (part, size, center) => {
    const mesh = CreateBox(`sky-reconstruction-${part}`, { width: size[0], height: size[1], depth: size[2] }, scene());
    mesh.position.set(...center); mesh.material = material; mesh.computeWorldMatrix(true); meshes.push(mesh);
    boxes.push({ part, size, center, min: center.map((value, axis) => value - size[axis] / 2),
      max: center.map((value, axis) => value + size[axis] / 2) });
  };
  if (name !== "empty") box("floor", [16, 0.2, 16], [0, -0.1, 0]);
  switch (name) {
    case "empty": break;
    case "covered-bottom2": box("roof", [10000, 0.2, 10000], [0, 2.1, 0]); break;
    case "covered-bottom4": box("roof", [10000, 0.2, 10000], [0, 4.1, 0]); break;
    case "distant-bottom100": box("roof", [10000, 0.2, 10000], [0, 100.1, 0]); break;
    case "finite-roof4x4": box("roof", [4, 0.2, 4], [0, 2.1, 0]); break;
    case "thin-wall": box("wall", [0.05, 4, 12], [0, 2, 0]); break;
    case "box-sealed":
    case "box-opening":
      box("roof", [6, 0.05, 6], [0, 4.025, 0]);
      box("left", [0.05, 4, 6], [-3, 2, 0]);
      box("right", [0.05, 4, 6], [3, 2, 0]);
      box("back", [6, 4, 0.05], [0, 2, 3]);
      if (name === "box-sealed") box("front", [6, 4, 0.05], [0, 2, -3]);
      else {
        // A 3 m wide, 2.5 m tall opening in a 5 cm wall. Both sides of the opening
        // and the lintel are geometry; no alpha texture or screen-space mask is involved.
        box("front-left", [1.5, 4, 0.05], [-2.25, 2, -3]);
        box("front-right", [1.5, 4, 0.05], [2.25, 2, -3]);
        box("lintel", [3, 1.5, 0.05], [0, 3.25, -3]);
      }
      break;
    default: throw new Error(`Unknown sky reconstruction fixture: ${name}`);
  }
  return { name, boxes, fieldRevision: before.fieldRevision, expectFieldChange: hadMeshes || meshes.length > 0 };
}

export function setSkyReconstruction(settings) {
  const before = lab.diagnostics;
  lab.setReconstruction(settings);
  const after = lab.diagnostics;
  return { previousFieldRevision: before.fieldRevision, settingsRevision: after.settingsRevision,
    changed: after.settingsRevision !== before.settingsRevision, reconstruction: after.reconstruction };
}

export function skyReconstructionState() {
  return { enabled: lab?.enabled ?? false, diagnostics: lab?.diagnostics ?? null, gpuErrors: [...gpuErrors],
    sceneFrameId: scene().getFrameId(), fixtureMeshCount: meshes.length };
}

export async function readSkyReconstructionPixels() {
  const values = await lab.readDiagnostic();
  return values ? Array.from(values) : null;
}

// Explicit test-only access for a separate timing probe; production code never imports this helper.
export function getSkyReconstructionContext() { return { lab, scene: scene() }; }

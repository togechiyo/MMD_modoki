import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { inspectCsmWallBand, restoreCsmWallBandBaseline } from "./csm-wall-band-probe.mjs";

const materials = new WeakMap();
const beams = new WeakMap();

function context() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const generator = scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])])[0];
  if (generator?.getClassName() !== "CascadedShadowGenerator") throw new Error("CSM generator unavailable");
  return { scene, generator };
}

function setOccluder(scene, generator, kind) {
  if (!["none", "beam"].includes(kind)) throw new Error(`Unknown diagnostic occluder: ${kind}`);
  let beam = beams.get(scene);
  if (kind === "beam" && !beam) {
    beam = CreateBox("csm-wall-blend-beam", { width: 8, height: 50, depth: 1800 }, scene);
    beam.position.set(-40, 220, 800);
    // Light (-1,-2,0) projects this box onto wall x=-114 at y=39..105.
    // Heights 50/75 receive a real cast shadow; 100 is near its upper edge.
    const material = new StandardMaterial("csm-wall-blend-beam-material", scene);
    material.diffuseColor.set(.5, .5, .5); material.specularColor.set(0, 0, 0);
    beam.material = material;
    beam.receiveShadows = false;
    beams.set(scene, beam);
  }
  if (!beam) return null;
  beam.setEnabled(kind === "beam");
  const list = generator.getShadowMap()?.renderList;
  if (!Array.isArray(list)) throw new Error("Diagnostic caster list unavailable");
  const index = list.indexOf(beam);
  if (kind === "beam" && index < 0) list.push(beam);
  if (kind === "none" && index >= 0) list.splice(index, 1);
  beam.computeWorldMatrix(true);
  const bounds = beam.getBoundingInfo().boundingBox;
  return { name: beam.name, enabled: beam.isEnabled(),
    minimum: bounds.minimumWorld.asArray(), maximum: bounds.maximumWorld.asArray() };
}

function materialBindings(scene) {
  if (materials.has(scene)) return materials.get(scene);
  const replacements = new Map(), bindings = [], seen = new Set();
  const standard = original => {
    if (!original || !("toonTexture" in original)) return original;
    if (!replacements.has(original)) {
      const replacement = new StandardMaterial(`csm-blend-standard-${original.name}`, scene);
      for (const field of ["diffuseColor", "ambientColor", "specularColor", "emissiveColor"]) {
        replacement[field].copyFrom(original[field]);
      }
      replacement.alpha = original.alpha; replacement.specularPower = original.specularPower;
      replacement.backFaceCulling = original.backFaceCulling;
      replacements.set(original, replacement);
    }
    return replacements.get(original);
  };
  for (const mesh of scene.meshes) {
    const holder = mesh.material;
    if (!holder || seen.has(holder)) continue;
    seen.add(holder);
    if (holder.subMaterials?.some(material => material && "toonTexture" in material)) {
      const original = [...holder.subMaterials];
      bindings.push({ holder, original, standard: original.map(standard), multi: true });
    } else if ("toonTexture" in holder) {
      // Direct materials can be shared by multiple meshes.
      bindings.push({ holder: scene.meshes.filter(other => other.material === holder), original: holder,
        standard: standard(holder), multi: false });
    }
  }
  if (!replacements.size) throw new Error("Repository PMX MMD materials unavailable");
  const state = { bindings, replacements, mode: "mmd" }; materials.set(scene, state); return state;
}

function setMaterialMode(scene, mode) {
  if (!["mmd", "standard"].includes(mode)) throw new Error(`Unknown material mode: ${mode}`);
  const state = materialBindings(scene);
  if (state.mode !== mode) {
    for (const binding of state.bindings) {
      const value = mode === "mmd" ? binding.original : binding.standard;
      if (binding.multi) binding.holder.subMaterials = [...value];
      else for (const mesh of binding.holder) mesh.material = value;
    }
    scene.markAllMaterialsAsDirty(StandardMaterial.AllDirtyFlag);
    state.mode = mode;
  }
  return { mode: state.mode, replacedMaterialCount: state.replacements.size,
    originalMaterialClasses: [...new Set([...state.replacements.keys()].map(material => material.getClassName()))] };
}

/** Diagnostic only: authored PMX geometry stays intact; no private asset or production setting change. */
export async function inspectCsmWallBlend({ blend, materialMode = "mmd", shadowEnabled = true,
  overrides = {}, occluder = "none" }) {
  for (const field of ["bias", "normalBias"]) {
    if (Object.hasOwn(overrides, field)) throw new Error(`Bias changes are prohibited in this diagnostic: ${field}`);
  }
  const { scene, generator } = context();
  const occluderBounds = setOccluder(scene, generator, occluder);
  const pose = { position: { x: 80, y: 80, z: -100 }, target: { x: -114, y: 80, z: 350 },
    direction: { x: -1, y: -2, z: 0 }, roof: false,
    overrides: { ...overrides, cascadeBlendPercentage: blend }, shadowEnabled };
  const base = await inspectCsmWallBand(pose);
  const material = setMaterialMode(scene, materialMode);
  await scene.whenReadyAsync();
  for (let frame = 0; frame < 8; frame++) await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  if (generator.cascadeBlendPercentage !== blend || generator.getLight().shadowEnabled !== shadowEnabled) {
    throw new Error("Diagnostic shadow state was replaced during material synchronization");
  }
  if (occluder === "beam" && !generator.getShadowMap()?.renderList?.includes(beams.get(scene))) {
    throw new Error("Diagnostic beam was removed from the caster list");
  }
  const camera = scene.activeCamera, engine = scene.getEngine();
  const width = engine.getRenderWidth(), height = engine.getRenderHeight();
  const viewport = camera.viewport.toGlobal(width, height);
  const splits = [...generator._viewSpaceFrustumsZ], lengths = [...generator._frustumLengths];
  const matrices = splits.map((_, index) => generator.getCascadeTransformMatrix(index));
  const boundaries = splits.slice(0, -1).map((split, index) => ({ index, split, length: lengths[index],
    blendStart: split - lengths[index] * blend, blendWidth: lengths[index] * blend,
    // Fixed window covers the full 0..0.3 sweep and a plateau on either side.
    window: [split - Math.max(10, lengths[index] * .35), split + Math.max(10, lengths[index] * .35)] }));
  const samples = [];
  for (let z = 20; z <= 1800; z += .5) for (const wallHeight of [30, 50, 75, 100, 125]) {
    const world = new Vector3(-113.99, wallHeight, z);
    const depth = Vector3.TransformCoordinates(world, camera.getViewMatrix()).z;
    const boundary = boundaries.find(item => depth >= item.window[0] && depth <= item.window[1]);
    if (!boundary) continue;
    const screen = Vector3.Project(world, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    if (depth <= camera.minZ || screen.x < 4 || screen.y < 4 || screen.x >= width - 4 || screen.y >= height - 4) continue;
    const projection = index => {
      const clip = Vector3.TransformCoordinates(world, matrices[index]);
      const uv = [.5 * clip.x + .5, .5 * clip.y + .5];
      return { uv, clip: clip.asArray(), clipZ: clip.z,
        uvInside: uv.every(value => value >= 0 && value <= 1),
        depthInside: clip.z >= (engine.isNDCHalfZRange ? 0 : -1) && clip.z <= 1 };
    };
    samples.push({ world: world.asArray(), z, height: wallHeight, x: screen.x, y: screen.y, depth,
      boundary: boundary.index, inBlend: blend > 0 && depth >= boundary.blendStart && depth <= boundary.split,
      current: projection(boundary.index), next: projection(boundary.index + 1) });
  }
  return { ...base, samples, splits, lengths, boundaries, material, width, height, occluder, occluderBounds,
    clipDepthRange: [engine.isNDCHalfZRange ? 0 : -1, 1],
    casterCount: generator.getShadowMap()?.renderList?.length ?? 0,
    lightDirection: generator.getLight().direction.asArray(),
    position: camera.position.asArray(), target: camera.getTarget().asArray(),
    shadowEnabled: generator.getLight().shadowEnabled,
    settings: { ...Object.fromEntries(Object.keys(base.settings).map(field => [field, generator[field]])),
      minDistance: generator.minDistance, maxDistance: generator.maxDistance } };
}

export function restoreCsmWallBlend() {
  const { scene, generator } = context(), state = materials.get(scene);
  if (state) {
    setMaterialMode(scene, "mmd");
    for (const replacement of state.replacements.values()) replacement.dispose();
    materials.delete(scene);
  }
  const beam = beams.get(scene);
  if (beam) {
    setOccluder(scene, generator, "none");
    beam.dispose(false, true);
    beams.delete(scene);
  }
  restoreCsmWallBandBaseline();
}

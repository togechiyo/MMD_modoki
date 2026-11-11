import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

const fields = ["filter", "frustumEdgeFalloff", "bias", "normalBias", "stabilizeCascades",
  "autoCalcDepthBounds", "depthClamp", "numCascades", "cascadeBlendPercentage", "lambda", "shadowMaxZ"];
const baselines = new WeakMap();
const roofs = new WeakMap();

function context() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  const generator = scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])])[0];
  if (!generator || generator.getClassName() !== "CascadedShadowGenerator") throw new Error("CSM fixture generator unavailable");
  if (!baselines.has(generator)) baselines.set(generator, {
    settings: Object.fromEntries(fields.map(field => [field, generator[field]])),
    shadowEnabled: generator.getLight().shadowEnabled,
  });
  return { scene, generator, baseline: baselines.get(generator) };
}

function restore(generator, baseline) {
  for (const [field, value] of Object.entries(baseline.settings)) {
    if (generator[field] !== value) generator[field] = value;
  }
  generator.getLight().shadowEnabled = baseline.shadowEnabled;
}

/** Test-only diagnostic overrides; no application defaults or saved settings are rewritten. */
export async function inspectCsmWallBand({ position, target, direction, shadowEnabled = true, overrides = {}, roof = false }) {
  for (const field of Object.keys(overrides)) {
    if (!fields.includes(field)) throw new Error(`Unsupported CSM diagnostic override: ${field}`);
  }
  const { scene, generator, baseline } = context();
  restore(generator, baseline);
  if (roof && !roofs.has(scene)) {
    // Authored diagnostic occluder: all sampled wall points lie below this roof.
    // The PMX wall geometry and material are unchanged.
    const mesh = CreateBox("csm-wall-diagnostic-roof", { width: 4000, height: 2, depth: 10000 }, scene);
    mesh.position.set(0, 300, 1000);
    const material = new StandardMaterial("csm-wall-diagnostic-roof-material", scene);
    material.diffuseColor.set(.5, .5, .5); material.specularColor.set(0, 0, 0);
    mesh.material = material;
    roofs.set(scene, mesh);
  }
  const roofMesh = roofs.get(scene);
  if (roofMesh) {
    roofMesh.setEnabled(roof);
    const list = generator.getShadowMap().renderList;
    if (roof && !list.includes(roofMesh)) list.push(roofMesh);
    if (!roof && list.includes(roofMesh)) list.splice(list.indexOf(roofMesh), 1);
  }
  window.mmdModokiE2e.setLightDirection(direction);
  window.mmdModokiE2e.setCameraPose(position, target);
  window.mmdModokiE2e.setAutoRenderEnabled(true);
  await scene.whenReadyAsync();
  // Let the initial model/scene synchronization finish before diagnostic overrides.
  // Otherwise the first capture can silently restore the application's shadowMaxZ.
  for (let frame = 0; frame < 8; frame++) await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  for (const [field, value] of Object.entries(overrides)) {
    if (generator[field] !== value) generator[field] = value;
  }
  generator.getLight().shadowEnabled = shadowEnabled;
  // Wait for actual render completion, including asynchronous CSM depth bounds.
  for (let frame = 0; frame < 8; frame++) await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  for (const [field, value] of Object.entries(overrides)) {
    if (generator[field] !== value) throw new Error(`CSM diagnostic override was replaced: ${field}`);
  }
  const engine = scene.getEngine(), camera = scene.activeCamera;
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const splits = [...(generator._viewSpaceFrustumsZ ?? [])];
  const samples = [];
  // The existing PMX wall spans x=-126..-114, y=1..151, z=0..4500.
  // Sample its positive-X face slightly outside the surface, away from its edges.
  for (let z = 20; z <= 1800; z += 5) for (const y of [30, 50, 75, 100, 125]) {
    const world = new Vector3(-113.99, y, z);
    const screen = Vector3.Project(world, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    const depth = Vector3.TransformCoordinates(world, camera.getViewMatrix()).z;
    if (depth <= camera.minZ || depth >= camera.maxZ || screen.x < 4 || screen.y < 4
      || screen.x >= viewport.width - 4 || screen.y >= viewport.height - 4) continue;
    samples.push({ world: world.asArray(), z, height: y, x: screen.x, y: screen.y, depth,
      splitDistance: splits.length > 1 ? Math.min(...splits.slice(0, -1).map(split => Math.abs(split - depth))) : null,
      withinShadowDistance: depth < generator.shadowMaxZ });
  }
  const light = generator.getLight(), shadowMap = generator.getShadowMap();
  return { roof, baseline: baseline.settings, settings: Object.fromEntries(fields.map(field => [field, generator[field]])),
    shadowEnabled: light.shadowEnabled, lightDirection: light.direction.asArray(),
    position: camera.position.asArray(), target: camera.getTarget().asArray(), cameraRange: [camera.minZ, camera.maxZ],
    splits, lengths: [...(generator._frustumLengths ?? [])],
    mapSize: shadowMap?.getSize(), lightDepthRange: [light.shadowMinZ, light.shadowMaxZ],
    shadowMap: { textureType: shadowMap?.textureType, _textureType: generator._textureType,
      internalTextureType: shadowMap?.getInternalTexture()?.type },
    reverseDepth: engine.useReverseDepthBuffer,
    casterCount: shadowMap?.renderList?.length ?? 0,
    width: engine.getRenderWidth(), height: engine.getRenderHeight(), samples };
}

export function restoreCsmWallBandBaseline() {
  const { scene, generator, baseline } = context();
  restore(generator, baseline);
  const roof = roofs.get(scene);
  if (roof) {
    const list = generator.getShadowMap().renderList;
    const index = list.indexOf(roof);
    if (index >= 0) list.splice(index, 1);
    roof.dispose(false, true);
    roofs.delete(scene);
  }
}

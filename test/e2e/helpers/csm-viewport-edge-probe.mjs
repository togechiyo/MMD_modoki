import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";

const fixtures = new WeakMap();

/** Entirely self-authored scene: a uniformly roof-shadowed floor, with no visible distant geometry. */
export async function inspectCsmViewportEdge({ pitch = 35, shadowEnabled = true, materialPath = "standard" }) {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const generator = scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])])[0];
  if (generator?.getClassName() !== "CascadedShadowGenerator") throw new Error("CSM generator unavailable");
  if (!fixtures.has(scene)) {
    // A repository PMX is normally loaded to dismiss the no-model overlay. Keep its UI
    // presence, but exclude it and built-in scene meshes from this geometry-only fixture.
    const disabledMeshNames = scene.meshes.map(mesh => mesh.name);
    const mmdMaterial = scene.meshes.flatMap(mesh => mesh.material?.subMaterials ?? [mesh.material])
      .find(material => material && "toonTexture" in material);
    if (!mmdMaterial) throw new Error("Loaded PMX material unavailable for MMD floor comparison");
    for (const mesh of scene.meshes) mesh.setEnabled(false);
    const floor = CreateBox("csm-edge-floor", { width: 600, height: 1, depth: 600 }, scene);
    floor.position.y = -.5; floor.receiveShadows = true;
    const roof = CreateBox("csm-edge-offscreen-roof", { width: 700, height: 2, depth: 700 }, scene);
    roof.position.y = 220;
    for (const mesh of [floor, roof]) {
      const material = new StandardMaterial(`${mesh.name}-material`, scene);
      material.diffuseColor.set(.8, .8, .8); material.specularColor.set(0, 0, 0);
      material.ambientColor.set(0, 0, 0); mesh.material = material;
    }
    fixtures.set(scene, { floor, roof, disabledMeshNames, mmdMaterial, standardMaterial: floor.material });
  }
  const { floor, roof, mmdMaterial, standardMaterial } = fixtures.get(scene);
  if (!["standard", "mmd"].includes(materialPath)) throw new Error(`Unknown floor material path: ${materialPath}`);
  // Reuse the real loaded PMX material, including its installed MMD shader plugins.
  // Only its neutral surface colors/outline change; geometry and depth remain identical.
  floor.material = materialPath === "mmd" ? mmdMaterial : standardMaterial;
  floor.material.diffuseColor.set(.8, .8, .8);
  floor.material.specularColor.set(0, 0, 0); floor.material.ambientColor.set(0, 0, 0);
  if (materialPath === "mmd") floor.material.renderOutline = false;
  const radians = pitch * Math.PI / 180, distance = 154;
  window.mmdModokiE2e.setLightDirection({ x: 0, y: -1, z: 0 });
  window.mmdModokiE2e.setCameraPose({ x: 0, y: distance * Math.sin(radians), z: -distance * Math.cos(radians) },
    { x: 0, y: 0, z: 0 });
  const camera = scene.activeCamera;
  camera.fov = 30 * Math.PI / 180;
  window.mmdModokiE2e.setAutoRenderEnabled(true);
  await scene.whenReadyAsync();
  for (let frame = 0; frame < 8; frame++) await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  const casters = generator.getShadowMap().renderList;
  // Disabled meshes can still affect caster bounds if left in renderList.
  casters.splice(0, casters.length, roof);
  generator.getLight().shadowEnabled = shadowEnabled;
  // Keep the application's depth-bounds policy; do not override min/max distances.
  for (let frame = 0; frame < 12; frame++) await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  const engine = scene.getEngine();
  const width = engine.getRenderWidth(), height = engine.getRenderHeight();
  const viewport = camera.viewport.toGlobal(width, height), samples = [];
  for (let z = -250; z <= 290; z += 2) for (let x = -80; x <= 80; x += 10) {
    const world = new Vector3(x, .01, z);
    const screen = Vector3.Project(world, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    const depth = Vector3.TransformCoordinates(world, camera.getViewMatrix()).z;
    const row = screen.y / height;
    if (depth <= camera.minZ || screen.x < width * .3 || screen.x > width * .7 || row < .02 || row > .8) continue;
    samples.push({ world: world.asArray(), x: screen.x, y: screen.y, row, depth,
      region: row <= .12 ? "upper" : row >= .45 && row <= .55 ? "middle" : "other" });
  }
  return { pitch, distance, width, height, shadowEnabled: generator.getLight().shadowEnabled,
    material: { path: materialPath, name: floor.material.name, className: floor.material.getClassName(),
      constructorName: floor.material.constructor.name, mmd: "toonTexture" in floor.material },
    camera: { position: camera.position.asArray(), target: camera.getTarget().asArray(), fov: camera.fov,
      minZ: camera.minZ, maxZ: camera.maxZ },
    settings: { shadowMaxZ: generator.shadowMaxZ, autoCalcDepthBounds: generator.autoCalcDepthBounds,
      minDistance: generator.minDistance, maxDistance: generator.maxDistance,
      filter: generator.filter, frustumEdgeFalloff: generator.frustumEdgeFalloff,
      depthClamp: generator.depthClamp, numCascades: generator.numCascades },
    splits: [...(generator._viewSpaceFrustumsZ ?? [])], roofIsCaster: casters.includes(roof),
    disabledMeshNames: fixtures.get(scene).disabledMeshNames,
    reverseDepth: engine.useReverseDepthBuffer, samples };
}

import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

const fixtures = new WeakMap();
const frames = async (scene, count) => {
  for (let frame = 0; frame < count; frame++) await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
};

function context() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const generator = scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])])[0];
  if (!generator) throw new Error("Shadow generator unavailable");
  return { scene, generator };
}

/** Authored boxes only. The flat far receiver is the last visible surface, not the roof. */
export async function inspectCsmFarReceiver({ pitch = 0, shadowEnabled = true, legacyAutoBounds = false } = {}) {
  const { scene, generator } = context(), light = generator.getLight(), camera = scene.activeCamera;
  const cascaded = generator.getClassName() === "CascadedShadowGenerator";
  if (!fixtures.has(scene)) {
    const disabled = scene.meshes.map(mesh => ({ mesh, enabled: mesh.isEnabled() }));
    for (const { mesh } of disabled) mesh.setEnabled(false);
    const box = (name, dimensions, position) => {
      const mesh = CreateBox(name, dimensions, scene);
      mesh.position.copyFromFloats(...position);
      const material = new StandardMaterial(`${name}-material`, scene);
      material.diffuseColor.set(.8, .8, .8); material.specularColor.set(0, 0, 0);
      material.ambientColor.set(0, 0, 0); mesh.material = material;
      mesh.receiveShadows = true;
      return mesh;
    };
    const wall = box("far-receiver-wall", { width: 180, height: 140, depth: 2 }, [0, 20, 411]);
    // A separate near surface prevents the min>=max fallback in depth reduction.
    // Its projection lies to the left of all measured far-wall samples.
    const near = box("far-receiver-near-box", { width: 26, height: 50, depth: 2 }, [-60, 0, 160]);
    // Under direction (0,-1,1), rays from the entire wall hit this offscreen roof.
    const roof = box("far-receiver-offscreen-roof", { width: 300, height: 2, depth: 500 }, [0, 200, 150]);
    roof.receiveShadows = false;
    fixtures.set(scene, { wall, near, roof, disabled, casters: [...(generator.getShadowMap().renderList ?? [])],
      autoBounds: cascaded ? generator.autoCalcDepthBounds : null,
      lightPosition: light.position.clone(), lightFrustum: light.shadowFrustumSize,
      lightMin: light.shadowMinZ, lightMax: light.shadowMaxZ, shadowEnabled: light.shadowEnabled });
  }
  const fixture = fixtures.get(scene);
  const radians = pitch * Math.PI / 180;
  window.mmdModokiE2e.setLightDirection({ x: 0, y: -1, z: 1 });
  window.mmdModokiE2e.setCameraPose({ x: 0, y: 10, z: -40 },
    { x: 0, y: 10 + 450 * Math.tan(radians), z: 410 });
  camera.minZ = .15; camera.maxZ = 100000; camera.fov = Math.PI / 6;
  camera.getProjectionMatrix(true);
  window.mmdModokiE2e.setAutoRenderEnabled(true);
  await scene.whenReadyAsync();
  await frames(scene, 8);
  const casters = generator.getShadowMap().renderList;
  casters.splice(0, casters.length, fixture.roof);
  if (cascaded) {
    generator.autoCalcDepthBounds = legacyAutoBounds ? true : fixture.autoBounds;
    generator.splitFrustum();
  } else {
    // This control must include the distant wall. The application's ordinary
    // origin-centered fixed frustum would exclude it and invalidate the comparison.
    const direction = light.direction.normalizeToNew();
    light.position.copyFrom(new Vector3(0, 20, 410).subtract(direction.scale(500)));
    light.shadowFrustumSize = 600; light.shadowMinZ = 1; light.shadowMaxZ = 1000;
    light.forceProjectionMatrixCompute();
  }
  light.shadowEnabled = shadowEnabled;
  await frames(scene, 16);
  const engine = scene.getEngine(), width = engine.getRenderWidth(), height = engine.getRenderHeight();
  const viewport = camera.viewport.toGlobal(width, height), samples = [];
  for (let y = -30; y <= 75; y += 5) for (let x = -45; x <= 45; x += 5) {
    const world = new Vector3(x, y, 409.99);
    const screen = Vector3.Project(world, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    const depth = Vector3.TransformCoordinates(world, camera.getViewMatrix()).z;
    if (screen.x < 4 || screen.y < 4 || screen.x >= width - 4 || screen.y >= height - 4) continue;
    samples.push({ world: world.asArray(), x: screen.x, y: screen.y, depth, height: y });
  }
  return { pitch, legacyAutoBounds, width, height, samples, reverseDepth: engine.useReverseDepthBuffer,
    camera: { minZ: camera.minZ, maxZ: camera.maxZ, position: camera.position.asArray(),
      target: camera.getTarget().asArray(), projectionM10: camera.getProjectionMatrix().m[10] },
    settings: { mode: cascaded ? "cascaded" : "standard", filter: generator.filter,
      bias: generator.bias, normalBias: generator.normalBias,
      autoCalcDepthBounds: cascaded ? generator.autoCalcDepthBounds : null,
      minDistance: cascaded ? generator.minDistance : null, maxDistance: cascaded ? generator.maxDistance : null,
      shadowMaxZ: cascaded ? generator.shadowMaxZ : null },
    splits: [...(generator._viewSpaceFrustumsZ ?? [])], shadowEnabled: light.shadowEnabled,
    casterCount: casters.length, roofIsCaster: casters.includes(fixture.roof),
    light: { position: light.position.asArray(), direction: light.direction.asArray(),
      frustumSize: light.shadowFrustumSize, minZ: light.shadowMinZ, maxZ: light.shadowMaxZ } };
}

export function restoreCsmFarReceiver() {
  const { scene, generator } = context(), fixture = fixtures.get(scene);
  if (!fixture) return;
  const light = generator.getLight(), casters = generator.getShadowMap().renderList;
  casters.splice(0, casters.length, ...fixture.casters);
  if (fixture.autoBounds !== null) generator.autoCalcDepthBounds = fixture.autoBounds;
  light.position.copyFrom(fixture.lightPosition); light.shadowFrustumSize = fixture.lightFrustum;
  light.shadowMinZ = fixture.lightMin; light.shadowMaxZ = fixture.lightMax;
  light.shadowEnabled = fixture.shadowEnabled; light.forceProjectionMatrixCompute();
  for (const mesh of [fixture.wall, fixture.near, fixture.roof]) mesh.dispose(false, true);
  for (const { mesh, enabled } of fixture.disabled) mesh.setEnabled(enabled);
  fixtures.delete(scene);
}

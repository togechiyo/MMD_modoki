import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";

let fixture;

export async function waitForShadowFrames() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  await scene.whenReadyAsync();
  for (let frame = 0; frame < 4; frame++) {
    await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  }
}

// Every visible floor sample is shadowed by the wall, so a bright strip at
// a cascade split cannot be a geometry edge. Only this test scene is changed.
export async function inspectBoundary(phase = "actual") {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  const engine = scene.getEngine();
  const generator = scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])])[0];
  const light = generator.getLight();
  if (!fixture) {
    scene.meshes.filter(mesh => mesh.isEnabled()).forEach(mesh => mesh.setEnabled(false));
    const floor = CreateGround("csm-boundary-floor", { width: 400, height: 1600 }, scene);
    floor.position.z = 500;
    floor.receiveShadows = true;
    const wall = CreateBox("csm-boundary-wall", { width: 2, height: 1000, depth: 6000 }, scene);
    wall.position.set(-210, 500, 500);
    const material = new StandardMaterial("csm-boundary-neutral", scene);
    material.diffuseColor.set(0.8, 0.8, 0.8);
    material.specularColor.set(0, 0, 0);
    floor.material = wall.material = material;
    fixture = { wall, generator, falloff: generator.frustumEdgeFalloff };
  }
  if (fixture.generator !== generator) {
    fixture.generator = generator;
    fixture.falloff = generator.frustumEdgeFalloff;
  }
  generator.getShadowMap().renderList = [fixture.wall];
  light.direction.set(1, -2, 0).normalize();
  scene.activeCamera.setTarget(new Vector3(0, 0, 250));
  scene.activeCamera.setPosition(new Vector3(40, 80, -100));
  generator.frustumEdgeFalloff = phase === "legacy" ? 0.26 : fixture.falloff;
  light.shadowEnabled = phase !== "unshadowed";
  window.mmdModokiE2e.setAutoRenderEnabled(true);
  await scene.whenReadyAsync();
  // Allow depth reduction and all cascade render passes to settle.
  for (let frame = 0; frame < 12; frame++) await new Promise(resolve => requestAnimationFrame(resolve));
  const camera = scene.activeCamera;
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const samples = [];
  for (let wx = -120; wx <= 120; wx += 10) for (let z = 0; z <= 800; z += 5) {
    const world = new Vector3(wx, 0.02, z);
    const screen = Vector3.Project(world, Matrix.Identity(), scene.getTransformMatrix(), viewport);
    const view = Vector3.TransformCoordinates(world, camera.getViewMatrix());
    if (screen.x > 3 && screen.x < viewport.width - 3 && screen.y > 3 && screen.y < viewport.height - 3 && view.z < 900) {
      samples.push({ wx, z, x: screen.x, y: screen.y, depth: view.z });
    }
  }
  return {
    samples, breaks: generator._viewSpaceFrustumsZ ? [...generator._viewSpaceFrustumsZ] : [],
    filter: generator.filter, falloff: generator.frustumEdgeFalloff,
    blend: generator.cascadeBlendPercentage,
    width: engine.getRenderWidth(), height: engine.getRenderHeight(),
  };
}

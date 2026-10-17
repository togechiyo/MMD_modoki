import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";

let previousPose;
let recording;
let legacyFalloff;

function sceneContext() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  const generator = scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])])[0];
  return { scene, generator };
}

export function startTravelRecording() {
  const { scene } = sceneContext();
  const stream = scene.getEngine().getRenderingCanvas().captureStream(15);
  const mimeType = ["video/webm;codecs=vp9", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("WebM recording unavailable");
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
  const chunks = [];
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recording = { recorder, stream, chunks };
  recorder.start();
}

export async function stopTravelRecording() {
  const { recorder, stream, chunks } = recording;
  await new Promise(resolve => {
    recorder.onstop = resolve;
    recorder.stop();
  });
  stream.getTracks().forEach(track => track.stop());
  recording = null;
  return Array.from(new Uint8Array(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer()));
}

// Keep the PMX geometry/materials and application cascade settings intact.
// Only the camera moves. Legacy falloff is a test-only positive control.
export async function travelTo({ position, target, legacy = false }) {
  const { scene, generator } = sceneContext();
  if (legacy) {
    legacyFalloff ??= generator.frustumEdgeFalloff;
    generator.frustumEdgeFalloff = 0.26;
  } else if (legacyFalloff !== undefined) {
    generator.frustumEdgeFalloff = legacyFalloff;
    legacyFalloff = undefined;
  }
  const next = { position, target };
  const start = previousPose ?? next;
  window.mmdModokiE2e.setAutoRenderEnabled(true);
  for (let frame = 1; frame <= 6; frame++) {
    const lerp = key => Object.fromEntries(["x", "y", "z"].map(axis => [axis, start[key][axis] + (next[key][axis] - start[key][axis]) * frame / 6]));
    window.mmdModokiE2e.setCameraPose(lerp("position"), lerp("target"));
    await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  }
  previousPose = next;
  // A following animation frame exposes the completed render, including the
  // async depth-reduction results used by the next cascade update.
  for (let frame = 0; frame < 3; frame++) await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  const engine = scene.getEngine(), camera = scene.activeCamera;
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const project = point => Vector3.Project(point, Matrix.Identity(), scene.getTransformMatrix(), viewport);
  const samples = [];
  for (let z = 20; z <= 4460; z += 5) {
    const clear = project(new Vector3(-10, 1.015, z));
    if (clear.x < 4 || clear.y < 4 || clear.x >= viewport.width - 4 || clear.y >= viewport.height - 4) continue;
    for (const wx of [-90, -80, -70]) {
      const world = new Vector3(wx, 1.015, z);
      const screen = project(world);
      const depth = Vector3.TransformCoordinates(world, camera.getViewMatrix()).z;
      if (screen.x < 4 || screen.y < 4 || screen.x >= viewport.width - 4 || screen.y >= viewport.height - 4 || depth < camera.minZ || depth > generator.shadowMaxZ * 0.95) continue;
      samples.push({ wx, z, depth, x: screen.x, y: screen.y, clearX: clear.x, clearY: clear.y });
    }
  }
  return {
    position: camera.position.asArray(), target: camera.getTarget().asArray(),
    breaks: [...generator._viewSpaceFrustumsZ], lengths: [...generator._frustumLengths],
    falloff: generator.frustumEdgeFalloff, filter: generator.filter,
    width: engine.getRenderWidth(), height: engine.getRenderHeight(), samples,
  };
}

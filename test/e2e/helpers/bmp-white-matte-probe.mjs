import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";

export async function observe() {
  const scene = EngineStore.LastCreatedScene;
  const mesh = scene.meshes.find(mesh => mesh.skeleton && mesh.getTotalVertices() === 4);
  const material = mesh?.material?.subMaterials?.[0] ?? mesh?.material;
  const texture = material?.diffuseTexture;
  if (!texture?.isReady()) return null;
  const pixels = await texture.readPixels();
  const edge = [0, 0, 0];
  let count = 0, minAlpha = 255, maxAlpha = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    minAlpha = Math.min(minAlpha, alpha); maxAlpha = Math.max(maxAlpha, alpha);
    if (alpha < 10 || alpha > 200) continue;
    count++;
    for (let channel = 0; channel < 3; channel++) edge[channel] += pixels[i + channel];
  }
  return {
    isWebGPU: scene.getEngine().isWebGPU, webGLVersion: scene.getEngine().webGLVersion,
    raw: texture instanceof RawTexture, metadata: texture.metadata, hasAlpha: texture.hasAlpha,
    name: texture.name, minAlpha, maxAlpha, edgePixels: count, edge: edge.map(value => value / count),
  };
}

export async function frameQuad() {
  const scene = EngineStore.LastCreatedScene;
  const quad = scene.meshes.find(mesh => mesh.skeleton && mesh.getTotalVertices() === 4);
  for (const mesh of scene.meshes) if (mesh !== quad) mesh.setEnabled(false);
  scene.clearColor.set(0, 0, 0, 1);
  const camera = scene.activeCamera;
  camera.setTarget(camera.target.constructor.FromArray([0, 5, 0]));
  camera.alpha = -Math.PI / 2; camera.beta = Math.PI / 2; camera.radius = 20;
  camera.mode = 1;
  const aspect = scene.getEngine().getRenderWidth() / scene.getEngine().getRenderHeight();
  camera.orthoTop = 6; camera.orthoBottom = -6; camera.orthoLeft = -6 * aspect; camera.orthoRight = 6 * aspect;
  await scene.whenReadyAsync();
  await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
}

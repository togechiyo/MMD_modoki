import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

let disposalCount = 0;

export function watchQuadTextureDisposal() {
  const scene = EngineStore.LastCreatedScene;
  const mesh = scene.meshes.find(mesh => mesh.skeleton && mesh.getTotalVertices() === 4);
  const material = mesh.material.subMaterials?.[0] ?? mesh.material;
  disposalCount = 0;
  material.diffuseTexture.onDisposeObservable.addOnce(() => disposalCount++);
}

export function getQuadTextureDisposalCount() {
  return disposalCount;
}

export async function observe() {
  const scene = EngineStore.LastCreatedScene;
  await scene.whenReadyAsync();
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
    sampler: { wrapU: texture.wrapU, wrapV: texture.wrapV, noMipmap: texture.noMipmap,
      invertY: texture.invertY, samplingMode: texture.samplingMode },
    name: texture.name, uniqueId: texture.uniqueId, minAlpha, maxAlpha, edgePixels: count, edge: edge.map(value => value / count),
  };
}

export function tileSamplePoints() {
  const scene = EngineStore.LastCreatedScene;
  const quad = scene.meshes.find(mesh => mesh.skeleton && mesh.getTotalVertices() === 4);
  const camera = scene.activeCamera;
  const viewport = camera.viewport.toGlobal(1, 1);
  return [-4.5, 4.5].map(x => [0, 35, 58].map(radius => {
    const point = Vector3.Project(new Vector3(x, 10 + 9 * radius / 128, 0),
      quad.getWorldMatrix(), scene.getTransformMatrix(), viewport);
    return [point.x, point.y];
  }));
}

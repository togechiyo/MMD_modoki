import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";

// Read-only diagnostics for the opt-in reproduction collector.
export async function observe() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene();
  handle.dispose();
  await scene.whenReadyAsync();
  for (let i = 0; i < 4; i++) await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
  return {
    engine: scene.getEngine().isWebGPU ? "WebGPU" : "other",
    camera: { type: scene.activeCamera.getClassName(), position: scene.activeCamera.position.asArray(),
      postProcesses: scene.activeCamera._postProcesses.filter(Boolean).map(process => process.getClassName()) },
    lights: scene.lights.map(light => ({ name: light.name, direction: light.direction?.asArray(), intensity: light.intensity })),
    models: scene.meshes.filter(mesh => mesh.skeleton && mesh.getTotalVertices() > 0).map(mesh => ({
      name: mesh.name, visible: mesh.isVisible, enabled: mesh.isEnabled(), visibility: mesh.visibility,
    })),
    mirrors: scene.textures.filter(texture => texture.name === "mirroringFloorTexture").map(texture => ({
      name: texture.name, list: texture.renderList?.map(mesh => ({ name: mesh.name, visible: mesh.isVisible, enabled: mesh.isEnabled(), visibility: mesh.visibility })),
    })),
    effects: window.mmdModokiE2e.getFrameGraphPostEffectsState(),
  };
}

export async function textures() {
  await observe();
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  return Promise.all(scene.textures.filter(texture => texture.name.includes("reload-color.bmp")).map(async texture => ({
    ready: texture.isReady(), size: texture.getSize(), pixels: Array.from((await texture.readPixels()).slice(0, 16)),
  })));
}

// Observe the camera's actual rendered input texture, including replacement of
// the post-process when switching from preview to an explicitly sized export.
export async function captureWithFxaaInputSize(directory, width, height) {
  const scene = EngineStore.LastCreatedScene;
  const camera = scene.activeCamera;
  const samples = [];
  const beforeCamera = scene.onBeforeCameraRenderObservable.add(renderingCamera => {
    if (renderingCamera !== camera || camera.outputRenderTarget?.name !== "mmdModokiExportRenderSurface") return;
    const fxaa = camera._postProcesses.find(process => process?.getClassName() === "FxaaPostProcess");
    fxaa?.onApplyObservable.addOnce(() => samples.push([fxaa.inputTexture.width, fxaa.inputTexture.height]));
  });
  try {
    const png = await window.mmdModokiE2e.captureSinglePngSurfaceToPath(directory, width, height);
    return { width: png.width, height: png.height, samples };
  } finally {
    scene.onBeforeCameraRenderObservable.remove(beforeCamera);
  }
}

export async function modelToonPixels() {
  await observe();
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const textures = new Set(scene.meshes.filter(mesh => mesh.skeleton && mesh.getTotalVertices() > 0)
    .flatMap(mesh => mesh.material?.subMaterials ?? [mesh.material])
    .map(material => material?.toonTexture).filter(texture => texture?.name.includes("reload-color.bmp")));
  return Promise.all([...textures].map(async texture => [...(await texture.readPixels()).slice(0, 4)]));
}

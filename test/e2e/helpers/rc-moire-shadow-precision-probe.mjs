import { Constants } from "@babylonjs/core/Engines/constants";
// eslint-disable-next-line import/no-unresolved -- Renderer-only hook into the disposable Electron test scene.
import { MmdManager } from "/src/mmd-manager.ts";

let baseline;

function context() {
  if (baseline) return baseline;
  let manager;
  const original = MmdManager.prototype.getShadowRuntimeDiagnostics;
  MmdManager.prototype.getShadowRuntimeDiagnostics = function (...args) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- Reuse the live fixture manager for its normal PCSS toggle.
    manager = this;
    return original.apply(this, args);
  };
  try { window.mmdModokiE2e.getShadowRuntimeDiagnostics(); }
  finally { MmdManager.prototype.getShadowRuntimeDiagnostics = original; }
  const generator = manager?.shadowGenerator;
  if (generator?.getClassName() !== "CascadedShadowGenerator") throw new Error("Expected a test scene with CSM");
  baseline = { manager, type: generator._textureType, size: generator.mapSize, clamp: generator.depthClamp,
    penumbra: manager.shadowPenumbraEnabled, enabled: generator.getLight().shadowEnabled };
  return baseline;
}

export function inspectShadowPrecision() {
  const { manager } = context(), generator = manager.shadowGenerator;
  const engine = manager.scene.getEngine(), caps = engine.getCaps();
  const map = generator.getShadowMap(), internal = map.getInternalTexture();
  const gpu = internal._hardwareTexture.underlyingResource, depth = map.depthStencilTexture?._hardwareTexture?.underlyingResource;
  return { colorFormat: gpu.format, depthFormat: depth?.format ?? null, internalType: internal.type,
    maxTextureSize: caps.maxTextureSize, renderableFloat32: caps.textureFloatRender,
    deviceFloat32Filterable: engine._device.features.has("float32-filterable"), samplingMode: internal.samplingMode,
    size: [gpu.width, gpu.height], layers: gpu.depthOrArrayLayers, depthClamp: generator.depthClamp,
    casterIds: map.renderList.map(mesh => mesh.uniqueId).sort((a,b) => a-b),
    numCascades: generator.numCascades, bias: generator.bias, normalBias: generator.normalBias, shadowMaxZ: generator.shadowMaxZ,
    ...Object.fromEntries(["filter","stabilizeCascades","lambda","cascadeBlendPercentage","autoCalcDepthBounds"].map(k => [k,generator[k]])),
    penumbra: manager.shadowPenumbraEnabled, enabled: generator.getLight().shadowEnabled };
}

// The saved-project and automation control both use this public manager setter.
export function setScenePenumbra(enabled) {
  context().manager.shadowPenumbraEnabled = enabled;
}

export function inspectShadowTransforms() {
  const generator = context().manager.shadowGenerator;
  return { splits: Array.from(generator._viewSpaceFrustumsZ),
    matrices: Array.from({ length: generator.numCascades }, (_, i) => Array.from(generator.getCascadeTransformMatrix(i).m)) };
}

async function apply(type, size, clamp, penumbra, enabled) {
  const { manager } = context();
  if (manager.shadowPenumbraEnabled !== penumbra) manager.shadowPenumbraEnabled = penumbra;
  const generator = manager.shadowGenerator;
  generator.depthClamp = clamp;
  if (generator._textureType !== type || generator.mapSize !== size) {
    // Babylon 9.2's public useFloat32TextureType setter disposes the whole CSM,
    // including the caster callbacks installed by the application. Recreate only
    // its RTT with the requested color format and retain the original generator.
    const casters = [...generator.getShadowMap().renderList];
    generator._usefullFloatFirst = type === Constants.TEXTURETYPE_FLOAT;
    generator._textureType = type;
    if (generator.mapSize !== size) generator.mapSize = size;
    else generator.recreateShadowMap();
    generator.getShadowMap().renderList = casters;
  }
  generator.getLight().shadowEnabled = enabled;
  await manager.scene.whenReadyAsync();
  for (let i = 0; i < 8; i++) await new Promise(resolve => manager.scene.onAfterRenderObservable.addOnce(resolve));
  return inspectShadowPrecision();
}

export async function setShadowPrecisionVariant(variant) {
  const b = context();
  switch (variant) {
    case "clear": return apply(b.type, b.size, b.clamp, false, false);
    // Retain the original R16F 8192 control for reproducing historical comparisons.
    case "hard-baseline": return apply(Constants.TEXTURETYPE_HALF_FLOAT, 8192, false, false, true);
    case "hard-clamp-on": return apply(Constants.TEXTURETYPE_HALF_FLOAT, 8192, true, false, true);
    case "hard-float32": return apply(Constants.TEXTURETYPE_FLOAT, 8192, false, false, true);
    case "hard-float32-4096": return apply(Constants.TEXTURETYPE_FLOAT, 4096, false, false, true);
    case "hard-float32-6144": return apply(Constants.TEXTURETYPE_FLOAT, 6144, false, false, true);
    case "hard-float32-7040": return apply(Constants.TEXTURETYPE_FLOAT, 7040, false, false, true);
    case "pcss": return apply(Constants.TEXTURETYPE_HALF_FLOAT, 8192, false, true, true);
    default: throw new Error("Unknown precision variant: " + variant);
  }
}

export async function restoreShadowPrecision() {
  if (!baseline) return;
  const b = baseline;
  try { return await apply(b.type, b.size, b.clamp, b.penumbra, b.enabled); }
  finally { baseline = undefined; }
}

/** CPU render start to GPU queue completion for a static frame, without VSync. */
export async function measureShadowFrameCompletion() {
  const { manager } = context(), engine = manager.scene.getEngine();
  const loops = [...engine.activeRenderLoops], wasAuto = manager.isAutoRenderEnabled();
  const queue = engine._device.queue, samples = [];
  const warmFrames = 10, frames = 32;
  try {
    manager.setAutoRenderEnabled(false);
    engine.stopRenderLoop();
    engine.flushFramebuffer();
    await queue.onSubmittedWorkDone();
    for (let i = 0; i < warmFrames + frames; i++) {
      const start = performance.now();
      engine.beginFrame();
      try { manager.renderOnceForCapture(0); }
      finally { engine.endFrame(); }
      await queue.onSubmittedWorkDone();
      if (i >= warmFrames) samples.push(performance.now() - start);
    }
  } finally {
    manager.setAutoRenderEnabled(wasAuto);
    for (const loop of loops) if (!engine.activeRenderLoops.includes(loop)) engine.runRenderLoop(loop);
  }
  samples.sort((a,b) => a-b);
  const info = engine.getInfo(), adapter = engine._adapter?.info;
  return { renderSize: [engine.getRenderWidth(), engine.getRenderHeight()], renderer: info.renderer,
    adapter: adapter ? { vendor: adapter.vendor, architecture: adapter.architecture, device: adapter.device,
      description: adapter.description } : null, warmFrames, frames, medianMs: (samples[frames / 2 - 1] + samples[frames / 2]) / 2,
    p95Ms: samples[Math.ceil(frames * .95) - 1] };
}

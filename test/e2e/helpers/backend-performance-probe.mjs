import { EngineStore } from "@babylonjs/core/Engines/engineStore";

function sceneContext() {
  const scene = EngineStore.LastCreatedScene;
  if (!scene || scene.isDisposed) throw new Error("Backend performance probe requires a live scene");
  return { scene, engine: scene.getEngine() };
}

export async function modelResourceCounts() {
  const { scene, engine } = sceneContext();
  await scene.whenReadyAsync();
  return {
    engine: engine.isWebGPU ? "webgpu" : `webgl${engine.webGLVersion}`,
    meshes: scene.meshes.length, skeletons: scene.skeletons.length,
    materials: scene.materials.length, textures: scene.textures.length,
    panels: scene.materials.filter(material => material.name.startsWith("AutoLuminous_")).length,
    panelTextures: scene.textures.filter(texture => /panel-\d+\.png/i.test(texture.name)).length,
    panelsReady: scene.materials.filter(material => material.name.startsWith("AutoLuminous_"))
      .every(material => (material.diffuseTexture ?? material.albedoTexture)?.isReady()),
  };
}

function glRendererInfo(engine) {
  if (engine.isWebGPU) return null;
  // Read the existing context; do not request a second canvas context.
  const gl = engine._gl;
  if (!gl) return null;
  try {
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      unmaskedVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
    };
  } catch {
    // Optional hardware diagnostics may be unavailable for a restricted context.
    return null;
  }
}

function geometryCounts(meshes) {
  const materials = new Set(meshes.flatMap(mesh =>
    mesh.subMeshes?.length ? mesh.subMeshes.map(subMesh => subMesh.getMaterial()) : [mesh.material]
  ).filter(Boolean));
  return {
    meshes: meshes.length,
    vertices: meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
    triangles: meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0),
    materials: materials.size,
    subMeshes: meshes.reduce((sum, mesh) => sum + (mesh.subMeshes?.length ?? 0), 0),
  };
}

function sceneColorSize(scene) {
  const target = scene.textures.find(texture => texture.name === "frameGraphPostEffectsSceneColor");
  const size = target?.getSize();
  return size ? [size.width, size.height] : null;
}

/** Resize through the normal window handler so FrameGraph targets follow the canvas. */
export async function prepareBackendProbe({ width = 1920, height = 1080 } = {}) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0)) {
    throw new Error("Backend performance dimensions must be positive integers");
  }
  const { scene, engine } = sceneContext();
  const canvas = engine.getRenderingCanvas();
  if (!canvas || canvas.id !== "render-canvas") throw new Error("Backend probe requires the editor rendering canvas");
  const getBackendState = window.mmdModokiE2e?.getFrameGraphPostEffectsState;
  if (!getBackendState) throw new Error("Backend probe requires the FrameGraph E2E state hook");
  const hardwareScalingLevel = engine.getHardwareScalingLevel();
  // Keep this rule for the lifetime of the isolated benchmark app. Layout updates
  // write inline dimensions; a stylesheet !important keeps the test size stable.
  // The canvas may be clipped by the UI, but the render targets use the full size.
  let style = document.getElementById("backend-performance-canvas-size");
  if (!style) {
    style = document.createElement("style");
    style.id = "backend-performance-canvas-size";
    document.head.append(style);
  }
  style.textContent = `#render-canvas { width: ${width * hardwareScalingLevel}px !important; height: ${height * hardwareScalingLevel}px !important; max-width: none !important; max-height: none !important; }`;
  // Calling engine.setSize directly would bypass the manager's depth/FrameGraph
  // target rebuild and could silently measure a smaller scene-color texture.
  window.dispatchEvent(new Event("resize"));
  const deadline = performance.now() + 30000;
  let resizeReady = false;
  let frameGraph;
  let sceneColor;
  let cameraFxaaRenderSize;
  while (performance.now() < deadline) {
    frameGraph = getBackendState();
    sceneColor = sceneColorSize(scene);
    const cameraFxaa = scene.activeCamera?._postProcesses.find(pass => pass?.name === "finalFxaa");
    cameraFxaaRenderSize = cameraFxaa ? [cameraFxaa.width, cameraFxaa.height] : null;
    const engineMatches = engine.getRenderWidth() === width && engine.getRenderHeight() === height;
    const targetRequired = frameGraph.backend === "frameGraph" && frameGraph.resourcesAllocated;
    const targetMatches = !targetRequired || (sceneColor?.[0] === width && sceneColor?.[1] === height);
    const fxaaMatches = !cameraFxaa || (cameraFxaa.width === width && cameraFxaa.height === height);
    if (engineMatches && targetMatches && fxaaMatches && frameGraph.ready) {
      resizeReady = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!resizeReady) {
    throw new Error(`Backend resize did not become ready: ${JSON.stringify({
      requested: [width, height], engine: [engine.getRenderWidth(), engine.getRenderHeight()],
      sceneColor, cameraFxaaRenderSize, backend: frameGraph?.backend, ready: frameGraph?.ready,
    })}`);
  }
  const meshes = scene.meshes.filter(mesh => mesh.getTotalIndices() > 0);
  const visibleMeshes = meshes.filter(mesh => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0);
  const generators = [...new Set(scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])]))];
  return {
    engine: engine.isWebGPU ? "WebGPU" : `WebGL${engine.webGLVersion ?? ""}`,
    engineClass: engine.getClassName(),
    isWebGPU: engine.isWebGPU === true,
    adapter: engine.getInfo(),
    glRenderer: glRendererInfo(engine),
    requestedRenderSize: [width, height],
    renderSize: [engine.getRenderWidth(), engine.getRenderHeight()],
    sceneColorRenderSize: sceneColor,
    cameraFxaaRenderSize,
    canvasClientSize: [canvas.clientWidth, canvas.clientHeight],
    hardwareScalingLevel,
    frameGraph: { backend: frameGraph.backend, ready: frameGraph.ready, buildGeneration: frameGraph.buildGeneration },
    devicePixelRatio: window.devicePixelRatio,
    geometry: geometryCounts(meshes),
    // Enabled/visible geometry is not necessarily within the camera frustum.
    visibleGeometry: geometryCounts(visibleMeshes),
    shadowsEnabled: scene.shadowsEnabled,
    shadows: generators.map(shadow => ({
      type: shadow.getClassName(),
      cascades: shadow.numCascades ?? 1,
      size: shadow.getShadowMap()?.getSize() ?? null,
      refreshRate: shadow.getShadowMap()?.refreshRate ?? null,
      filter: shadow.filter,
      bias: shadow.bias,
      normalBias: shadow.normalBias,
      shadowMaxZ: shadow.shadowMaxZ ?? null,
      renderListMeshes: shadow.getShadowMap()?.renderList?.length ?? 0,
    })),
    camera: scene.activeCamera ? {
      position: scene.activeCamera.position.asArray(),
      target: scene.activeCamera.getTarget?.().asArray() ?? null,
    } : null,
  };
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    samples: sorted.length,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1),
  };
}

/**
 * Observe ordinary playback; the caller starts it through the normal GUI.
 * beginFrame -> endFrame is wall time spent submitting a frame, not GPU time.
 * Frame intervals include presentation pacing; no screenshots/readback occur here.
 */
export async function measureBackendPlayback({ warmFrames = 60, frames = 180 } = {}) {
  if (!Number.isInteger(warmFrames) || warmFrames < 0 || !Number.isInteger(frames) || frames < 2) {
    throw new Error("Backend performance measurement requires warmFrames >= 0 and frames >= 2");
  }
  const { scene, engine } = sceneContext();
  const frameInput = document.querySelector("#current-frame");
  const readTimelineFrame = () => {
    const value = frameInput?.value;
    return value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
  };
  const intervals = [], cpuSubmission = [];
  const renderSizeBefore = [engine.getRenderWidth(), engine.getRenderHeight()];
  let beganAt, didRender = false, renderedFrames = 0, ignoredEngineFrames = 0;
  let firstBegin, previousBegin, lastEnd, timelineFirst, timelineLast;
  let beginObserver, renderObserver, endObserver, timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(
        `Backend playback probe timed out after 60000 ms (${renderedFrames}/${warmFrames + frames} rendered frames)`
      )), 60000);
      beginObserver = engine.onBeginFrameObservable.add(() => {
        beganAt = performance.now();
        didRender = false;
      });
      // The engine also begins/ends frames when the app's FPS cap skips rendering.
      // Count only frames that actually rendered this scene, without replacing its loop.
      renderObserver = scene.onAfterRenderObservable.add(() => { didRender = true; });
      endObserver = engine.onEndFrameObservable.add(() => {
        const endedAt = performance.now();
        if (!didRender || beganAt === undefined) { ignoredEngineFrames++; return; }
        renderedFrames++;
        if (renderedFrames <= warmFrames) return;
        if (firstBegin === undefined) {
          firstBegin = beganAt;
          timelineFirst = readTimelineFrame();
        }
        if (previousBegin !== undefined) intervals.push(beganAt - previousBegin);
        previousBegin = beganAt;
        lastEnd = endedAt;
        cpuSubmission.push(endedAt - beganAt);
        if (cpuSubmission.length === frames) {
          timelineLast = readTimelineFrame();
          resolve();
        }
      });
    });
  } finally {
    clearTimeout(timer);
    if (beginObserver) engine.onBeginFrameObservable.remove(beginObserver);
    if (renderObserver) scene.onAfterRenderObservable.remove(renderObserver);
    if (endObserver) engine.onEndFrameObservable.remove(endObserver);
  }
  const intervalElapsedMs = previousBegin - firstBegin;
  return {
    warmFrames,
    frames,
    renderedFrames,
    ignoredEngineFrames,
    elapsedMs: lastEnd - firstBegin,
    intervalElapsedMs,
    fps: intervals.length * 1000 / intervalElapsedMs,
    intervalMs: summarize(intervals),
    cpuSubmissionMs: summarize(cpuSubmission),
    timeline: { first: timelineFirst, last: timelineLast },
    renderSizeBefore,
    renderSizeAfter: [engine.getRenderWidth(), engine.getRenderHeight()],
  };
}

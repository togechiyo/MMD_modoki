import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";

function sceneContext() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose(); return scene;
}

export function capacityState() {
  const scene = sceneContext(), engine = scene.getEngine();
  const shadow = scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])])[0];
  const meshes = [...new Set(shadow?.getShadowMap()?.renderList ?? [])].filter(mesh => mesh.getTotalIndices() > 0);
  return { engine: engine.isWebGPU ? "WebGPU" : engine.getClassName(), adapter: engine.getInfo(),
    width: engine.getRenderWidth(), height: engine.getRenderHeight(),
    meshes: meshes.map(mesh => ({ name: mesh.name, vertices: mesh.getTotalVertices(), triangles: mesh.getTotalIndices() / 3,
      subMeshes: mesh.subMeshes?.length, visible: mesh.isVisible && mesh.isEnabled(), receiveShadows: mesh.receiveShadows,
      vertexBuffers: Object.keys(mesh.geometry?.getVertexBuffers() ?? {}) })),
    shadow: { type: shadow?.getClassName(), cascades: shadow?.numCascades ?? 1,
      size: shadow?.getShadowMap()?.getSize(), refreshRate: shadow?.getShadowMap()?.refreshRate,
      maxZ: shadow?.shadowMaxZ, filter: shadow?.filter },
    postProcesses: scene.activeCamera?._postProcesses.filter(Boolean).map(p => p.name),
    effectLayers: scene.effectLayers?.map(layer => ({ name: layer.name, enabled: layer.isEnabled })),
    heap: performance.memory ? { used: performance.memory.usedJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null };
}

export function setCapacityRenderSize({ width, height }) {
  sceneContext().getEngine().setSize(width, height, true);
}

export function setCapacityShadowEnabled(enabled) {
  sceneContext().shadowsEnabled = enabled;
}

export async function profileCapacity({ seconds = 10, moving = false } = {}) {
  const scene = sceneContext(), engine = scene.getEngine();
  const instrumentation = new SceneInstrumentation(scene);
  instrumentation.captureFrameTime = true;
  instrumentation.captureRenderTime = true;
  const intervals = [], cpuRender = [], drawCalls = [], passTriangles = [], visibleStageTriangles = [];
  const stageMeshes = [...new Set(scene.lights.flatMap(light => [...(light.getShadowGenerators()?.values() ?? [])])
    [0]?.getShadowMap()?.renderList ?? [])];
  let before, previous, first, frames = 0;
  const startObserver = scene.onBeforeRenderObservable.add(() => {
    before = performance.now();
    if (moving) {
      const angle = (before - (first ?? before)) / 1000 * 0.16;
      window.mmdModokiE2e.setCameraPose({ x: Math.sin(angle) * 2000, y: 1500, z: -Math.cos(angle) * 2100 }, { x: 0, y: 80, z: 0 });
    }
  });
  await new Promise(resolve => {
    const observer = scene.onAfterRenderObservable.add(() => {
      const now = performance.now(); first ??= now;
      if (previous !== undefined) intervals.push(now - previous);
      previous = now; frames++;
      cpuRender.push(now - before);
      drawCalls.push(instrumentation.drawCallsCounter.current);
      passTriangles.push(scene.getActiveIndices() / 3);
      const active = new Set(scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length));
      visibleStageTriangles.push(stageMeshes.filter(mesh => active.has(mesh)).reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0));
      if (now - first >= seconds * 1000) { scene.onAfterRenderObservable.remove(observer); resolve(); }
    });
  });
  scene.onBeforeRenderObservable.remove(startObserver); instrumentation.dispose();
  const stats = list => {
    const sorted = [...list].sort((a, b) => a - b), average = list.reduce((a, b) => a + b, 0) / list.length;
    return { average, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) };
  };
  return { frames, seconds: (previous - first) / 1000, fps: intervals.length * 1000 / (previous - first),
    intervalMs: stats(intervals), cpuSubmissionMs: stats(cpuRender), drawCalls: stats(drawCalls),
    submittedPassTriangles: stats(passTriangles), visibleStageTriangles: stats(visibleStageTriangles),
    renderSize: [engine.getRenderWidth(), engine.getRenderHeight()] };
}

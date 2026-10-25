import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { LuminousRadianceScene } from "/src/render/luminous-radiance-scene.ts";

function scene() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const current = texture.getScene(); texture.dispose(); return current;
}

export function luminousStageState() {
  const current = scene(), engine = current.getEngine();
  const meshes = current.meshes.filter(mesh => mesh.getTotalIndices() > 0 && mesh.material
    && (mesh.material.name.startsWith("AutoLuminous_") || mesh.material.getClassName() === "MultiMaterial"
      || ["床", "壁と庇", "曲面受け手", "格子", "可動遮蔽板"].includes(mesh.material.name)));
  const materials = [...new Set(meshes.flatMap(mesh => mesh.subMeshes.map(sub => sub.getMaterial())))].filter(Boolean);
  return { engine: engine.isWebGPU ? "WebGPU" : engine.getClassName(), adapter: engine.getInfo(), renderSize: [engine.getRenderWidth(), engine.getRenderHeight()],
    triangles: meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0), meshes: meshes.length,
    materials: materials.map(value => ({ name: value.name, textureReady: value.diffuseTexture?.isReady() ?? null,
      hasTexture: Boolean(value.diffuseTexture), alpha: value.alpha })),
    camera: { position: current.activeCamera.position.asArray(), target: current.activeCamera.getTarget().asArray() } };
}

// Presentation intervals and CPU preparation, without screenshots/readback in the measured window.
// Each mode runs in a fresh Electron process; this helper never replaces the loaded PMX geometry.
export async function profileLuminousStage({ frames = 60, moving = false, changingEmission = false } = {}) {
  const current = scene(), intervals = [], prepare = [], updatedPrepare = [], updates = [];
  const morph = changingEmission ? document.querySelector('#morph-controls [data-morph-name="LightUp"]')
    ?.closest(".morph-slider-row")?.querySelector('input[type="range"]') : null;
  if (changingEmission && !morph) throw new Error("LightUp GUI control is required for emission profiling");
  const originalWeight = morph?.value;
  const update = LuminousRadianceScene.prototype.update;
  LuminousRadianceScene.prototype.update = function (...args) {
    const start = performance.now(), before = this.updates;
    try { return update.apply(this, args); }
    finally {
      const duration = performance.now() - start;
      prepare.push(duration); updates.push(this.updates - before);
      if (this.updates > before) updatedPrepare.push(duration);
    }
  };
  let observer, index = 0;
  if (moving || changingEmission) observer = current.onBeforeRenderObservable.add(() => {
    const angle = ++index * 0.006;
    if (moving) window.mmdModokiE2e.setCameraPose({ x: 55 + Math.sin(angle) * 4, y: 48, z: -78 }, { x: 0, y: 5, z: 0 });
    // Distinct hundredths survive the GUI's weight rounding on every input frame.
    if (morph) { morph.value = (0.1 + index % 20 * 0.03).toFixed(2); morph.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  try {
    let previous = await new Promise(resolve => requestAnimationFrame(resolve));
    for (let i = 0; i < frames; i++) {
      const now = await new Promise(resolve => requestAnimationFrame(resolve));
      intervals.push(now - previous); previous = now;
    }
    const stats = values => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted.at(-1) };
    };
    return { frames, moving, changingEmission, intervalMs: stats(intervals), cpuPrepareMs: stats(prepare),
      cpuChangedPrepareMs: stats(updatedPrepare), emissionInputFrames: morph ? index : 0,
      geometryUpdates: updates.reduce((sum, value) => sum + value, 0), gpuTimestampMs: null };
  } finally {
    LuminousRadianceScene.prototype.update = update;
    if (observer) current.onBeforeRenderObservable.remove(observer);
    if (morph) { morph.value = originalWeight; morph.dispatchEvent(new Event("input", { bubbles: true })); }
  }
}

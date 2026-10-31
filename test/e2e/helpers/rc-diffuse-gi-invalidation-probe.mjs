// Browser test modules are served by Vite from this repository path.
// eslint-disable-next-line import/no-unresolved
import { MmdManager } from "/src/mmd-manager.ts";

let manager = null, fixture = null, wasAuto = false;
const settingsGetter = MmdManager.prototype.getRcDiffuseGiSettings;
const skySettingsGetter = MmdManager.prototype.getRcSkyOcclusionSettings;
function captureManager(instance) { manager = instance; }
MmdManager.prototype.getRcDiffuseGiSettings = function (...args) {
  captureManager(this); return settingsGetter.apply(this, args);
};
MmdManager.prototype.getRcSkyOcclusionSettings = function (...args) {
  captureManager(this); return skySettingsGetter.apply(this, args);
};

function context(kind = "gi") {
  const controller = kind === "gi" ? manager?.rcDiffuseGiController : manager?.rcSkyOcclusionController, field = controller?.field;
  if (!manager || !field) throw new Error(`Open the ${kind} card and await readiness before the invalidation probe`);
  return { controller, field, source: field.source, scene: manager.scene, engine: manager.engine };
}

function settings(kind) { return kind === "gi" ? manager.getRcDiffuseGiSettings() : manager.getRcSkyOcclusionSettings(); }
function setSettings(kind, update) {
  if (kind === "gi") manager.setRcDiffuseGiSettings(update); else manager.setRcSkyOcclusionSettings(update);
}

function revision(source) {
  return { source: source.revision, geometry: source.geometryRevision, triangles: source.bvh.triangleCount };
}

async function textureSummary(texture) {
  const pixels = await texture.readPixels();
  if (!pixels) throw new Error(`Cannot read ${texture.name}`);
  const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  let hash = 2166136261;
  for (const value of bytes) hash = Math.imul(hash ^ value, 16777619) >>> 0;
  return { hash, length: pixels.length, finite: Array.from(pixels).every(Number.isFinite) };
}

async function prepareInvalidationProbe(kind) {
  const { scene, engine, controller } = context(kind);
  wasAuto = manager.isAutoRenderEnabled(); manager.setAutoRenderEnabled(false);
  const material = scene.materials.find(value => value.name === "GI Source");
  const mesh = kind === "gi" ? scene.meshes.find(value => value.subMeshes?.some(sub => sub.getMaterial() === material)) : controller.receivers()[0];
  const light = kind === "gi" ? controller.mainLight() : null;
  if (!mesh || kind === "gi" && (!material || !light)) throw new Error(`Original ${kind} fixture source/light is missing`);
  fixture = { kind, material, mesh, light, intensity: light?.intensity, strength: settings(kind).strength, minimum: settings(kind).minimum };
  if (!await manager.waitForPostEffectBackendReadyForCapture()) throw new Error("RC capture preparation failed");
  engine.beginFrame(); manager.renderOnceForCapture(0); engine.endFrame();
  await engine._device.queue.onSubmittedWorkDone();
  return { revisions: revision(context(kind).source), diagnostics: controller.diagnostics };
}

export const prepareGiInvalidationProbe = () => prepareInvalidationProbe("gi");
export const prepareSkyInvalidationProbe = () => prepareInvalidationProbe("sky");

/** Diagnostic changes happen after pose evaluation but before the ordinary lighting prepare hook. */
async function measureInvalidation(kind, action) {
  const { engine, scene, controller, field, source } = context(kind);
  if (!fixture) throw new Error("Prepare the invalidation fixture first");
  if (fixture.kind !== kind) throw new Error("The invalidation fixture belongs to another lighting effect");
  const before = revision(source), dispatches = {}, restores = [];
  let sourceCalls = 0;
  for (const task of field.graph.tasks) {
    const shader = task.computeShader;
    if (!shader) continue;
    const dispatch = shader.dispatch;
    shader.dispatch = function (...args) {
      dispatches[task.name] = (dispatches[task.name] ?? 0) + 1;
      return dispatch.apply(this, args);
    };
    restores.push(() => { shader.dispatch = dispatch; });
  }
  const update = source.update;
  source.update = function (...args) { sourceCalls++; return update.apply(this, args); };
  restores.push(() => { source.update = update; });
  const mutation = scene.onBeforeRenderObservable.addOnce(() => {
    switch (action) {
      case "idle": break;
      case "light": fixture.light.direction.z += 0.5; break;
      case "color": fixture.material.diffuseColor.r = 0.35; break;
      case "geometry": fixture.mesh.position.x += 0.25; break;
      case "dark": fixture.light.intensity = 0; break;
      case "light-restored": fixture.light.intensity = fixture.intensity; break;
      case "volume": {
        const volume = settings(kind).volume;
        setSettings(kind, { volume: { min: volume.min.map(value => value - 0.25), size: volume.size + 0.5 } });
        break;
      }
      case "zero-strength": setSettings(kind, { strength: 0 }); break;
      case "strength-restored": setSettings(kind, { strength: fixture.strength }); break;
      case "neutral-minimum": setSettings(kind, { minimum: 1 }); break;
      case "minimum-restored": setSettings(kind, { minimum: fixture.minimum }); break;
      default: throw new Error(`Unknown RC invalidation action: ${action}`);
    }
  });
  try {
    engine.beginFrame(); manager.renderOnceForCapture(0); engine.endFrame();
    await engine._device.queue.onSubmittedWorkDone();
  } finally {
    scene.onBeforeRenderObservable.remove(mutation);
    for (const restore of restores.reverse()) restore();
  }
  return { action, before, after: revision(source), sourceCalls, dispatches,
    diagnostics: controller.diagnostics, nearest: await textureSummary(field.nearestSurfaceField),
    irradiance: await textureSummary(field.irradianceField), validation: window.mmdModokiE2e.getWebGpuValidationDiagnostics() };
}

export const measureGiInvalidation = action => measureInvalidation("gi", action);
export const measureSkyInvalidation = action => measureInvalidation("sky", action);

export function disposeGiInvalidationProbe() {
  if (manager) manager.setAutoRenderEnabled(wasAuto);
  MmdManager.prototype.getRcDiffuseGiSettings = settingsGetter;
  MmdManager.prototype.getRcSkyOcclusionSettings = skySettingsGetter;
  manager = null; fixture = null;
}

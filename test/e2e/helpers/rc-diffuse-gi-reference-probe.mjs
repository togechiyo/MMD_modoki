// eslint-disable-next-line import/no-unresolved -- Resolved by the test application's Vite server.
import { MmdManager } from "/src/mmd-manager.ts";

// Test-only observation. Chain with the performance probe instead of replacing it.
let manager = null;
const previousGetter = MmdManager.prototype.getRcDiffuseGiSettings;
function captureManager(...args) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Observe the existing manager without constructing another runtime.
  manager = this;
  return previousGetter.apply(this, args);
}
MmdManager.prototype.getRcDiffuseGiSettings = captureManager;

function context() {
  if (!manager) throw new Error("Open GI settings after importing the reference probe");
  return { manager, scene: manager.scene, controller: manager.rcDiffuseGiController,
    field: manager.rcDiffuseGiController?.field ?? null };
}

function safeTextureName(texture) {
  const name = String(texture?.name ?? texture?.url ?? "");
  if (/^(data|blob):/i.test(name)) return `${name.split(":", 1)[0]}:[omitted]`;
  return name;
}

function textureInfo(texture) {
  if (!texture) return null;
  const name = safeTextureName(texture), path = name.split(/[?#]/, 1)[0];
  return { name, extension: /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? null,
    ready: texture.isReady?.() ?? null, size: texture.getSize?.() ?? null,
    hasAlpha: texture.hasAlpha, level: texture.level, gammaSpace: texture.gammaSpace };
}

function inputState(field) {
  const source = field?.source;
  if (!source) return null;
  const entries = [...(source.textures?.entries?.entries?.() ?? [])];
  const chunks = source.chunks ?? [];
  return { ready: source.ready, error: source.error, revision: source.revision, updates: source.updates,
    triangleCount: source.bvh.triangleCount, nodeCount: source.bvh.nodes.length / 12,
    reflectanceInputTriangles: source.emitterTriangles,
    reflectanceInputNote: "Input obtained; includes black material RGB and does not prove nonzero reflected light",
    snapshotMeshes: chunks.length, snapshots: chunks.map(chunk => ({ meshId: chunk.key.uniqueId,
      mesh: chunk.key.name, triangles: chunk.triangles.length / 24, reflectanceInputTriangles: chunk.emitters })),
    textures: { count: entries.length, ready: entries.filter(([, entry]) => entry.ready).length,
      failed: entries.filter(([, entry]) => entry.failed).length,
      pending: entries.filter(([, entry]) => !entry.ready && !entry.failed).length,
      revision: source.emissionTextureRevision, pixelBytes: source.textures?.pixels?.byteLength ?? 0,
      entries: entries.map(([texture, entry]) => ({ ...textureInfo(texture), slot: entry.index,
        cached: entry.ready, failed: entry.failed })) } };
}

export function readReferenceState() {
  const { manager, scene, controller, field } = context();
  const light = manager.dirLight;
  return { sceneFrameId: scene.getFrameId(), diagnostics: controller?.diagnostics ?? null,
    settings: manager.getRcDiffuseGiSettings(), sourceRevision: field?.source.revision ?? null,
    sourceUpdates: field?.source.updates ?? null, sourceReady: field?.source.ready ?? null,
    sourceError: field?.source.error ?? null, fieldRevision: controller?.fieldRevision ?? null,
    viewPresent: Boolean(controller?.view), volume: controller?.diagnostics.volume ?? null,
    light: light ? { enabled: light.isEnabled(), direction: light.direction.asArray(),
      diffuse: light.diffuse.asArray(), scaledIntensity: light.getScaledIntensity() } : null };
}

function authoredMeshes() {
  const { manager } = context();
  const models = (manager.sceneModels ?? []).flatMap(entry => entry.mesh
    ? [entry.mesh, ...entry.mesh.getChildMeshes()] : []);
  return [...new Set([...models, ...(manager.getAccessoryMeshes?.() ?? [])])]
    .filter(mesh => typeof mesh.getVerticesData === "function");
}

function emptyBounds() { return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; }
function finishBounds(bounds) {
  if (![...bounds.min, ...bounds.max].every(Number.isFinite)) return null;
  return { min: bounds.min, max: bounds.max,
    center: bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2),
    spans: bounds.min.map((value, axis) => bounds.max[axis] - value) };
}

function geometryOverview() {
  const meshes = authoredMeshes(), full = emptyBounds(), receivers = emptyBounds();
  const { manager } = context();
  const inputs = meshes.map(mesh => ({ mesh, positions: mesh.getVerticesData("position") }));
  const totalVertices = inputs.reduce((sum, input) => sum + Math.floor((input.positions?.length ?? 0) / 3), 0);
  const stride = Math.max(1, Math.ceil(totalVertices / 20000)), samples = [[], [], []], details = [];
  let cursor = 0;
  for (const { mesh, positions } of inputs) {
    const bounds = emptyBounds(), world = mesh.computeWorldMatrix(true).m;
    const receiver = (mesh.subMeshes ?? []).some(sub => {
      const material = sub.getMaterial(); return material && manager.acceptsRcDiffuseGiMaterial(material);
    });
    for (let offset = 0; positions && offset + 2 < positions.length; offset += 3, cursor++) {
      const x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
      const point = [x * world[0] + y * world[4] + z * world[8] + world[12],
        x * world[1] + y * world[5] + z * world[9] + world[13],
        x * world[2] + y * world[6] + z * world[10] + world[14]];
      if (!point.every(Number.isFinite)) continue;
      for (let axis = 0; axis < 3; axis++) {
        bounds.min[axis] = Math.min(bounds.min[axis], point[axis]); bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
        full.min[axis] = Math.min(full.min[axis], point[axis]); full.max[axis] = Math.max(full.max[axis], point[axis]);
        if (receiver) {
          receivers.min[axis] = Math.min(receivers.min[axis], point[axis]); receivers.max[axis] = Math.max(receivers.max[axis], point[axis]);
        }
        if (cursor % stride === 0) samples[axis].push(point[axis]);
      }
    }
    details.push({ mesh, bounds: finishBounds(bounds) });
  }
  const quantile = samples[0].length ? { min: [], max: [] } : null;
  if (quantile) for (let axis = 0; axis < 3; axis++) {
    samples[axis].sort((a, b) => a - b);
    quantile.min[axis] = samples[axis][Math.floor((samples[axis].length - 1) * 0.05)];
    quantile.max[axis] = samples[axis][Math.floor((samples[axis].length - 1) * 0.95)];
  }
  const framingBounds = quantile && finishBounds(quantile);
  return { full: finishBounds(full), receiverMeshBounds: finishBounds(receivers), quantile: framingBounds,
    framing: framingBounds ? { center: framingBounds.center, size: Math.max(1, ...framingBounds.spans) * 1.2 } : null,
    sampledVertices: samples[0].length, totalVertices, details,
    interpretation: "Raw mesh positions with current world transform; quantiles are camera-only. Actual GI fit uses accepted submesh indices and current CPU-deformed pose." };
}

export function getReferenceCameraBounds() {
  const { details, ...bounds } = geometryOverview();
  return { ...bounds, meshCount: details.length };
}

export function inspectReferenceScene() {
  const { manager, controller, field } = context(), geometry = geometryOverview();
  const materials = new Map();
  const meshes = geometry.details.map(({ mesh, bounds }) => {
    const surfaces = (mesh.subMeshes ?? []).map(sub => {
      const material = sub.getMaterial();
      if (material && !materials.has(material.uniqueId)) {
        materials.set(material.uniqueId, { id: material.uniqueId, name: material.name, className: material.getClassName(),
          preset: manager.materialShaderPresetByMaterial.get(material) ?? null,
          acceptedReceiver: manager.acceptsRcDiffuseGiMaterial(material), acceptedSource: manager.acceptsRcDiffuseGiMaterial(material, true),
          alpha: material.alpha, alphaTesting: material.needAlphaTesting(), alphaBlending: material.needAlphaBlending(),
          disableLighting: material.disableLighting, diffuse: material.diffuseColor?.asArray?.() ?? null,
          ambient: material.ambientColor?.asArray?.() ?? null, applyAmbientColorToDiffuse: material.applyAmbientColorToDiffuse,
          diffuseTexture: textureInfo(material.diffuseTexture) });
      }
      return { materialId: material?.uniqueId ?? null, indexStart: sub.indexStart, indexCount: sub.indexCount,
        receiver: Boolean(material && manager.acceptsRcDiffuseGiMaterial(material)),
        source: Boolean(material && manager.acceptsRcDiffuseGiMaterial(material, true)) };
    });
    return { id: mesh.uniqueId, name: mesh.name, className: mesh.getClassName(), enabled: mesh.isEnabled(),
      isVisible: mesh.isVisible, visibility: mesh.visibility, vertices: mesh.getTotalVertices(), indices: mesh.getIndices()?.length ?? 0,
      vertexColors: Boolean(mesh.useVertexColors && mesh.isVerticesDataPresent("color")),
      geometryId: mesh.geometry?.uniqueId ?? null, bounds, surfaces };
  });
  return { state: readReferenceState(), autoVolume: controller?.fitVolume() ?? null,
    geometryBounds: geometry.full, receiverBounds: geometry.receiverMeshBounds,
    quantileBounds: geometry.quantile, framing: geometry.framing, sampledVertices: geometry.sampledVertices,
    geometryInterpretation: geometry.interpretation, meshes, materials: [...materials.values()], sourceInputs: inputState(field) };
}

function triangleSummary(source) {
  const data = source.bvh.triangles, count = source.bvh.triangleCount;
  const sum = [0, 0, 0], max = [0, 0, 0]; let nonzero = 0, invalid = 0, noTexture = 0, pendingTexture = 0;
  const textureSlots = new Set();
  for (let i = 0; i < count; i++) {
    const offset = i * 24, rgb = [data[offset + 12], data[offset + 13], data[offset + 14]];
    if (!rgb.every(Number.isFinite)) { invalid++; continue; }
    if (rgb.some(value => value > 0)) nonzero++;
    for (let axis = 0; axis < 3; axis++) { sum[axis] += rgb[axis]; max[axis] = Math.max(max[axis], rgb[axis]); }
    const slot = data[offset + 22];
    if (slot < -1.5) pendingTexture++; else if (slot < 0) noTexture++; else textureSlots.add(slot);
  }
  return { count, nonzeroRGB: nonzero, invalidRGB: invalid, meanRGB: sum.map(value => value / Math.max(1, count)), maxRGB: max,
    noTexture, pendingTexture, distinctTextureSlots: textureSlots.size,
    interpretation: "Packed material RGB before texture multiplication or direct-light/shadow evaluation; unweighted by triangle area" };
}

function colorSummary(pixels, predicate, width, lobe = null) {
  const sum = [0, 0, 0], max = [0, 0, 0]; let count = 0, valid = 0, nonzero = 0, invalidRGB = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (lobe !== null && Math.floor(((offset / 4) % width) / 16) !== lobe) continue;
    count++;
    const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    if (!rgb.every(Number.isFinite)) { invalidRGB++; continue; }
    if (!predicate(pixels[offset + 3])) continue;
    valid++; if (rgb.some(value => value > 1e-8)) nonzero++;
    for (let axis = 0; axis < 3; axis++) { sum[axis] += rgb[axis]; max[axis] = Math.max(max[axis], rgb[axis]); }
  }
  return { count, valid, invalid: count - valid, invalidRGB, nonzero, nonzeroFraction: nonzero / Math.max(1, valid),
    meanRGB: sum.map(value => value / Math.max(1, valid)), maxRGB: max };
}

async function readColorTexture(texture, integrated = false) {
  if (!texture) return null;
  const pixels = await texture.readPixels();
  if (!(pixels instanceof Float32Array)) throw new Error(`Expected converted Float32Array from ${texture.name}, received ${pixels?.constructor?.name}`);
  const size = texture.getSize(), predicate = integrated ? alpha => alpha > 0.5 : alpha => alpha >= 0 && alpha <= 1;
  const result = { name: texture.name, size, format: pixels.constructor.name, ...colorSummary(pixels, predicate, size.width) };
  if (integrated) result.lobes = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"].map((axis, i) => ({ axis, ...colorSummary(pixels, predicate, size.width, i) }));
  return result;
}

export async function inspectReferenceField() {
  const { field } = context(), before = readReferenceState();
  if (!field) return { before, field: null };
  // Readbacks are intentionally outside timed windows and can flush GPU submissions.
  const base = await readColorTexture(field.baseField), irradiance = await readColorTexture(field.irradianceField, true);
  const surface = await field.nearestSurfaceField.readPixels();
  if (!(surface instanceof Float32Array)) throw new Error("Expected Float32Array nearest-surface readback");
  let valid = 0, empty = 0, one = 0, two = 0, outOfRange = 0;
  const ids = new Set(), count = field.source.bvh.triangleCount;
  for (let offset = 0; offset < surface.length; offset += 4) {
    if (!(surface[offset + 2] > 0.5)) continue;
    valid++; const candidates = [surface[offset], surface[offset + 1]].filter(id => id >= 1);
    if (!candidates.length) empty++; else if (candidates.length === 1) one++; else two++;
    for (const id of candidates) { ids.add(id); if (!Number.isInteger(id) || id > count) outOfRange++; }
  }
  return { before, after: readReferenceState(), sourceInputs: inputState(field), triangles: triangleSummary(field.source), base, irradiance,
    nearest: { size: field.nearestSurfaceField.getSize(), probes: surface.length / 4, valid,
      invalid: surface.length / 4 - valid, empty, one, two, distinctTriangleIds: ids.size, outOfRange },
    interpretation: "Readback diagnostics, not performance samples or proof of visible receiver contribution" };
}

export function disposeReferenceProbe() {
  if (MmdManager.prototype.getRcDiffuseGiSettings === captureManager) MmdManager.prototype.getRcDiffuseGiSettings = previousGetter;
  manager = null;
}

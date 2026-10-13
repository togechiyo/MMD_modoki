import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation";
import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import { LuminousRadianceScene } from "/src/render/luminous-radiance-scene.ts";
import { TriangleRadianceBvh } from "/src/render/triangle-radiance-bvh.ts";

let latestGraph;
const executeGraph = FrameGraph.prototype.execute;
FrameGraph.prototype.execute = function () { latestGraph = this; return executeGraph.call(this); };

function scene() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const result = texture.getScene(); texture.dispose(); return result;
}

// Original geometry; the source uses the loaded tofu fixture's GUI-assigned Luminous material.
export async function createRadianceProbe({ multicolor = false } = {}) {
  const current = scene();
  const source = current.meshes.find(mesh => mesh.material && ("toonTexture" in mesh.material
    || mesh.material.subMaterials?.some(material => material && "toonTexture" in material)));
  if (!source) throw new Error("Luminous fixture is missing");
  const luminous = source.material.subMaterials?.find(material => material && "toonTexture" in material) ?? source.material;
  const materials = [...new Set(current.meshes.flatMap(mesh => mesh.material?.subMaterials ?? [mesh.material]))]
    .filter(material => material && "toonTexture" in material);
  const second = materials.find(material => material !== luminous);
  if (multicolor && !second) throw new Error("Second GUI-assigned Luminous material is missing");
  for (const mesh of current.meshes) if (mesh.material && ("toonTexture" in mesh.material || mesh.material.subMaterials)) mesh.setEnabled(false);
  luminous.diffuseColor.set(1, 0.08, 0.03); luminous.ambientColor.set(0, 0, 0);
  luminous.emissiveColor.set(1, 0.08, 0.03); luminous.renderOutline = false;
  const receiver = new StandardMaterial("rc-receiver", current);
  receiver.diffuseColor.set(0.6, 0.6, 0.6); receiver.specularColor.set(0, 0, 0);
  function box(name, size, position, material) {
    const mesh = CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, current);
    mesh.position.set(...position); mesh.material = material; return mesh;
  }
  box("rc-floor", [12, 0.2, 10], [0, -0.1, 0], receiver);
  box("rc-wall", [12, 4, 0.2], [0, 2, 3], receiver);
  box("rc-emitter", [0.2, 2, 2], [-3, 2, 0], luminous);
  if (multicolor) {
    second.diffuseColor.set(0, 0, 1); second.ambientColor.set(0, 0, 0);
    second.emissiveColor.set(0, 0, 1); second.renderOutline = false;
    luminous.diffuseColor.set(1, 0, 0); luminous.emissiveColor.set(1, 0, 0);
    box("rc-emitter-second", [0.2, 2, 2], [3, 2, 0], second);
  }
  box("rc-blocker", [0.35, 2, 2], [-1.4, 1, 0], receiver);
  await current.whenReadyAsync();
}

export async function radianceProbeState({ color, secondColor, blocker, emitter, secondEmitter, position } = {}) {
  const current = scene();
  const source = current.getMeshByName("rc-emitter");
  if (color) { source.material.diffuseColor.set(...color); source.material.emissiveColor.set(...color); }
  const second = current.getMeshByName("rc-emitter-second");
  if (secondColor) { second.material.diffuseColor.set(...secondColor); second.material.emissiveColor.set(...secondColor); }
  if (secondEmitter !== undefined) second.setEnabled(secondEmitter);
  if (blocker !== undefined) current.getMeshByName("rc-blocker").setEnabled(blocker);
  if (emitter !== undefined) source.setEnabled(emitter);
  if (position) source.position.set(...position);
  await current.whenReadyAsync();
  for (let i = 0; i < 8; i++) await new Promise(resolve => requestAnimationFrame(resolve));
  const engine = current.getEngine();
  const camera = current.activeCamera;
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const project = point => {
    const projected = Vector3.Project(new Vector3(...point), Matrix.Identity(), current.getTransformMatrix(), viewport);
    return [projected.x / engine.getRenderWidth(), projected.y / engine.getRenderHeight(), projected.z];
  };
  return { floor: project([0, 0, 0]), floorLeft: project([-1.5, 0, 0]), floorRight: project([1.5, 0, 0]),
    surfaces: current.meshes.filter(mesh => mesh.name.startsWith("rc-surface-")).map(mesh => ({
      name: mesh.name, point: project([mesh.position.x, 0.6, -0.5]), color: mesh.material.diffuseColor.asArray(),
    })),
    emitter: project(source.position.asArray()), secondEmitter: second ? project(second.position.asArray()) : null,
    edgeInner: project([5.25, 0, 0]), edgeInside: project([5.9, 0, 0]), edgeOutside: project([6.1, 0, 0]),
    camera: camera.position.asArray() };
}

export async function setRadianceProbeTexture(uOffset) {
  const current = scene(), source = current.getMeshByName("rc-emitter");
  let texture = source.material.diffuseTexture;
  if (!texture) {
    const pixels = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      pixels.set(x < 32 ? [0, 255, 0, 255] : [0, 0, 255, 255], (y * 64 + x) * 4);
    }
    texture = RawTexture.CreateRGBATexture(pixels, 64, 64, current, false, false, Texture.BILINEAR_SAMPLINGMODE);
    texture.name = "rc-original-color-fixture"; texture.gammaSpace = true;
    source.material.diffuseTexture = texture;
    source.material.diffuseColor.set(1, 1, 1); source.material.emissiveColor.set(1, 1, 1);
  }
  texture.uScale = 0; texture.uOffset = uOffset;
  await current.whenReadyAsync();
  return radianceProbeState();
}

export async function setRadianceProbeBoundary() {
  const current = scene(), source = current.getMeshByName("rc-emitter");
  source.material.diffuseTexture?.dispose(); source.material.diffuseTexture = null;
  source.material.diffuseColor.set(0, 0, 1); source.material.emissiveColor.set(0, 0, 1);
  source.rotation.z = Math.PI / 2; source.scaling.set(1, 5, 5); source.position.set(0, 2, 0);
  current.getMeshByName("rc-wall").setEnabled(false); current.getMeshByName("rc-blocker").setEnabled(false);
  current.getMeshByName("rc-floor").scaling.set(2, 1, 2);
  return radianceProbeState();
}

// Test-only readback of the existing geometry pass, to distinguish reconstruction from camera timing.
export async function radianceProbeSurface(point) {
  const current = scene(), task = latestGraph?.getTaskByName("frameGraphPostEffectsGeometry");
  if (!task) return null;
  const engine = current.getEngine(), camera = current.activeCamera;
  const points = await radianceProbeState();
  const depthTexture = latestGraph.textureManager.getTextureFromHandle(task.geometryViewDepthTexture);
  const normalTexture = latestGraph.textureManager.getTextureFromHandle(task.geometryViewNormalTexture);
  const albedoTexture = latestGraph.textureManager.getTextureFromHandle(task.geometryAlbedoTexture);
  point ??= points.floor;
  const x = Math.floor(point[0] * depthTexture.width), y = depthTexture.height - 1 - Math.floor(point[1] * depthTexture.height);
  const depth = await engine._readTexturePixels(depthTexture, 1, 1, -1, 0, null, true, false, x, y);
  const normal = await engine._readTexturePixels(normalTexture, 1, 1, -1, 0, null, true, false, x, y);
  const albedo = await engine._readTexturePixels(albedoTexture, 1, 1, -1, 0, null, true, false, x, y);
  const inverseProjection = camera.getProjectionMatrix().clone().invert(), inverseView = camera.getViewMatrix().clone().invert();
  const ray = Vector3.TransformCoordinates(new Vector3((x + 0.5) / depthTexture.width * 2 - 1,
    (y + 0.5) / depthTexture.height * 2 - 1, 0.5), inverseProjection);
  const world = Vector3.TransformCoordinates(ray.scale(depth[0] / ray.z), inverseView);
  return { depth: Array.from(depth), normal: Array.from(normal), albedo: Array.from(albedo), world: world.asArray(),
    worldNormal: Vector3.TransformNormal(new Vector3(...Array.from(normal).slice(0, 3)), inverseView).asArray(),
    expectedViewDepth: Vector3.TransformCoordinates(Vector3.Zero(), camera.getViewMatrix()).z };
}

// Added while RC is running: both loaded MMD and plain Standard materials must capture their color.
export async function createRadianceReceiverColors() {
  const current = scene(), source = current.getMeshByName("rc-emitter");
  source.material.diffuseTexture?.dispose(); source.material.diffuseTexture = null;
  source.material.diffuseColor.set(1, 1, 1); source.material.emissiveColor.set(1, 1, 1);
  source.rotation.z = Math.PI / 2; source.scaling.set(1, 3, 3); source.position.set(0, 3, 2);
  current.getMeshByName("rc-wall").setEnabled(false); current.getMeshByName("rc-blocker").setEnabled(false);
  for (const [i, [name, color, mmd]] of [
    ["warm-mmd", [0.8, 0.4, 0.2], true], ["blue-mmd", [0.1, 0.3, 0.8], true],
    ["black-standard", [0.03, 0.03, 0.03], false], ["white-standard", [0.8, 0.8, 0.8], false],
  ].entries()) {
    const material = mmd ? source.material.clone(`rc-surface-${name}`) : new StandardMaterial(`rc-surface-${name}`, current);
    material.disableLighting = false; material.diffuseColor.set(...color);
    material.emissiveColor.set(0, 0, 0); material.ambientColor.set(0, 0, 0); material.specularColor.set(0, 0, 0);
    const mesh = CreateBox(`rc-surface-${name}`, { width: 0.85, height: 0.6, depth: 1 }, current);
    mesh.position.set((i - 1.5) * 1.2, 0.3, -0.5); mesh.material = material;
  }
  await current.whenReadyAsync();
  return radianceProbeState();
}

export function createDenseRadianceProbe({ subdivisions = 128, tiles = 1 } = {}) {
  const current = scene(), floor = current.getMeshByName("rc-floor");
  floor.setEnabled(false);
  for (const mesh of [...current.meshes]) if (mesh.name.startsWith("rc-dense-floor")) mesh.dispose();
  let triangles = 0;
  for (let i = 0; i < tiles; i++) {
    const ground = CreateGround(i ? `rc-dense-floor-${i}` : "rc-dense-floor", { width: 12, height: 10, subdivisions, updatable: true }, current);
    ground.position.x = i * 12; ground.material = floor.material;
    triangles += ground.getTotalIndices() / 3;
  }
  return triangles;
}

export function skinDenseRadianceProbe(name = "rc-dense-floor") {
  const current = scene(), ground = current.getMeshByName(name);
  const skeleton = new Skeleton("rc-pose-skeleton", "rc-pose-skeleton", current);
  const root = new Bone("rc-pose-root", skeleton, null, Matrix.Identity());
  for (let i = 1; i < 4; i++) new Bone(`rc-pose-bone-${i}`, skeleton, root, Matrix.Identity());
  const indices = new Float32Array(ground.getTotalVertices() * 4), weights = new Float32Array(indices.length);
  for (let i = 0; i < indices.length; i += 4) { indices.set([0, 1, 2, 3], i); weights.set([0.4, 0.3, 0.2, 0.1], i); }
  ground.setVerticesData(VertexBuffer.MatricesIndicesKind, indices); ground.setVerticesData(VertexBuffer.MatricesWeightsKind, weights);
  ground.skeleton = skeleton;
  const target = new MorphTarget("rc-pose-morph", 0, current), positions = Float32Array.from(ground.getVerticesData(VertexBuffer.PositionKind));
  for (let i = 1; i < positions.length; i += 3) positions[i] += 0.2;
  target.setPositions(positions);
  ground.morphTargetManager = new MorphTargetManager(current);
  ground.morphTargetManager.areUpdatesFrozen = true; ground.morphTargetManager.addTarget(target);
  for (let i = 1; i < 32; i++) { const inactive = new MorphTarget(`rc-inactive-morph-${i}`, 0, current); inactive.setPositions(positions); ground.morphTargetManager.addTarget(inactive); }
  ground.morphTargetManager.areUpdatesFrozen = false;
}

export async function createAnimatedRadianceProbe() {
  createDenseRadianceProbe({ subdivisions: 384 });
  const current = scene(), character = CreateSphere("rc-animated-character", { diameter: 2, segments: 48 }, current);
  character.position.set(0, 1.1, 0); character.material = current.getMeshByName("rc-floor").material;
  skinDenseRadianceProbe(character.name);
  const positions = character.getVerticesData(VertexBuffer.PositionKind);
  const weights = character.getVerticesData(VertexBuffer.MatricesWeightsKind);
  for (let vertex = 0; vertex < character.getTotalVertices(); vertex++) {
    const top = (positions[vertex * 3 + 1] + 1) / 2;
    weights.set([1 - top, top, 0, 0], vertex * 4);
  }
  character.updateVerticesData(VertexBuffer.MatricesWeightsKind, weights);
  current.getMeshByName("rc-blocker").setEnabled(false);
  await current.whenReadyAsync();
  return { staticTriangles: current.getMeshByName("rc-dense-floor").getTotalIndices() / 3,
    movingTriangles: character.getTotalIndices() / 3 };
}

export async function createRadianceQualityProbe() {
  const current = scene(), source = current.getMeshByName("rc-emitter");
  source.material.diffuseColor.set(1, 1, 1); source.material.emissiveColor.set(1, 1, 1);
  source.position.set(-3, 2, -1.5);
  current.getMeshByName("rc-wall").setEnabled(false); current.getMeshByName("rc-blocker").setEnabled(false);
  const material = source.material.clone("rc-quality-material");
  material.diffuseColor.set(0.8, 0.8, 0.8); material.emissiveColor.set(0, 0, 0);
  material.specularColor.set(0, 0, 0); material.ambientColor.set(0, 0, 0); material.disableLighting = false;
  const sphere = CreateSphere("rc-quality-sphere", { diameter: 2, segments: 64 }, current);
  sphere.position.set(0, 1, 0); sphere.material = material;
  await current.whenReadyAsync();
}

export async function radianceQualityProbeState() {
  const current = scene(); await radianceProbeState();
  const engine = current.getEngine(), camera = current.activeCamera;
  const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const project = x => {
    const p = Vector3.Project(new Vector3(x, 1, -Math.sqrt(1 - x * x)), Matrix.Identity(), current.getTransformMatrix(), viewport);
    return [p.x / engine.getRenderWidth(), p.y / engine.getRenderHeight()];
  };
  return { left: project(-0.6), right: project(0.6), width: engine.getRenderWidth(), height: engine.getRenderHeight() };
}

// Test-only timings: frame intervals include presentation; task setup measures CPU collection separately.
export async function profileRadianceProbe(frames = 30, change) {
  const tasks = [3, 2, 1, 0].map(i => latestGraph.getTaskByName(`luminousRadianceCascade${i}`)).filter(Boolean);
  const receiver = latestGraph.getTaskByName("luminousRadianceReceiver");
  const counts = { cascades: 0, receiver: 0, positions: 0, refittedTriangles: 0, uploadedBytes: 0, updates: 0 }, durations = [], intervals = [], positionDurations = [], gpu = [], undo = [];
  const engine = scene().getEngine(), instrumentation = new EngineInstrumentation(engine);
  instrumentation.captureGPUFrameTime = true;
  const ground = scene().getMeshByName(change === "continuous" ? "rc-animated-character" : "rc-dense-floor");
  if (ground) {
    const original = ground.getPositionData;
    ground.getPositionData = function (...args) { const start = performance.now(); counts.positions++;
      try { return original.apply(this, args); } finally { positionDurations.push(performance.now() - start); } };
    undo.push(() => { ground.getPositionData = original; });
  }
  for (const task of [...tasks, receiver].filter(Boolean)) {
    const original = task.computeShader.dispatch;
    task.computeShader.dispatch = function (...args) {
      if (args[0] > 0 && args[1] > 0 && args[2] > 0) counts[task === receiver ? "receiver" : "cascades"]++;
      return original.apply(this, args);
    };
    undo.push(() => { task.computeShader.dispatch = original; });
  }
  const prepare = latestGraph.getTaskByName("luminousRadiancePrepare") ?? tasks[0];
  if (prepare) {
    const key = "func" in prepare ? "func" : "execute", original = prepare[key];
    prepare[key] = function (...args) {
      const start = performance.now();
      try { return original.apply(this, args); } finally { durations.push(performance.now() - start); }
    };
    undo.push(() => { prepare[key] = original; });
  }
  const buffers = new Set(), updateScene = LuminousRadianceScene.prototype.update;
  LuminousRadianceScene.prototype.update = function (...args) {
    buffers.add(this.triangleBuffer); buffers.add(this.nodeBuffer);
    const before = this.updates;
    try { return updateScene.apply(this, args); } finally { counts.updates += this.updates - before; }
  };
  undo.push(() => { LuminousRadianceScene.prototype.update = updateScene; });
  const updateBvh = TriangleRadianceBvh.prototype.update;
  TriangleRadianceBvh.prototype.update = function (input) { counts.refittedTriangles += input.length / 24; return updateBvh.call(this, input); };
  undo.push(() => { TriangleRadianceBvh.prototype.update = updateBvh; });
  const upload = StorageBuffer.prototype.update;
  StorageBuffer.prototype.update = function (data, offset, length) {
    if (buffers.has(this)) counts.uploadedBytes += length ?? data.byteLength;
    return upload.call(this, data, offset, length);
  };
  undo.push(() => { StorageBuffer.prototype.update = upload; });
  try {
    if (change === "vertex") {
      const ground = scene().getMeshByName("rc-dense-floor"), positions = ground.getVerticesData(VertexBuffer.PositionKind);
      positions[1] += 0.1; ground.updateVerticesData(VertexBuffer.PositionKind, positions);
    } else if (change === "transform") scene().getMeshByName("rc-emitter").position.x += 0.1;
    else if (change === "bone") { const bone = ground.skeleton.bones[0]; bone.setPosition(bone.getPosition().add(new Vector3(0.1, 0, 0))); }
    else if (change === "morph") ground.morphTargetManager.getTarget(0).influence = 0.5;
    else if (change === "continuous") {
      let frame = 0;
      const observer = scene().onBeforeRenderObservable.add(() => {
        const phase = ++frame * 0.13;
        ground.skeleton.bones[0].setPosition(new Vector3(Math.sin(phase) * 0.7, 0, 0));
        ground.skeleton.bones[1].setRotation(new Vector3(0, 0, Math.sin(phase * 0.7) * 0.3));
        ground.morphTargetManager.getTarget(0).influence = (Math.sin(phase * 0.8) + 1) * 0.25;
      });
      undo.push(() => { scene().onBeforeRenderObservable.remove(observer);
        ground.skeleton.bones[0].setPosition(Vector3.Zero()); ground.skeleton.bones[1].setRotation(Vector3.Zero());
        ground.morphTargetManager.getTarget(0).influence = 0; });
    }
    let previous = await new Promise(resolve => requestAnimationFrame(resolve));
    for (let i = 0; i < frames; i++) {
      const now = await new Promise(resolve => requestAnimationFrame(resolve)); intervals.push(now - previous); previous = now;
      const value = instrumentation.gpuFrameTimeCounter?.current;
      if (value > 0) gpu.push(value / 1e6);
    }
    const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
    return { counts: { cascades: counts.cascades, receiver: counts.receiver }, positionCalls: counts.positions,
      geometryUpdates: counts.updates, refittedTriangles: counts.refittedTriangles, uploadedBytes: counts.uploadedBytes,
      positionCpuMedianMs: median(positionDurations), cpuMedianMs: median(durations), gpuMedianMs: gpu.length ? median(gpu) : null, frameMedianMs: median(intervals),
      receiverSize: receiver ? [receiver.dispatchSize.x * 8, receiver.dispatchSize.y * 8] : null };
  } finally { for (const restore of undo) restore(); instrumentation.captureGPUFrameTime = false; instrumentation.dispose(); }
}

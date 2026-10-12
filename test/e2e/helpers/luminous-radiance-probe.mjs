import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";

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
  receiver.diffuseColor.set(0.12, 0.12, 0.12); receiver.specularColor.set(0, 0, 0);
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
export async function radianceProbeSurface() {
  const current = scene(), task = latestGraph?.getTaskByName("frameGraphPostEffectsGeometry");
  if (!task) return null;
  const engine = current.getEngine(), camera = current.activeCamera;
  const points = await radianceProbeState();
  const depthTexture = latestGraph.textureManager.getTextureFromHandle(task.geometryViewDepthTexture);
  const normalTexture = latestGraph.textureManager.getTextureFromHandle(task.geometryViewNormalTexture);
  const x = Math.floor(points.floor[0] * depthTexture.width), y = depthTexture.height - 1 - Math.floor(points.floor[1] * depthTexture.height);
  const depth = await engine._readTexturePixels(depthTexture, 1, 1, -1, 0, null, true, false, x, y);
  const normal = await engine._readTexturePixels(normalTexture, 1, 1, -1, 0, null, true, false, x, y);
  const inverseProjection = camera.getProjectionMatrix().clone().invert(), inverseView = camera.getViewMatrix().clone().invert();
  const ray = Vector3.TransformCoordinates(new Vector3((x + 0.5) / depthTexture.width * 2 - 1,
    (y + 0.5) / depthTexture.height * 2 - 1, 0.5), inverseProjection);
  const world = Vector3.TransformCoordinates(ray.scale(depth[0] / ray.z), inverseView);
  return { depth: Array.from(depth), normal: Array.from(normal), world: world.asArray(),
    worldNormal: Vector3.TransformNormal(new Vector3(...Array.from(normal).slice(0, 3)), inverseView).asArray(),
    expectedViewDepth: Vector3.TransformCoordinates(Vector3.Zero(), camera.getViewMatrix()).z };
}

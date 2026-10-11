import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";

function scene() {
  const texture = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const result = texture.getScene(); texture.dispose(); return result;
}

// Original geometry; the source uses the loaded tofu fixture's GUI-assigned Luminous material.
export async function createRadianceProbe() {
  const current = scene();
  const source = current.meshes.find(mesh => mesh.material && ("toonTexture" in mesh.material
    || mesh.material.subMaterials?.some(material => material && "toonTexture" in material)));
  if (!source) throw new Error("Luminous fixture is missing");
  const luminous = source.material.subMaterials?.find(material => material && "toonTexture" in material) ?? source.material;
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
  box("rc-blocker", [0.35, 2, 2], [-1.4, 1, 0], receiver);
  await current.whenReadyAsync();
}

export async function radianceProbeState({ color, blocker, emitter, position } = {}) {
  const current = scene();
  const source = current.getMeshByName("rc-emitter");
  if (color) { source.material.diffuseColor.set(...color); source.material.emissiveColor.set(...color); }
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
  return { floor: project([0, 0, 0]), emitter: project([-3, 2, 0]), camera: camera.position.asArray() };
}

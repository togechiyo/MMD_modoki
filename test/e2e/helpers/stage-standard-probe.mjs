import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";

// Generated scenery uses only the repository fixture's assigned material.
// This is test setup; preset assignment remains an actual GUI operation.
export async function createStageProbe() {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const source = scene.meshes.find(mesh => mesh.getTotalVertices() > 0 &&
    (mesh.material?.subMaterials?.some(mat => mat && "toonTexture" in mat) || (mesh.material && "toonTexture" in mesh.material)));
  if (!source) throw new Error("MMD fixture material is missing");
  const material = source.material.subMaterials?.find(mat => mat && "toonTexture" in mat) ?? source.material;
  for (const mesh of scene.meshes) {
    if (mesh.material && ("toonTexture" in mesh.material || mesh.material.subMaterials)) mesh.setEnabled(false);
  }
  const data = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const color = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? [182, 198, 209] : [221, 215, 198];
    data.set([...color, 255], (y * 64 + x) * 4);
  }
  const texture = RawTexture.CreateRGBATexture(data, 64, 64, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  material.diffuseTexture = texture;
  material.renderOutline = false;
  const meshes = [];
  function box(name, size, position) {
    const mesh = CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
    mesh.position.set(...position); meshes.push(mesh); return mesh;
  }
  box("stage-floor", [10, 0.2, 8], [0, -0.1, 0]);
  box("stage-back-wall", [10, 4, 0.2], [0, 2, 3.9]);
  box("stage-side-wall", [0.2, 4, 8], [-4.9, 2, 0]);
  box("stage-plinth", [2, 0.8, 2], [0.9, 0.4, 0.8]);
  const column = box("stage-column", [1, 2.8, 1], [-2.5, 1.4, 1.2]);
  column.rotation.y = 0.35;
  const sphere = CreateSphere("stage-curved-surface", { diameter: 1.7, segments: 32 }, scene);
  sphere.position.set(0.9, 1.65, 0.8); meshes.push(sphere);
  const generators = scene.lights.flatMap(light => Array.from(light.getShadowGenerators()?.values() ?? []));
  for (const mesh of meshes) {
    mesh.material = material; mesh.receiveShadows = true;
    generators.forEach(generator => generator.addShadowCaster(mesh));
  }
  await scene.whenReadyAsync();
  return { meshCount: meshes.length, shadowMaps: generators.length };
}

export async function stageProbeState(receiveShadows) {
  const handle = RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, undefined, false, false);
  const scene = handle.getScene(); handle.dispose();
  const meshes = scene.meshes.filter(mesh => mesh.name.startsWith("stage-"));
  // Neutral fixture surfaces make the form response visible without the source
  // fixture's skin colour. Reapply after preset restore for an equal comparison.
  if (meshes[0]) {
    meshes[0].material.diffuseColor.set(0.95, 0.95, 0.95);
    meshes[0].material.ambientColor.set(0.04, 0.04, 0.04);
    meshes[0].material.emissiveColor.set(0, 0, 0);
  }
  if (receiveShadows !== undefined) meshes.forEach(mesh => { mesh.receiveShadows = receiveShadows; });
  await scene.whenReadyAsync();
  for (let i = 0; i < 12; i++) await new Promise(resolve => requestAnimationFrame(resolve));
  return { targets: scene.textures.filter(texture => texture.isRenderTarget).map(texture => texture.name).sort(),
    lights: scene.lights.map(light => ({ name: light.name, intensity: light.intensity, direction: light.direction?.asArray(), enabled: light.isEnabled() })),
    material: meshes[0] && { name: meshes[0].material.name, toon: meshes[0].material.toonTexture?.name, disableLighting: meshes[0].material.disableLighting,
      additive: meshes[0].material.toonTextureAdditiveColor, multiplicative: meshes[0].material.toonTextureMultiplicativeColor,
    },
    stageShader: meshes[0]?.subMeshes[0]?.effect?.fragmentSourceCode.includes("let formLight=ndl*(1.5-0.5*ndl)"),
    signedStageLight: meshes[0]?.subMeshes[0]?.effect?.fragmentSourceCode.includes("result.ndl=dot(vNormal,lightVectorW)"),
  };
}

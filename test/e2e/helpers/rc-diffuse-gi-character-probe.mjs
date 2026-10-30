// eslint-disable-next-line import/no-unresolved -- Served only by the E2E Vite application.
import { MmdManager } from "/src/mmd-manager.ts";

let manager = null;
const previousGetter = MmdManager.prototype.getRcDiffuseGiSettings;
function observeManager(...args) {
  // eslint-disable-next-line @typescript-eslint/no-this-alias -- Observe the running test application.
  manager = this;
  return previousGetter.apply(this, args);
}
MmdManager.prototype.getRcDiffuseGiSettings = observeManager;

function context() {
  if (!manager) throw new Error("Open GI settings after importing the character probe");
  const [stage, character] = manager.sceneModels;
  if (!stage || !character) throw new Error("Load the original GI stage first, then the authorized character");
  return { stage, character, controller: manager.rcDiffuseGiController };
}
const meshes = entry => [...new Set([entry.mesh, ...entry.mesh.getChildMeshes(), ...entry.renderMeshes])];

// Fixture preparation only: never alter the character's materials or model asset.
export function prepareCharacterStage() {
  const { stage } = context();
  if (!stage.info.path.replaceAll("\\", "/").endsWith("/rc-diffuse-gi-red.pmx")) throw new Error("Unexpected fixture path");
  stage.mesh.scaling.setAll(5);
  for (const mesh of meshes(stage)) mesh.computeWorldMatrix(true);
  return { scale: stage.mesh.scaling.asArray(), source: setCharacterSourceColor("red") };
}
export function setCharacterSourceColor(name) {
  const colors = { red: [0.9, 0.025, 0.025], blue: [0.025, 0.025, 0.9] };
  const color = colors[name];
  if (!color) throw new Error(`Unknown original-fixture color ${name}`);
  const { stage } = context();
  const materials = [...new Set(meshes(stage).flatMap(mesh => (mesh.subMeshes ?? []).map(sub => sub.getMaterial())))];
  const material = materials.find(material => material?.name === "GI Source");
  if (!material) throw new Error("Original fixture GI Source material not found");
  material.diffuseColor.set(...color);
  return { name, diffuse: material.diffuseColor.asArray() };
}
export function readCharacterState() {
  const { stage, character, controller } = context();
  const materials = [...new Set(meshes(character).flatMap(mesh => (mesh.subMeshes ?? []).map(sub => sub.getMaterial())))].filter(Boolean);
  return { settings: manager.getRcDiffuseGiSettings(), diagnostics: controller?.diagnostics ?? null,
    sourceRevision: controller?.field?.source.revision ?? null, sourceReady: controller?.field?.source.ready ?? null,
    stageScale: stage.mesh.scaling.asArray(), characterScale: character.mesh.scaling.asArray(),
    characterMaterials: materials.map(material => ({ name: material.name, receiver: manager.acceptsRcDiffuseGiMaterial(material),
      preset: manager.materialShaderPresetByMaterial.get(material) ?? null, alpha: material.alpha,
      alphaTesting: material.needAlphaTesting(), alphaBlending: material.needAlphaBlending() })) };
}

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const normalize = a => a.map(value => value / Math.hypot(...a));

/** CPU screen mask from the producer's posed opaque triangles, without an extra GPU pass.
 * This is an observation of character pixels, not an independent transport oracle.
 * Alpha-tested/transparent overlays are absent from the opaque source and may cover
 * a few selected pixels; the centered face region and erosion reduce that ambiguity.
 */
export function characterPixelMask(view, width = 640, height = 360) {
  const { character, controller } = context();
  const chunks = controller?.field?.source.chunks;
  if (!chunks?.length) throw new Error("A ready GI source is required for the character mask");
  const actorMeshes = new Set(meshes(character)), eye = [view.position.x, view.position.y, view.position.z];
  const target = [view.target.x, view.target.y, view.target.z];
  const forward = normalize(target.map((value, i) => value - eye[i]));
  const right = normalize(cross([0, 1, 0], forward)), up = cross(forward, right);
  const tangent = Math.tan(view.fov * Math.PI / 360), depth = new Float32Array(width * height), labels = new Uint8Array(width * height);
  const project = point => {
    const delta = point.map((value, i) => value - eye[i]), z = dot(delta, forward);
    return [width * (.5 + dot(delta, right) / z / tangent / (width / height) * .5), height * (.5 - dot(delta, up) / z / tangent * .5), z];
  };
  let triangles = 0, characterTriangles = 0;
  for (const chunk of chunks) {
    const actor = actorMeshes.has(chunk.key), packed = chunk.triangles;
    for (let offset = 0; offset < packed.length; offset += 24) {
      triangles++; if (actor) characterTriangles++;
      const points = [0, 4, 8].map(vertex => project(Array.from(packed.subarray(offset + vertex, offset + vertex + 3))));
      if (points.some(point => point[2] <= 0.001 || !point.every(Number.isFinite))) continue;
      const [a, b, c] = points;
      const area = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if (Math.abs(area) < 1e-8) continue;
      const lowX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), highX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const lowY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), highY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = lowY; y <= highY; y++) for (let x = lowX; x <= highX; x++) {
        const wa = ((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1])) / area;
        const wb = ((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1])) / area, wc = 1 - wa - wb;
        if (wa < 0 || wb < 0 || wc < 0) continue;
        const inverse = wa/a[2] + wb/b[2] + wc/c[2], index = y * width + x;
        if (inverse > depth[index]) { depth[index] = inverse; labels[index] = actor ? 1 : 0; }
      }
    }
  }
  const pixels = [], facePixels = [];
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const index = y * width + x;
    if (!labels[index] || [-2, -1, 1, 2].some(step => !labels[index + step] || !labels[index + step * width])) continue;
    pixels.push(index);
    if (x >= 200 && x < 440 && y >= 70 && y < 290) facePixels.push(index);
  }
  return { width, height, triangles, characterTriangles, pixels, facePixels,
    faceBounds: [200, 70, 440, 290], note: "CPU opaque-character mask, depth tested against all source triangles; two-pixel edge erosion. Not a material-ID pass or a GI correctness oracle." };
}

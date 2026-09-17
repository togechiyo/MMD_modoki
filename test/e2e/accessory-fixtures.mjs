import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Original MIT fixture: a white, double-sided quad, with no external resources.
// GLB layout: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification
export function createAccessoryGlb(directory) {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(normals.buffer), Buffer.from(uvs.buffer), Buffer.from(indices.buffer)]);
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0", generator: "MMD_modoki MIT test fixture" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ doubleSided: true, emissiveFactor: [1, 1, 1],
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 72, byteStride: 12, target: 34962 },
      { buffer: 0, byteOffset: 72, byteLength: 72, byteStride: 12, target: 34962 },
      { buffer: 0, byteOffset: 144, byteLength: 48, byteStride: 8, target: 34962 },
      { buffer: 0, byteOffset: 192, byteLength: 12, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 6, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 6, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 6, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
  }));
  const paddedJson = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(paddedJson);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + bin.length, 8);
  const chunk = (data, type) => {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(data.length, 0); header.writeUInt32LE(type, 4);
    return Buffer.concat([header, data]);
  };
  const path = resolve(directory, "visibility.glb");
  writeFileSync(path, Buffer.concat([header, chunk(paddedJson, 0x4e4f534a), chunk(bin, 0x004e4942)]));
  return path;
}

export async function loadAccessoryFixture(page, kind, root, directory) {
  if (kind !== "glb") {
    return page.evaluate(path => window.mmdModokiE2e.loadAccessory(path),
      resolve(root, "test/fixtures/accessory", "tofu." + kind));
  }
  // The GLB menu is disabled; existing projects still restore through loadGlb.
  const path = createAccessoryGlb(directory);
  const result = await page.evaluate(async path => {
    const project = window.mmdModokiE2e.exportProjectState();
    project.accessories = [{ path, visible: true, castsShadow: false,
      transform: { position: { x: 0, y: 0, z: 0 }, rotationDeg: { x: 0, y: 0, z: 0 }, scale: 1 / 60 } }];
    return window.mmdModokiE2e.importProjectState(project);
  }, path);
  if (result.warnings.length) throw new Error(JSON.stringify(result.warnings));
  return true;
}

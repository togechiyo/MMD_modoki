import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, "test/fixtures/luminous-material-conditions");

class Writer {
  chunks = [];
  scalar(method, bytes, value) { const chunk = Buffer.alloc(bytes); chunk[method](value); this.chunks.push(chunk); }
  u8(value) { this.scalar("writeUInt8", 1, value); }
  i8(value) { this.scalar("writeInt8", 1, value); }
  u16(value) { this.scalar("writeUInt16LE", 2, value); }
  i32(value) { this.scalar("writeInt32LE", 4, value); }
  f32(value) { this.scalar("writeFloatLE", 4, value); }
  vector(values) { values.forEach(value => this.f32(value)); }
  text(value) { const bytes = Buffer.from(value, "utf16le"); this.i32(bytes.length); this.chunks.push(bytes); }
  build() { return Buffer.concat(this.chunks); }
}

/** Two original, texture-free PMX models; the rear has no AL control morphs. */
export function createLuminousMaterialConditionsFixture(rear = false) {
  const vertices = [], materials = [];
  const quad = (name, points, normal, diffuse, shininess, specular = [0, 0, 0]) => {
    const first = vertices.length;
    points.forEach((position, index) => vertices.push({ position, normal, uv: [[0, 1], [0, 0], [1, 0], [1, 1]][index] }));
    materials.push({ name, diffuse, shininess, specular, indices: [first, first + 1, first + 2, first, first + 2, first + 3] });
  };
  const panel = (name, center, half, color, shininess, specular) => {
    const [x, y, z] = center, [w, h] = half;
    quad(name, [[x-w, y-h, z], [x-w, y+h, z], [x+w, y+h, z], [x+w, y-h, z]], [0, 0, -1], color, shininess, specular);
  };
  if (rear) {
    panel("Panel B", [-2, 2, 1], [1.65, 1.65], [0.004, 0.008, 0.07], 130);
  } else {
    // Leave headroom for the existing white core and mask clamp, so front/rear hue remains measurable.
    panel("Panel A", [-2, 2, -1], [1.15, 1.15], [0.07, 0.006, 0.003], 130);
    panel("Panel C", [0.6, 2, -1], [0.48, 0.7], [0.7, 0.7, 0.7], 100);
    panel("Panel D", [2.2, 2, -1], [0.48, 0.7], [0.7, 0.7, 0.7], 130, [0.02, 0, 0]);
    quad("Receiver", [[-5, 0, -3], [-5, 0, 4], [4, 0, 4], [4, 0, -3]], [0, 1, 0], [0.8, 0.8, 0.8], 20);
  }
  return { rear, vertices, materials };
}

export function encodeLuminousMaterialConditionsFixture(model) {
  assert.ok(model.vertices.length < 256);
  const w = new Writer();
  [0x50, 0x4d, 0x58, 0x20].forEach(value => w.u8(value)); w.f32(2); w.u8(8);
  [0, 0, 1, 1, 1, 1, 1, 1].forEach(value => w.u8(value));
  w.text(model.rear ? "材質条件・奥の板" : "材質条件・前面と対照");
  w.text(model.rear ? "Material Conditions Rear" : "Material Conditions Front");
  w.text("MMD_modoki自作fixture。普通の材質名、shininess/specular条件、材質モーフ消灯と遮蔽。第三者assetなし。");
  w.text("Original geometry and PMX writer; repository MIT license. No external assets, textures or physics.");
  w.i32(model.vertices.length);
  for (const vertex of model.vertices) {
    w.vector(vertex.position); w.vector(vertex.normal); w.vector(vertex.uv); w.u8(0); w.i8(0); w.f32(0);
  }
  const indices = model.materials.flatMap(material => material.indices);
  w.i32(indices.length); indices.forEach(value => w.u8(value));
  w.i32(0); // No textures.
  w.i32(model.materials.length);
  for (const material of model.materials) {
    w.text(material.name); w.text(material.name); w.vector([...material.diffuse, 1]);
    w.vector(material.specular); w.f32(material.shininess); w.vector([0, 0, 0]);
    w.u8(0x01); w.vector([0, 0, 0, 0]); w.f32(0); // Double-sided; no edge or shadow dependency.
    w.i8(-1); w.i8(-1); w.u8(0); w.u8(0); w.i8(-1); // No diffuse, sphere or toon textures.
    w.text("Original ordinary material, no Luminous preset"); w.i32(material.indices.length);
  }
  w.i32(1); w.text("センター"); w.text("Center"); w.vector([0, 0, 0]);
  w.i8(-1); w.i32(0); w.u16(0x001e); w.vector([0, 1, 0]);
  const names = model.rear ? [] : ["ShininessOff", "AlphaOff", "Alpha35", "FrontAway", "LightOff"];
  w.i32(names.length);
  if (!model.rear) {
    for (const [name, shininess, alpha] of [["ShininessOff", -50, 0], ["AlphaOff", 0, -1], ["Alpha35", 0, -0.65]]) {
      w.text(name); w.text(name); w.u8(4); w.u8(8); w.i32(1);
      w.i8(0); w.u8(1); // Only Panel A; additive material morph.
      w.vector([0, 0, 0, alpha]); w.vector([0, 0, 0]); w.f32(shininess);
      w.vector([0, 0, 0]); w.vector([0, 0, 0, 0]); w.f32(0);
      for (let i = 0; i < 3; i++) w.vector([0, 0, 0, 0]);
    }
    w.text("FrontAway"); w.text("FrontAway"); w.u8(4); w.u8(1); w.i32(4);
    for (let index = 0; index < 4; index++) { w.u8(index); w.vector([-6, 0, 0]); }
    // Conventional control name on a zero-displacement vertex morph, like authored AL controls.
    w.text("LightOff"); w.text("LightOff"); w.u8(4); w.u8(1); w.i32(1); w.u8(0); w.vector([0, 0, 0]);
  }
  w.i32(model.rear ? 1 : 2);
  w.text("Root"); w.text("Root"); w.u8(1); w.i32(1); w.u8(0); w.i8(0);
  if (!model.rear) {
    w.text("表情"); w.text("Expression"); w.u8(1); w.i32(names.length);
    names.forEach((_, index) => { w.u8(1); w.i8(index); });
  }
  w.i32(0); w.i32(0); // No rigid bodies or joints.
  return w.build();
}

export async function generateLuminousMaterialConditionsFixtures() {
  await mkdir(directory, { recursive: true });
  const files = [];
  for (const rear of [false, true]) {
    const model = createLuminousMaterialConditionsFixture(rear);
    const path = resolve(directory, rear ? "rear.pmx" : "front.pmx");
    await writeFile(path, encodeLuminousMaterialConditionsFixture(model)); files.push(path);
  }
  // Parse using the installed loader without launching Electron, a renderer, or a GPU device.
  const { createServer } = await import("vite");
  const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { PmxReader } = await vite.ssrLoadModule("/node_modules/babylon-mmd/esm/Loader/Parser/pmxReader.js");
    for (const [index, path] of files.entries()) {
      const bytes = await readFile(path);
      const pmx = await PmxReader.ParseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      assert.equal(pmx.indices.length / 3, index === 0 ? 8 : 2);
      assert.equal(pmx.materials[0].shininess, 130);
      assert.deepEqual(pmx.materials[0].specular, [0, 0, 0]);
      assert.equal(pmx.textures.length, 0);
      if (index === 0) {
        assert.deepEqual(pmx.morphs.map(morph => morph.name), ["ShininessOff", "AlphaOff", "Alpha35", "FrontAway", "LightOff"]);
        assert.equal(pmx.morphs[0].type, 8); assert.equal(pmx.morphs[0].elements[0].shininess, -50);
        assert.equal(pmx.morphs[1].elements[0].diffuse[3], -1);
        assert.ok(Math.abs(pmx.morphs[2].elements[0].diffuse[3] + 0.65) < 1e-6);
        assert.equal(pmx.materials[1].shininess, 100); assert.ok(pmx.materials[2].specular[0] > 0.01);
      }
    }
  } finally { await vite.close(); }
  return { files, triangles: 10, readBack: "passed" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await generateLuminousMaterialConditionsFixtures(), null, 2));
}

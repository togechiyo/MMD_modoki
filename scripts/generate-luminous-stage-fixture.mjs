import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { deflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const stagePresets = {
  fixture: { floor: 16, source: 2, rows: 8, columns: 16, fins: 6 },
  heavy: { floor: 192, source: 20, rows: 48, columns: 96, fins: 24 },
  stress: { floor: 240, source: 24, rows: 64, columns: 128, fins: 24 },
};
const palette = [[1, 0.12, 0.06], [0.08, 0.35, 1], [0.12, 1, 0.22], [1, 0.55, 0.08],
  [0.6, 0.12, 1], [0.08, 0.9, 1], [1, 0.12, 0.55], [1, 0.9, 0.7]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const length = Math.hypot(...a); return a.map(v => v / length); };

export function createLuminousStage(preset = "fixture") {
  const density = stagePresets[preset];
  assert.ok(density, `Unknown stage preset: ${preset}`);
  const vertices = [], groups = [];
  const group = (name, diffuse, texture = -1) => {
    const value = { name, diffuse, texture, indices: [] };
    groups.push(value); return value;
  };
  const floor = group("床", [0.65, 0.65, 0.65]);
  const walls = group("壁と庇", [0.72, 0.72, 0.72]);
  const curves = group("曲面受け手", [0.8, 0.8, 0.8]);
  const fins = group("格子", [0.5, 0.5, 0.5]);
  const screen = group("可動遮蔽板", [0.65, 0.65, 0.65]);
  const sources = Array.from({ length: 64 }, (_, index) => group(`AutoLuminous_${String(index).padStart(2, "0")}`, palette[index % palette.length], index % 16));
  function quad(material, origin, u, v, segments = 1) {
    const normal = unit(cross(u, v)), start = vertices.length;
    for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) {
      const uv = [col / segments, row / segments];
      vertices.push({ position: origin.map((value, axis) => value + u[axis] * uv[0] + v[axis] * uv[1]), normal, uv });
    }
    for (let row = 0; row < segments; row++) for (let col = 0; col < segments; col++) {
      const a = start + row * (segments + 1) + col, b = a + segments + 1;
      material.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  function box(material, center, size, segments = 1, topSegments = segments) {
    const [x, y, z] = center, [w, h, d] = size;
    const l = x - w / 2, r = x + w / 2, bottom = y - h / 2, top = y + h / 2, near = z - d / 2, far = z + d / 2;
    quad(material, [l, bottom, far], [w, 0, 0], [0, h, 0], segments);
    quad(material, [r, bottom, near], [-w, 0, 0], [0, h, 0], segments);
    quad(material, [l, bottom, near], [0, 0, d], [0, h, 0], segments);
    quad(material, [r, bottom, far], [0, 0, -d], [0, h, 0], segments);
    quad(material, [l, top, far], [w, 0, 0], [0, 0, -d], topSegments);
    quad(material, [l, bottom, near], [w, 0, 0], [0, 0, d], segments);
  }
  function ellipsoid(center, radius) {
    const { rows, columns } = density, start = vertices.length;
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const theta = row / rows * Math.PI, phi = col / columns * Math.PI * 2;
      const direction = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      vertices.push({ position: center.map((v, i) => v + direction[i] * radius[i]),
        normal: unit(direction.map((v, i) => v / radius[i])), uv: [col / columns, row / rows] });
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const a = start + row * (columns + 1) + col, b = a + columns + 1;
      if (row > 0) curves.indices.push(a, a + 1, b);
      if (row < rows - 1) curves.indices.push(a + 1, b + 1, b);
    }
  }
  box(floor, [0, 0, 0], [48, 0.8, 48], 1, density.floor);
  box(walls, [0, 8.4, 24.3], [48, 16, 0.6]);
  box(walls, [-24.3, 8.4, 0], [0.6, 16, 48]);
  box(walls, [24.3, 8.4, 0], [0.6, 16, 48]);
  // Front and right courtyard stay open; the left canopy provides a dark receiver.
  box(walls, [-12, 15.5, 0], [24, 0.6, 48]);
  for (const x of [-23, -1]) for (const z of [-23, -1, 23]) box(walls, [x, 7.7, z], [0.6, 14.6, 0.6]);
  let bay = 0;
  for (const z of [-18, -6, 6, 18]) for (const x of [-18, -6, 6, 18]) {
    box(sources[bay * 4], [x - 2, 14.5, z - 1], [2.8, 0.25, 0.8], density.source);
    box(sources[bay * 4 + 1], [x + 2, 8, z + 1], [0.35, 3, 1], density.source);
    box(sources[bay * 4 + 2], [x - 3, 0.5, z + 2], [2.2, 0.1, 0.35], density.source);
    box(sources[bay * 4 + 3], [x + 3, 4, z - 2], [0.25, 2, 1.5], density.source);
    ellipsoid([x, 2.65, z], [2, 2.2, 1.2]);
    for (let index = 0; index < density.fins; index++) {
      const offset = (index / (density.fins - 1) - 0.5) * 4;
      box(fins, [x + offset, 2.4, z + 3.5], [0.08, 4, 0.5]);
    }
    bay++;
  }
  const screenStart = vertices.length;
  box(screen, [0, 3, -5], [0.4, 5, 7]);
  const screenVertices = Array.from({ length: vertices.length - screenStart }, (_, index) => screenStart + index);
  return { preset, vertices, groups, screenVertices, textures: Array.from({ length: 16 }, (_, i) => `textures/panel-${String(i).padStart(2, "0")}.png`) };
}

export function validateLuminousStage(model) {
  const { vertices, groups } = model;
  let triangleCount = 0;
  for (const vertex of vertices) {
    assert.ok([...vertex.position, ...vertex.normal, ...vertex.uv].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...vertex.normal) - 1) < 1e-6);
  }
  for (const material of groups) {
    assert.ok(material.indices.length > 0 && material.indices.length % 3 === 0);
    for (let i = 0; i < material.indices.length; i += 3) {
      const points = material.indices.slice(i, i + 3).map(index => {
        assert.ok(Number.isInteger(index) && index >= 0 && index < vertices.length); return vertices[index];
      });
      const edges = points.slice(1).map(p => p.position.map((value, axis) => value - points[0].position[axis]));
      const face = cross(...edges);
      assert.ok(face.reduce((sum, value, axis) => sum + value * points[0].normal[axis], 0) > 1e-10, `Invalid winding: ${material.name}`);
      triangleCount++;
    }
  }
  assert.ok(triangleCount < 900000, "Leave room beneath the current RC one-million-triangle limit");
  return { vertexCount: vertices.length, triangleCount, materialCount: groups.length,
    luminousMaterialCount: groups.filter(value => value.name.startsWith("AutoLuminous_")).length,
    sourceTriangleCount: groups.filter(value => value.texture >= 0).reduce((sum, value) => sum + value.indices.length / 3, 0),
    textureCount: model.textures.length, vertexIndexSize: vertices.length > 65535 ? 4 : 2,
    bounds: Object.fromEntries(["x", "y", "z"].map((axis, index) => [axis, vertices.reduce((bounds, value) =>
      [Math.min(bounds[0], value.position[index]), Math.max(bounds[1], value.position[index])], [Infinity, -Infinity])])) };
}

class Writer {
  offset = 0;
  constructor(size) { this.buffer = Buffer.alloc(size); }
  u8(v) { this.buffer.writeUInt8(v, this.offset++); }
  i8(v) { this.buffer.writeInt8(v, this.offset++); }
  u16(v) { this.buffer.writeUInt16LE(v, this.offset); this.offset += 2; }
  i32(v) { this.buffer.writeInt32LE(v, this.offset); this.offset += 4; }
  f32(v) { this.buffer.writeFloatLE(v, this.offset); this.offset += 4; }
  vector(values) { for (const v of values) this.f32(v); }
  text(value) { const bytes = Buffer.from(value, "utf16le"); this.i32(bytes.length); bytes.copy(this.buffer, this.offset); this.offset += bytes.length; }
}

export function encodeLuminousStage(model, report = validateLuminousStage(model)) {
  const { vertexCount, triangleCount, vertexIndexSize } = report;
  const writer = new Writer(vertexCount * 38 + triangleCount * 3 * vertexIndexSize + 65536);
  const vertexIndex = value => vertexIndexSize === 4 ? writer.i32(value) : writer.u16(value);
  for (const value of [0x50, 0x4d, 0x58, 0x20]) writer.u8(value);
  writer.f32(2); writer.u8(8);
  for (const value of [0, 0, vertexIndexSize, 1, 1, 1, 1, 1]) writer.u8(value);
  writer.text(`ルミナス負荷ステージ ${model.preset}`); writer.text(`Luminous stage ${model.preset}`);
  writer.text("自作の64発光材質ステージ。LightOff/LightUp は MMD_modoki の発光制御用。遮蔽板スライドは頂点モーフ。外部配布物なし。");
  writer.text("Generated by scripts/generate-luminous-stage-fixture.mjs. MIT; no third-party assets.");
  writer.i32(vertexCount);
  for (const vertex of model.vertices) {
    writer.vector(vertex.position); writer.vector(vertex.normal); writer.vector(vertex.uv);
    writer.u8(0); writer.i8(0); writer.f32(0); // BDEF1, Center, no outline.
  }
  writer.i32(triangleCount * 3);
  for (const group of model.groups) for (const index of group.indices) vertexIndex(index);
  writer.i32(model.textures.length);
  for (const texture of model.textures) writer.text(texture);
  writer.i32(model.groups.length);
  for (const group of model.groups) {
    writer.text(group.name); writer.text(group.name); writer.vector([...group.diffuse, 1]);
    writer.vector([0, 0, 0]); writer.f32(1); writer.vector([0, 0, 0]);
    writer.u8(0x0c); writer.vector([0, 0, 0, 0]); writer.f32(0);
    writer.i8(group.texture); writer.i8(-1); writer.u8(0); writer.u8(1); writer.u8(0);
    writer.text("Opaque; shadow caster/receiver; no edge"); writer.i32(group.indices.length);
  }
  writer.i32(1); writer.text("センター"); writer.text("Center"); writer.vector([0, 0, 0]);
  writer.i8(-1); writer.i32(0); writer.u16(0x001e); writer.vector([0, 1, 0]);
  writer.i32(3);
  // Empty group morphs intentionally carry only the conventional AL control names.
  for (const name of ["LightOff", "LightUp"]) {
    writer.text(name); writer.text(name); writer.u8(4); writer.u8(0); writer.i32(0);
  }
  writer.text("遮蔽板スライド"); writer.text("Screen slide"); writer.u8(4); writer.u8(1);
  writer.i32(model.screenVertices.length);
  for (const index of model.screenVertices) { vertexIndex(index); writer.vector([4, 0, 0]); }
  writer.i32(2);
  writer.text("Root"); writer.text("Root"); writer.u8(1); writer.i32(1); writer.u8(0); writer.i8(0);
  writer.text("表情"); writer.text("Expression"); writer.u8(1); writer.i32(3);
  for (const index of [0, 1, 2]) { writer.u8(1); writer.i8(index); }
  writer.i32(0); writer.i32(0); // Rigid bodies, joints.
  return writer.buffer.subarray(0, writer.offset);
}

function pngChunk(name, data) {
  const type = Buffer.from(name), body = Buffer.concat([type, data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const chunk = Buffer.alloc(data.length + 12); chunk.writeUInt32BE(data.length);
  body.copy(chunk, 4); chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4); return chunk;
}
export function createPanelTexture(index) {
  const size = 64, pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const stripe = ((x + index * 3) % 16 < 3) || ((y + index * 5) % 24 < 3);
    const value = Math.round((stripe ? 0.18 : 0.65 + 0.35 * x / (size - 1)) * 255);
    pixels.set([value, value, value, 255], offset);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0))]);
}

export async function generateLuminousStage({ preset = "fixture", output } = {}) {
  const model = createLuminousStage(preset), counts = validateLuminousStage(model), bytes = encodeLuminousStage(model, counts);
  const outputPath = resolve(output ?? resolve(root, preset === "fixture" ? "test/fixtures/luminous-stage" : `local-references/luminous-stage/${preset}`, `luminous-stage-${preset}.pmx`));
  const report = { preset, ...counts, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
    bones: 1, morphs: ["LightOff", "LightUp", "遮蔽板スライド"], rigidBodies: 0, joints: 0,
    camera: { position: { x: 55, y: 48, z: -78 }, target: { x: 0, y: 5, z: 0 } },
    coveredCamera: { position: { x: -14, y: 6, z: -28 }, target: { x: -10, y: 4, z: -4 } } };
  await mkdir(resolve(dirname(outputPath), "textures"), { recursive: true });
  await writeFile(outputPath, bytes);
  for (const [index, texture] of model.textures.entries()) await writeFile(resolve(dirname(outputPath), texture), createPanelTexture(index));
  await writeFile(`${outputPath}.json`, `${JSON.stringify(report, null, 2)}\n`);
  return { outputPath, report };
}

async function readBack(outputPath, report) {
  const { createServer } = await import("vite");
  const vite = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { PmxReader } = await vite.ssrLoadModule("/node_modules/babylon-mmd/esm/Loader/Parser/pmxReader.js");
    const bytes = await readFile(outputPath);
    const pmx = await PmxReader.ParseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(pmx.vertices.length, report.vertexCount); assert.equal(pmx.indices.length / 3, report.triangleCount);
    assert.equal(pmx.materials.length, report.materialCount); assert.equal(pmx.textures.length, report.textureCount);
    assert.equal(pmx.materials.reduce((sum, material) => sum + material.indexCount, 0), pmx.indices.length);
    assert.deepEqual(pmx.morphs.map(morph => morph.name), report.morphs);
  } finally { await vite.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { preset: { type: "string", default: "fixture" }, output: { type: "string" } } });
  const result = await generateLuminousStage(values);
  await readBack(result.outputPath, result.report);
  console.log(JSON.stringify({ ...result, readBack: "passed" }, null, 2));
}

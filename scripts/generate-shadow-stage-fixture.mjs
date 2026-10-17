import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { writePmx } from "./generate-external-parent-test-models.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, "test/fixtures/shadow-stage");
const floorY = 1;

export function createWideShadowStage() {
  const vertices = [];
  const groups = new Map();
  const material = (name, englishName, color) => {
    const group = { name, englishName, diffuse: [...color, 1], ambient: [0, 0, 0], edge: false, indices: [] };
    groups.set(englishName, group);
    return group;
  };
  const floorA = material("床・薄灰", "Floor A", [0.72, 0.74, 0.76]);
  const floorB = material("床・濃灰", "Floor B", [0.64, 0.66, 0.68]);
  const smooth = material("中央・連続影確認床", "Smooth shadow lane", [0.88, 0.88, 0.88]);
  const structure = material("壁・柱・庇", "Occluders", [0.7, 0.66, 0.6]);
  const fine = material("柵・細部", "Fine casters", [0.44, 0.5, 0.57]);
  const steps = material("階段・斜面", "Steps and ramp", [0.64, 0.71, 0.67]);
  const buildings = material("遠景ブロック", "Far blocks", [0.65, 0.62, 0.57]);
  const plaque = material("距離表示・台", "Distance plaques", [0.9, 0.85, 0.64]);
  const ink = material("距離表示・数字", "Distance digits", [0.08, 0.1, 0.12]);
  const red = material("X正方向", "Positive X", [0.8, 0.16, 0.12]);
  const blue = material("Z正方向", "Positive Z", [0.12, 0.3, 0.8]);

  function face(group, points) {
    const [a, b, c] = points;
    const ab = b.map((v, i) => v - a[i]), ac = c.map((v, i) => v - a[i]);
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const length = Math.hypot(...cross);
    assert.ok(length > 0);
    const normal = cross.map(v => v / length);
    const offset = vertices.length;
    points.forEach((position, i) => vertices.push({ position, normal, uv: [[0, 1], [1, 1], [1, 0], [0, 0]][i] }));
    group.indices.push(offset, offset + 1, offset + 2);
    if (points.length === 4) group.indices.push(offset, offset + 2, offset + 3);
  }

  function box(group, x, y, z, width, height, depth, top = true) {
    const l = x - width / 2, r = x + width / 2, n = z - depth / 2, f = z + depth / 2, t = y + height;
    face(group, [[l, y, f], [r, y, f], [r, t, f], [l, t, f]]);
    face(group, [[r, y, n], [l, y, n], [l, t, n], [r, t, n]]);
    face(group, [[l, y, n], [l, y, f], [l, t, f], [l, t, n]]);
    face(group, [[r, y, f], [r, y, n], [r, t, n], [r, t, f]]);
    if (top) face(group, [[l, t, f], [r, t, f], [r, t, n], [l, t, n]]);
    face(group, [[l, y, n], [r, y, n], [r, y, f], [l, y, f]]);
  }

  // Disjoint top faces: the checker and lane do not overlap a hidden full floor.
  box(floorB, 0, -15, 2000, 6000, floorY + 15, 6000, false);
  for (let x = -3000; x < 3000; x += 200) for (let z = -1000; z < 5000; z += 200) {
    if (x >= -200 && x < 200) continue;
    const group = ((x + 3000) / 200 + (z + 1000) / 200) % 2 === 0 ? floorA : floorB;
    face(group, [[x, floorY, z], [x, floorY, z + 200], [x + 200, floorY, z + 200], [x + 200, floorY, z]]);
  }
  face(smooth, [[-200, floorY, -1000], [-200, floorY, 5000], [200, floorY, 5000], [200, floorY, -1000]]);

  // Long wall casts an uninterrupted strip across multiple cascade splits.
  box(structure, -120, floorY, 2250, 12, 150, 4500);
  const distances = [0, 100, 250, 500, 1000, 1500, 2000, 3000, 4000];
  for (const z of distances) {
    box(structure, 420, floorY, z, 40, 100, 40);
    box(fine, 540, floorY, z, 8, 100, 8);
    const radius = 22, height = 100, cx = 660, segments = 16;
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2, b = (i + 1) / segments * Math.PI * 2;
      const p = [cx + radius * Math.cos(a), floorY, z + radius * Math.sin(a)];
      const q = [cx + radius * Math.cos(b), floorY, z + radius * Math.sin(b)];
      const pt = [p[0], floorY + height, p[2]], qt = [q[0], floorY + height, q[2]];
      face(structure, [q, p, pt, qt]);
      face(structure, [[cx, floorY + height, z], qt, pt]);
      face(structure, [[cx, floorY, z], p, q]);
    }
  }

  // Overhangs expose contact gaps and broad occlusion on both floor and posts.
  for (const z of [200, 900, 2000, 3500]) {
    box(structure, -700, floorY + 120, z, 400, 12, 240);
    for (const dx of [-170, 170]) for (const dz of [-90, 90]) {
      box(structure, -700 + dx, floorY, z + dz, 16, 120, 16);
    }
  }
  // Identical fine patterns near, mid-distance and far away.
  for (const z of [250, 1000, 2500, 4000]) {
    let x = 920;
    for (const gap of [2, 5, 10, 20]) for (let i = 0; i < 5; i++) {
      box(fine, x, floorY, z, 4, 80, 8);
      x += 4 + gap;
    }
    box(fine, 1085, floorY + 60, z, 350, 5, 8);
  }

  // Non-overlapping closed stair treads; neighboring faces are internal.
  for (let i = 0; i < 10; i++) box(steps, 950, floorY, 500 + i * 25, 200, (i + 1) * 10, 25);
  const l = 1250, r = 1450, n = 500, f = 750, y = floorY, t = floorY + 100;
  face(steps, [[l, y, n], [l, t, f], [r, t, f], [r, y, n]]);
  face(steps, [[l, y, n], [l, y, f], [l, t, f]]);
  face(steps, [[r, y, n], [r, t, f], [r, y, f]]);
  face(steps, [[l, y, f], [r, y, f], [r, t, f], [l, t, f]]);
  face(steps, [[l, y, n], [r, y, n], [r, y, f], [l, y, f]]);
  for (const [i, height] of [20, 40, 80, 160].entries()) box(structure, 450 + i * 120, floorY, -350, 40, height, 40);

  for (const side of [-1, 1]) for (const [i, z] of [1500, 3000, 4300].entries()) {
    box(buildings, side * 2000, floorY, z, 420, [200, 400, 800][i], 420);
    box(buildings, side * 2500, floorY, z - 250, 220, [100, 240, 480][i], 240);
  }

  // Seven-segment geometry keeps the numeric labels independent of fonts/textures.
  const digitSegments = ["abcedf", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgecd", "abc", "abcdefg", "abfgcd"];
  const segments = {
    a: [4, 14, 8, 1.4], b: [8, 10.5, 1.4, 7], c: [8, 3.5, 1.4, 7],
    d: [4, 0, 8, 1.4], e: [0, 3.5, 1.4, 7], f: [0, 10.5, 1.4, 7], g: [4, 7, 8, 1.4],
  };
  for (const z of distances) {
    const text = String(z), width = text.length * 12 + 8, startX = 260;
    box(plaque, startX + (width - 12) / 2, floorY, z + 7, width, 0.8, 22);
    [...text].forEach((digit, index) => {
      for (const segment of digitSegments[Number(digit)]) {
        const [dx, dz, w, d] = segments[segment];
        box(ink, startX + index * 12 + dx, floorY + 0.8, z + dz, w, 0.35, d);
      }
    });
    box(ink, 220, floorY, z, 20, 0.5, 2);
  }
  box(red, 60, floorY, -450, 120, 0.5, 8);
  face(red, [[120, floorY + 0.5, -435], [145, floorY + 0.5, -450], [120, floorY + 0.5, -465]]);
  box(blue, 0, floorY, -390, 8, 0.5, 120);
  face(blue, [[-15, floorY + 0.5, -330], [0, floorY + 0.5, -305], [15, floorY + 0.5, -330]]);

  return {
    modelName: "広域シャドウ確認ステージ",
    englishModelName: "Wide Shadow Test Stage",
    comment: "MMD_modoki 自作・再配布可能 fixture。6000×6000単位。中央無地床と長壁、柱列、庇、柵、階段、斜面、遠景ブロック。数字はZ距離。床上面Y=1。外部画像・物理・モーフなし。",
    vertices, materialGroups: [...groups.values()],
  };
}

function validateGeometry(model) {
  assert.ok(model.vertices.length < 65536, "Shared fixture writer uses 16-bit vertex indices");
  for (const vertex of model.vertices) {
    assert.ok([...vertex.position, ...vertex.normal, ...vertex.uv].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...vertex.normal) - 1) < 1e-6);
  }
  for (const material of model.materialGroups) {
    assert.equal(material.indices.length % 3, 0);
    for (const index of material.indices) assert.ok(Number.isInteger(index) && index >= 0 && index < model.vertices.length);
    for (let i = 0; i < material.indices.length; i += 3) {
      const [a, b, c] = material.indices.slice(i, i + 3).map(index => model.vertices[index]);
      const ab = b.position.map((v, j) => v - a.position[j]);
      const ac = c.position.map((v, j) => v - a.position[j]);
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      assert.ok(cross.reduce((sum, v, j) => sum + v * a.normal[j], 0) > 0, `${material.name}: reversed/degenerate triangle`);
    }
  }
}

async function main() {
  const model = createWideShadowStage();
  validateGeometry(model);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "shadow-stage-wide.pmx");
  await writeFile(outputPath, writePmx(model));
  const vite = await createServer({ root: repositoryRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { PmxReader } = await vite.ssrLoadModule("/node_modules/babylon-mmd/esm/Loader/Parser/pmxReader.js");
    const bytes = await readFile(outputPath);
    const parsed = await PmxReader.ParseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.equal(parsed.header.modelName, model.modelName);
    assert.equal(parsed.vertices.length, model.vertices.length);
    assert.equal(parsed.indices.length, model.materialGroups.reduce((sum, m) => sum + m.indices.length, 0));
    assert.equal(parsed.materials.length, model.materialGroups.length);
    assert.equal(parsed.materials.reduce((sum, m) => sum + m.indexCount, 0), parsed.indices.length);
    assert.equal(parsed.bones.length, 1);
    assert.equal(parsed.rigidBodies.length + parsed.joints.length + parsed.morphs.length, 0);
    assert.equal(parsed.textures.length, 0);
    for (const material of parsed.materials) assert.equal(material.flag & 0x0c, 0x0c);
    console.log(`[shadow-stage] ${outputPath}`);
    console.log(`[shadow-stage] ${parsed.vertices.length} vertices, ${parsed.indices.length / 3} triangles, ${parsed.materials.length} materials, ${bytes.length} bytes; PMX round-trip OK`);
  } finally {
    await vite.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

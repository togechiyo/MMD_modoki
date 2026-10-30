import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { writePmx } from "./generate-external-parent-test-models.mjs";

/** Original flat-shaded boxes; no external model, texture, physics or toon dependency. */
export function createRcDiffuseGiStage(sourceColor = [0.9, 0.025, 0.025]) {
  const vertices = [], materialGroups = [];
  const material = (name, color) => {
    const group = { name, englishName: name, diffuse: [...color, 1], ambient: [0, 0, 0], edge: false, indices: [] };
    materialGroups.push(group); return group;
  };
  const receiver = material("GI Receiver", [0.8, 0.8, 0.8]);
  const source = material("GI Source", sourceColor);
  const blocker = material("GI Light Blocker", [0, 0, 0]);
  const box = (group, min, max, boneIndex = 0) => {
    const [l, b, n] = min, [r, t, f] = max;
    for (const [points, normal] of [
      [[[l,b,f],[r,b,f],[r,t,f],[l,t,f]], [0,0,1]],
      [[[r,b,n],[l,b,n],[l,t,n],[r,t,n]], [0,0,-1]],
      [[[l,b,n],[l,b,f],[l,t,f],[l,t,n]], [-1,0,0]],
      [[[r,b,f],[r,b,n],[r,t,n],[r,t,f]], [1,0,0]],
      [[[l,t,f],[r,t,f],[r,t,n],[l,t,n]], [0,1,0]],
      [[[l,b,n],[r,b,n],[r,b,f],[l,b,f]], [0,-1,0]],
    ]) {
      const first = vertices.length;
      points.forEach((position, i) => vertices.push({ position, normal, uv: [[0,0],[0,1],[1,1],[1,0]][i], boneIndex }));
      group.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  };
  box(receiver, [-2, -0.2, -3], [2, 0, 3]);
  box(source, [-3.2, 0, -3], [-3, 4, 3]);
  // tx=-20 puts this above the source. It blocks source→light rays but lies
  // above every receiver→source segment, so those two visibility tests differ.
  box(blocker, [17, 5, -4], [25, 5.2, 4], 1);
  return { modelName: "RC拡散GI確認ステージ", englishModelName: "RC Diffuse GI Test Stage", noToon: true,
    comment: "MMD_modoki自作・再配布可能。白receiver、色source、黒遮光板の3箱/36三角形。外部assetなし。遮光板bone tx=-20でsourceの直接光だけ遮蔽。",
    vertices, materialGroups, bones: [
      { name: "センター", englishName: "Center", parentBoneIndex: -1 },
      { name: "光遮蔽板", englishName: "Light Blocker", parentBoneIndex: 0 },
    ] };
}

function texturedPmx(model, textureName) {
  // The shared fixture writer exposes one texture-table slot via toonTexture.
  // noToon keeps that slot unbound; bind it solely as the source diffuse map.
  // Walk and assert its small BDEF1 / int8 layout rather than searching binary strings.
  const bytes = writePmx({ ...model, toonTexture: textureName });
  assert.equal(bytes[8], 8); assert.equal(bytes[11], 1); assert.equal(bytes[12], 1); assert.equal(bytes[14], 1);
  let offset = 17;
  const skipText = () => { const length = bytes.readInt32LE(offset); offset += 4 + length; };
  for (let i = 0; i < 4; i++) skipText();
  const vertices = bytes.readInt32LE(offset); offset += 4 + vertices * 38;
  const indices = bytes.readInt32LE(offset); offset += 4 + indices;
  assert.equal(bytes.readInt32LE(offset), 1); offset += 4; skipText();
  assert.equal(bytes.readInt32LE(offset), model.materialGroups.length); offset += 4;
  for (const material of model.materialGroups) {
    skipText(); skipText(); offset += 65;
    assert.equal(bytes.readInt8(offset), -1); assert.equal(bytes[offset + 3], 0); assert.equal(bytes.readInt8(offset + 4), -1);
    if (material.name === "GI Source") bytes.writeInt8(0, offset);
    offset += 5; skipText(); offset += 4;
  }
  return bytes;
}

function redTextureBmp() {
  const bytes = Buffer.alloc(70);
  bytes.write("BM"); bytes.writeUInt32LE(70, 2); bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14); bytes.writeInt32LE(2, 18); bytes.writeInt32LE(2, 22);
  bytes.writeUInt16LE(1, 26); bytes.writeUInt16LE(24, 28); bytes.writeUInt32LE(16, 34);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const offset = 54 + y * 8 + x * 3; bytes[offset] = 6; bytes[offset + 1] = 6; bytes[offset + 2] = 230;
  }
  return bytes;
}

export async function generateRcDiffuseGiFixture() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = path.join(root, "test/fixtures/rc-diffuse-gi-stage");
  await mkdir(directory, { recursive: true });
  for (const [variant, color] of [["red", [0.9, 0.025, 0.025]], ["black", [0, 0, 0]]]) {
    await writeFile(path.join(directory, `rc-diffuse-gi-${variant}.pmx`), writePmx(createRcDiffuseGiStage(color)));
  }
  await writeFile(path.join(directory, "source-red.bmp"), redTextureBmp());
  await writeFile(path.join(directory, "rc-diffuse-gi-textured-red.pmx"), texturedPmx(createRcDiffuseGiStage([1, 1, 1]), "source-red.bmp"));
  return directory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await generateRcDiffuseGiFixture());

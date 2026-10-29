import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writePmx } from "./generate-external-parent-test-models.mjs";

// Original geometry, no external assets. Keep the scene small enough for deterministic GPU tests.
export function createRcSkyStage() {
  const vertices = [], materialGroups = [];
  const material = (name, color) => {
    const group = { name, englishName: name, diffuse: [...color, 1], ambient: [0, 0, 0], edge: false, indices: [] };
    materialGroups.push(group); return group;
  };
  const floor = material("床・天空比較", [0.8, 0.8, 0.8]), walls = material("庇・壁", [0.65, 0.7, 0.8]);
  const markers = material("高さ比較", [0.85, 0.7, 0.4]);
  const face = (group, points, normal) => {
    const base = vertices.length;
    points.forEach((position, i) => vertices.push({ position, normal, uv: [[0, 0], [0, 1], [1, 1], [1, 0]][i] }));
    group.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const box = (group, x, y, z, w, h, d) => {
    const l = x-w/2, r = x+w/2, n = z-d/2, f = z+d/2, t = y+h;
    face(group, [[l,y,f],[r,y,f],[r,t,f],[l,t,f]], [0,0,1]);
    face(group, [[r,y,n],[l,y,n],[l,t,n],[r,t,n]], [0,0,-1]);
    face(group, [[l,y,n],[l,y,f],[l,t,f],[l,t,n]], [-1,0,0]);
    face(group, [[r,y,f],[r,y,n],[r,t,n],[r,t,f]], [1,0,0]);
    face(group, [[l,t,f],[r,t,f],[r,t,n],[l,t,n]], [0,1,0]);
    face(group, [[l,y,n],[r,y,n],[r,y,f],[l,y,f]], [0,-1,0]);
  };
  box(floor, 0, -0.2, 0, 16, 0.2, 12);
  const roofStart = vertices.length;
  box(walls, -4, 4, 1, 7, 0.2, 8);
  const roofVertices = Array.from({ length: vertices.length - roofStart }, (_, i) => roofStart + i);
  for (const index of roofVertices) vertices[index].boneIndex = 1;
  box(walls, -7.45, 0, 1, 0.1, 4, 8);
  box(walls, -4, 0, 4.95, 7, 4, 0.1);
  box(markers, -4, 0, 0, 1.5, 1.5, 1.5);
  box(markers, 4, 0, 0, 1.5, 1.5, 1.5);
  box(markers, -4, 4.2, 1, 1.5, 1.5, 1.5);
  return { modelName: "RC天空遮蔽確認ステージ", englishModelName: "RC Sky Occlusion Test Stage",
    comment: "MMD_modoki自作・再配布可能fixture。左は庇と2枚の壁、右は屋外。同じ材質の箱を屋内・屋外・屋根上へ配置。庇のみボーンまたは頂点モーフで移動可能。外部画像・物理なし。",
    vertices, materialGroups,
    bones: [
      { name: "センター", englishName: "Center", parentBoneIndex: -1 },
      { name: "庇移動", englishName: "Roof Translation", parentBoneIndex: 0 },
    ],
    vertexMorphs: [{ name: "庇移動モーフ", offsets: roofVertices.map(index => ({ index, offset: [16, 0, 0] })) }],
  };
}

export async function generateRcSkyStage() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = path.join(root, "test/fixtures/rc-sky-stage");
  await mkdir(directory, { recursive: true });
  const model = createRcSkyStage();
  const destination = path.join(directory, "rc-sky-stage.pmx");
  await writeFile(destination, writePmx(model));
  return destination;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(await generateRcSkyStage());

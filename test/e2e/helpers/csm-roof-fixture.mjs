import { writePmx } from "../../../scripts/generate-external-parent-test-models.mjs";

/** Self-authored, texture-free PMX equivalent of the diagnostic roof box.
 * Unlike a runtime-only mesh, normal model loading preserves this caster in export projects.
 */
export function createCsmRoofFixture() {
  const vertices = [], indices = [];
  const left = -2000, right = 2000, near = -4000, far = 6000, bottom = 299, top = 301;
  const faces = [
    [[[left, bottom, far], [right, bottom, far], [right, top, far], [left, top, far]], [0, 0, 1]],
    [[[right, bottom, near], [left, bottom, near], [left, top, near], [right, top, near]], [0, 0, -1]],
    [[[left, bottom, near], [left, bottom, far], [left, top, far], [left, top, near]], [-1, 0, 0]],
    [[[right, bottom, far], [right, bottom, near], [right, top, near], [right, top, far]], [1, 0, 0]],
    [[[left, top, far], [right, top, far], [right, top, near], [left, top, near]], [0, 1, 0]],
    [[[left, bottom, near], [right, bottom, near], [right, bottom, far], [left, bottom, far]], [0, -1, 0]],
  ];
  for (const [positions, normal] of faces) {
    const offset = vertices.length;
    positions.forEach((position, index) => vertices.push({ position, normal,
      uv: [[0, 1], [1, 1], [1, 0], [0, 0]][index] }));
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  }
  return writePmx({ modelName: "CSM距離フェード確認用屋根", englishModelName: "CSM distance fade roof",
    comment: "Self-authored test-only box: x[-2000,2000], y[299,301], z[-4000,6000]. No external assets.",
    noToon: true, vertices,
    materialGroups: [{ name: "屋根", englishName: "Roof", diffuse: [.5, .5, .5, 1],
      ambient: [0, 0, 0], edge: false, indices }] });
}

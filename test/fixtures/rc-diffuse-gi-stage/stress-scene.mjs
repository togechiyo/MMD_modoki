// Original procedural PMX. All surfaces use opaque, untextured MMD materials.
const roomSegments = 64, rings = 64, sides = 128;
const shellCenters = [[-18, 1, 0], [-6, 1, 5], [6, 1, -4], [18, 1, 1]];
const staticTriangles = 3 * roomSegments ** 2 * 2;
const movingTriangles = shellCenters.length * rings * sides * 2;

export const rcGiStressScene = {
  triangleCount: staticTriangles + movingTriangles, staticTriangles, movingTriangles,
  boneNames: { root: "曲面全体", left: "曲面左", right: "曲面右" }, morphName: "波打ち",
  camera: { tx: 0, ty: 8, tz: 0, rx: -10, ry: -8, camDistance: 70 },
};

export function createRcGiStressScene() {
  const vertices = [], materialGroups = [], offsets = [];
  function surface(name, rgb, columns, rows, positionAt, vertexPose) {
    const first = vertices.length, stride = columns + 1, indices = [];
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const u = column / columns, v = row / rows;
        const position = positionAt(u, v);
        const boneIndex = vertexPose ? vertexPose(u, v, position, vertices.length) : 0;
        vertices.push({ position, normal: [0, 0, 0], uv: [u, v], boneIndex });
        if (row < rows && column < columns) {
          const a = first + row * stride + column;
          indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
        }
      }
    }
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const i = first + row * stride + column;
        const west = vertices[i - (column > 0 ? 1 : 0)].position;
        const east = vertices[i + (column < columns ? 1 : 0)].position;
        const south = vertices[i - (row > 0 ? stride : 0)].position;
        const north = vertices[i + (row < rows ? stride : 0)].position;
        const [ax, ay, az] = east.map((value, axis) => value - west[axis]);
        const [bx, by, bz] = north.map((value, axis) => value - south[axis]);
        const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
        const length = Math.hypot(...n);
        vertices[i].normal = n.map(value => value / length);
      }
    }
    materialGroups.push({ name, englishName: name, diffuse: [...rgb, 1], ambient: [0, 0, 0],
      edge: false, doubleSided: true, indices });
  }

  surface("Stage floor", [.65, .64, .62], roomSegments, roomSegments, (u, v) =>
    [(u - .5) * 66, .35 * Math.cos(4 * Math.PI * u) * Math.cos(6 * Math.PI * v), (.5 - v) * 48]);
  for (const side of [-1, 1]) {
    surface(side < 0 ? "Red wall" : "Blue wall", side < 0 ? [.69, .18, .13] : [.19, .36, .7],
      roomSegments, roomSegments, (u, v) => [
        side * (33 + 1.2 * Math.sin(12 * Math.PI * u) * v), 19 * v - .5, side * (u - .5) * 48,
      ]);
  }

  const shellColors = [[.72, .45, .26], [.68, .72, .76], [.24, .65, .58], [.67, .41, .52]];
  shellCenters.forEach(([cx, cy, cz], shell) => {
    surface("Pleated shell " + (shell + 1), shellColors[shell], sides, rings, (u, v) => {
      const angle = -2 * Math.PI * u;
      const radius = 2.6 + 2.3 * Math.sin(Math.PI * v) + .6 * Math.cos(9 * angle + 5 * v + shell);
      return [cx + radius * Math.cos(angle), cy + v * (15 + shell % 2), cz + radius * Math.sin(angle)];
    }, (u, v, position, index) => {
      if (v > 0 && v < 1) {
        const pulse = .16 * Math.sin(Math.PI * v) * Math.cos(6 * Math.PI * u + 4 * v);
        offsets.push({ index, offset: [(position[0] - cx) * pulse, 0, (position[2] - cz) * pulse] });
      }
      if (v <= .5) return 1;
      return shell < 2 ? 2 : 3;
    });
  });
  const { root, left, right } = rcGiStressScene.boneNames;
  return {
    modelName: "GI RC負荷測定", englishModelName: "GI RC stress scene", noToon: true,
    comment: "Original three-part stage and four pleated surfaces with a shared translation, two articulated branches and a radial morph.",
    vertices, materialGroups, vertexMorphs: [{ name: rcGiStressScene.morphName, offsets }],
    bones: [
      { name: "センター", englishName: "Center", parentBoneIndex: -1 },
      { name: root, englishName: "Shell group", parentBoneIndex: 0 },
      { name: left, englishName: "Left shells", parentBoneIndex: 1, position: [-12, 9, 0] },
      { name: right, englishName: "Right shells", parentBoneIndex: 1, position: [12, 9, 0] },
    ],
  };
}

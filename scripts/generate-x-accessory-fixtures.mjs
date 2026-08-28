import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../test/fixtures/accessory",
);

const faceDefinitions = [
  {
    normal: [0, 0, -1],
    corners: [[-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], [0.5, 0, -0.5]],
  },
  {
    normal: [0, 0, 1],
    corners: [[0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5], [-0.5, 0, 0.5]],
  },
  {
    normal: [1, 0, 0],
    corners: [[0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5], [0.5, 0, 0.5]],
  },
  {
    normal: [-1, 0, 0],
    corners: [[-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5], [-0.5, 0, -0.5]],
  },
  {
    normal: [0, 1, 0],
    corners: [[-0.5, 1, -0.5], [-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5]],
  },
  {
    normal: [0, -1, 0],
    corners: [[-0.5, 0, 0.5], [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5]],
  },
];

function formatNumber(value) {
  const normalized = Math.abs(value) < 1e-9 ? 0 : value;
  return Number(normalized.toFixed(6)).toString();
}

function buildTofuMesh({ columns, rows, layers, cubeSize, cellSize, duplicateFaceCount }) {
  const positions = [];
  const faces = [];
  const normalFaces = [];
  const originals = [];

  for (let layer = 0; layer < layers; layer += 1) {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const centerX = (column - (columns - 1) / 2) * cellSize;
        const centerY = row * cellSize;
        const centerZ = (layer - (layers - 1) / 2) * cellSize;

        for (let faceIndex = 0; faceIndex < faceDefinitions.length; faceIndex += 1) {
          const definition = faceDefinitions[faceIndex];
          const vertexStart = positions.length;
          for (const [x, y, z] of definition.corners) {
            positions.push([
              centerX + x * cubeSize,
              centerY + y * cubeSize,
              centerZ + z * cubeSize,
            ]);
          }
          const face = [vertexStart, vertexStart + 1, vertexStart + 2, vertexStart + 3];
          faces.push(face);
          normalFaces.push([faceIndex, faceIndex, faceIndex, faceIndex]);
          originals.push({ face, faceIndex });
        }
      }
    }
  }

  if (duplicateFaceCount > originals.length) {
    throw new Error(`Requested ${duplicateFaceCount} duplicates for ${originals.length} source faces`);
  }
  for (let index = 0; index < duplicateFaceCount; index += 1) {
    const { face, faceIndex } = originals[index];
    faces.push([...face].reverse());
    normalFaces.push([faceIndex, faceIndex, faceIndex, faceIndex]);
  }

  return { positions, faces, normalFaces };
}

function formatSequence(items, formatItem, indent = "  ") {
  return items.map((item, index) => (
    `${indent}${formatItem(item)}${index === items.length - 1 ? ";" : ","}`
  )).join("\n");
}

function serializeXFixture(name, mesh) {
  const positions = formatSequence(
    mesh.positions,
    ([x, y, z]) => `${formatNumber(x)};${formatNumber(y)};${formatNumber(z)};`,
  );
  const faces = formatSequence(mesh.faces, (face) => `${face.length};${face.join(",")};`);
  const faceMaterials = formatSequence(mesh.faces, () => "0", "    ");
  const normals = formatSequence(
    faceDefinitions,
    ({ normal }) => `${normal.join(";")};`,
    "    ",
  );
  const normalFaces = formatSequence(
    mesh.normalFaces,
    (face) => `${face.length};${face.join(",")};`,
    "    ",
  );

  return `xof 0303txt 0032

Mesh ${name} {
  ${mesh.positions.length};
${positions}
  ${mesh.faces.length};
${faces}

  MeshMaterialList {
    1;
    ${mesh.faces.length};
${faceMaterials}
    Material TofuMaterial {
      0.92;0.92;0.92;1.0;;
      16.0;
      0.12;0.12;0.12;;
      0.25;0.25;0.25;;
    }
  }

  MeshNormals {
    ${faceDefinitions.length};
${normals}
    ${mesh.normalFaces.length};
${normalFaces}
  }
}
`;
}

const fixtures = [
  {
    fileName: "tofu.x",
    meshName: "TofuCube",
    options: {
      columns: 1,
      rows: 1,
      layers: 1,
      cubeSize: 0.1,
      cellSize: 1,
      duplicateFaceCount: 0,
    },
  },
  {
    fileName: "tofu-grid-reversed-duplicates.x",
    meshName: "TofuGridReversedDuplicates",
    options: {
      columns: 16,
      rows: 16,
      layers: 2,
      cubeSize: 0.055,
      cellSize: 0.065,
      duplicateFaceCount: 2935,
    },
  },
];

mkdirSync(fixtureDirectory, { recursive: true });
for (const fixture of fixtures) {
  const mesh = buildTofuMesh(fixture.options);
  const outputPath = resolve(fixtureDirectory, fixture.fileName);
  writeFileSync(outputPath, serializeXFixture(fixture.meshName, mesh), "utf8");
  console.log(
    `Generated ${outputPath} (${mesh.positions.length} vertices, ${mesh.faces.length} faces, `
      + `${fixture.options.duplicateFaceCount} reversed duplicates)`,
  );
}

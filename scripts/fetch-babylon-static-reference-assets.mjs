import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Development-only acquisition. Tests and the application never fetch these files.
const commit = "c81f5d744fe8d41acfebd89eaeb7008c6f9659e3";
const sourceRoot = `https://raw.githubusercontent.com/BabylonJS/Assets/${commit}`;
const destination = resolve(import.meta.dirname, "../local-references/babylonjs/static-formats");
const sources = [
  ["LICENSE", "LICENSE", "7e7170e3cebf88a9f60c7b8421418323c09304da1af4d5e90f4da1dc1c8a2661"],
  ["Channel9.stl", "meshes/Channel9/Channel9.stl", "8b9d7cecc4fffdcc31b7dc5cf1bd4eab23b17c3392ea09efe411a44085bb5473"],
  ["combined_SPZv3.ply", "splats/combined_SPZv3.ply", "2d4d6154960c3de305cdd20d5feb3df97b9b3d39da0693b656c72a4800a391a4"],
];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

await mkdir(destination, { recursive: true });
for (const [name, source, expectedHash] of sources) {
  const path = resolve(destination, name);
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(`${sourceRoot}/${source}`);
    if (!response.ok) throw new Error(`Download failed: ${source} (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== expectedHash) throw new Error(`Source checksum mismatch: ${name}`);
    await writeFile(path, bytes);
  }
  if (sha256(bytes) !== expectedHash) throw new Error(`Local checksum mismatch: ${name}; existing file was preserved`);
  console.log(`${name}: ${bytes.length} bytes, SHA256 ${expectedHash}`);
}

// Convert the pinned ASCII STL into mesh PLY, retaining coordinates and facet normals.
// Credit: BabylonJS/Assets, Channel9, CC BY 4.0. These PLY files are derivatives.
const stl = await readFile(resolve(destination, "Channel9.stl"), "utf8");
const facets = [...stl.matchAll(/facet normal ([^\r\n]+)\s+outer loop\s+vertex ([^\r\n]+)\s+vertex ([^\r\n]+)\s+vertex ([^\r\n]+)\s+endloop\s+endfacet/g)]
  .map(match => match.slice(1).map(line => line.trim().split(/\s+/).map(Number)));
if (facets.length !== 5912 || facets.some(facet => facet.some(vector => vector.length !== 3 || vector.some(value => !Number.isFinite(value))))) {
  throw new Error("Unexpected Channel9 ASCII STL geometry");
}
for (const littleEndian of [true, false]) {
  const header = Buffer.from([
    "ply", `format binary_${littleEndian ? "little" : "big"}_endian 1.0`,
    `comment Derived from BabylonJS/Assets ${commit} meshes/Channel9/Channel9.stl; CC BY 4.0`,
    `element vertex ${facets.length * 3}`,
    ...["x", "y", "z", "nx", "ny", "nz"].map(property => `property float ${property}`),
    `element face ${facets.length}`, "property list uchar int vertex_indices", "end_header", "",
  ].join("\n"));
  const bytes = Buffer.alloc(header.length + facets.length * (3 * 24 + 13));
  header.copy(bytes);
  let offset = header.length;
  for (const [normal, ...vertices] of facets) {
    for (const vertex of vertices) {
      for (const value of [...vertex, ...normal]) {
        if (littleEndian) bytes.writeFloatLE(value, offset);
        else bytes.writeFloatBE(value, offset);
        offset += 4;
      }
    }
  }
  for (let face = 0; face < facets.length; face += 1) {
    bytes[offset++] = 3;
    for (let corner = 0; corner < 3; corner += 1) {
      if (littleEndian) bytes.writeInt32LE(face * 3 + corner, offset);
      else bytes.writeInt32BE(face * 3 + corner, offset);
      offset += 4;
    }
  }
  const name = `Channel9.${littleEndian ? "le" : "be"}.ply`;
  await writeFile(resolve(destination, name), bytes);
  console.log(`${name} (converted): ${bytes.length} bytes, SHA256 ${sha256(bytes)}`);
}
console.log("Source/credit: BabylonJS/Assets, CC BY 4.0; see docs/babylon-ply-stl-reference-assets-2026-10-09.md");

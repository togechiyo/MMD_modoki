import type { PackedXFaces } from "./x-packed-faces";

type XGeometrySource = {
    pos: ArrayLike<number>;
    faces: PackedXFaces;
    normals: { values: ArrayLike<number>; faces: PackedXFaces } | null;
    uvs: ArrayLike<number> | null;
    faceMats: ArrayLike<number>;
    mats: readonly unknown[];
};

type MaterialRange = { material: number; start: number; count: number };
type XGeometry = {
    positions: Float32Array;
    normals: Float32Array | null;
    uvs: Float32Array | null;
    indices: Uint32Array;
    ranges: MaterialRange[];
};

function float32(values: ArrayLike<number>): Float32Array {
    return values instanceof Float32Array ? values : Float32Array.from(values);
}

function matchingFaceLayout(left: PackedXFaces, right: PackedXFaces): boolean {
    if (left.offsets.length !== right.offsets.length) return false;
    for (let face = 0; face < left.offsets.length - 1; face++) {
        if (left.offsets[face] !== right.offsets[face] || left.offsets[face + 1] - left.offsets[face] < 3) return false;
    }
    return left.indices.length === right.indices.length;
}

function normalsFollowPositions(x: XGeometrySource, source: NonNullable<XGeometrySource["normals"]>, redundant: Uint8Array): boolean {
    if (source.values.length !== x.pos.length || (x.uvs && x.uvs.length !== x.pos.length / 3 * 2)) return false;
    const { offsets, indices } = x.faces;
    for (let face = 0; face < redundant.length; face++) {
        if (redundant[face]) continue;
        for (let corner = offsets[face]; corner < offsets[face + 1]; corner++) {
            if (indices[corner] !== source.faces.indices[corner]) return false;
        }
    }
    return true;
}

function indexedNormals(x: XGeometrySource, source: NonNullable<XGeometrySource["normals"]>, redundant: Uint8Array) {
    const { offsets, indices } = x.faces;
    const numPositions = x.pos.length / 3;
    const numNormals = source.values.length / 3;
    const heads = new Uint32Array(numPositions);
    const corners = new Uint32Array(indices.length);
    // Group corners by position. Each link is replaced by its output vertex once visited.
    for (let face = 0; face < redundant.length; face++) {
        if (redundant[face]) continue;
        for (let corner = offsets[face]; corner < offsets[face + 1]; corner++) {
            const position = indices[corner];
            if (position >= numPositions) throw new Error("X face vertex index is out of range");
            corners[corner] = heads[position];
            heads[position] = corner + 1;
        }
    }

    const outputForNormal = new Uint32Array(numNormals + 1);
    // The upper bit marks one representative corner for each distinct position/normal pair.
    const representative = 0x80000000;
    let vertices = 0;
    for (let position = 0; position < heads.length; position++) {
        const firstOutput = vertices;
        let link = heads[position];
        while (link) {
            const corner = link - 1;
            link = corners[corner];
            const normal = Math.min(source.faces.indices[corner], numNormals);
            if (outputForNormal[normal] <= firstOutput) {
                outputForNormal[normal] = ++vertices;
                corners[corner] = (vertices - 1) | representative;
            } else {
                corners[corner] = outputForNormal[normal] - 1;
            }
        }
    }

    const positions = new Float32Array(vertices * 3);
    const normals = new Float32Array(vertices * 3);
    const uvs = x.uvs ? new Float32Array(vertices * 2) : null;
    for (let corner = 0; corner < corners.length; corner++) {
        if (corners[corner] < representative) continue;
        const output = corners[corner] & 0x7fffffff;
        corners[corner] = output;
        const position = indices[corner];
        const normal = source.faces.indices[corner];
        for (let axis = 0; axis < 3; axis++) {
            positions[output * 3 + axis] = x.pos[position * 3 + axis];
            normals[output * 3 + axis] = source.values[normal * 3 + axis] ?? 0;
        }
        if (uvs && x.uvs) {
            uvs[output * 2] = x.uvs[position * 2] ?? 0;
            uvs[output * 2 + 1] = x.uvs[position * 2 + 1] ?? 0;
        }
    }
    return { positions, normals, uvs, corners };
}

/** Pack from the original attributes so discarded vertices never need float32 copies. */
function packReferencedVertices(x: XGeometrySource, normalValues: ArrayLike<number> | null, indices: Uint32Array) {
    const vertexCount = x.pos.length / 3;
    const sourceUvs = x.uvs?.length === vertexCount * 2 ? x.uvs : null;
    const used = new Uint8Array(vertexCount);
    let usedCount = 0;
    for (let i = 0; i < indices.length && usedCount < vertexCount; i++) {
        const vertex = indices[i];
        if (!used[vertex]) {
            used[vertex] = 1;
            usedCount++;
        }
    }
    if (usedCount === vertexCount) {
        return {
            positions: float32(x.pos),
            normals: normalValues ? float32(normalValues) : null,
            uvs: sourceUvs ? float32(sourceUvs) : null,
        };
    }

    const positions = new Float32Array(usedCount * 3);
    const normals = normalValues ? new Float32Array(usedCount * 3) : null;
    const uvs = sourceUvs ? new Float32Array(usedCount * 2) : null;
    // Reuse the usage bytes as local offsets. One base per 256 source vertices avoids
    // allocating a second, full-size uint32 remap alongside the parsed geometry.
    const blockSize = 256;
    const base = new Uint32Array(Math.ceil(vertexCount / blockSize));
    let target = 0;
    for (let block = 0; block < base.length; block++) {
        base[block] = target;
        const end = Math.min((block + 1) * blockSize, vertexCount);
        for (let source = block * blockSize; source < end; source++) {
            if (!used[source]) continue;
            used[source] = target - base[block];
            for (let axis = 0; axis < 3; axis++) {
                positions[target * 3 + axis] = x.pos[source * 3 + axis];
                if (normals && normalValues) normals[target * 3 + axis] = normalValues[source * 3 + axis];
            }
            if (uvs && sourceUvs) {
                uvs[target * 2] = sourceUvs[source * 2];
                uvs[target * 2 + 1] = sourceUvs[source * 2 + 1];
            }
            target++;
        }
    }
    for (let i = 0; i < indices.length; i++) {
        const source = indices[i];
        indices[i] = base[Math.floor(source / blockSize)] + used[source];
    }
    return { positions, normals, uvs };
}

export function buildXMeshGeometry(x: XGeometrySource, redundant: Uint8Array): XGeometry {
    const { offsets } = x.faces;
    const materialCount = Math.max(1, x.mats.length);
    const counts = new Uint32Array(materialCount);
    const materialOf = (face: number) => Math.max(0, Math.min(x.faceMats[face] ?? 0, materialCount - 1));
    let indexCount = 0;
    for (let face = 0; face < offsets.length - 1; face++) {
        if (redundant[face]) continue;
        const count = Math.max(0, offsets[face + 1] - offsets[face] - 2) * 3;
        counts[materialOf(face)] += count;
        indexCount += count;
    }
    const ranges: MaterialRange[] = [];
    const cursors = new Uint32Array(materialCount);
    let start = 0;
    for (let material = 0; material < materialCount; material++) {
        const count = counts[material];
        if (count) ranges.push({ material, start, count });
        cursors[material] = start;
        start += count;
    }

    const normalSource = x.normals && matchingFaceLayout(x.faces, x.normals.faces) ? x.normals : null;
    const split = normalSource && !normalsFollowPositions(x, normalSource, redundant)
        ? indexedNormals(x, normalSource, redundant) : null;
    const corners = split?.corners ?? x.faces.indices;
    const indices = new Uint32Array(indexCount);
    const vertexCount = x.pos.length / 3;
    for (let face = 0; face < offsets.length - 1; face++) {
        if (redundant[face]) continue;
        const first = offsets[face];
        const end = offsets[face + 1];
        if (end - first < 3) continue;
        const material = materialOf(face);
        let output = cursors[material];
        const pivot = corners[first];
        let previous = corners[first + 1];
        if (!split && (pivot >= vertexCount || previous >= vertexCount)) throw new Error("X face vertex index is out of range");
        for (let corner = first + 2; corner < end; corner++) {
            const next = corners[corner];
            if (!split && next >= vertexCount) throw new Error("X face vertex index is out of range");
            indices[output++] = pivot;
            indices[output++] = previous;
            indices[output++] = next;
            previous = next;
        }
        cursors[material] = output;
    }
    const { positions, normals, uvs } = split ?? packReferencedVertices(x, normalSource?.values ?? null, indices);
    return { positions, normals, uvs, indices, ranges };
}

// Partition only when a vertex or index buffer would exceed the device's allocation limit.
// Normals are calculated before this step so chunk boundaries do not introduce seams.
export function* splitXMeshGeometry(geometry: XGeometry, maxBufferBytes: number): Generator<XGeometry> {
    if (Math.max(geometry.positions.byteLength, geometry.indices.byteLength) <= maxBufferBytes) {
        yield geometry;
        return;
    }
    const maxIndices = Math.floor(maxBufferBytes / (3 * 3 * Float32Array.BYTES_PER_ELEMENT)) * 3;
    if (maxIndices < 3) throw new Error("GPU buffer is too small for an X triangle");
    const localIndex = new Uint32Array(geometry.positions.length / 3);
    const { indices } = geometry;
    let firstRange = 0;
    for (let start = 0; start < indices.length; start += maxIndices) {
        const end = Math.min(start + maxIndices, indices.length);
        const sourceVertices = new Uint32Array(end - start);
        const localIndices = new Uint32Array(end - start);
        let vertices = 0;
        for (let i = start; i < end; i++) {
            const source = indices[i];
            if (!localIndex[source]) {
                sourceVertices[vertices++] = source;
                localIndex[source] = vertices;
            }
            localIndices[i - start] = localIndex[source] - 1;
        }
        const positions = new Float32Array(vertices * 3);
        const normals = geometry.normals ? new Float32Array(vertices * 3) : null;
        const uvs = geometry.uvs ? new Float32Array(vertices * 2) : null;
        for (let vertex = 0; vertex < vertices; vertex++) {
            const source = sourceVertices[vertex];
            localIndex[source] = 0;
            for (let axis = 0; axis < 3; axis++) {
                positions[vertex * 3 + axis] = geometry.positions[source * 3 + axis];
                if (normals && geometry.normals) normals[vertex * 3 + axis] = geometry.normals[source * 3 + axis];
            }
            if (uvs && geometry.uvs) {
                uvs[vertex * 2] = geometry.uvs[source * 2];
                uvs[vertex * 2 + 1] = geometry.uvs[source * 2 + 1];
            }
        }
        const ranges: MaterialRange[] = [];
        while (firstRange < geometry.ranges.length) {
            const range = geometry.ranges[firstRange];
            const overlap = Math.max(range.start, start);
            const rangeEnd = range.start + range.count;
            if (overlap < end) ranges.push({ material: range.material, start: overlap - start, count: Math.min(rangeEnd, end) - overlap });
            if (rangeEnd > end) break;
            firstRange++;
        }
        yield { positions, normals, uvs, indices: localIndices, ranges };
    }
}

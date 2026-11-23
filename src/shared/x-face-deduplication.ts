import type { PackedXFaces } from "./x-packed-faces";

type XFaceDeduplicationInput = {
    positions: ArrayLike<number>;
    uvs: ArrayLike<number> | null;
    faces: PackedXFaces;
    faceMaterials: ArrayLike<number>;
};

function quantize(value: number): number {
    return Number.isFinite(value) ? Math.round(value * 1_000_000) : 0;
}

// MurmurHash3's 32-bit finalizer mixes the low bits used to select a bucket.
function mixHash(value: number): number {
    value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
    value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
    return (value ^ (value >>> 16)) >>> 0;
}

function cornerHash(input: XFaceDeduplicationInput, vertex: number): number {
    let hash = 0;
    for (let axis = 0; axis < 3; axis++) {
        hash = Math.imul(hash ^ quantize(input.positions[vertex * 3 + axis]), 16777619);
    }
    if (input.uvs) {
        for (let axis = 0; axis < 2; axis++) {
            hash = Math.imul(hash ^ quantize(input.uvs[vertex * 2 + axis]), 16777619);
        }
    }
    return mixHash(hash);
}

function equalCorners(input: XFaceDeduplicationInput, hashes: Uint32Array, a: number, b: number): boolean {
    if (a === b) return true;
    if ((hashes[a] ?? 0) !== (hashes[b] ?? 0)) return false;
    for (let axis = 0; axis < 3; axis++) {
        if (quantize(input.positions[a * 3 + axis]) !== quantize(input.positions[b * 3 + axis])) return false;
    }
    if (input.uvs) {
        for (let axis = 0; axis < 2; axis++) {
            if (quantize(input.uvs[a * 2 + axis]) !== quantize(input.uvs[b * 2 + axis])) return false;
        }
    }
    return true;
}

/** Check the actual corner order in either direction, including repeated corners. */
function equalPolygons(input: XFaceDeduplicationInput, hashes: Uint32Array, a: number, b: number): boolean {
    const { indices, offsets } = input.faces;
    const start = offsets[a];
    const otherStart = offsets[b];
    const length = offsets[a + 1] - start;
    if (length !== offsets[b + 1] - otherStart || (input.faceMaterials[a] ?? 0) !== (input.faceMaterials[b] ?? 0)) return false;

    for (let shift = 0; shift < length; shift++) {
        if (!equalCorners(input, hashes, indices[start], indices[otherStart + shift])) continue;
        let forward = true;
        let reverse = true;
        for (let i = 1; i < length && (forward || reverse); i++) {
            const corner = indices[start + i];
            forward = forward && equalCorners(input, hashes, corner, indices[otherStart + (shift + i) % length]);
            reverse = reverse && equalCorners(input, hashes, corner, indices[otherStart + (shift - i + length) % length]);
        }
        if (forward || reverse) return true;
    }
    return false;
}

export function findRedundantPackedXFaces(input: XFaceDeduplicationInput): Uint8Array {
    const { offsets, indices } = input.faces;
    const faceCount = offsets.length - 1;
    const redundant = new Uint8Array(faceCount);
    if (faceCount < 2) return redundant;

    // Typed arrays keep the index linear in geometry size without a JS string or object per face.
    const vertexCount = Math.max(Math.ceil(input.positions.length / 3), Math.ceil((input.uvs?.length ?? 0) / 2));
    const hashes = new Uint32Array(vertexCount);
    for (let vertex = 0; vertex < hashes.length; vertex++) hashes[vertex] = cornerHash(input, vertex);
    const bucketCount = 2 ** Math.ceil(Math.log2(faceCount / 2));
    const buckets = new Uint32Array(bucketCount);
    const next = new Uint32Array(faceCount);
    for (let face = 0; face < faceCount; face++) {
        const start = offsets[face];
        const end = offsets[face + 1];
        if (end - start < 3) continue;
        // Addition gives every rotation and its reversal the same bucket. Only the exact
        // position/UV/material and cyclic comparisons below can discard a polygon.
        let hash = Math.imul(end - start, 16777619) ^ (input.faceMaterials[face] ?? 0);
        for (let i = start; i < end; i++) hash = (hash + (hashes[indices[i]] ?? 0)) | 0;
        const bucket = mixHash(hash) & (bucketCount - 1);
        for (let candidate = buckets[bucket]; candidate !== 0; candidate = next[candidate - 1]) {
            if (equalPolygons(input, hashes, face, candidate - 1)) {
                redundant[face] = 1;
                break;
            }
        }
        if (!redundant[face]) {
            next[face] = buckets[bucket];
            buckets[bucket] = face + 1;
        }
    }
    return redundant;
}

import { describe, expect, it } from "vitest";
import { findRedundantPackedXFaces } from "./x-face-deduplication";

function findRedundantXFaceIndices(input: { positions: number[]; uvs: number[] | null; faces: number[][]; faceMaterials: number[] }): number[] {
    const offsets = new Uint32Array(input.faces.length + 1);
    input.faces.forEach((face, index) => { offsets[index + 1] = offsets[index] + face.length; });
    const flags = findRedundantPackedXFaces({
        ...input,
        faces: { offsets, indices: Uint32Array.from(input.faces.flat()) },
    });
    return Array.from(flags).flatMap((flag, face) => flag ? [face] : []);
}

const positions = [
    0, 0, 0,
    1, 0, 0,
    1, 1, 0,
    0, 1, 0,
];
const uvs = [
    0, 0,
    1, 0,
    1, 1,
    0, 1,
];

describe("X face deduplication", () => {
    it("removes a reversed duplicate polygon before triangulation", () => {
        const redundant = findRedundantXFaceIndices({
            positions,
            uvs,
            faces: [[0, 1, 2, 3], [3, 2, 1, 0]],
            faceMaterials: [2, 2],
        });

        expect(redundant).toEqual([1]);
    });

    it("recognizes a cyclic rotation as the same polygon", () => {
        const redundant = findRedundantXFaceIndices({
            positions,
            uvs,
            faces: [[0, 1, 2, 3], [2, 3, 0, 1]],
            faceMaterials: [2, 2],
        });

        expect(redundant).toEqual([1]);
    });

    it("preserves layered polygons that use different materials", () => {
        const redundant = findRedundantXFaceIndices({
            positions,
            uvs,
            faces: [[0, 1, 2, 3], [3, 2, 1, 0]],
            faceMaterials: [2, 3],
        });

        expect(redundant).toEqual([]);
    });

    it("preserves polygons that map the same positions to different UVs", () => {
        const alternateUvs = [...uvs];
        alternateUvs[0] = 0.25;
        const redundant = findRedundantXFaceIndices({
            positions: [...positions, ...positions],
            uvs: [...uvs, ...alternateUvs],
            faces: [[0, 1, 2, 3], [7, 6, 5, 4]],
            faceMaterials: [2, 2],
        });

        expect(redundant).toEqual([]);
    });

    it("does not merge a non-cyclic polygon with a different edge topology", () => {
        const redundant = findRedundantXFaceIndices({
            positions,
            uvs,
            faces: [[0, 1, 2, 3], [0, 2, 1, 3]],
            faceMaterials: [2, 2],
        });

        expect(redundant).toEqual([]);
    });

    it("matches distinct vertex IDs using quantized coordinates and UVs", () => {
        const a = [...positions];
        a[0] += 0.0000004;
        const first = [...uvs];
        first[0] += 0.0000004;
        const second = [...first];
        second[0] += 0.0000002;
        const redundant = findRedundantXFaceIndices({
            positions: [...positions, ...a, ...a],
            uvs: [...uvs, ...first, ...second],
            faces: [[0, 1, 2, 3], [6, 5, 4, 7], [10, 9, 8, 11]],
            faceMaterials: [],
        });
        expect(redundant).toEqual([1]);
    });

    it("checks coordinates exactly when different positions share a 32-bit hash", () => {
        const alternate = [...positions];
        alternate[0] = 2 ** 32 / 1_000_000;
        const redundant = findRedundantXFaceIndices({
            positions: [...positions, ...alternate],
            uvs: null,
            faces: [[0, 1, 2], [4, 5, 6], [5, 4, 6]],
            faceMaterials: [],
        });
        expect(redundant).toEqual([2]);
    });

    it("looks beyond a repeated corner to find the matching rotation", () => {
        const redundant = findRedundantXFaceIndices({
            positions, uvs,
            faces: [[0, 1, 0, 2, 3], [0, 2, 3, 0, 1], [0, 1, 2, 0, 3]],
            faceMaterials: [],
        });
        expect(redundant).toEqual([1]);
    });
});

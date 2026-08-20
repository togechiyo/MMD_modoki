import { describe, expect, it } from "vitest";
import { findRedundantXFaceIndices } from "./x-face-deduplication";

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

        expect([...redundant]).toEqual([1]);
    });

    it("recognizes a cyclic rotation as the same polygon", () => {
        const redundant = findRedundantXFaceIndices({
            positions,
            uvs,
            faces: [[0, 1, 2, 3], [2, 3, 0, 1]],
            faceMaterials: [2, 2],
        });

        expect([...redundant]).toEqual([1]);
    });

    it("preserves layered polygons that use different materials", () => {
        const redundant = findRedundantXFaceIndices({
            positions,
            uvs,
            faces: [[0, 1, 2, 3], [3, 2, 1, 0]],
            faceMaterials: [2, 3],
        });

        expect(redundant.size).toBe(0);
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

        expect(redundant.size).toBe(0);
    });

    it("does not merge a non-cyclic polygon with a different edge topology", () => {
        const redundant = findRedundantXFaceIndices({
            positions,
            uvs,
            faces: [[0, 1, 2, 3], [0, 2, 1, 3]],
            faceMaterials: [2, 2],
        });

        expect(redundant.size).toBe(0);
    });
});

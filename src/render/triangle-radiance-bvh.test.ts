import { describe, expect, it } from "vitest";
import { TriangleRadianceBvh, MAX_RADIANCE_TRIANGLES } from "./triangle-radiance-bvh";

function geometry(count: number, shift = 0): Float32Array {
    return new Float32Array(Array.from({ length: count }, (_, index) => {
        const x = index * 2 + shift;
        return [x, 0, 0, 0, x + 1, 0, 0, 0, x, 1, 0, 0, index, 0.2, 0.3, 0];
    }).flat());
}

describe("world triangle radiance BVH", () => {
    it("encloses every triangle and preserves source emission after deformation refit", () => {
        const bvh = new TriangleRadianceBvh();
        for (const shift of [0, -100, 50]) {
            bvh.update(geometry(21, shift));
            expect(bvh.triangleCount).toBe(21);
            expect(bvh.nodes[0]).toBeLessThanOrEqual(shift);
            expect(bvh.nodes[4]).toBeGreaterThanOrEqual(41 + shift);
            const visited: number[] = [];
            const visit = (node: number) => {
                const base = node * 12, first = bvh.nodes[base + 3], count = bvh.nodes[base + 7];
                if (!count) { visit(first); visit(bvh.nodes[base + 8]); return; }
                for (let index = first; index < first + count; index++) {
                    const triangle = bvh.triangles.subarray(index * 16, index * 16 + 16);
                    visited.push(triangle[12]);
                    expect(triangle[0]).toBeCloseTo(triangle[12] * 2 + shift);
                    for (const vertex of [0, 4, 8]) for (let axis = 0; axis < 3; axis++) {
                        expect(triangle[vertex + axis]).toBeGreaterThanOrEqual(bvh.nodes[base + axis]);
                        expect(triangle[vertex + axis]).toBeLessThanOrEqual(bvh.nodes[base + 4 + axis]);
                    }
                }
            };
            visit(0);
            expect(visited.sort((a, b) => a - b)).toEqual(Array.from({ length: 21 }, (_, index) => index));
        }
    });
    it("clears stale emitters when topology becomes empty", () => {
        const bvh = new TriangleRadianceBvh(); bvh.update(geometry(12)); bvh.update(new Float32Array());
        expect(bvh.triangleCount).toBe(0);
        expect(bvh.triangles.every(value => value === 0)).toBe(true);
        expect(bvh.nodes.every(Number.isFinite)).toBe(true);
    });
    it("rejects malformed, nonfinite and excessive geometry before changing the tree", () => {
        const bvh = new TriangleRadianceBvh(); bvh.update(geometry(1));
        for (const invalid of [new Float32Array(3), new Float32Array(16).fill(NaN), new Float32Array((MAX_RADIANCE_TRIANGLES + 1) * 16)]) {
            expect(() => bvh.update(invalid)).toThrow(); expect(bvh.triangleCount).toBe(1);
        }
    });
});

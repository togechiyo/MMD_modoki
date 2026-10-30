import { describe, expect, it } from "vitest";
import { TriangleRadianceBvh, radianceTriangleBudget, MAX_RADIANCE_TRIANGLES, RADIANCE_TRIANGLE_STRIDE as STRIDE } from "./triangle-radiance-bvh";

function geometry(count: number, shift = 0): Float32Array {
    return new Float32Array(Array.from({ length: count }, (_, index) => {
        const x = index * 2 + shift;
        return [x, 0, 0, 0, x + 1, 0, 0, 0, x, 1, 0, 0, index, 0.2, 0.3, 0, 0, 0, 1, 0, 0, 1, -1, 0];
    }).flat());
}

function verifyEscapes(nodes: Float32Array): void {
    const nodeCount = nodes.length / 12;
    // Skip each subtree in turn, as a ray missing its bounds would do.
    for (let skipped = -1; skipped < nodeCount; skipped++) {
        const expected: number[] = [];
        const visit = (index: number): void => {
            expected.push(index);
            if (nodes[index * 12 + 7] === 0 && index !== skipped) {
                visit(nodes[index * 12 + 8]); visit(nodes[index * 12 + 3]);
            }
        };
        visit(0);
        const actual: number[] = [];
        let index = 0;
        while (index >= 0) {
            if (!Number.isInteger(index) || index >= nodeCount || actual.length >= nodeCount) throw new Error("Invalid BVH escape or cycle");
            actual.push(index);
            index = nodes[index * 12 + 7] === 0 && index !== skipped ? nodes[index * 12 + 8] : nodes[index * 12 + 9];
        }
        expect(index).toBe(-1);
        expect(actual).toEqual(expected);
    }
}

describe("world triangle radiance BVH", () => {
    it("supports dense scenes within both enabled device limits and a bounded ceiling", () => {
        expect(radianceTriangleBudget(128 * 1024 * 1024, 256 * 1024 * 1024)).toBe(1000000);
        expect(radianceTriangleBudget(10 * STRIDE * 4 + 4, 1024)).toBe(10);
        expect(radianceTriangleBudget(1024, 10 * STRIDE * 4 + 4)).toBe(10);
        expect(radianceTriangleBudget(95, 1024)).toBe(0);
    });
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
                    const triangle = bvh.triangles.subarray(index * STRIDE, (index + 1) * STRIDE);
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
            verifyEscapes(bvh.nodes);
        }
    });
    it("clears stale emitters when topology becomes empty", () => {
        const bvh = new TriangleRadianceBvh(); bvh.update(geometry(12)); bvh.update(new Float32Array());
        expect(bvh.triangleCount).toBe(0);
        expect(bvh.triangles.every(value => value === 0)).toBe(true);
        expect(bvh.nodes.every(Number.isFinite)).toBe(true);
        expect(bvh.nodes[9]).toBe(-1);
    });
    it("threads a single leaf and preserves escape links through deformation", () => {
        const bvh = new TriangleRadianceBvh();
        expect(bvh.nodes[9]).toBe(-1);
        for (const count of [1, 8, 9, 33]) {
            bvh.update(geometry(count)); verifyEscapes(bvh.nodes);
            const escapes = bvh.nodes.filter((_, index) => index % 12 === 9);
            bvh.update(geometry(count, -300)); verifyEscapes(bvh.nodes);
            expect(bvh.nodes.filter((_, index) => index % 12 === 9)).toEqual(escapes);
        }
    });
    it("updates only emission through the existing sort order without refitting or changing other triangle fields", () => {
        const input = geometry(21), bvh = new TriangleRadianceBvh(), reference = new TriangleRadianceBvh();
        // Reverse source order so a direct sorted-index color write would attach light to the wrong face.
        const reversed = new Float32Array(input.length);
        for (let i = 0; i < 21; i++) reversed.set(input.subarray((20 - i) * STRIDE, (21 - i) * STRIDE), i * STRIDE);
        bvh.update(reversed); reference.update(reversed);
        const nodes = bvh.nodes, nodeBytes = nodes.slice();
        for (const strength of [0, 0.13, 8]) {
            const next = reversed.slice();
            for (let i = 0; i < 21; i++) next.set([strength * i, strength / (i + 1), 0.3], i * STRIDE + 12);
            bvh.updateEmission(next); reference.update(next);
            expect(bvh.triangles).toEqual(reference.triangles);
            expect(bvh.nodes).toBe(nodes); expect(nodes).toEqual(nodeBytes);
        }
        const before = bvh.triangles.slice(), invalid = reversed.slice(); invalid[12] = Infinity;
        expect(() => bvh.updateEmission(invalid)).toThrow();
        expect(() => bvh.updateEmission(geometry(20))).toThrow();
        expect(bvh.triangles).toEqual(before); expect(nodes).toEqual(nodeBytes);
    });
    it("keeps red, green and blue emitters on their triangles across sorting and color-only refit", () => {
        const source = geometry(12), input = new Float32Array(source.length);
        for (let index = 0; index < 12; index++) input.set(source.subarray((11 - index) * STRIDE, (12 - index) * STRIDE), index * STRIDE);
        const colors = [[8, 0, 0], [0, 4, 0], [0, 0, 2]];
        for (let index = 0; index < 12; index++) {
            input.set(colors[index % 3], index * STRIDE + 12);
            input.set([index * 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, index, 5], index * STRIDE + 16);
        }
        const bvh = new TriangleRadianceBvh();
        const verify = () => {
            bvh.update(input);
            for (let index = 0; index < bvh.triangleCount; index++) {
                const triangle = bvh.triangles.subarray(index * STRIDE, (index + 1) * STRIDE);
                const original = 11 - triangle[0] / 2;
                expect(Array.from(triangle.subarray(12))).toEqual(Array.from(input.subarray(original * STRIDE + 12, (original + 1) * STRIDE)));
            }
        };
        verify();
        input.set([1, 2, 3], 5 * STRIDE + 12);
        verify();
    });
    it("rejects malformed, nonfinite and excessive geometry before changing the tree", () => {
        const bvh = new TriangleRadianceBvh(); bvh.update(geometry(1));
        for (const invalid of [new Float32Array(3), new Float32Array(STRIDE).fill(NaN), new Float32Array((MAX_RADIANCE_TRIANGLES + 1) * STRIDE)]) {
            expect(() => bvh.update(invalid)).toThrow(); expect(bvh.triangleCount).toBe(1);
        }
    });
});

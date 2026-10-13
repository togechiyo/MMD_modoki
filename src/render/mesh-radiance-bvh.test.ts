import { describe, expect, it, vi } from "vitest";
import { MeshRadianceBvh, type RadianceBufferRange } from "./mesh-radiance-bvh";
import { TriangleRadianceBvh, RADIANCE_TRIANGLE_STRIDE as STRIDE } from "./triangle-radiance-bvh";

function geometry(count: number, shift = 0): Float32Array {
    return new Float32Array(Array.from({ length: count }, (_, index) => {
        const x = index * 2 + shift;
        return [x, 0, 0, 0, x + 1, 0, 0, 0, x, 1, 0, 0, x, 0.2, 0.3, 0, 0, 0, 1, 0, 0, 1, -1, 0];
    }).flat());
}

function verifyTree(bvh: MeshRadianceBvh, inputs: Float32Array[]): void {
    const visited = new Set<number>(), leaves: number[] = [];
    const visit = (index: number): void => {
        expect(visited.has(index)).toBe(false); visited.add(index);
        const offset = index * 12, first = bvh.nodes[offset + 3], count = bvh.nodes[offset + 7];
        if (count) {
            expect(first + count).toBeLessThanOrEqual(bvh.triangleCount);
            for (let triangle = first; triangle < first + count; triangle++) {
                leaves.push(triangle);
                for (const vertex of [0, 4, 8]) for (let axis = 0; axis < 3; axis++) {
                    const value = bvh.triangles[triangle * STRIDE + vertex + axis];
                    expect(value).toBeGreaterThanOrEqual(bvh.nodes[offset + axis]);
                    expect(value).toBeLessThanOrEqual(bvh.nodes[offset + 4 + axis]);
                }
            }
        } else {
            for (const child of [first, bvh.nodes[offset + 8]]) {
                expect(child).toBeLessThan(bvh.nodes.length / 12);
                for (let axis = 0; axis < 3; axis++) {
                    expect(bvh.nodes[child * 12 + axis]).toBeGreaterThanOrEqual(bvh.nodes[offset + axis]);
                    expect(bvh.nodes[child * 12 + 4 + axis]).toBeLessThanOrEqual(bvh.nodes[offset + 4 + axis]);
                }
                visit(child);
            }
        }
    };
    visit(0);
    expect(leaves.sort((a, b) => a - b)).toEqual(Array.from({ length: bvh.triangleCount }, (_, index) => index));
    const records = (arrays: Float32Array[]): string[] => arrays.flatMap(array => Array.from({ length: array.length / STRIDE },
        (_, index) => JSON.stringify(Array.from(array.subarray(index * STRIDE, (index + 1) * STRIDE))))).sort();
    expect(records([bvh.triangles])).toEqual(records(inputs));
}

describe("mesh radiance acceleration updates", () => {
    it("refits/uploads only a changed mesh and keeps the entire top tree enclosing it", () => {
        const stage = { key: {}, triangles: geometry(200) }, actor = { key: {}, triangles: geometry(12, -100) };
        const lamp = { key: {}, triangles: geometry(1, 1000) }, bvh = new MeshRadianceBvh();
        bvh.update([stage, actor, lamp]);
        const triangleMirror = bvh.triangles.slice(), nodeMirror = bvh.nodes.slice();
        const apply = (mirror: Float32Array, ranges: RadianceBufferRange[]): void => {
            for (const range of ranges) mirror.set(range.data, range.byteOffset / 4);
        };
        const spy = vi.spyOn(TriangleRadianceBvh.prototype, "update");
        try {
            for (const shift of [700, -500, 50]) {
                actor.triangles = geometry(12, shift);
                // Include color/UV/source edits as well as deformation; reordered records must retain all fields.
                actor.triangles.set([0, 8, 2, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 2, 5], 12);
                const changes = bvh.update([stage, actor, lamp]);
                expect(spy).toHaveBeenLastCalledWith(actor.triangles);
                expect(changes.triangles.reduce((size, range) => size + range.data.length, 0)).toBe(actor.triangles.length);
                expect(changes.nodes.reduce((size, range) => size + range.data.length, 0)).toBeLessThan(bvh.nodes.length / 2);
                apply(triangleMirror, changes.triangles); apply(nodeMirror, changes.nodes);
                expect(triangleMirror).toEqual(bvh.triangles); expect(nodeMirror).toEqual(bvh.nodes);
                verifyTree(bvh, [stage.triangles, actor.triangles, lamp.triangles]);
            }
            expect(spy).toHaveBeenCalledTimes(3);
            expect(bvh.update([stage, actor, lamp])).toEqual({ triangles: [], nodes: [] });
        } finally { spy.mockRestore(); }
    });

    it("rebuilds offsets on addition, removal, reordering and topology changes without retaining stale sources", () => {
        const a = { key: {}, triangles: geometry(9) }, b = { key: {}, triangles: geometry(17, 100) };
        const c = { key: {}, triangles: geometry(1, -30) }, bvh = new MeshRadianceBvh();
        for (const inputs of [[a], [a, b], [b, c, a], [c, a], [c], []]) {
            const changes = bvh.update(inputs);
            expect(changes.triangles).toHaveLength(1); expect(changes.nodes).toHaveLength(1);
            if (inputs.length) verifyTree(bvh, inputs.map(input => input.triangles));
            else { expect(bvh.triangleCount).toBe(0); expect(bvh.triangles.every(value => value === 0)).toBe(true); }
        }
        bvh.update([a, b]); a.triangles = geometry(33, 800);
        bvh.update([a, b]); verifyTree(bvh, [a.triangles, b.triangles]);
        bvh.update([{ key: {}, triangles: new Float32Array() }, a]); verifyTree(bvh, [a.triangles]);
    });
});

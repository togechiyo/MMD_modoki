import { describe, expect, it, vi } from "vitest";
import { MeshRadianceBvh, type RadianceBufferRange } from "./mesh-radiance-bvh";
import { TriangleRadianceBvh, RADIANCE_TRIANGLE_STRIDE as STRIDE, createRadianceIndexedPositions,
    materializeRadianceIndexedPositions, type RadianceIndexedPositions } from "./triangle-radiance-bvh";

function geometry(count: number, shift = 0): Float32Array {
    return new Float32Array(Array.from({ length: count }, (_, index) => {
        const x = index * 2 + shift;
        return [x, 0, 0, 0, x + 1, 0, 0, 0, x, 1, 0, 0, x, 0.2, 0.3, 0, 0, 0, 1, 0, 0, 1, -1, 0];
    }).flat());
}

function verifyEscapes(nodes: Float32Array): void {
    const nodeCount = nodes.length / 12;
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
    verifyEscapes(bvh.nodes);
}

describe("mesh radiance acceleration updates", () => {
    it("retains indexed poses through RGB edits, live/cold repacking and return to fully packed geometry", () => {
        const actor: { key: object; triangles: Float32Array; attributesVersion: object; geometryVersion: object;
            indexedPositions?: RadianceIndexedPositions } = { key: {}, triangles: geometry(17), attributesVersion: {}, geometryVersion: {} };
        const stage = { key: {}, triangles: geometry(19, 1000) }, actual = new MeshRadianceBvh(), full = new MeshRadianceBvh();
        const reference = () => ({ key: actor.key, triangles: actor.indexedPositions
            ? materializeRadianceIndexedPositions(actor.triangles, actor.indexedPositions) : actor.triangles });
        const update = (order: Array<"actor" | "stage">) => {
            actual.update(order.map(key => key === "actor" ? actor : stage));
            full.update(order.map(key => key === "actor" ? reference() : stage));
            expect(actual.triangles).toEqual(full.triangles); expect(actual.nodes).toEqual(full.nodes);
            expect(actual.changedMin).toEqual(full.changedMin); expect(actual.changedMax).toEqual(full.changedMax);
        };
        update(["stage", "actor"]);
        for (const x of [-200, 500]) {
            const positions = new Float32Array(17 * 9), indices = Uint32Array.from({ length: 17 * 3 }, (_, i) => i);
            for (let i = 0; i < indices.length; i++) {
                const input = Math.floor(i / 3) * STRIDE + i % 3 * 4;
                positions.set([actor.triangles[input] + x, actor.triangles[input + 1], actor.triangles[input + 2]], i * 3);
            }
            actor.indexedPositions = createRadianceIndexedPositions(positions, indices); actor.geometryVersion = {};
            update(["stage", "actor"]);
        }
        // Color-only updates carry old coordinate attributes but must retain the latest pose.
        actor.triangles = actor.triangles.slice(); actor.triangles.set([0.3, 0.4, 1], 12); actor.attributesVersion = {};
        const nodes = actual.nodes.slice();
        actual.update([stage, actor]); full.update([stage, reference()]);
        expect(actual.triangles).toEqual(full.triangles); expect(actual.nodes).toEqual(nodes);
        update(["actor", "stage"]); update(["stage"]); update(["actor", "stage"]);
        actor.triangles = geometry(17, -400); actor.indexedPositions = undefined; actor.geometryVersion = {}; actor.attributesVersion = {};
        update(["actor", "stage"]);
        actor.triangles = geometry(33, 700); actor.geometryVersion = {}; actor.attributesVersion = {};
        update(["actor", "stage"]); verifyTree(actual, [actor.triangles, stage.triangles]);
    });
    it("changes the layout revision only after a successful repack", () => {
        const actor = { key: {}, triangles: geometry(17), attributesVersion: {} };
        const stage = { key: {}, triangles: geometry(9, 10) }, bvh = new MeshRadianceBvh();
        bvh.update([stage, actor]);
        const first = bvh.layoutRevision, packed = bvh.triangles;
        actor.triangles = actor.triangles.slice(); actor.triangles[0] += 30;
        bvh.update([stage, actor]);
        expect(bvh.layoutRevision).toBe(first); expect(bvh.triangles).toBe(packed);
        const invalid = { key: {}, triangles: new Float32Array(STRIDE).fill(Infinity) };
        expect(() => bvh.update([stage, actor, invalid])).toThrow();
        expect(bvh.layoutRevision).toBe(first); expect(bvh.triangles).toBe(packed);
        bvh.update([actor, stage]);
        expect(bvh.layoutRevision).toBe(first + 1); expect(bvh.triangles).not.toBe(packed);
        verifyTree(bvh, [actor.triangles, stage.triangles]);
        bvh.update([]);
        expect(bvh.layoutRevision).toBe(first + 2);
        bvh.update([]);
        expect(bvh.layoutRevision).toBe(first + 2);
    });

    it("keeps cross-mesh escapes valid when packed order differs from tree order and one BLAS is refitted", () => {
        const right = { key: {}, triangles: geometry(17, 300) };
        const left = { key: {}, triangles: geometry(33, -300) };
        const middle = { key: {}, triangles: geometry(9) };
        const bvh = new MeshRadianceBvh();
        bvh.update([right, left, middle]);
        const mirror = bvh.nodes.slice();
        const escapes = bvh.nodes.filter((_, index) => index % 12 === 9);
        verifyTree(bvh, [right.triangles, left.triangles, middle.triangles]);
        for (const shift of [-600, 600, -100]) {
            left.triangles = geometry(33, shift);
            const changes = bvh.update([right, left, middle]);
            for (const range of changes.nodes) mirror.set(range.data, range.byteOffset / 4);
            expect(mirror).toEqual(bvh.nodes);
            expect(bvh.nodes.filter((_, index) => index % 12 === 9)).toEqual(escapes);
            verifyTree(bvh, [right.triangles, left.triangles, middle.triangles]);
            verifyEscapes(mirror);
        }
    });
    it("writes the same triangle and node ranges as a full refit for a moving actor and fixed stage", () => {
        const actor = { key: {}, triangles: geometry(17), attributesVersion: {} };
        const stage = { key: {}, triangles: geometry(200, 1000) };
        const actual = new MeshRadianceBvh(), full = new MeshRadianceBvh();
        const fullActor = () => ({ key: actor.key, triangles: actor.triangles });
        actual.update([stage, actor]); full.update([stage, fullActor()]);
        for (const y of [2, -5, 0]) {
            const pose = actor.triangles.slice();
            for (let i = 0; i < pose.length; i += STRIDE) {
                pose[i + 1] = y; pose[i + 5] = y * 2; pose[i + 9] = y + 1;
            }
            actor.triangles = pose;
            const changes = actual.update([stage, actor]), expected = full.update([stage, fullActor()]);
            for (const key of ["triangles", "nodes"] as const) {
                expect(changes[key].map(r => [r.byteOffset, r.data.byteLength])).toEqual(expected[key].map(r => [r.byteOffset, r.data.byteLength]));
                expect(new Uint8Array(actual[key].buffer)).toEqual(new Uint8Array(full[key].buffer));
            }
            expect(changes.triangles).toHaveLength(1);
            expect(changes.triangles[0].byteOffset).toBe(stage.triangles.byteLength);
            expect(actual.changedMin).toEqual(full.changedMin); expect(actual.changedMax).toEqual(full.changedMax);
        }
    });
    it("uploads color-only changes without a BLAS/TLAS refit while invalidating the source bounds", () => {
        const source = { key: {}, geometryVersion: {}, triangles: geometry(21, -100) };
        const stage = { key: {}, geometryVersion: {}, triangles: geometry(200, 1000) };
        const bvh = new MeshRadianceBvh(); bvh.update([source, stage]);
        const nodes = bvh.nodes.slice(), mirror = bvh.triangles.slice();
        const spy = vi.spyOn(TriangleRadianceBvh.prototype, "update");
        try {
            source.triangles = source.triangles.slice();
            for (let i = 0; i < 21; i++) source.triangles.set([0, i * 0.1, 2], i * STRIDE + 12);
            const changes = bvh.update([source, stage]);
            expect(spy).not.toHaveBeenCalled(); expect(changes.nodes).toEqual([]);
            expect(changes.triangles.reduce((sum, range) => sum + range.data.length, 0)).toBe(source.triangles.length);
            for (const range of changes.triangles) mirror.set(range.data, range.byteOffset / 4);
            expect(mirror).toEqual(bvh.triangles); expect(bvh.nodes).toEqual(nodes);
            expect(bvh.changedMin[0]).toBeLessThanOrEqual(-100);
            expect(bvh.changedMax[0]).toBeGreaterThanOrEqual(-59);
            expect(bvh.changedMax[0]).toBeLessThan(1000);
            verifyTree(bvh, [source.triangles, stage.triangles]);
            source.geometryVersion = {}; source.triangles = geometry(21, 800);
            bvh.update([source, stage]); expect(spy).toHaveBeenCalledTimes(1);
            verifyTree(bvh, [source.triangles, stage.triangles]);
            // Rebuild top-level offsets while a retained source also changes color.
            spy.mockClear(); source.triangles = source.triangles.slice(); source.triangles.set([1, 2, 3], 12);
            bvh.update([stage, source]); expect(spy).not.toHaveBeenCalled();
            verifyTree(bvh, [stage.triangles, source.triangles]);
            const actor = { key: {}, geometryVersion: {}, triangles: geometry(9, -50) };
            bvh.update([stage, source, actor]); spy.mockClear();
            source.triangles = source.triangles.slice(); source.triangles.set([0, 0, 0], 12);
            actor.triangles = geometry(9, 700); actor.geometryVersion = {};
            const mixed = bvh.update([stage, source, actor]);
            expect(spy).toHaveBeenCalledTimes(1); expect(mixed.nodes.length).toBeGreaterThan(0);
            verifyTree(bvh, [stage.triangles, source.triangles, actor.triangles]);
        } finally { spy.mockRestore(); }
    });
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
                const oldLow = Math.min(...Array.from(actor.triangles.filter((_, index) => index % STRIDE === 0)));
                const oldHigh = oldLow + 23;
                actor.triangles = geometry(12, shift);
                // Include color/UV/source edits as well as deformation; reordered records must retain all fields.
                actor.triangles.set([0, 8, 2, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 2, 5], 12);
                const changes = bvh.update([stage, actor, lamp]);
                expect(spy).toHaveBeenLastCalledWith(actor.triangles);
                expect(changes.triangles.reduce((size, range) => size + range.data.length, 0)).toBe(actor.triangles.length);
                expect(changes.nodes.reduce((size, range) => size + range.data.length, 0)).toBeLessThan(bvh.nodes.length / 2);
                expect(bvh.changedMin[0]).toBeLessThanOrEqual(Math.min(oldLow, shift));
                expect(bvh.changedMax[0]).toBeGreaterThanOrEqual(Math.max(oldHigh, shift + 23));
                expect(bvh.changedMax[0]).toBeLessThan(1000); // The unchanged distant lamp is not dirty.
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
            else {
                expect(bvh.triangleCount).toBe(0); expect(bvh.triangles.every(value => value === 0)).toBe(true);
                expect(bvh.nodes[9]).toBe(-1);
            }
        }
        bvh.update([a, b]); a.triangles = geometry(33, 800);
        bvh.update([a, b]); verifyTree(bvh, [a.triangles, b.triangles]);
        bvh.update([{ key: {}, triangles: new Float32Array() }, a]); verifyTree(bvh, [a.triangles]);
    });
});

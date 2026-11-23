import { describe, expect, it } from "vitest";
import { buildXMeshGeometry, splitXMeshGeometry } from "./x-mesh-geometry";

function faces(...items: number[][]) {
    const offsets = new Uint32Array(items.length + 1);
    for (let i = 0; i < items.length; i++) offsets[i + 1] = offsets[i] + items[i].length;
    return { offsets, indices: Uint32Array.from(items.flat()) };
}

const square = {
    pos: Float32Array.of(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0),
    faces: faces([0, 1, 2], [0, 2, 3]),
    uvs: Float32Array.of(0, 0, 1, 0, 1, 1, 0, 1),
    normals: null,
    faceMats: Uint32Array.of(1, 0),
    mats: [null, null],
};

describe("packed X mesh geometry", () => {
    it("fans surviving faces directly into material ranges", () => {
        const mesh = { ...square, faces: faces([0, 1, 2, 3], [0, 2, 3], [3, 2, 1, 0]), faceMats: Uint32Array.of(1, 0, 1) };
        const out = buildXMeshGeometry(mesh, Uint8Array.of(0, 0, 1));
        expect(out.positions).toBe(mesh.pos);
        expect(out.uvs).toBe(mesh.uvs);
        expect([...out.indices]).toEqual([0, 2, 3, 0, 1, 2, 0, 2, 3]);
        expect(out.ranges).toEqual([{ material: 0, start: 0, count: 3 }, { material: 1, start: 3, count: 6 }]);
    });

    it("reuses matching position/normal pairs and splits a hard normal seam", () => {
        const normals = { values: Float32Array.of(0, 0, 1, 0, 1, 0), faces: faces([0, 0, 0], [1, 0, 1]) };
        const out = buildXMeshGeometry({ ...square, normals }, new Uint8Array(2));
        expect(out.positions.length / 3).toBe(5);
        // The two source faces share position 2 and split position 0 along the seam.
        expect(out.indices[1]).toBe(out.indices[5]);
        expect(out.indices[0]).not.toBe(out.indices[3]);
        const normalAt = (index: number) => out.normals?.slice(out.indices[index] * 3, out.indices[index] * 3 + 3);
        expect(normalAt(0)).toEqual(Float32Array.of(0, 1, 0));
        expect(normalAt(3)).toEqual(Float32Array.of(0, 0, 1));
        expect(out.uvs?.slice(out.indices[0] * 2, out.indices[0] * 2 + 2)).toEqual(Float32Array.of(0, 0));
    });

    it("keeps the computed-normal fallback for inconsistent normal faces", () => {
        const normals = { values: Float32Array.of(0, 0, 1), faces: faces([0, 0, 0], [0]) };
        const out = buildXMeshGeometry({ ...square, normals }, new Uint8Array(2));
        expect(out.normals).toBeNull();
        expect(out.positions).toBe(square.pos);
    });

    it("keeps shared buffers for vertex-aligned normals", () => {
        const normals = { values: new Float32Array(square.pos.length), faces: square.faces };
        const out = buildXMeshGeometry({ ...square, normals }, new Uint8Array(2));
        expect(out.positions).toBe(square.pos);
        expect(out.normals).toBe(normals.values);
        expect(out.uvs).toBe(square.uvs);
    });

    it("partitions oversized buffers without changing surface attributes or material ranges", () => {
        const geometry = buildXMeshGeometry(square, new Uint8Array(2));
        geometry.normals = Float32Array.from(geometry.positions, value => value + 1);
        const parts = [...splitXMeshGeometry(geometry, 36)];
        expect(parts).toHaveLength(2);
        expect(parts.map(part => part.ranges)).toEqual([[{ material: 0, start: 0, count: 3 }], [{ material: 1, start: 0, count: 3 }]]);
        for (const [i, part] of parts.entries()) {
            expect([...part.indices]).toEqual([0, 1, 2]);
            for (const iPart of part.indices) {
                const source = geometry.indices[i * 3 + iPart];
                expect(part.positions.slice(iPart * 3, iPart * 3 + 3)).toEqual(geometry.positions.slice(source * 3, source * 3 + 3));
                expect(part.normals?.slice(iPart * 3, iPart * 3 + 3)).toEqual(geometry.normals.slice(source * 3, source * 3 + 3));
                expect(part.uvs?.slice(iPart * 2, iPart * 2 + 2)).toEqual(geometry.uvs?.slice(source * 2, source * 2 + 2));
            }
        }
    });
});

import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStaticAccessoryMeshes } from "../../src/assets/static-accessory-loader";

const root = resolve("local-references/babylonjs/static-formats");
const references = [
    { name: "Channel9.stl", kind: "stl" },
    { name: "Channel9.le.ply", kind: "ply" },
    { name: "Channel9.be.ply", kind: "ply" },
] as const;

for (const reference of references) {
    const path = resolve(root, reference.name);
    describe.skipIf(!existsSync(path))(`local Babylon.js ${reference.name} reference`, () => {
        it("loads all triangles with finite normals and retains authored bounds", () => {
            const engine = new NullEngine();
            const scene = new Scene(engine);
            try {
                const meshes = loadStaticAccessoryMeshes(scene, reference.kind, Uint8Array.from(readFileSync(path)).buffer);
                expect(meshes).toHaveLength(1);
                const mesh = meshes[0];
                expect(mesh.getTotalVertices()).toBe(17_736);
                expect(mesh.getTotalIndices()).toBe(17_736);
                const normals = mesh.getVerticesData(VertexBuffer.NormalKind) ?? [];
                expect(normals).toHaveLength(17_736 * 3);
                expect(Array.from(normals).every(Number.isFinite)).toBe(true);
                expect(Array.from(normals).some(value => value !== 0)).toBe(true);
                const box = mesh.getBoundingInfo().boundingBox;
                box.minimum.asArray().forEach((value, axis) => expect(value).toBeCloseTo([-38.690868, -23.697248, -1.213336][axis], 4));
                box.maximum.asArray().forEach((value, axis) => expect(value).toBeCloseTo([38.690868, 22.182064, 120.544174][axis], 4));
                expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(false);
            } finally { scene.dispose(); engine.dispose(); }
        });
    });
}

for (const [name, hash] of [
    ["Channel9.stl", "8b9d7cecc4fffdcc31b7dc5cf1bd4eab23b17c3392ea09efe411a44085bb5473"],
    ["combined_SPZv3.ply", "2d4d6154960c3de305cdd20d5feb3df97b9b3d39da0693b656c72a4800a391a4"],
    ["Channel9.le.ply", "17bea6f6e1459fae2f5c42b9ad7ba9f0b4fa7800d4599625178f86920ca13083"],
    ["Channel9.be.ply", "a64c382bab35e48f98e5e465477693f6ecf46e1bd4e1bd1b194d96b1b04ab46b"],
]) {
    it.skipIf(!existsSync(resolve(root, name)))(`${name} matches the recorded source or conversion checksum`, () => {
        expect(createHash("sha256").update(readFileSync(resolve(root, name))).digest("hex")).toBe(hash);
    });
}

it.skipIf(!existsSync(resolve(root, "combined_SPZv3.ply")))("rejects official Gaussian Splat PLY without adding a scene mesh", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
        const data = Uint8Array.from(readFileSync(resolve(root, "combined_SPZv3.ply"))).buffer;
        expect(() => loadStaticAccessoryMeshes(scene, "ply", data)).toThrow(/Point-cloud and Gaussian Splat PLY are not supported/);
        expect(scene.meshes).toHaveLength(0);
    } finally { scene.dispose(); engine.dispose(); }
});

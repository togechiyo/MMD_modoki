import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { STLFileLoader } from "@babylonjs/loaders/STL/stlFileLoader.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { isStaticPointCloudMesh, loadStaticAccessoryMeshes } from "./static-accessory-loader";

describe("static accessory loader", () => {
    it("builds an unlit point primitive with colors, no normals and authored bounds", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const data = Uint8Array.from(readFileSync("test/fixtures/accessory/color-point-cloud.ply")).buffer;
            const [mesh] = loadStaticAccessoryMeshes(scene, "ply", data);
            expect(isStaticPointCloudMesh(mesh)).toBe(true);
            expect(mesh.getTotalVertices()).toBe(441);
            expect(mesh.getTotalIndices()).toBe(441);
            expect(mesh.isVerticesDataPresent(VertexBuffer.NormalKind)).toBe(false);
            expect(mesh.getVerticesData(VertexBuffer.ColorKind)).toHaveLength(441 * 4);
            expect(mesh.receiveShadows).toBe(false);
            expect(mesh.hasVertexAlpha).toBe(false);
            expect(mesh.getBoundingInfo().boundingBox.minimum.asArray()).toEqual([-10, 2, -2]);
            expect(mesh.getBoundingInfo().boundingBox.maximum.asArray()).toEqual([10, 22, 2]);
            expect(mesh.material).toBeInstanceOf(StandardMaterial);
            expect(mesh.material).toMatchObject({ pointsCloud: true, pointSize: 1, disableLighting: true });
        } finally { scene.dispose(); engine.dispose(); }
    });
    it("loads a single colorless point without requiring a triangle or generating normals", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const data = new TextEncoder().encode("ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n1 2 3\n").buffer;
            const [mesh] = loadStaticAccessoryMeshes(scene, "ply", data);
            expect(isStaticPointCloudMesh(mesh)).toBe(true);
            expect(mesh.getIndices()).toEqual([0]);
            expect(mesh.getVerticesData(VertexBuffer.PositionKind)).toEqual([1, 2, 3]);
            expect(mesh.isVerticesDataPresent(VertexBuffer.ColorKind)).toBe(false);
        } finally { scene.dispose(); engine.dispose(); }
    });
    it.each(["ply", "stl"] as const)("loads %s with renderable normals and authored bounds", kind => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const data = Uint8Array.from(readFileSync(`test/fixtures/accessory/static-triangle.${kind}`)).buffer;
            const meshes = loadStaticAccessoryMeshes(scene, kind, data);
            expect(meshes).toHaveLength(1);
            expect(meshes[0].getTotalVertices()).toBe(3);
            expect(meshes[0].getTotalIndices()).toBe(3);
            expect(meshes[0].getVerticesData(VertexBuffer.NormalKind)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
            expect(meshes[0].getBoundingInfo().boundingBox.maximum.asArray()).toEqual([4, 8, 0]);
            expect(STLFileLoader.DO_NOT_ALTER_FILE_COORDINATES).toBe(false);
            if (kind === "ply") expect(meshes[0].getVerticesData(VertexBuffer.ColorKind)).toHaveLength(12);
        } finally { scene.dispose(); engine.dispose(); }
    });
    it("loads binary STL and supplies normals when the author used zero normals", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const data = new ArrayBuffer(134);
            const view = new DataView(data);
            view.setUint32(80, 1, true);
            [-4, 0, 0, 4, 0, 0, 0, 8, 0].forEach((value, i) => view.setFloat32(96 + i * 4, value, true));
            const meshes = loadStaticAccessoryMeshes(scene, "stl", data);
            expect(Array.from(meshes[0].getVerticesData(VertexBuffer.NormalKind) ?? [])).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
        } finally { scene.dispose(); engine.dispose(); }
    });
    it("rejects malformed data without leaving partial scene meshes or loader flags", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const invalid = new TextEncoder().encode("solid bad\nfacet normal 0 0 1\nvertex 0 0 0\nendfacet\nendsolid bad\n").buffer;
            expect(() => loadStaticAccessoryMeshes(scene, "stl", invalid)).toThrow();
            expect(scene.meshes).toHaveLength(0);
            expect(STLFileLoader.DO_NOT_ALTER_FILE_COORDINATES).toBe(false);
            expect(() => loadStaticAccessoryMeshes(scene, "stl", new ArrayBuffer(90))).toThrow();
            expect(scene.meshes).toHaveLength(0);
        } finally { scene.dispose(); engine.dispose(); }
    });
});

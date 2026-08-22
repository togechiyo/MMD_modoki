import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    createObjLoaderForLocalMaterialData,
    findObjMaterialLibraryReference,
} from "../../src/shared/obj-local-materials";

const chairObjPath = resolve("local-references", "babylonjs", "chair", "Chair.obj");
const expectedSha256 = "c4ac14dd2a1207c98b575fd1f5fbf723ce1c24e17fac3e73737a4d28a26cc0d6";

describe.skipIf(!existsSync(chairObjPath))("Babylon.js official Chair OBJ reference asset", () => {
    it("matches the recorded unmodified source asset", () => {
        const bytes = readFileSync(chairObjPath);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedSha256);
    });

    it("loads all groups and generates normals through the local OBJ path", async () => {
        const objData = readFileSync(chairObjPath, "utf8");
        expect(findObjMaterialLibraryReference(objData)).toBeNull();

        const engine = new NullEngine();
        const scene = new Scene(engine);

        try {
            const loader = createObjLoaderForLocalMaterialData(null);
            const container = await loader.loadAssetContainerAsync(scene, objData, "");
            const totalVertices = container.meshes.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0);
            const totalIndices = container.meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices(), 0);

            expect(container.meshes).toHaveLength(10);
            expect(totalVertices).toBe(16_755);
            expect(totalIndices).toBe(59_256);
            expect(container.meshes.every((mesh) => mesh.isVerticesDataPresent(VertexBuffer.NormalKind))).toBe(true);
            expect(container.meshes.every((mesh) => mesh.isVerticesDataPresent(VertexBuffer.UVKind))).toBe(true);

            container.dispose();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});

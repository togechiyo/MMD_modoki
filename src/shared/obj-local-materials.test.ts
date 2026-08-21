import { describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    createObjLoaderForLocalMaterialData,
    findObjMaterialLibraryReference,
    prepareLocalObjMaterialBundle,
    resolveLocalObjCompanionPath,
} from "./obj-local-materials";

describe("OBJ local material helpers", () => {
    it("uses the final mtllib reference like Babylon.js 9.2.0", () => {
        expect(findObjMaterialLibraryReference([
            "mtllib first.mtl",
            "o Cube",
            "mtllib materials/tofu material.mtl",
        ].join("\n"))).toBe("materials/tofu material.mtl");
        expect(findObjMaterialLibraryReference("o Cube\nv 0 0 0")).toBeNull();
    });

    it("resolves only relative files inside the OBJ directory tree", () => {
        expect(resolveLocalObjCompanionPath(
            "C:\\fixtures\\accessory\\tofu.obj",
            "materials\\tofu.mtl",
        )).toBe("C:/fixtures/accessory/materials/tofu.mtl");
        expect(resolveLocalObjCompanionPath(
            "C:\\fixtures\\accessory\\materials\\tofu.mtl",
            "../tofu.png",
        )).toBeNull();
        expect(resolveLocalObjCompanionPath(
            "C:\\fixtures\\accessory\\materials\\tofu.mtl",
            "../tofu.png",
            "C:\\fixtures\\accessory\\tofu.obj",
        )).toBe("C:/fixtures/accessory/tofu.png");
        expect(resolveLocalObjCompanionPath(
            "C:\\fixtures\\accessory\\materials\\tofu.mtl",
            "../../outside.png",
            "C:\\fixtures\\accessory\\tofu.obj",
        )).toBeNull();
        expect(resolveLocalObjCompanionPath("C:\\fixtures\\tofu.obj", "https://example.com/tofu.mtl")).toBeNull();
        expect(resolveLocalObjCompanionPath("C:\\fixtures\\tofu.obj", "D:\\outside\\tofu.mtl")).toBeNull();
        expect(resolveLocalObjCompanionPath("C:\\fixtures\\tofu.obj", "/outside/tofu.mtl")).toBeNull();
    });

    it("loads a local MTL and rewrites its PNG texture to an offline data URL", async () => {
        const readTextFile = vi.fn(async (filePath: string) => (
            filePath === "C:/fixtures/tofu.mtl"
                ? "newmtl TofuMaterial\nKd 1 1 1\nmap_Kd tofu.png\n"
                : null
        ));
        const readBinaryFile = vi.fn(async (filePath: string) => (
            filePath === "C:/fixtures/tofu.png"
                ? Uint8Array.from([1, 2, 3, 4])
                : null
        ));

        const result = await prepareLocalObjMaterialBundle(
            "C:\\fixtures\\tofu.obj",
            "mtllib tofu.mtl\no Cube\n",
            { readTextFile, readBinaryFile },
        );

        expect(result).toEqual({
            materialReference: "tofu.mtl",
            materialPath: "C:/fixtures/tofu.mtl",
            mtlData: "newmtl TofuMaterial\nKd 1 1 1\nmap_Kd data:image/png;base64,AQIDBA==\n",
            loadedTextureCount: 1,
            warnings: [],
        });
        expect(readTextFile).toHaveBeenCalledWith("C:/fixtures/tofu.mtl");
        expect(readBinaryFile).toHaveBeenCalledWith("C:/fixtures/tofu.png");
    });

    it("keeps the MTL colors but removes unsafe or missing texture references", async () => {
        const readBinaryFile = vi.fn(async () => null);
        const result = await prepareLocalObjMaterialBundle(
            "C:\\fixtures\\tofu.obj",
            "mtllib tofu.mtl\n",
            {
                readTextFile: async () => [
                    "newmtl TofuMaterial",
                    "Kd 0.5 0.5 0.5",
                    "map_Kd https://example.com/remote.png",
                    "map_Ks missing.png",
                    "",
                ].join("\n"),
                readBinaryFile,
            },
        );

        expect(result.mtlData).toContain("Kd 0.5 0.5 0.5");
        expect(result.mtlData).not.toContain("https://");
        expect(result.mtlData).not.toMatch(/^map_K[ds]/m);
        expect(result.loadedTextureCount).toBe(0);
        expect(result.warnings).toEqual([
            "Rejected unsafe MTL texture reference: https://example.com/remote.png",
            "Unable to read MTL texture: C:/fixtures/missing.png",
        ]);
        expect(readBinaryFile).toHaveBeenCalledTimes(1);
    });

    it("falls back to geometry-only loading when the MTL is unavailable", async () => {
        const result = await prepareLocalObjMaterialBundle(
            "C:\\fixtures\\tofu.obj",
            "mtllib missing.mtl\n",
            {
                readTextFile: async () => null,
                readBinaryFile: async () => null,
            },
        );

        expect(result.mtlData).toBeNull();
        expect(result.warnings).toEqual(["Unable to read OBJ material library: C:/fixtures/missing.mtl"]);
    });

    it("assigns the fixture MTL material and local PNG through Babylon.js", async () => {
        const fixtureDirectory = resolve("test", "fixtures", "accessory");
        const objPath = resolve(fixtureDirectory, "tofu-uv-mtl.obj");
        const objData = readFileSync(objPath, "utf8");
        const bundle = await prepareLocalObjMaterialBundle(objPath, objData, {
            readTextFile: async (filePath) => readFileSync(filePath, "utf8"),
            readBinaryFile: async (filePath) => readFileSync(filePath),
        });
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.useDelayedTextureLoading = true;

        try {
            const loader = createObjLoaderForLocalMaterialData(bundle.mtlData);
            const container = await loader.loadAssetContainerAsync(scene, objData, "");
            const mesh = container.meshes[0];
            const material = mesh?.material;
            const diffuseTexture = material && "diffuseTexture" in material
                ? material.diffuseTexture as { url?: string } | null
                : null;

            expect(container.meshes).toHaveLength(1);
            expect(mesh?.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(true);
            expect(material?.name).toBe("TofuMaterial");
            expect(material?.getClassName()).toBe("StandardMaterial");
            expect(diffuseTexture?.url).toMatch(/^data:image\/png;base64,/);

            container.dispose();
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});

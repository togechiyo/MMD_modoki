import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { applyAccessoryCoplanarMaterialDepthBias } from "./accessory-coplanar-depth-bias";

describe("accessory coplanar depth bias", () => {
    let engine: NullEngine | null = null;
    let scene: Scene | null = null;

    afterEach(() => {
        scene?.dispose();
        engine?.dispose();
        scene = null;
        engine = null;
    });

    it("applies the shared planar overlap policy to X-style submaterials", () => {
        engine = new NullEngine();
        scene = new Scene(engine);
        const mesh = new Mesh("x-stage", scene);
        mesh.setVerticesData("position", [
            -20, 0, -20,
            20, 0, -20,
            20, 0, 20,
            -20, 0, 20,
            -5, 0.001, -5,
            5, 0.001, -5,
            5, 0.001, 5,
            -5, 0.001, 5,
        ]);
        mesh.setIndices([
            0, 1, 2, 0, 2, 3,
            4, 5, 6, 4, 6, 7,
        ]);

        const base = new StandardMaterial("base", scene);
        const overlay = new StandardMaterial("overlay", scene);
        const multi = new MultiMaterial("x-stage-materials", scene);
        multi.subMaterials.push(base, overlay);
        mesh.material = multi;
        mesh.releaseSubMeshes();
        new SubMesh(0, 0, 8, 0, 6, mesh);
        new SubMesh(1, 0, 8, 6, 6, mesh);

        expect(applyAccessoryCoplanarMaterialDepthBias([mesh], 2)).toBe(1);
        expect(base.zOffsetUnits).toBe(0);
        expect(overlay.zOffsetUnits).toBe(-2);
    });

    it("resets X material bias when correction is turned off", () => {
        engine = new NullEngine();
        scene = new Scene(engine);
        const mesh = new Mesh("single", scene);
        mesh.setVerticesData("position", [-10, 0, -10, 10, 0, -10, 10, 0, 10]);
        mesh.setIndices([0, 1, 2]);
        const material = new StandardMaterial("material", scene);
        material.zOffsetUnits = -8;
        mesh.material = material;
        const transparencyMode = material.transparencyMode;

        expect(applyAccessoryCoplanarMaterialDepthBias([mesh], 0)).toBe(0);
        expect(material.zOffsetUnits).toBe(0);
        expect(material.zOffset).toBe(0);
        expect(material.transparencyMode).toBe(transparencyMode);
    });
});

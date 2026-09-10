import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { describe, expect, it, vi } from "vitest";
import { SwitchableMaterialProxy } from "../runtime/switchable-material-proxy";
import { MaterialVisibilityController } from "./material-visibility-controller";

describe("material draw visibility", () => {
    it("keeps an opaque material hidden across morph/preset writes and preserves the current alpha on restore", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const mesh = MeshBuilder.CreateBox("model", {}, scene);
            const material = new PBRMaterial("material", scene);
            material.transparencyMode = 0;
            mesh.material = material;
            const ranges = mesh.subMeshes;
            const proxy = new SwitchableMaterialProxy(material, [mesh]);
            const controller = new MaterialVisibilityController();
            controller.sync([mesh], () => false);
            expect(mesh.subMeshes).toEqual([]);
            expect(material.alpha).toBe(1);
            proxy.diffuse[3] = 0.4;
            proxy.applyChanges();
            expect(mesh.isVisible).toBe(true);
            expect(mesh.subMeshes).toEqual([]);
            controller.sync([mesh], () => true);
            expect(mesh.subMeshes).toBe(ranges);
            expect(material.alpha).toBe(0.4);
            proxy.diffuse[3] = 0;
            proxy.applyChanges();
            controller.sync([mesh], () => false);
            controller.sync([mesh], () => true);
            expect(mesh.isVisible).toBe(false);
        } finally { scene.dispose(); engine.dispose(); }
    });

    it("filters MultiMaterial ranges independently and re-evaluates replaced materials", () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const mesh = MeshBuilder.CreateBox("accessory", {}, scene);
            mesh.releaseSubMeshes();
            const a = new SubMesh(0, 0, 24, 0, 18, mesh);
            const b = new SubMesh(1, 0, 24, 18, 18, mesh);
            const material = new MultiMaterial("multi", scene);
            const first = new PBRMaterial("first", scene);
            const second = new PBRMaterial("second", scene);
            material.subMaterials = [first, second];
            mesh.material = material;
            const controller = new MaterialVisibilityController();
            controller.sync([mesh], value => value !== first);
            expect(mesh.subMeshes).toEqual([b]);
            expect([a.indexStart, a.indexCount, b.indexStart, b.indexCount]).toEqual([0, 18, 18, 18]);
            controller.sync([mesh], () => false);
            expect(mesh.subMeshes).toEqual([]);
            material.subMaterials = [second, first];
            const resetA = vi.spyOn(a, "resetDrawCache");
            controller.sync([mesh], value => value !== first);
            expect(mesh.subMeshes).toEqual([a]);
            expect(resetA).toHaveBeenCalledTimes(1);
            controller.sync([mesh], () => true);
            expect(mesh.subMeshes).toEqual([a, b]);
            const disposeA = vi.spyOn(a, "dispose");
            const disposeB = vi.spyOn(b, "dispose");
            controller.sync([mesh], value => value !== first);
            mesh.dispose();
            expect(disposeA).toHaveBeenCalledTimes(1);
            expect(disposeB).toHaveBeenCalledTimes(1);
        } finally { scene.dispose(); engine.dispose(); }
    });
});

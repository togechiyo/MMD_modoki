import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { ReflectiveShadowMap, RSMCreatePluginMaterial } from "@babylonjs/core/Rendering/reflectiveShadowMap";
import { disposeRsmMaterialClones, prepareRsmMaterialClones } from "./rsm-material-compatibility";
import { GlobalIlluminationController } from "./global-illumination-controller";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine), light = new DirectionalLight("test", new Vector3(0, -1, 1), scene);
    const rsm = new ReflectiveShadowMap(scene, light, { width: 16, height: 16 });
    const clones = (rsm as unknown as { _regularMatToMatWithPlugin: Map<Material, Material> })._regularMatToMatWithPlugin;
    const add = (material: Material) => { const mesh = CreateBox("source", {}, scene); mesh.material = material; rsm.addMesh(mesh); return mesh; };
    return { scene, light, rsm, clones, add };
}

describe("RSM material compatibility", () => {
    it("gives each MultiMaterial child a dedicated RSM clone with all three fragment outputs", () => {
        const { scene, light, rsm, clones, add } = fixture();
        const first = new StandardMaterial("red", scene), second = new StandardMaterial("blue", scene);
        const group = new MultiMaterial("group", scene); group.subMaterials = [first, second, null]; add(group);
        prepareRsmMaterialClones(rsm, light);
        const clone = clones.get(group) as MultiMaterial;
        expect(clone.subMaterials[2]).toBeNull();
        for (const [index, original] of [first, second].entries()) {
            const child = clone.subMaterials[index];
            if (!child) throw new Error("Missing child RSM clone");
            expect(child).not.toBe(original); expect(child).toBe(clones.get(original));
            expect(original.pluginManager?.getPlugin("RSMCreate")).toBeFalsy();
            const plugin = child.pluginManager?.getPlugin<RSMCreatePluginMaterial>("RSMCreate");
            expect(plugin?.isEnabled).toBe(true); expect(plugin?.light).toBe(light);
            const code = plugin?.getCustomCode("fragment", 1)?.CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR;
            for (const index of [0, 1, 2]) expect(code).toContain(`fragmentOutputs.fragData${index}`);
            expect(child.canRenderToMRT).toBe(false);
        }
        expect(group.subMaterials[0]).toBe(first); expect(group.subMaterials[1]).toBe(second);
        expect(group.subMaterials[2]).toBeNull();
    });

    it("reuses shared child clones across meshes, nested groups and repeated preparation", () => {
        const { scene, light, rsm, clones, add } = fixture();
        const source = new StandardMaterial("shared", scene); add(source);
        const nested = new MultiMaterial("nested", scene); nested.subMaterials = [source];
        const group = new MultiMaterial("group", scene); group.subMaterials = [nested, source]; add(group);
        prepareRsmMaterialClones(rsm, light);
        const child = clones.get(source), count = scene.materials.length;
        prepareRsmMaterialClones(rsm, light);
        const result = clones.get(group) as MultiMaterial;
        expect(result.subMaterials[1]).toBe(child);
        expect((result.subMaterials[0] as MultiMaterial).subMaterials[0]).toBe(child);
        expect(scene.materials.length).toBe(count);
        expect(source.disableLighting).toBe(false);
    });

    it("disables camera SSS on PBR child clones while preserving source material and textures on disposal", () => {
        const { scene, light, rsm, clones, add } = fixture();
        const source = new PBRMaterial("skin", scene); source.subSurface.isScatteringEnabled = true;
        const texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 80, 20, 255]), 1, 1, scene);
        source.albedoTexture = texture;
        const group = new MultiMaterial("group", scene); group.subMaterials = [source]; add(group);
        prepareRsmMaterialClones(rsm, light);
        const child = clones.get(source) as PBRMaterial;
        expect(child.subSurface.isScatteringEnabled).toBe(false);
        expect(source.subSurface.isScatteringEnabled).toBe(true);
        const owned = [...clones.values()]; disposeRsmMaterialClones(rsm);
        expect(clones.size).toBe(0);
        expect(scene.materials).toContain(source); expect(scene.multiMaterials).toContain(group);
        expect(texture.getInternalTexture()).not.toBeNull(); expect(source.albedoTexture).toBe(texture);
        for (const clone of owned) expect([...scene.materials, ...scene.multiMaterials]).not.toContain(clone);
    });

    it("keeps the app's RSM out of the render loop before GI is enabled and disposes its resources", () => {
        const { scene, light, rsm } = fixture(); rsm.dispose();
        const material = new StandardMaterial("source", scene), mesh = CreateBox("source", {}, scene); mesh.material = material;
        const controller = new GlobalIlluminationController(scene, { clientWidth: 16, clientHeight: 16 } as HTMLCanvasElement,
            () => light, () => [{ mesh }]);
        controller.syncSceneModels();
        expect(controller.isEnabled()).toBe(false);
        expect(scene.customRenderTargets.filter(target => target.name.startsWith("RSMmrt_"))).toHaveLength(0);
        controller.setEnabled(false); controller.dispose(); controller.dispose();
        expect(scene.customRenderTargets.filter(target => target.name.startsWith("RSMmrt_"))).toHaveLength(0);
        expect(scene.materials.some(material => material.name.startsWith("RSMCreate_"))).toBe(false);
        expect(scene.materials).toContain(material);
    });
});

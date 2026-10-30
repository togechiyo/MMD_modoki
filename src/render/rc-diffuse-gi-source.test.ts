import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import type { MmdPluginMaterial } from "babylon-mmd/esm/Loader/mmdPluginMaterial";
import { readRcDiffuseGiReflectance } from "./rc-diffuse-gi-source";

const engines: NullEngine[] = [];
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); });
function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine), mesh = CreateBox("bounce", {}, scene);
    const material = new MmdStandardMaterial("bounce", scene); mesh.material = material;
    return { scene, mesh, material };
}

describe("RC GI diffuse source", () => {
    it("matches MMD ambient-to-diffuse color while keeping emission and light-independent inputs separate", () => {
        const { scene, mesh, material } = fixture();
        scene.ambientColor.set(0.5, 1, 0);
        material.diffuseColor.set(0.2, 0.3, 0.4); material.ambientColor.set(0.4, 0.2, 0.8);
        material.emissiveColor.set(100, 10, 1); material.disableLighting = true;
        expect(readRcDiffuseGiReflectance(mesh, material)).toEqual({ r: 0.4 ** 2.2, g: 0.5 ** 2.2, b: 0.4 ** 2.2, texture: null });
        material.applyAmbientColorToDiffuse = false;
        expect(readRcDiffuseGiReflectance(mesh, material)).toEqual({ r: 0.2 ** 2.2, g: 0.3 ** 2.2, b: 0.4 ** 2.2, texture: null });
        material.diffuseColor.set(0, 0, 0);
        expect(readRcDiffuseGiReflectance(mesh, material)).toEqual({ r: 0, g: 0, b: 0, texture: null });
    });

    it("passes the UV texture and level without enabling MMD texture-morph shader features", async () => {
        const { scene, mesh, material } = fixture();
        material.diffuseColor.set(0.5, 1, 0.25); material.ambientColor.set(0, 0, 0);
        const texture = new Texture(null, scene); texture.level = 0.5; material.diffuseTexture = texture;
        await vi.waitFor(() => expect(material.pluginManager?.getPlugin("MmdMaterial")).toBeTruthy());
        const plugin = material.pluginManager?.getPlugin<MmdPluginMaterial>("MmdMaterial");
        expect(plugin?.useTextureColor).toBe(false);
        const value = readRcDiffuseGiReflectance(mesh, material);
        expect(value?.r).toBeCloseTo(0.25 ** 2.2); expect(value?.g).toBeCloseTo(0.5 ** 2.2);
        expect(value?.b).toBeCloseTo(0.125 ** 2.2); expect(value?.texture).toBe(texture);
        expect(plugin?.useTextureColor).toBe(false);
        material.textureMultiplicativeColor.set(0.5, 1, 1, 1);
        expect(readRcDiffuseGiReflectance(mesh, material)).toBeNull();
        material.textureMultiplicativeColor.set(1, 1, 1, 1);
        expect(readRcDiffuseGiReflectance(mesh, material)).not.toBeNull();
        material.textureAdditiveColor.set(0.1, 0, 0, 0);
        expect(readRcDiffuseGiReflectance(mesh, material)).toBeNull();
    });

    it("does not guess unsupported vertex colors or other material classes", () => {
        const { scene, mesh, material } = fixture();
        expect(readRcDiffuseGiReflectance(mesh, new StandardMaterial("other", scene))).toBeNull();
        mesh.setVerticesData(VertexBuffer.ColorKind, new Float32Array(mesh.getTotalVertices() * 4).fill(1));
        mesh.useVertexColors = true; expect(readRcDiffuseGiReflectance(mesh, material)).toBeNull();
        mesh.useVertexColors = false; expect(readRcDiffuseGiReflectance(mesh, material)).not.toBeNull();
        material.diffuseTexture = new BaseTexture(scene);
        expect(readRcDiffuseGiReflectance(mesh, material)).toBeNull();
    });
});

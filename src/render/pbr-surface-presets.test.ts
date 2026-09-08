import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { applyPbrMaterialShaderPreset } from "./pbr-mmd-like-toon-settings";

describe("PBR surface presets", () => {
    it.each([
        ["pbr-metal-polished", 1, 0.2], ["pbr-metal-satin", 1, 0.45],
        ["pbr-plastic-glossy", 0, 0.25], ["pbr-clay-white", 0, 1],
    ] as const)("%s preserves cutouts and restores source settings", (preset, metallic, roughness) => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const material = new PBRMaterial("surface", scene);
            const texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 0, 0, 0]), 1, 1, scene);
            texture.hasAlpha = true;
            material.albedoTexture = texture;
            material.bumpTexture = texture;
            material.emissiveTexture = texture;
            material.emissiveColor = new Color3(0.3, 0.2, 0.1);
            material.metallicTexture = texture;
            material.albedoColor = new Color3(0.2, 0.5, 0.8);
            material.alpha = 0.7;
            material.useAlphaFromAlbedoTexture = true;
            material.metallic = 0.3;
            material.roughness = 0.6;
            material.clearCoat.isEnabled = true;
            applyPbrMaterialShaderPreset(material, preset);
            expect(material.metallic).toBe(metallic);
            expect(material.roughness).toBe(roughness);
            expect(material.albedoTexture).toBe(texture);
            expect(material.alpha).toBe(0.7);
            expect(material.useAlphaFromAlbedoTexture).toBe(true);
            expect(material.metallicTexture).toBeNull();
            if (preset === "pbr-clay-white") {
                expect(material.bumpTexture).toBeNull();
                expect(material.emissiveTexture).toBeNull();
                expect(material.emissiveColor.equals(Color3.Black())).toBe(true);
                expect(material.clearCoat.isEnabled).toBe(false);
            }
            applyPbrMaterialShaderPreset(material, "pbr-base");
            expect(material.metallic).toBe(0.3);
            expect(material.roughness).toBe(0.6);
            expect(material.metallicTexture).toBe(texture);
            expect(material.bumpTexture).toBe(texture);
            expect(material.emissiveTexture).toBe(texture);
            expect(material.emissiveColor.asArray()).toEqual([0.3, 0.2, 0.1]);
            expect(material.albedoColor.asArray()).toEqual([0.2, 0.5, 0.8]);
            expect(material.clearCoat.isEnabled).toBe(true);
        } finally { scene.dispose(); engine.dispose(); }
    });
});

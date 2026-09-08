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
        ["pbr-cotton", 0, 0.9], ["pbr-satin", 0, 0.3],
        ["pbr-velvet", 0, 0.85], ["pbr-leather", 0, 0.45],
        ["pbr-emissive", 0, 1], ["pbr-candy-coat", 1, 0.25],
        ["pbr-pearl", 0.15, 0.35], ["pbr-aurora", 0.8, 0.2],
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
            material.clearCoat.intensity = 0.4;
            material.clearCoat.roughness = 0.6;
            material.clearCoat.texture = texture;
            material.iridescence.intensity = 0.2;
            material.iridescence.maximumThickness = 700;
            material.iridescence.texture = texture;
            material.emissiveIntensity = 0.6;
            material.sheen.intensity = 0.17;
            material.sheen.linkSheenWithAlbedo = true;
            material.sheen.albedoScaling = true;
            material.sheen.texture = texture;
            material.anisotropy.intensity = 0.23;
            material.anisotropy.direction.set(0, 1);
            material.anisotropy.texture = texture;
            applyPbrMaterialShaderPreset(material, preset);
            expect(material.metallic).toBe(metallic);
            expect(material.roughness).toBe(roughness);
            expect(material.albedoTexture).toBe(texture);
            expect(material.alpha).toBe(0.7);
            expect(material.useAlphaFromAlbedoTexture).toBe(true);
            expect(material.metallicTexture).toBeNull();
            if (preset === "pbr-emissive") {
                expect(material.emissiveTexture).toBe(texture);
                expect(material.emissiveColor.asArray()).toEqual([0.2, 0.5, 0.8]);
                expect(material.emissiveIntensity).toBe(1);
                expect(material.directIntensity).toBe(0);
                expect(material.environmentIntensity).toBe(0);
            }
            if (preset === "pbr-candy-coat" || preset === "pbr-pearl") {
                expect(material.clearCoat.isEnabled).toBe(true);
                expect(material.clearCoat.intensity).toBe(1);
                expect(material.clearCoat.texture).toBeNull();
            }
            if (preset === "pbr-pearl" || preset === "pbr-aurora") {
                expect(material.iridescence.isEnabled).toBe(true);
                expect(material.iridescence.intensity).toBe(preset === "pbr-pearl" ? 0.3 : 1);
                expect(material.iridescence.texture).toBeNull();
            }
            if (preset === "pbr-satin") {
                expect(material.anisotropy.isEnabled).toBe(true);
                expect(material.anisotropy.intensity).toBe(0.5);
                expect(material.anisotropy.texture).toBeNull();
            }
            if (preset === "pbr-velvet") {
                expect(material.sheen.isEnabled).toBe(true);
                expect(material.sheen.intensity).toBe(0.8);
                expect(material.sheen.linkSheenWithAlbedo).toBe(false);
                expect(material.sheen.albedoScaling).toBe(false);
                expect(material.sheen.texture).toBeNull();
            }
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
            expect(material.clearCoat.intensity).toBe(0.4);
            expect(material.clearCoat.roughness).toBe(0.6);
            expect(material.clearCoat.texture).toBe(texture);
            expect(material.iridescence.isEnabled).toBe(false);
            expect(material.iridescence.intensity).toBe(0.2);
            expect(material.iridescence.maximumThickness).toBe(700);
            expect(material.iridescence.texture).toBe(texture);
            expect(material.emissiveIntensity).toBe(0.6);
            expect(material.directIntensity).toBe(1);
            expect(material.environmentIntensity).toBe(1);
            expect(material.sheen.isEnabled).toBe(false);
            expect(material.sheen.intensity).toBe(0.17);
            expect(material.sheen.linkSheenWithAlbedo).toBe(true);
            expect(material.sheen.albedoScaling).toBe(true);
            expect(material.sheen.texture).toBe(texture);
            expect(material.anisotropy.isEnabled).toBe(false);
            expect(material.anisotropy.intensity).toBe(0.23);
            expect(material.anisotropy.direction.asArray()).toEqual([0, 1]);
            expect(material.anisotropy.texture).toBe(texture);
        } finally { scene.dispose(); engine.dispose(); }
    });
});

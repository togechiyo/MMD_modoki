import { describe, expect, it, vi } from "vitest";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
    applyPbrMaterialShaderPreset, getPbrMaterialShaderPreset, getPbrMmdLikeShadowTintStrength,
    isPbrShadowTintPreset, registerPbrPresetMaterial, registerPbrPresetTransparencyBaseline,
    type MmdLikeSubSurfaceTarget,
} from "./pbr-mmd-like-toon-settings";


describe("PBR MMD Like shadow control", () => {
    it("inverts the Toon influence for multiplicative shadow tint", () => {
        expect(getPbrMmdLikeShadowTintStrength(0)).toBe(1);
        expect(getPbrMmdLikeShadowTintStrength(0.25)).toBe(0.75);
        expect(getPbrMmdLikeShadowTintStrength(1)).toBe(0);
    });

    it("clamps invalid or out-of-range Toon influence values", () => {
        expect(getPbrMmdLikeShadowTintStrength(-1)).toBe(1);
        expect(getPbrMmdLikeShadowTintStrength(2)).toBe(0);
        expect(getPbrMmdLikeShadowTintStrength(Number.NaN)).toBe(1);
    });
});

function createSubSurfaceTarget(): MmdLikeSubSurfaceTarget {
    return {
        isRefractionEnabled: true,
        isTranslucencyEnabled: false,
        isScatteringEnabled: false,
        refractionIntensity: 0.4,
        translucencyIntensity: 0.25,
        linkRefractionWithTransparency: true,
        legacyTranslucency: true,
        useAlbedoToTintTranslucency: true,
        minimumThickness: 0.1,
        maximumThickness: 0.9,
        tintColor: new Color3(0.8, 0.7, 0.6),
        translucencyColor: null,
        translucencyColorTexture: null,
        scatteringDiffusionProfile: null,
    };
}

function createMaterial() {
    const subSurfaceConfiguration = {
        enabled: false,
        metersPerUnit: 1,
        needsImageProcessing: true,
    };
    const scene = {
        materials: [] as unknown[],
        subSurfaceConfiguration,
        enableSubSurfaceForPrePass: vi.fn(() => subSurfaceConfiguration),
    };
    const material = {
        subSurface: createSubSurfaceTarget(),
        albedoColor: new Color3(0.45, 0.5, 0.55),
        albedoTexture: null as BaseTexture | null,
        ambientColor: new Color3(0.2, 0.3, 0.4),
        alpha: 1,
        transparencyMode: Material.MATERIAL_ALPHABLEND,
        useAlphaFromAlbedoTexture: true,
        forceDepthWrite: true,
        alphaCutOff: 0.4,
        roughness: 0.35,
        specularIntensity: 1,
        environmentIntensity: 0.9,
        reflectionColor: new Color3(0.05, 0.1, 0.15),
        getScene: () => scene,
        markAsDirty: vi.fn(),
    };
    scene.materials.push(material);
    return material;
}

function expectStandardBaseline(material: ReturnType<typeof createMaterial>): void {
    expect(material.subSurface.isRefractionEnabled).toBe(true);
    expect(material.subSurface.isTranslucencyEnabled).toBe(false);
    expect(material.subSurface.isScatteringEnabled).toBe(false);
    expect(material.subSurface.refractionIntensity).toBe(0.4);
    expect(material.subSurface.translucencyIntensity).toBe(0.25);
    expect(material.subSurface.linkRefractionWithTransparency).toBe(true);
    expect(material.subSurface.legacyTranslucency).toBe(true);
    expect(material.subSurface.useAlbedoToTintTranslucency).toBe(true);
    expect(material.subSurface.minimumThickness).toBe(0.1);
    expect(material.subSurface.maximumThickness).toBe(0.9);
    expect(material.subSurface.tintColor.equals(new Color3(0.8, 0.7, 0.6))).toBe(true);
    expect(material.alpha).toBe(1);
    expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
    expect(material.useAlphaFromAlbedoTexture).toBe(true);
    expect(material.forceDepthWrite).toBe(true);
    expect(material.alphaCutOff).toBe(0.4);
    expect(material.roughness).toBe(0.35);
    expect(material.specularIntensity).toBe(1);
    expect(material.environmentIntensity).toBe(0.9);
    expect(material.reflectionColor.equals(Color3.White())).toBe(true);
    expect(material.albedoColor.equals(new Color3(0.45, 0.5, 0.55))).toBe(true);
}

describe("PBR preset responsibilities", () => {
    it.each(["pbr-mmd-like", "pbr-skin", "pbr-skin-face", "pbr-no-shadow", "pbr-skin-sss", "pbr-sss-wax"])("restores Standard after %s without leaking material changes", preset => {
        const material = createMaterial();
        registerPbrPresetMaterial(material, material.ambientColor);
        registerPbrPresetTransparencyBaseline(material);
        expect(applyPbrMaterialShaderPreset(material, preset)).toBe(true);
        expect(applyPbrMaterialShaderPreset(material, "pbr-base")).toBe(true);
        expectStandardBaseline(material);
    });
    it("MMD Like uses a matte roughness floor without changing IBL or adding transmission", () => {
        const material = createMaterial();
        applyPbrMaterialShaderPreset(material, "pbr-mmd-like");
        expect(material.roughness).toBe(0.8);
        expect(material.environmentIntensity).toBe(0.9);
        expect(material.specularIntensity).toBe(1);
        expect(material.subSurface.isTranslucencyEnabled).toBe(false);
        expect(material.subSurface.isScatteringEnabled).toBe(false);
        expect(material.subSurface.translucencyIntensity).toBe(0);
        expect(material.getScene().enableSubSurfaceForPrePass).not.toHaveBeenCalled();
        expect(isPbrShadowTintPreset("pbr-mmd-like")).toBe(true);
        expect(isPbrShadowTintPreset("pbr-skin")).toBe(false);
    });
    it.each(["pbr-skin", "pbr-skin-face", "pbr-skin-sss", "pbr-sss-wax"])("%s avoids Babylon scattering and preserves PBR IBL/albedo", preset => {
        const material = createMaterial();
        applyPbrMaterialShaderPreset(material, preset);
        expect(material.roughness).toBe(0.68);
        expect(material.environmentIntensity).toBe(0.9);
        expect(material.subSurface.isScatteringEnabled).toBe(false);
        expect(material.subSurface.isTranslucencyEnabled).toBe(false);
        expect(material.getScene().enableSubSurfaceForPrePass).not.toHaveBeenCalled();
        expect(material.albedoColor.asArray()).toEqual([0.45, 0.5, 0.55]);
        expect(getPbrMaterialShaderPreset(material)).toBe(preset === "pbr-skin-sss" ? "pbr-skin" : preset);
    });
    it("retains rougher source materials", () => {
        const material = createMaterial(); material.roughness = 0.9;
        applyPbrMaterialShaderPreset(material, "pbr-skin");
        expect(material.roughness).toBe(0.9);
    });
    it("rejects non-PBR input", () => {
        expect(applyPbrMaterialShaderPreset({}, "pbr-skin")).toBe(false);
        expect(getPbrMaterialShaderPreset(null)).toBe("pbr-base");
    });
});

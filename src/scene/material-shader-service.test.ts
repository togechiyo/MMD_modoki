import { describe, expect, it, vi } from "vitest";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
    PBR_MMD_LIKE_TRANSLUCENCY_INTENSITY,
} from "../render/pbr-mmd-like-toon-settings";
import {
    applyImportedMaterialShaderStates,
    getFrameGraphLuminousMaskMaterialState,
    getSerializedMaterialShaderStates,
    setExternalWgslToonShader,
    syncLuminousGlowLayer,
    setWgslMaterialShaderPreset,
} from "./material-shader-service";

function createHost() {
    const morphWeights = new Map<string, number>();
    const material = {
        name: "face",
        disableLighting: false,
        specularPower: 32,
        diffuseColor: new Color3(1, 0.8, 0.8),
        emissiveColor: new Color3(0, 0, 0),
        ambientColor: new Color3(0, 0, 0),
        toonTexture: null,
        ignoreDiffuseWhenToonTextureIsNull: false,
        markAsDirty: vi.fn(),
    };
    const mesh = { name: "modelRoot", parent: null };
    const model = {
        morph: {
            getMorphWeight: (name: string) => morphWeights.get(name) ?? 0,
        },
    };

    return {
        constructor: {
            DEFAULT_WGSL_MATERIAL_SHADER_PRESET: "wgsl-mmd-standard",
            WGSL_MATERIAL_SHADER_PRESETS: [
                { id: "wgsl-mmd-standard", label: "standard" },
                { id: "wgsl-autoluminous", label: "Luminous" },
                { id: "wgsl-full-shadow", label: "full_shadow" },
                { id: "wgsl-obj-untextured", label: "OBJ Untextured" },
                { id: "wgsl-obj-mtl", label: "OBJ MTL" },
            ],
            externalWgslToonFragmentByMaterial: new WeakMap<object, string>(),
            presetWgslToonFragmentByMaterial: new WeakMap<object, string>(),
        },
        material,
        mesh,
        model,
        morphWeights,
        sceneModels: [{
            mesh,
            model,
            materials: [{
                key: "0:face",
                material,
            }],
        }],
        materialShaderDefaultsByMaterial: new WeakMap<object, unknown>(),
        materialShaderPresetByMaterial: new WeakMap<object, string>(),
        externalWgslToonShaderPathByMaterial: new WeakMap<object, string>(),
        engine: {
            releaseEffects: vi.fn(),
        },
        defaultRenderingPipeline: {
            glowLayerEnabled: false,
            bloomEnabled: false,
            bloomWeight: 0,
            bloomThreshold: 0,
            bloomKernel: 0,
        },
        luminousGlowLayer: {
            mmdLuminousGlowLayer: true,
            intensity: 0,
            blurKernelSize: 0,
            customEmissiveColorSelector: null,
            customEmissiveTextureSelector: null,
            dispose: vi.fn(),
        },
        luminousGlowCoreLayer: {
            mmdLuminousGlowLayer: true,
            intensity: 0,
            blurKernelSize: 0,
            customEmissiveColorSelector: null,
            customEmissiveTextureSelector: null,
            dispose: vi.fn(),
        },
        postEffectGlowEnabledValue: false,
        postEffectGlowIntensityValue: 0,
        postEffectGlowKernelValue: 20,
        postEffectBloomEnabledValue: false,
        postEffectBloomWeightValue: 1,
        postEffectBloomThresholdValue: 1,
        postEffectBloomKernelValue: 64,
        mmdRuntime: {
            currentFrameTime: 0,
        },
        luminousGlowMorphRevision: 0,
        onMaterialShaderStateChanged: vi.fn(),
        isWebGpuEngine: () => true,
        isMaterialVisible: () => true,
    };
}

describe("material shader preset restore", () => {
    it("uses neutral lighting for untextured OBJ and restores MTL material values", () => {
        const host = createHost();
        host.material.specularPower = 96;
        host.material.specularColor = new Color3(0.3, 0.2, 0.1);
        host.material.ambientColor = new Color3(0.05, 0.1, 0.15);

        expect(setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-obj-untextured")).toBe(true);
        expect(host.material.disableLighting).toBe(false);
        expect(host.material.specularPower).toBe(32);
        expect(host.material.specularColor.equals(new Color3(0.1, 0.1, 0.1))).toBe(true);
        expect(host.material.ambientColor.equals(new Color3(0.2, 0.2, 0.2))).toBe(true);

        expect(setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-obj-mtl")).toBe(true);
        expect(host.material.disableLighting).toBe(false);
        expect(host.material.specularPower).toBe(96);
        expect(host.material.specularColor.equals(new Color3(0.3, 0.2, 0.1))).toBe(true);
        expect(host.material.ambientColor.equals(new Color3(0.05, 0.1, 0.15))).toBe(true);
    });

    it("persists and restores per-material PBR shader assignments", () => {
        const host = createHost();
        const pbrMaterial = {
            subSurface: {
                isTranslucencyEnabled: false,
                isScatteringEnabled: false,
                translucencyIntensity: 0,
                useAlbedoToTintTranslucency: false,
                tintColor: Color3.White(),
                translucencyColor: null,
                translucencyColorTexture: null,
                scatteringDiffusionProfile: null as Color3 | null,
            },
            ambientColor: new Color3(0.2, 0.1, 0.1),
            roughness: 0.4,
            specularIntensity: 1,
            markAsDirty: vi.fn(),
        };
        host.sceneModels[0].materialPipeline = "pbr-standard";
        host.sceneModels[0].materials = [{
            key: "0:face",
            material: pbrMaterial,
        }];
        const warnings: string[] = [];

        applyImportedMaterialShaderStates(
            host,
            0,
            [{ materialKey: "0:face", presetId: "pbr-mmd-like" }],
            warnings,
            "C:/models/pbr.pmx",
        );

        expect(warnings).toEqual([]);
        expect(pbrMaterial.subSurface.isScatteringEnabled).toBe(false);
        expect(pbrMaterial.subSurface.isTranslucencyEnabled).toBe(true);
        expect(pbrMaterial.subSurface.translucencyIntensity).toBe(
            PBR_MMD_LIKE_TRANSLUCENCY_INTENSITY,
        );
        expect(pbrMaterial.subSurface.translucencyColor?.equals(Color3.White())).toBe(true);
        expect(pbrMaterial.roughness).toBeGreaterThan(0.4);
        expect(pbrMaterial.subSurface.scatteringDiffusionProfile).toBeNull();
        expect(getSerializedMaterialShaderStates(host, host.sceneModels[0])).toEqual([{
            materialKey: "0:face",
            presetId: "pbr-mmd-like",
        }]);

        applyImportedMaterialShaderStates(
            host,
            0,
            [{ materialKey: "0:face", presetId: "pbr-no-shadow" }],
            warnings,
            "C:/models/pbr.pmx",
        );

        expect(warnings).toEqual([]);
        expect(getSerializedMaterialShaderStates(host, host.sceneModels[0])).toEqual([{
            materialKey: "0:face",
            presetId: "pbr-no-shadow",
        }]);
    });

    it("keeps preset fragment override when clearing global external wgsl override", () => {
        const host = createHost();

        const applied = setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-full-shadow");
        expect(applied).toBe(true);

        const presetBefore = host.constructor.presetWgslToonFragmentByMaterial.get(host.material);
        expect(typeof presetBefore).toBe("string");
        expect(presetBefore?.length ?? 0).toBeGreaterThan(0);

        setExternalWgslToonShader(host, null, null);

        expect(host.externalWgslToonShaderPathByMaterial.get(host.material)).toBeUndefined();
        expect(host.constructor.externalWgslToonFragmentByMaterial.get(host.material)).toBeUndefined();
        expect(host.constructor.presetWgslToonFragmentByMaterial.get(host.material)).toBe(presetBefore);
    });

    it("configures LuminousGlow selector from shininess and diffuse/ambient colors", () => {
        const host = createHost();
        const fakeTexture = { name: "diffuse" };
        host.material.specularPower = 120;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(0.8, 0.2, 0.1);
        host.material.ambientColor = new Color3(0.1, 0.05, 0.2);
        host.material.diffuseTexture = fakeTexture;
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1.4;

        syncLuminousGlowLayer(host);

        expect(host.defaultRenderingPipeline.glowLayerEnabled).toBe(false);
        expect(host.luminousGlowLayer.intensity).toBeCloseTo(1.4 * 1.08);
        expect(host.luminousGlowCoreLayer.intensity).toBeCloseTo(1.4 * 0.72);
        expect(host.luminousGlowLayer.blurKernelSize).toBe(20);
        expect(host.luminousGlowCoreLayer.blurKernelSize).toBe(5);

        const haloResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        const coreResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(null, null, host.material, haloResult);
        host.luminousGlowCoreLayer.customEmissiveColorSelector(null, null, host.material, coreResult);

        expect(haloResult.values[0]).toBeGreaterThan(0.8);
        expect(haloResult.values[1]).toBeGreaterThan(0.15);
        expect(haloResult.values[2]).toBeGreaterThan(0.05);
        expect(haloResult.values[3]).toBeGreaterThan(0);
        expect(coreResult.values[0]).toBeGreaterThan(haloResult.values[1]);
        expect(coreResult.values[1]).toBeGreaterThan(haloResult.values[1]);
        expect(coreResult.values[2]).toBeGreaterThan(haloResult.values[2]);
        expect(coreResult.values[0] - coreResult.values[2]).toBeLessThan(haloResult.values[0] - haloResult.values[2]);
        expect(host.luminousGlowLayer.customEmissiveTextureSelector(null, null, host.material)).toBe(fakeTexture);
        expect(host.luminousGlowCoreLayer.customEmissiveTextureSelector(null, null, host.material)).toBe(fakeTexture);
    });

    it("applies AL morph brightness controls on top of the material-driven glow", () => {
        const host = createHost();
        host.material.specularPower = 120;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(0.6, 0.2, 0.1);
        host.material.ambientColor = new Color3(0.1, 0.05, 0.1);
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        syncLuminousGlowLayer(host);

        const baseResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, baseResult);

        host.morphWeights.set("LightUp", 1);
        host.luminousGlowMorphRevision += 1;
        const boostedResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, boostedResult);

        expect(boostedResult.values[0]).toBeGreaterThan(baseResult.values[0]);
        expect(boostedResult.values[1]).toBeGreaterThan(baseResult.values[1]);

        host.morphWeights.set("LightOff", 1);
        host.luminousGlowMorphRevision += 1;
        const offResult = {
            values: [1, 1, 1, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, offResult);

        expect(offResult.values).toEqual([0, 0, 0, 1]);
    });

    it("applies the AutoLuminous exponential LightUpE morph as a strong boost", () => {
        const host = createHost();
        host.material.specularPower = 120;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(0.2, 0.1, 0.05);
        host.material.ambientColor = new Color3(0, 0, 0);
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        syncLuminousGlowLayer(host);

        const baseResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, baseResult);

        host.morphWeights.set("LightUpE", 0.25);
        host.luminousGlowMorphRevision += 1;
        const boostedResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, boostedResult);

        expect(boostedResult.values[0]).toBeGreaterThan(baseResult.values[0] * 3);
        expect(boostedResult.values[1]).toBeGreaterThan(baseResult.values[1] * 3);
    });

    it("uses LightBlink and LightMin as an AutoLuminous-style animated brightness floor", () => {
        const host = createHost();
        host.material.specularPower = 120;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(0.4, 0.2, 0.1);
        host.material.ambientColor = new Color3(0, 0, 0);
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        syncLuminousGlowLayer(host);

        const baseResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, baseResult);

        host.morphWeights.set("LightBlink", 1);
        host.morphWeights.set("LightMin", 0.2);
        host.luminousGlowMorphRevision += 1;
        host.mmdRuntime.currentFrameTime = 0;
        const dimResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, dimResult);

        host.mmdRuntime.currentFrameTime = 15;
        const brightResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, brightResult);

        expect(dimResult.values[0]).toBeCloseTo(baseResult.values[0] * 0.2, 4);
        expect(brightResult.values[0]).toBeGreaterThan(dimResult.values[0]);
    });

    it("keeps an opaque black occluder pass when shininess is below the AutoLuminous threshold", () => {
        const host = createHost();
        const fakeTexture = { name: "diffuse" };
        host.material.specularPower = 99;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(1, 1, 1);
        host.material.ambientColor = new Color3(0.2, 0.2, 0.2);
        host.material.alpha = 0.8;
        host.material.diffuseTexture = fakeTexture;
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        syncLuminousGlowLayer(host);

        const result = {
            values: [1, 1, 1, 1],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(null, null, host.material, result);
        const coreResult = {
            values: [1, 1, 1, 1],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowCoreLayer.customEmissiveColorSelector(null, null, host.material, coreResult);

        expect(result.values).toEqual([0, 0, 0, 1]);
        expect(coreResult.values).toEqual([0, 0, 0, 1]);
        expect(host.luminousGlowLayer.customEmissiveTextureSelector(null, null, host.material)).toBe(fakeTexture);
        expect(host.luminousGlowCoreLayer.customEmissiveTextureSelector(null, null, host.material)).toBe(fakeTexture);
    });

    it("treats explicit AutoLuminous-style material names as luminous sources", () => {
        const host = createHost();
        host.sceneModels[0].materials[0].name = "AL_hair_light";
        host.material.specularPower = 32;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(0.2, 0.8, 0.7);
        host.material.ambientColor = new Color3(0.1, 0.1, 0.1);

        syncLuminousGlowLayer(host);

        const result = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, result);
        expect(result.values[0]).toBeGreaterThan(0);
        expect(result.values[1]).toBeGreaterThan(0.7);
        expect(result.values[2]).toBeGreaterThan(0.6);
    });

    it("keeps opt-in particle hue in the FrameGraph Luminous mask core", () => {
        const host = createHost();
        host.material.name = "AutoLuminous ring particle 0";
        host.material.diffuseColor = Color3.Black();
        host.material.emissiveColor = new Color3(0.24, 1, 0.32);
        host.material.ambientColor = Color3.Black();
        Object.assign(host.material, { mmdLuminousPreserveChroma: true });

        const state = getFrameGraphLuminousMaskMaterialState(host, host.mesh, host.material);

        expect(state).not.toBeNull();
        if (!state) throw new Error("Expected a luminous particle mask state.");
        expect(state.color.g).toBeGreaterThan(state.color.r * 3);
        expect(state.color.g).toBeGreaterThan(state.color.b * 2.5);
    });

    it("keeps FrameGraph Luminous mask heuristic from lighting ordinary shiny materials", () => {
        const host = createHost();
        host.material.specularPower = 120;
        host.material.specularColor = new Color3(0, 0, 0);
        host.material.diffuseColor = new Color3(1, 0.9, 0.8);
        host.material.ambientColor = new Color3(0.1, 0.1, 0.1);
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        const state = getFrameGraphLuminousMaskMaterialState(host, host.mesh, host.material);

        expect(state?.color.r).toBe(0);
        expect(state?.color.g).toBe(0);
        expect(state?.color.b).toBe(0);
        expect(state?.texture).toBeNull();
    });

    it("keeps ordinary shiny materials as occluders when specular color is not dark", () => {
        const host = createHost();
        host.material.specularPower = 120;
        host.material.specularColor = new Color3(0.2, 0.2, 0.2);
        host.material.diffuseColor = new Color3(1, 1, 1);
        host.material.ambientColor = new Color3(0, 0, 0);
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        syncLuminousGlowLayer(host);

        const result = {
            values: [1, 1, 1, 1],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(null, null, host.material, result);
        const coreResult = {
            values: [1, 1, 1, 1],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowCoreLayer.customEmissiveColorSelector(null, null, host.material, coreResult);

        expect(result.values[0]).toBe(0);
        expect(result.values[1]).toBe(0);
        expect(result.values[2]).toBe(0);
        expect(result.values[3]).toBe(1);
        expect(coreResult.values[0]).toBe(0);
        expect(coreResult.values[1]).toBe(0);
        expect(coreResult.values[2]).toBe(0);
        expect(coreResult.values[3]).toBe(1);
    });

    it("routes the Luminous preset through LuminousGlow instead of auto bloom", () => {
        const host = createHost();
        host.material.diffuseColor = new Color3(0.2, 0.8, 1);
        host.material.ambientColor = new Color3(0.05, 0.1, 0.15);
        host.material.specularPower = 16;

        const applied = setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-autoluminous");
        expect(applied).toBe(true);

        expect(host.defaultRenderingPipeline.bloomEnabled).toBe(false);
        expect(host.luminousGlowLayer.intensity).toBeCloseTo(0.5 * 1.08);
        expect(host.luminousGlowCoreLayer.intensity).toBeCloseTo(0.5 * 0.72);

        const haloResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, haloResult);

        expect(haloResult.values[0]).toBeGreaterThan(0.05);
        expect(haloResult.values[1]).toBeGreaterThan(0.3);
        expect(haloResult.values[2]).toBeGreaterThan(0.4);
        expect(haloResult.values[2]).toBeGreaterThan(haloResult.values[0]);
        expect(haloResult.values[3]).toBeGreaterThan(0);
    });

    it("creates a non-black FrameGraph luminous mask state from the Luminous preset", () => {
        const host = createHost();
        host.material.diffuseColor = new Color3(0.2, 0.8, 1);
        host.material.ambientColor = new Color3(0.05, 0.1, 0.15);
        host.material.alpha = 0.75;

        expect(setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-autoluminous")).toBe(true);

        const state = getFrameGraphLuminousMaskMaterialState(host, host.mesh, host.material);
        expect(state).not.toBeNull();
        expect(state?.color.r).toBeGreaterThan(0.05);
        expect(state?.color.g).toBeGreaterThan(0.3);
        expect(state?.color.b).toBeGreaterThan(0.4);
        expect(state?.alpha).toBeCloseTo(0.75);

        host.morphWeights.set("LightOff", 1);
        host.luminousGlowMorphRevision += 1;
        expect(getFrameGraphLuminousMaskMaterialState(host, host.mesh, host.material)).toBeNull();
    });

    it("keeps heuristic glow after clearing the Luminous preset back to the standard shader", () => {
        const host = createHost();
        host.material.diffuseColor = new Color3(0.2, 0.8, 1);
        host.material.ambientColor = new Color3(0.05, 0.1, 0.15);
        host.material.specularPower = 160;
        host.material.specularColor = new Color3(0, 0, 0);
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        expect(setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-autoluminous")).toBe(true);

        const luminousResult = {
            values: [0, 0, 0, 0],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, luminousResult);
        expect(luminousResult.values[2]).toBeGreaterThan(0.4);

        expect(setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-mmd-standard")).toBe(true);

        const clearedResult = {
            values: [1, 1, 1, 1],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, clearedResult);

        expect(clearedResult.values[0]).toBeGreaterThan(0.1);
        expect(clearedResult.values[1]).toBeGreaterThan(clearedResult.values[0]);
        expect(clearedResult.values[2]).toBeGreaterThan(clearedResult.values[1]);
        expect(clearedResult.values[3]).toBeGreaterThan(0);
    });

    it("applies heuristic glow even for nonstandard explicit shader presets when AL conditions are met", () => {
        const host = createHost();
        host.material.diffuseColor = new Color3(0.2, 0.8, 1);
        host.material.ambientColor = new Color3(0.05, 0.1, 0.15);
        host.material.specularPower = 160;
        host.material.specularColor = new Color3(0, 0, 0);
        host.postEffectGlowEnabledValue = true;
        host.postEffectGlowIntensityValue = 1;

        expect(setWgslMaterialShaderPreset(host, 0, "0:face", "wgsl-full-shadow")).toBe(true);

        const result = {
            values: [1, 1, 1, 1],
            set(r: number, g: number, b: number, a: number) {
                this.values = [r, g, b, a];
            },
        };
        host.luminousGlowLayer.customEmissiveColorSelector(host.mesh, null, host.material, result);

        expect(result.values[0]).toBeGreaterThan(0.1);
        expect(result.values[1]).toBeGreaterThan(result.values[0]);
        expect(result.values[2]).toBeGreaterThan(result.values[1]);
        expect(result.values[3]).toBeGreaterThan(0);
    });
});

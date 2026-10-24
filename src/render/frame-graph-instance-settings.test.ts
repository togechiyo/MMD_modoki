import { describe, expect, it } from "vitest";
import { frameGraphInstanceSettings } from "./frame-graph-instance-settings";
import type { FrameGraphPostEffectsSettings } from "./frame-graph-post-effects-controller";

describe("instance render settings", () => {
    const base = { vignetteEnabled: true, vignetteWeight: 4, edgeBlurStrength: 3 } as FrameGraphPostEffectsSettings;
    it("does not inherit singleton screen-space, motion or radiance settings", () => {
        const singleton = { ...base, ssaoToonInfluence: 0.9, motionBlurSamples: 64, luminousRadiance: { enabled: true, strength: 8, range: 100 } };
        expect(frameGraphInstanceSettings(singleton, { instanceId: "fx-ao", type: "ssao", value: { enabled: false, strength: 0.7, radius: 2 }, fixedSettings: { color: { r: 1, g: 0, b: 0 }, toonInfluence: 0.2 } })).toMatchObject({ ssaoEnabled: false, ssaoPrepared: true, ssaoStrength: 0.7, ssaoRadius: 2, ssaoToonInfluence: 0.2, ssaoShadowColor: { r: 1, g: 0, b: 0 } });
        expect(frameGraphInstanceSettings(singleton, { instanceId: "fx-gi", type: "ssgi", value: { enabled: true, strength: 0.4, sampleRadius: 80 }, fixedSettings: { blendMode: "additive" } })).toMatchObject({ ssgiStrength: 0.4, ssgiSampleRadius: 80, ssgiBlendMode: "additive" });
        expect(frameGraphInstanceSettings(singleton, { instanceId: "fx-ssr", type: "ssr", value: { enabled: true, strength: 1.5, step: 3 } })).toMatchObject({ ssrStrength: 1.5, ssrStep: 3 });
        expect(frameGraphInstanceSettings(singleton, { instanceId: "fx-motion", type: "motionBlur", value: { enabled: true, strength: 4 } })).toMatchObject({ motionBlurStrength: 4, motionBlurSamples: 32 });
        expect(frameGraphInstanceSettings(singleton, { instanceId: "fx-glow", type: "luminous", value: { enabled: true, intensity: 2, threshold: 0.4, radius: 60 } })).toMatchObject({ luminousIntensity: 2, luminousThreshold: 0.4, luminousRadius: 60, luminousRadiance: { enabled: false, strength: 1, range: 12 } });
    });
    it("uses per-instance resolved DoF focus and optics", () => {
        expect(frameGraphInstanceSettings(base, { instanceId: "fx-dof", type: "dof", value: { enabled: false, focusDistance: 1000, fStop: 4, lensSize: 50, focalLength: 80 }, dofFocusDistanceMm: 23000 })).toMatchObject({ dofEnabled: false, dofFocusDistanceMm: 23000, dofEffectiveFStop: 4, dofLensSize: 50, dofFocalLength: 80, dofBlurLevel: 1 });
    });
    it("isolates vignette and blur even when the singleton or neighbour is active", () => {
        expect(frameGraphInstanceSettings(base, { instanceId: "fx-a", type: "vignette", value: { enabled: true, weight: 0.3 } })).toMatchObject({ vignetteWeight: 0.3, edgeBlurStrength: 0 });
        expect(frameGraphInstanceSettings(base, { instanceId: "fx-b", type: "edgeBlur", value: { enabled: true, strength: 2 } })).toMatchObject({ vignetteEnabled: false, vignetteWeight: 0, edgeBlurStrength: 2 });
        expect(base.edgeBlurStrength).toBe(3);
    });
    it("uses a Bloom instance's kernel and color independently", () => {
        const result = frameGraphInstanceSettings(base, { instanceId: "fx-a", type: "bloom", value: { enabled: false, weight: 0.7, threshold: 0.2, kernel: 17 }, bloomColor: { r: 1, g: 0, b: 0 } });
        expect(result).toMatchObject({ bloomEnabled: false, bloomWeight: 0.7, bloomThreshold: 0.2, bloomKernel: 17, bloomPrepared: true, bloomColor: { r: 1, g: 0, b: 0 } });
    });
    it("uses independent depth parameters and LUT data without inheriting singleton values", () => {
        const shadow = frameGraphInstanceSettings(base, { instanceId: "fx-a", type: "offsetShadow", value: { enabled: false, strength: 0.4, offsetX: 4, offsetY: -3, depthBias: 0.1, maxDepth: 2, depthScale: 1 }, fixedSettings: { color: { r: 0, g: 1, b: 0 }, thickness: 0.3, softness: 2 } });
        expect(shadow).toMatchObject({ offsetShadowEnabled: false, offsetShadowStrength: 0.4, offsetShadowThickness: 0.3, offsetShadowSoftness: 2, offsetShadowDebugView: false, offsetShadowColor: { r: 0, g: 1, b: 0 } });
        expect(frameGraphInstanceSettings(base, { instanceId: "fx-lut", type: "lut", value: { enabled: true, intensity: 0.2 }, lutText: "snapshot" })).toMatchObject({ lutRuntimeText: "snapshot", lutIntensity: 0.2, lutTextureKey: "fx-lut" });
    });
});

import { describe, expect, it, vi } from "vitest";
import {
    applyImageProcessingSettings,
    enforceFinalPostProcessOrder,
    isImageProcessingEffectsEnabled,
    setupOriginFogPostProcess,
} from "./post-process-controller";

function createImageProcessingHost(postEffectBackend: "classic" | "frameGraph") {
    return {
        constructor: {
            POST_EFFECT_LUT_PRESETS: [],
            POST_EFFECT_LUT_TEXT_BY_ID: {},
        },
        postEffectBackend,
        scene: {
            imageProcessingConfiguration: {
                exposure: 1,
                toneMappingEnabled: false,
                toneMappingType: 0,
                ditheringEnabled: false,
                ditheringIntensity: 0,
                vignetteEnabled: false,
                vignetteWeight: 0,
                vignetteColor: { set: vi.fn() },
                colorCurves: null,
                colorCurvesEnabled: false,
                colorGradingEnabled: false,
                colorGradingTexture: null,
                isEnabled: false,
                applyByPostProcess: false,
            },
        },
        defaultRenderingPipeline: {
            imageProcessingEnabled: false,
        },
        postEffectToneMappingEnabledValue: false,
        postEffectDitheringEnabledValue: false,
        postEffectVignetteEnabledValue: true,
        postEffectColorCurvesEnabledValue: false,
        postEffectLutEnabledValue: false,
        postEffectExposureValue: 1,
        postEffectToneMappingTypeValue: 0,
        postEffectDitheringIntensityValue: 0,
        postEffectVignetteWeightValue: 2,
        postEffectColorCurvesHueValue: 0,
        postEffectColorCurvesDensityValue: 0,
        postEffectColorCurvesSaturationValue: 0,
        postEffectColorCurvesExposureValue: 0,
        postEffectLutSourceModeValue: "builtin",
        postEffectLutPresetValue: "",
        postEffectLutExternalTextValue: null,
        postEffectLutExternalPathValue: null,
        postEffectLutExternalSourceFormatValue: null,
        postEffectLutExternalRevision: 0,
        postEffectLutTexture: null,
        postEffectLutTextureKey: null,
        postEffectLutPresetBlobUrlById: new Map(),
        postEffectLutExternalBlobUrl: null,
    };
}

describe("enforceFinalPostProcessOrder", () => {
    it("does not attach classic fog to a FrameGraph depth renderer", () => {
        const host = { postEffectBackend: "frameGraph", originFogPostProcess: null, depthRenderer: {} };
        setupOriginFogPostProcess(host as unknown as Parameters<typeof setupOriginFogPostProcess>[0]);
        expect(host.originFogPostProcess).toBeNull();
    });
    it("keeps fog and bloom before volumetric light and final cleanup passes", () => {
        const fog = { name: "fog" };
        const bloomExtract = { name: "bloomExtract" };
        const bloomBlurX = { name: "bloomBlurX" };
        const bloomBlurY = { name: "bloomBlurY" };
        const bloomMerge = { name: "bloomMerge" };
        const lensBlur = { name: "lensBlur" };
        const vls = { name: "vls" };
        const motionBlur = { name: "motionBlur" };
        const edgeBlur = { name: "edgeBlur" };
        const lens = { name: "lens" };
        const aa = { name: "aa" };
        const camera = {
            detachPostProcess: vi.fn(),
            attachPostProcess: vi.fn(),
        };
        const host = {
            camera,
            originFogPostProcess: fog,
            standaloneBloomEffect: {
                _effects: [bloomExtract, bloomBlurX, bloomBlurY, bloomMerge],
            },
            standaloneLensBlurPostProcess: lensBlur,
            volumetricLightPostProcess: vls,
            motionBlurPostProcess: motionBlur,
            standaloneEdgeBlurPostProcess: edgeBlur,
            finalLensDistortionPostProcess: lens,
            finalAntialiasPostProcess: aa,
        };

        enforceFinalPostProcessOrder(host);

        expect(camera.detachPostProcess.mock.calls.map(([postProcess]) => postProcess)).toEqual([
            fog,
            bloomExtract,
            bloomBlurX,
            bloomBlurY,
            bloomMerge,
            lensBlur,
            vls,
            motionBlur,
            edgeBlur,
            lens,
            aa,
        ]);
        expect(camera.attachPostProcess.mock.calls.map(([postProcess]) => postProcess)).toEqual([
            fog,
            bloomExtract,
            bloomBlurX,
            bloomBlurY,
            bloomMerge,
            lensBlur,
            vls,
            motionBlur,
            edgeBlur,
            lens,
            aa,
        ]);
    });
});

describe("applyImageProcessingSettings", () => {
    it("bypasses FrameGraph image processing without disabling Classic settings", () => {
        const host = {
            ...createImageProcessingHost("frameGraph"),
            postEffectExposureValue: 2,
            getFrameGraphPostEffectsEnabled: () => false,
        };
        expect(isImageProcessingEffectsEnabled(host as unknown as Parameters<typeof isImageProcessingEffectsEnabled>[0])).toBe(false);
        expect(isImageProcessingEffectsEnabled({ ...host, postEffectBackend: "classic" } as unknown as Parameters<typeof isImageProcessingEffectsEnabled>[0])).toBe(true);
    });
    it("does not enable scene vignette while FrameGraph owns vignette rendering", () => {
        const host = createImageProcessingHost("frameGraph");

        expect(isImageProcessingEffectsEnabled(host as never)).toBe(false);

        applyImageProcessingSettings(host as never);

        expect(host.scene.imageProcessingConfiguration.vignetteEnabled).toBe(false);
        expect(host.scene.imageProcessingConfiguration.vignetteWeight).toBe(0);
        expect(host.scene.imageProcessingConfiguration.isEnabled).toBe(false);
        expect(host.scene.imageProcessingConfiguration.applyByPostProcess).toBe(false);
        expect(host.defaultRenderingPipeline.imageProcessingEnabled).toBe(false);
    });

    it("keeps using scene vignette for the classic post-process backend", () => {
        const host = createImageProcessingHost("classic");

        expect(isImageProcessingEffectsEnabled(host as never)).toBe(true);

        applyImageProcessingSettings(host as never);

        expect(host.scene.imageProcessingConfiguration.vignetteEnabled).toBe(true);
        expect(host.scene.imageProcessingConfiguration.vignetteWeight).toBe(2);
        expect(host.defaultRenderingPipeline.imageProcessingEnabled).toBe(true);
    });
});

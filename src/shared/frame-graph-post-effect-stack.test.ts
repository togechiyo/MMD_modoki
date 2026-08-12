import { describe, expect, it } from "vitest";
import {
    addFrameGraphPostEffectId,
    getActiveFrameGraphPostEffectIdsFromSettings,
    isFrameGraphPostEffectActiveInSettings,
    moveFrameGraphPostEffectId,
    normalizeFrameGraphPostEffectIds,
    normalizeFrameGraphPostEffectStack,
    type FrameGraphPostEffectActivationSettings,
} from "./frame-graph-post-effect-stack";

function createActivationSettings(
    overrides: Partial<FrameGraphPostEffectActivationSettings> = {},
): FrameGraphPostEffectActivationSettings {
    return {
        dofEnabled: false,
        luminousEnabled: false,
        luminousIntensity: 0.5,
        bloomEnabled: false,
        lutEnabled: false,
        motionBlurEnabled: false,
        motionBlurStrength: 0.5,
        sharpenEdge: 0,
        grainIntensity: 0,
        chromaticAberration: 0,
        vignetteEnabled: false,
        vignetteWeight: 0,
        edgeBlurStrength: 0,
        lensDistortionEnabled: false,
        lensDistortion: 0,
        ssaoEnabled: false,
        ssaoStrength: 1,
        offsetShadowEnabled: false,
        offsetShadowStrength: 0.35,
        offsetHighlightEnabled: false,
        offsetHighlightStrength: 0.55,
        ssrEnabled: false,
        ssrStrength: 0.3,
        ssgiEnabled: false,
        ssgiStrength: 0.3,
        ssgiSampleRadius: 64,
        oceanEnabled: false,
        ...overrides,
    };
}

describe("frame graph post effect stack helpers", () => {
    it("normalizes ids and appends active ids in canonical order", () => {
        expect(normalizeFrameGraphPostEffectIds(
            ["grain", "unknown", "lut", "grain"],
            ["bloom", "luminous", "ssao", "lut"],
        )).toEqual(["grain", "lut", "ssao", "luminous", "bloom"]);
    });

    it("normalizes saved stack entries", () => {
        expect(normalizeFrameGraphPostEffectStack([
            { id: "bloom", enabled: true },
            { id: "ocean", enabled: true },
            { id: "bad", enabled: true },
            { id: "bloom", enabled: false },
            { id: "lut" },
        ])).toEqual([
            { id: "bloom", enabled: true },
            { id: "lut", enabled: false },
        ]);
    });

    it("retires ocean from saved and runtime stack ids", () => {
        expect(normalizeFrameGraphPostEffectIds(["ssao", "ocean", "bloom"])).toEqual([
            "ssao",
            "bloom",
        ]);
        expect(addFrameGraphPostEffectId(["ssao"], "ocean")).toEqual(["ssao"]);
        expect(isFrameGraphPostEffectActiveInSettings(createActivationSettings({
            oceanEnabled: true,
        }), "ocean")).toBe(false);
    });

    it("inserts new ids by canonical order", () => {
        expect(addFrameGraphPostEffectId(["ssr", "ssao"], "ssgi")).toEqual(["ssr", "ssgi", "ssao"]);
        expect(addFrameGraphPostEffectId(["ssao", "lut"], "bloom")).toEqual(["ssao", "bloom", "lut"]);
        expect(addFrameGraphPostEffectId(["dof", "bloom"], "luminous")).toEqual(["dof", "luminous", "bloom"]);
        expect(addFrameGraphPostEffectId(["ssao", "bloom"], "distortion")).toEqual(["ssao", "bloom", "distortion"]);
    });

    it("moves ids without dropping disabled stack positions", () => {
        expect(moveFrameGraphPostEffectId(["bloom", "lut", "grain"], "lut", -1)).toEqual(["lut", "bloom", "grain"]);
        expect(moveFrameGraphPostEffectId(["bloom", "lut", "grain"], "lut", 1)).toEqual(["bloom", "grain", "lut"]);
        expect(moveFrameGraphPostEffectId(["bloom", "lut"], "bloom", -1)).toEqual(["bloom", "lut"]);
    });

    it("evaluates active effects with the shared runtime thresholds", () => {
        const settings = createActivationSettings({
            dofEnabled: true,
            luminousEnabled: true,
            luminousIntensity: 0,
            bloomEnabled: true,
            motionBlurEnabled: true,
            motionBlurStrength: 0.75,
            offsetShadowEnabled: true,
            offsetShadowStrength: 0.45,
            offsetHighlightEnabled: true,
            offsetHighlightStrength: 0.5,
            ssaoEnabled: true,
            ssaoStrength: 0,
            ssrEnabled: true,
            ssrStrength: 0.2,
            ssgiEnabled: true,
            oceanEnabled: true,
            ssgiStrength: 0,
            vignetteEnabled: true,
            vignetteWeight: 0,
            edgeBlurStrength: 0.25,
            lensDistortionEnabled: true,
            lensDistortion: -0.1,
        });

        expect(isFrameGraphPostEffectActiveInSettings(settings, "dof")).toBe(true);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "luminous")).toBe(false);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "ssao")).toBe(false);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "ssgi")).toBe(true);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "ocean")).toBe(false);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "motionBlur")).toBe(true);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "offsetShadow")).toBe(true);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "offsetHighlight")).toBe(true);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "edgeBlur")).toBe(true);
        expect(isFrameGraphPostEffectActiveInSettings(settings, "distortion")).toBe(true);
    });

    it("keeps lens distortion active even when FoV-linked amount is neutral", () => {
        expect(isFrameGraphPostEffectActiveInSettings(createActivationSettings({
            lensDistortionEnabled: true,
            lensDistortion: 0,
        }), "distortion")).toBe(true);
    });

    it("returns active effect ids in canonical order", () => {
        expect(getActiveFrameGraphPostEffectIdsFromSettings(createActivationSettings({
            grainIntensity: 0.2,
            bloomEnabled: true,
            offsetShadowEnabled: true,
            offsetHighlightEnabled: true,
            ssrEnabled: true,
            ssrStrength: 0.4,
            ssgiEnabled: true,
            oceanEnabled: true,
            lutEnabled: true,
            motionBlurEnabled: true,
        }))).toEqual(["ssr", "ssgi", "offsetShadow", "offsetHighlight", "bloom", "lut", "motionBlur", "grain"]);
    });
});


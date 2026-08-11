import { describe, expect, it } from "vitest";
import {
    FRAME_GRAPH_EFFECT_SLIDER_MAX,
    FRAME_GRAPH_EFFECT_SLIDER_MIN,
    FRAME_GRAPH_EFFECT_SLIDER_SPECS,
    fromFrameGraphEffectSliderValue,
    isFrameGraphEffectSliderField,
    toFrameGraphEffectSliderValue,
} from "./frame-graph-effect-slider-mapping";

describe("FrameGraph effect detail slider mapping", () => {
    it("uses the same 0..100 UI range for every numeric detail slider", () => {
        expect(FRAME_GRAPH_EFFECT_SLIDER_MIN).toBe(0);
        expect(FRAME_GRAPH_EFFECT_SLIDER_MAX).toBe(100);

        for (const field of Object.keys(FRAME_GRAPH_EFFECT_SLIDER_SPECS)) {
            expect(isFrameGraphEffectSliderField(field)).toBe(true);
        }
    });

    it("maps every configured runtime range to the common UI endpoints", () => {
        for (const [field, spec] of Object.entries(FRAME_GRAPH_EFFECT_SLIDER_SPECS)) {
            if (!isFrameGraphEffectSliderField(field)) {
                throw new Error(`Unexpected slider field: ${field}`);
            }
            expect(toFrameGraphEffectSliderValue(field, spec.actualMin)).toBe(0);
            expect(toFrameGraphEffectSliderValue(field, spec.actualMax)).toBe(100);
            expect(fromFrameGraphEffectSliderValue(field, 0)).toBe(spec.actualMin);
            expect(fromFrameGraphEffectSliderValue(field, 100)).toBe(spec.actualMax);
        }
    });

    it("puts signed offsets at the neutral center", () => {
        expect(toFrameGraphEffectSliderValue("offsetShadowOffsetX", 0)).toBe(50);
        expect(toFrameGraphEffectSliderValue("offsetHighlightOffsetY", 0)).toBe(50);
        expect(toFrameGraphEffectSliderValue("dofFocusOffset", 0)).toBe(50);

        expect(fromFrameGraphEffectSliderValue("offsetShadowOffsetX", 50)).toBe(0);
        expect(fromFrameGraphEffectSliderValue("offsetHighlightOffsetY", 50)).toBe(0);
        expect(fromFrameGraphEffectSliderValue("dofFocusOffset", 50)).toBe(0);
    });

    it("uses logarithmic control for the wide DoF lens range", () => {
        expect(toFrameGraphEffectSliderValue("dofLensSize", 64)).toBe(50);
        expect(fromFrameGraphEffectSliderValue("dofLensSize", 50)).toBe(64);
    });

    it("quantizes discrete runtime values after conversion", () => {
        expect(fromFrameGraphEffectSliderValue("ssrStep", 0)).toBe(1);
        expect(fromFrameGraphEffectSliderValue("ssrStep", 50)).toBe(5);
        expect(fromFrameGraphEffectSliderValue("ssrStep", 100)).toBe(8);
        expect(fromFrameGraphEffectSliderValue("bloomKernel", 50)).toBe(129);
    });

    it("clamps UI and runtime values at the declared bounds", () => {
        expect(toFrameGraphEffectSliderValue("ssgiStrength", -1)).toBe(0);
        expect(toFrameGraphEffectSliderValue("ssgiStrength", 2)).toBe(100);
        expect(fromFrameGraphEffectSliderValue("ssgiStrength", -20)).toBe(0);
        expect(fromFrameGraphEffectSliderValue("ssgiStrength", 120)).toBe(1);
    });
});

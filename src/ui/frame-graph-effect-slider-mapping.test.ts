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
            const reversed = "reversed" in spec && spec.reversed;
            expect(toFrameGraphEffectSliderValue(field, spec.actualMin)).toBe(reversed ? 100 : 0);
            expect(toFrameGraphEffectSliderValue(field, spec.actualMax)).toBe(reversed ? 0 : 100);
            expect(fromFrameGraphEffectSliderValue(field, 0)).toBe(reversed ? spec.actualMax : spec.actualMin);
            expect(fromFrameGraphEffectSliderValue(field, 100)).toBe(reversed ? spec.actualMin : spec.actualMax);
        }
    });

    it("maps the legacy gamma offset around a neutral midpoint", () => {
        expect(toFrameGraphEffectSliderValue("gammaPower", 2)).toBe(0);
        expect(toFrameGraphEffectSliderValue("gammaPower", 1)).toBe(50);
        expect(toFrameGraphEffectSliderValue("gammaPower", 0.5)).toBe(100);
        expect(fromFrameGraphEffectSliderValue("gammaPower", 50)).toBeCloseTo(1, 10);
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
        expect(fromFrameGraphEffectSliderValue("motionBlurSamples", 0)).toBe(8);
        expect(fromFrameGraphEffectSliderValue("motionBlurSamples", 100)).toBe(64);
    });

    it("maps the light bloom preset into the shared range", () => {
        expect(toFrameGraphEffectSliderValue("bloomWeight", 0.4)).toBe(20);
        expect(toFrameGraphEffectSliderValue("bloomThreshold", 0.9)).toBe(90);
        expect(fromFrameGraphEffectSliderValue("bloomThreshold", 100)).toBe(1);
        expect(toFrameGraphEffectSliderValue("bloomKernel", 205)).toBe(80);
    });

    it("gives FrameGraph motion blur a visibly strong range", () => {
        expect(fromFrameGraphEffectSliderValue("motionBlurStrength", 50)).toBe(5);
        expect(fromFrameGraphEffectSliderValue("motionBlurStrength", 100)).toBe(10);
    });

    it("maps the subtle aerial perspective defaults into the shared range", () => {
        expect(toFrameGraphEffectSliderValue("aerialPerspectiveStrength", 0.18)).toBe(30);
        expect(toFrameGraphEffectSliderValue("aerialPerspectiveStart", 55)).toBe(11);
        expect(fromFrameGraphEffectSliderValue("aerialPerspectiveStart", 11)).toBe(55);
        expect(fromFrameGraphEffectSliderValue("aerialPerspectiveStrength", 30)).toBeCloseTo(0.18);
    });

    it("maps directional light shaft controls into the shared range", () => {
        expect(toFrameGraphEffectSliderValue("directionalLightShaftsStrength", 0.08)).toBe(50);
        expect(fromFrameGraphEffectSliderValue("directionalLightShaftsStrength", 100)).toBe(0.16);
        expect(fromFrameGraphEffectSliderValue("directionalLightShaftsPhaseG", 50)).toBeCloseTo(0);
    });

    it("maps the compact particle preset into the shared range", () => {
        expect(toFrameGraphEffectSliderValue("ringParticleCount", 180)).toBe(50);
        expect(toFrameGraphEffectSliderValue("ringParticleDensity", 32.5)).toBe(50);
        expect(toFrameGraphEffectSliderValue("ringParticleSize", 0.335)).toBe(30);
        expect(toFrameGraphEffectSliderValue("ringParticleSpeed", 0.05)).toBe(10);
        expect(toFrameGraphEffectSliderValue("ringParticleIntensity", 4)).toBe(100);
        expect(fromFrameGraphEffectSliderValue("ringParticleCount", 50)).toBe(180);
        expect(fromFrameGraphEffectSliderValue("ringParticleDensity", 50)).toBe(32.5);
    });

    it("clamps UI and runtime values at the declared bounds", () => {
        expect(toFrameGraphEffectSliderValue("ssgiStrength", -1)).toBe(0);
        expect(toFrameGraphEffectSliderValue("ssgiStrength", 2)).toBe(100);
        expect(fromFrameGraphEffectSliderValue("ssgiStrength", -20)).toBe(0);
        expect(fromFrameGraphEffectSliderValue("ssgiStrength", 120)).toBe(1);
    });
});

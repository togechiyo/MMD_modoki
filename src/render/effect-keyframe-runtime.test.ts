import { describe, expect, it } from "vitest";
import { scalarEffectRenderValue, lensDistortionForFov } from "./effect-keyframe-runtime";

describe("scalar effect rendering", () => {
    it("neutralizes disabled and suspended tracks while preserving authored values", () => {
        const value = { enabled: true, strength: 2.4 };
        expect(scalarEffectRenderValue(value, "strength", true, 0.1)).toBe(2.4);
        expect(scalarEffectRenderValue(value, "strength", false, 0.1)).toBe(0);
        expect(scalarEffectRenderValue({ ...value, enabled: false }, "strength", true, 0.1)).toBe(0);
        expect(scalarEffectRenderValue(null, "strength", true, 0.1)).toBe(0.1);
        expect(value).toEqual({ enabled: true, strength: 2.4 });
    });
    it("applies the animated influence to wide and telephoto distortion, keeping 30 degrees neutral", () => {
        const distortion = (degrees: number, influence: number) => lensDistortionForFov(degrees * Math.PI / 180, influence, 10, 30, 120);
        expect(distortion(120, 0.5)).toBeCloseTo(0.5);
        expect(distortion(10, 0.5)).toBeCloseTo(-0.5);
        expect(distortion(30, 1)).toBeCloseTo(0);
        expect(distortion(75, 0.4)).toBeCloseTo(0.2);
        expect(distortion(120, 0)).toBe(0);
    });
});

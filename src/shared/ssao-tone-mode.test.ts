import { describe, expect, it } from "vitest";
import { getSsaoTotalStrength, normalizeSsaoToneMode } from "./ssao-tone-mode";

describe("SSAO tone modes", () => {
    it("keeps missing and unknown saved modes on the legacy appearance", () => {
        for (const value of [undefined, null, "", "unknown", 1]) {
            expect(normalizeSsaoToneMode(value)).toBe("legacy");
        }
        expect(normalizeSsaoToneMode("simple")).toBe("simple");
        expect(normalizeSsaoToneMode("legacy")).toBe("legacy");
    });

    it("uses a linear strength in simple mode", () => {
        for (const strength of [0, 0.25, 0.5, 0.75, 1]) {
            expect(getSsaoTotalStrength(strength, "simple")).toBe(strength);
        }
    });

    it("retains the previous strength curve for comparisons", () => {
        expect(getSsaoTotalStrength(0, "legacy")).toBe(0);
        expect(getSsaoTotalStrength(0.5, "legacy")).toBeCloseTo(0.8630425, 6);
        expect(getSsaoTotalStrength(1, "legacy")).toBe(2.2);
    });

    it("bounds invalid strengths before sending them to the renderer", () => {
        expect(getSsaoTotalStrength(-1, "simple")).toBe(0);
        expect(getSsaoTotalStrength(2, "simple")).toBe(1);
        expect(getSsaoTotalStrength(Number.NaN, "legacy")).toBe(0);
    });
});

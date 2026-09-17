import { describe, expect, it } from "vitest";
import { normalizeEnvironmentLightingRotation } from "./environment-lighting-rotation";

describe("normalizeEnvironmentLightingRotation", () => {
    it("preserves both ends of a full turn and fractional angles", () => {
        for (const angle of [0, 90, 180, 270.5, 360]) {
            expect(normalizeEnvironmentLightingRotation(angle)).toBe(angle);
        }
    });

    it("clamps out-of-range angles and restores legacy or invalid values to zero", () => {
        expect(normalizeEnvironmentLightingRotation(-20)).toBe(0);
        expect(normalizeEnvironmentLightingRotation(400)).toBe(360);
        for (const value of [undefined, null, "90", NaN, Infinity, -Infinity]) {
            expect(normalizeEnvironmentLightingRotation(value)).toBe(0);
        }
    });
});

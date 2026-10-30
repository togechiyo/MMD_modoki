import { describe, expect, it } from "vitest";
import { SKY_IRRADIANCE_AXIS_TOTALS, SKY_IRRADIANCE_AXIS_WEIGHTS, SKY_IRRADIANCE_DIRECTIONS } from "./radiance-sky-irradiance-shaders";

describe("sky irradiance cosine lobes", () => {
    it("preserves open and closed sky for every lobe", () => {
        for (const weights of SKY_IRRADIANCE_AXIS_WEIGHTS) {
            expect(weights).toHaveLength(16);
            expect(weights.every(value => value >= 0 && Number.isFinite(value))).toBe(true);
            expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
            expect(weights.reduce((sum, value) => sum + value * 0, 0)).toBe(0);
        }
    });
    it("keeps zenith elevation weights and opposite horizontal lobes disjoint", () => {
        expect(SKY_IRRADIANCE_AXIS_TOTALS[2]).toBe(8);
        for (let i = 0; i < 16; i++) {
            expect(SKY_IRRADIANCE_AXIS_WEIGHTS[2][i]).toBe(i < 8 ? 0.75 / 8 : 0.25 / 8);
            expect(SKY_IRRADIANCE_AXIS_WEIGHTS[0][i] * SKY_IRRADIANCE_AXIS_WEIGHTS[1][i]).toBe(0);
            expect(SKY_IRRADIANCE_AXIS_WEIGHTS[3][i] * SKY_IRRADIANCE_AXIS_WEIGHTS[4][i]).toBe(0);
            expect(Math.hypot(...SKY_IRRADIANCE_DIRECTIONS[i])).toBeCloseTo(1, 10);
        }
        expect(SKY_IRRADIANCE_AXIS_TOTALS[0]).toBeCloseTo(SKY_IRRADIANCE_AXIS_TOTALS[3], 10);
    });
});

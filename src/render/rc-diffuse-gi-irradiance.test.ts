import { describe, expect, it } from "vitest";
import { RC_DIFFUSE_GI_AXIS_WEIGHTS, RC_DIFFUSE_GI_DIRECTIONS } from "./rc-diffuse-gi-irradiance";

describe("RC GI six-axis quadrature", () => {
    it("keeps a uniform incoming radiance unchanged on every axis, including downward receivers", () => {
        expect(RC_DIFFUSE_GI_AXIS_WEIGHTS).toHaveLength(6);
        for (const weights of RC_DIFFUSE_GI_AXIS_WEIGHTS) {
            expect(weights).toHaveLength(32);
            expect(weights.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
            expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
            expect(weights.reduce((sum, weight) => sum + weight * 0.7, 0)).toBeCloseTo(0.7, 12);
        }
    });
    it("uses only the facing hemisphere with symmetric opposite lobes", () => {
        const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (const [axisIndex, axis] of axes.entries()) {
            const weights = RC_DIFFUSE_GI_AXIS_WEIGHTS[axisIndex];
            for (const [index, ray] of RC_DIFFUSE_GI_DIRECTIONS.entries()) {
                expect(Math.hypot(...ray)).toBeCloseTo(1, 12);
                if (axis.reduce((sum, value, i) => sum + value * ray[i], 0) <= 0) expect(weights[index]).toBe(0);
            }
            const opposite = RC_DIFFUSE_GI_AXIS_WEIGHTS[axisIndex ^ 1].slice().sort((a, b) => a - b);
            weights.slice().sort((a, b) => a - b).forEach((value, index) => expect(value).toBeCloseTo(opposite[index], 12));
        }
    });
});

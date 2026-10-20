import { describe, expect, it } from "vitest";
import { getSsaoTotalStrength } from "./ssao-strength";

describe("SSAO strength", () => {
    it("uses a linear 0..2 output strength", () => {
        for (const [strength, expected] of [[0, 0], [0.25, 0.5], [0.5, 1], [0.75, 1.5], [1, 2]]) {
            expect(getSsaoTotalStrength(strength)).toBe(expected);
        }
    });

    it("bounds invalid strengths before sending them to the renderer", () => {
        expect(getSsaoTotalStrength(-1)).toBe(0);
        expect(getSsaoTotalStrength(2)).toBe(2);
        expect(getSsaoTotalStrength(Number.NaN)).toBe(0);
    });
});

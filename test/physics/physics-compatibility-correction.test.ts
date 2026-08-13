import { describe, expect, it } from "vitest";
import { fullyDampedGravityScaleFromCorrectionAmount } from "../../src/physics/physics-compatibility-correction";

describe("fullyDampedGravityScaleFromCorrectionAmount", () => {
    it("maps the correction slider to full gravity cancellation", () => {
        expect(fullyDampedGravityScaleFromCorrectionAmount(0)).toBe(1);
        expect(fullyDampedGravityScaleFromCorrectionAmount(0.4)).toBeCloseTo(0.6);
        expect(fullyDampedGravityScaleFromCorrectionAmount(1)).toBe(0);
    });

    it("clamps out-of-range values and uses maximum correction for invalid values", () => {
        expect(fullyDampedGravityScaleFromCorrectionAmount(-1)).toBe(1);
        expect(fullyDampedGravityScaleFromCorrectionAmount(2)).toBe(0);
        expect(fullyDampedGravityScaleFromCorrectionAmount(Number.NaN)).toBe(0);
    });
});

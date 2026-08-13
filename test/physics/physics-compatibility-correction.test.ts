import { describe, expect, it } from "vitest";
import {
    collectFreeLinearSpringDynamicRigidBodyIndices,
    DEFAULT_PHYSICS_COMPATIBILITY_CORRECTION_AMOUNTS,
    fullyDampedGravityScaleFromCorrectionAmount,
} from "../../src/physics/physics-compatibility-correction";

describe("fullyDampedGravityScaleFromCorrectionAmount", () => {
    it("uses safe mixed-model defaults", () => {
        expect(DEFAULT_PHYSICS_COMPATIBILITY_CORRECTION_AMOUNTS).toEqual({
            damping: 0,
            gravity: 1,
            massTowardUnit: 0,
        });
    });

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

describe("collectFreeLinearSpringDynamicRigidBodyIndices", () => {
    const followBody = { physicsMode: 0 };
    const dynamicBody = { physicsMode: 1 };

    it("selects a dynamic body connected through an effectively free linear spring", () => {
        expect(collectFreeLinearSpringDynamicRigidBodyIndices(
            [followBody, dynamicBody],
            [{
                type: 0,
                rigidbodyIndexA: 0,
                rigidbodyIndexB: 1,
                positionMin: [-1000, -1000, -1000],
                positionMax: [1000, 1000, 1000],
                springPosition: [388, 388, 388],
            }],
        )).toEqual(new Set([1]));
    });

    it("does not select character-style constrained springs", () => {
        expect(collectFreeLinearSpringDynamicRigidBodyIndices(
            [followBody, dynamicBody],
            [{
                type: 0,
                rigidbodyIndexA: 0,
                rigidbodyIndexB: 1,
                positionMin: [-1, -2, -1],
                positionMax: [1, 2, 1],
                springPosition: [0, 40, 0],
            }],
        )).toEqual(new Set());
    });

    it("does not select dynamic chains without a follow-bone anchor", () => {
        expect(collectFreeLinearSpringDynamicRigidBodyIndices(
            [dynamicBody, dynamicBody],
            [{
                type: 0,
                rigidbodyIndexA: 0,
                rigidbodyIndexB: 1,
                positionMin: [-1000, -1000, -1000],
                positionMax: [1000, 1000, 1000],
                springPosition: [388, 388, 388],
            }],
        )).toEqual(new Set());
    });
});

import { describe, expect, it } from "vitest";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";

import {
    applyKeyframeValueCorrection,
    createKeyframeValueCorrectionPreview,
    isKeyframeValueCorrectionIdentity,
    isKeyframeValueCorrectionValid,
    type KeyframeValueCorrection,
} from "./keyframe-value-correction";
import type {
    CameraKeyframePayload,
    MorphKeyframePayload,
    MovableBoneKeyframePayload,
} from "./timeline-edit-service";

const xyzCorrection = {
    x: { multiply: 2, add: 1 },
    y: { multiply: 0.5, add: -1 },
    z: { multiply: -1, add: 3 },
};

const identityXyzCorrection = {
    x: { multiply: 1, add: 0 },
    y: { multiply: 1, add: 0 },
    z: { multiply: 1, add: 0 },
};

function quaternionFromDegrees(x: number, y: number, z: number): number[] {
    const toRad = Math.PI / 180;
    const quaternion = Quaternion.RotationYawPitchRoll(y * toRad, x * toRad, z * toRad);
    return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function expectEquivalentQuaternion(actual: readonly number[], expected: readonly number[]): void {
    const dot = actual.reduce((sum, value, index) => sum + value * (expected[index] ?? 0), 0);
    expect(Math.abs(dot)).toBeCloseTo(1, 6);
}

describe("keyframe value correction", () => {
    it("corrects movable bone positions without changing interpolation or rotation", () => {
        const payload: MovableBoneKeyframePayload = {
            kind: "movableBone",
            positions: [1, 4, -2],
            positionInterpolations: [1, 2, 3],
            rotations: [0, 0, 0, 1],
            rotationInterpolations: [4, 5, 6, 7],
            physicsToggles: [1],
        };

        const corrected = applyKeyframeValueCorrection(payload, {
            kind: "bone",
            position: xyzCorrection,
            rotation: identityXyzCorrection,
        });

        expect(corrected).toEqual({
            ...payload,
            positions: [3, 1, 5],
        });
        expect(payload.positions).toEqual([1, 4, -2]);
        expect(corrected).not.toBe(payload);
    });

    it("corrects movable and rotation-only bone Euler degrees while preserving interpolation", () => {
        const sourceRotation = quaternionFromDegrees(10, 20, 30);
        const correction: KeyframeValueCorrection = {
            kind: "bone",
            position: identityXyzCorrection,
            rotation: {
                x: { multiply: 1, add: 5 },
                y: { multiply: 1, add: -10 },
                z: { multiply: 1, add: 20 },
            },
        };
        const rotationOnly = {
            kind: "bone" as const,
            rotations: sourceRotation,
            rotationInterpolations: [4, 5, 6, 7],
            physicsToggles: [1],
        };
        const movable = {
            kind: "movableBone" as const,
            positions: [1, 2, 3],
            positionInterpolations: [1, 2, 3],
            rotations: sourceRotation,
            rotationInterpolations: [4, 5, 6, 7],
            physicsToggles: [0],
        };

        const correctedRotationOnly = applyKeyframeValueCorrection(rotationOnly, correction);
        const correctedMovable = applyKeyframeValueCorrection(movable, correction);
        if (correctedRotationOnly?.kind !== "bone") throw new Error("expected rotation-only bone payload");
        if (correctedMovable?.kind !== "movableBone") throw new Error("expected movable bone payload");

        expectEquivalentQuaternion(correctedRotationOnly.rotations, quaternionFromDegrees(15, 10, 50));
        expectEquivalentQuaternion(correctedMovable.rotations, quaternionFromDegrees(15, 10, 50));
        expect(correctedRotationOnly.rotationInterpolations).toEqual(rotationOnly.rotationInterpolations);
        expect(correctedMovable.positions).toEqual(movable.positions);
        expect(correctedMovable.positionInterpolations).toEqual(movable.positionInterpolations);
    });

    it("keeps the corrected quaternion in the source hemisphere", () => {
        const source = quaternionFromDegrees(15, -30, 45).map((value) => -value);
        const payload = {
            kind: "bone" as const,
            rotations: source,
            rotationInterpolations: [20, 20, 20, 20],
            physicsToggles: [0],
        };

        const corrected = applyKeyframeValueCorrection(payload, {
            kind: "bone",
            position: identityXyzCorrection,
            rotation: {
                ...identityXyzCorrection,
                x: { multiply: 1, add: 360 },
            },
        });
        if (corrected?.kind !== "bone") throw new Error("expected bone payload");
        const dot = corrected.rotations
            .reduce((sum, value, index) => sum + value * (source[index] ?? 0), 0);

        expect(dot).toBeCloseTo(1, 6);
    });

    it("produces a finite normalized quaternion at the Euler singularity", () => {
        const payload = {
            kind: "bone" as const,
            rotations: quaternionFromDegrees(90, 25, 0),
            rotationInterpolations: [20, 20, 20, 20],
            physicsToggles: [0],
        };
        const corrected = applyKeyframeValueCorrection(payload, {
            kind: "bone",
            position: identityXyzCorrection,
            rotation: {
                ...identityXyzCorrection,
                y: { multiply: 1, add: 15 },
            },
        });
        if (corrected?.kind !== "bone") throw new Error("expected bone payload");
        const rotations = corrected.rotations;
        const norm = Math.hypot(...rotations);

        expect(rotations.every(Number.isFinite)).toBe(true);
        expect(norm).toBeCloseTo(1, 6);
    });

    it("rejects a zero-length source quaternion when rotation correction is requested", () => {
        const payload = {
            kind: "bone" as const,
            rotations: [0, 0, 0, 0],
            rotationInterpolations: [20, 20, 20, 20],
            physicsToggles: [0],
        };
        const correction: KeyframeValueCorrection = {
            kind: "bone",
            position: identityXyzCorrection,
            rotation: {
                ...identityXyzCorrection,
                z: { multiply: 1, add: 10 },
            },
        };

        expect(applyKeyframeValueCorrection(payload, correction)).toBeNull();
        expect(createKeyframeValueCorrectionPreview([payload], correction).valid).toBe(false);
    });

    it("corrects camera center, distance, and fov while preserving rotations and interpolation", () => {
        const payload: CameraKeyframePayload = {
            kind: "camera",
            positions: [1, 4, -2],
            positionInterpolations: [1, 2, 3],
            rotations: [0.1, 0.2, 0.3],
            rotationInterpolations: [4, 5, 6, 7],
            distances: [-45],
            distanceInterpolations: [8, 9, 10, 11],
            fovs: [30],
            fovInterpolations: [12, 13, 14, 15],
            externalParent: { modelPath: null, boneName: null },
        };
        const correction: KeyframeValueCorrection = {
            kind: "camera",
            center: xyzCorrection,
            rotation: {
                x: { multiply: 1, add: 10 },
                y: { multiply: 2, add: 0 },
                z: { multiply: -1, add: 0 },
            },
            distance: { multiply: 1, add: 5 },
            fov: { multiply: 2, add: -10 },
        };

        const corrected = applyKeyframeValueCorrection(payload, correction);

        expect(corrected).toEqual({
            ...payload,
            positions: [3, 1, 5],
            rotations: [
                0.1 + 10 * Math.PI / 180,
                0.4,
                -0.3,
            ],
            distances: [-40],
            fovs: [50],
        });
        expect(payload.distances).toEqual([-45]);
        expect(payload.fovs).toEqual([30]);
    });

    it("corrects morph weights without clamping MMD values", () => {
        const payload: MorphKeyframePayload = { kind: "morph", weights: [0.75] };

        expect(applyKeyframeValueCorrection(payload, {
            kind: "morph",
            weight: { multiply: 2, add: 0.25 },
        })).toEqual({ kind: "morph", weights: [1.75] });
    });

    it("returns null for incompatible payloads", () => {
        const payload: MorphKeyframePayload = { kind: "morph", weights: [0.5] };

        expect(applyKeyframeValueCorrection(payload, {
            kind: "bone",
            position: xyzCorrection,
            rotation: identityXyzCorrection,
        })).toBeNull();
    });

    it("summarizes compatible and changed payloads for a dry-run preview", () => {
        const correction: KeyframeValueCorrection = {
            kind: "morph",
            weight: { multiply: 0.5, add: 0 },
        };
        const preview = createKeyframeValueCorrectionPreview([
            { kind: "morph", weights: [0.4] },
            { kind: "morph", weights: [0.8] },
            {
                kind: "bone",
                rotations: [0, 0, 0, 1],
                rotationInterpolations: [0, 0, 0, 0],
                physicsToggles: [0],
            },
        ], correction);

        expect(preview).toEqual({
            compatibleKeyCount: 2,
            changedKeyCount: 2,
            beforeMin: 0.4,
            beforeMax: 0.8,
            afterMin: 0.2,
            afterMax: 0.4,
            valid: true,
        });
    });

    it("recognizes identity and invalid corrections", () => {
        const identity: KeyframeValueCorrection = {
            kind: "morph",
            weight: { multiply: 1, add: 0 },
        };
        const invalid: KeyframeValueCorrection = {
            kind: "morph",
            weight: { multiply: Number.NaN, add: 0 },
        };

        expect(isKeyframeValueCorrectionIdentity(identity)).toBe(true);
        expect(isKeyframeValueCorrectionValid(identity)).toBe(true);
        expect(isKeyframeValueCorrectionValid(invalid)).toBe(false);
    });
});

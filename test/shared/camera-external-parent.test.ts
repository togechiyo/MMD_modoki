import { describe, expect, it } from "vitest";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
    moveCameraExternalParentKeyframe,
    normalizeCameraExternalParentPayload,
    removeCameraExternalParentKeyframes,
    selectCameraExternalParentKeyframeAtFrame,
    transformCameraExternalParentVectorsToRef,
    upsertCameraExternalParentKeyframe,
} from "../../src/shared/camera-external-parent";

describe("external parent initialization", () => {
    it("rejects the uninitialized zero bone matrix without corrupting camera vectors", () => {
        const position = new Vector3(0, 3, -20);
        const target = new Vector3(0, 3, -19);
        const up = Vector3.Up();
        expect(transformCameraExternalParentVectorsToRef(Matrix.Zero(), position, target, up)).toBe(false);
        expect(position.asArray()).toEqual([0, 3, -20]);
        expect(target.asArray()).toEqual([0, 3, -19]);
        expect(up.asArray()).toEqual([0, 1, 0]);
        expect(transformCameraExternalParentVectorsToRef(Matrix.Translation(40, 0, 0), position, target, up)).toBe(true);
        expect(position.asArray()).toEqual([40, 3, -20]);
    });
});

describe("camera external parent keyframes", () => {
    const keyframes = [
        { frame: 5, modelPath: "model-a.pmx", boneName: "head" },
        { frame: 20, modelPath: null, boneName: null },
    ];

    it("holds the latest relation until the next key", () => {
        expect(selectCameraExternalParentKeyframeAtFrame(keyframes, 4)).toBeNull();
        expect(selectCameraExternalParentKeyframeAtFrame(keyframes, 19)).toEqual(keyframes[0]);
        expect(selectCameraExternalParentKeyframeAtFrame(keyframes, 20)).toEqual(keyframes[1]);
    });

    it("upserts a normalized key and keeps frame order", () => {
        expect(upsertCameraExternalParentKeyframe(keyframes, 10.9, {
            modelPath: "model-b.pmx",
            boneName: "center",
        })).toEqual([
            keyframes[0],
            { frame: 10, modelPath: "model-b.pmx", boneName: "center" },
            keyframes[1],
        ]);
    });

    it("replaces a key at the destination when moving", () => {
        expect(moveCameraExternalParentKeyframe(keyframes, 5, 20)).toEqual([
            { frame: 20, modelPath: "model-a.pmx", boneName: "head" },
        ]);
    });

    it("removes normalized frame numbers", () => {
        expect(removeCameraExternalParentKeyframes(keyframes, [20.8])).toEqual([keyframes[0]]);
    });

    it("clears a bone name when the model is detached", () => {
        expect(normalizeCameraExternalParentPayload({ modelPath: null, boneName: "head" })).toEqual({
            modelPath: null,
            boneName: null,
        });
    });
});

describe("MMD_modoki camera external-parent transform", () => {
    it("transforms camera position, target, and up by the parent bone", () => {
        const position = new Vector3(0, 1, -10);
        const target = new Vector3(0, 1, 0);
        const up = Vector3.Up();

        transformCameraExternalParentVectorsToRef(
            Matrix.RotationY(Math.PI / 2).multiply(Matrix.Translation(2, 3, 4)),
            position,
            target,
            up,
        );

        expect(position.x).toBeCloseTo(-8, 5);
        expect(position.y).toBeCloseTo(4, 5);
        expect(position.z).toBeCloseTo(4, 5);
        expect(target.asArray()).toEqual([2, 4, 4]);
        expect(up.asArray()).toEqual([0, 1, 0]);
    });

});

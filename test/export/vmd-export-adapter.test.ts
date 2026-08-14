import { describe, expect, it } from "vitest";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import {
    MmdBoneAnimationTrack,
    MmdCameraAnimationTrack,
    MmdMorphAnimationTrack,
    MmdMovableBoneAnimationTrack,
    MmdPropertyAnimationTrack,
} from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";

import {
    VmdExportAdapterError,
    createCameraVmdExportDocument,
    createModelVmdExportDocument,
} from "../../src/export/vmd-export-adapter";

describe("VMD export adapter", () => {
    it("flattens and deterministically sorts model tracks while preserving physics and IK", () => {
        const rotation = new MmdBoneAnimationTrack("上半身", 1);
        rotation.frameNumbers[0] = 10;
        rotation.rotations.set([0, 0.25, 0, 0.96]);
        rotation.rotationInterpolations.set([1, 2, 3, 4]);
        rotation.physicsToggles[0] = 0;

        const movable = new MmdMovableBoneAnimationTrack("センター", 1);
        movable.frameNumbers[0] = 2;
        movable.positions.set([1, 2, 3]);
        movable.rotations.set([0, 0, 0, 1]);
        movable.positionInterpolations.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        movable.rotationInterpolations.set([13, 14, 15, 16]);
        movable.physicsToggles[0] = 1;

        const morph = new MmdMorphAnimationTrack("笑い", 1);
        morph.frameNumbers[0] = 5;
        morph.weights[0] = 0.75;

        const property = new MmdPropertyAnimationTrack(1, ["左足ＩＫ"]);
        property.frameNumbers[0] = 8;
        property.visibles[0] = 1;
        property.getIkState(0)[0] = 0;

        const animation = new MmdAnimation("source", [rotation], [movable], [morph], property, new MmdCameraAnimationTrack(0));
        const document = createModelVmdExportDocument(animation, "モデル", 3);
        expect(document.kind).toBe("model");
        if (document.kind !== "model") return;
        expect(document.boneKeys.map((key) => [key.boneName, key.frame])).toEqual([["センター", 2], ["上半身", 10]]);
        expect(document.boneKeys[0].position).toEqual([1, 2, 3]);
        expect(document.boneKeys[0].positionInterpolations).toEqual([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]);
        expect(document.boneKeys[0].physicsEnabled).toBe(true);
        expect(document.boneKeys[1].position).toEqual([0, 0, 0]);
        expect(document.boneKeys[1].physicsEnabled).toBe(false);
        expect(document.morphKeys[0]).toEqual({ morphName: "笑い", frame: 5, weight: 0.75 });
        expect(document.propertyKeys[0]).toEqual({ frame: 8, visible: true, ikStates: [{ boneName: "左足ＩＫ", enabled: false }] });
        expect(document.unsupportedExternalParentKeyCount).toBe(3);
    });

    it("copies camera track values without coordinate or distance conversion", () => {
        const track = new MmdCameraAnimationTrack(1);
        track.frameNumbers[0] = 4;
        track.positions.set([1, 2, 3]);
        track.rotations.set([0.1, 0.2, -0.3]);
        track.distances[0] = -25;
        track.fovs[0] = 40;
        track.positionInterpolations.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        track.rotationInterpolations.set([13, 14, 15, 16]);
        track.distanceInterpolations.set([17, 18, 19, 20]);
        track.fovInterpolations.set([21, 22, 23, 24]);

        const document = createCameraVmdExportDocument(track, 0);
        expect(document.kind).toBe("camera");
        if (document.kind !== "camera") return;
        expect(document.cameraKeys[0].distance).toBe(-25);
        expect(document.cameraKeys[0].position).toEqual([1, 2, 3]);
        expect(document.cameraKeys[0].rotation[2]).toBeCloseTo(-0.3);
        expect(document.cameraKeys[0].fovInterpolation).toEqual([21, 22, 23, 24]);
    });

    it("fails closed when source track strides or binary flags are invalid", () => {
        const track = new MmdBoneAnimationTrack("上半身", 1);
        Object.defineProperty(track, "rotations", { value: new Float32Array(3) });
        const animation = new MmdAnimation(
            "broken",
            [track],
            [],
            [],
            new MmdPropertyAnimationTrack(0, []),
            new MmdCameraAnimationTrack(0),
        );
        expect(() => createModelVmdExportDocument(animation, "model", 0)).toThrow(VmdExportAdapterError);

        const camera = new MmdCameraAnimationTrack(1);
        Object.defineProperty(camera, "fovs", { value: new Float32Array(0) });
        expect(() => createCameraVmdExportDocument(camera, 0)).toThrow(VmdExportAdapterError);
    });
});

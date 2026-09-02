import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import {
    MmdBoneAnimationTrack,
    MmdCameraAnimationTrack,
    MmdMorphAnimationTrack,
    MmdPropertyAnimationTrack,
} from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import { BvmdLoader } from "babylon-mmd/esm/Loader/Optimized/bvmdLoader";
import { describe, expect, it } from "vitest";

import {
    serializeCameraBvmd,
    serializeModelBvmd,
} from "../../src/export/bvmd-exporter";

const unicodeBoneName = "髪飾り_龙门石窟_🐉";
const unicodeMorphName = "表情_微笑_繁體龍";
const unicodeIkName = "左足ＩＫ_龙";

function createSourceAnimation(): MmdAnimation {
    const boneTrack = new MmdBoneAnimationTrack(unicodeBoneName, 1);
    boneTrack.frameNumbers[0] = 7;
    boneTrack.rotations.set([0, 0.25, 0, 0.96875]);
    boneTrack.rotationInterpolations.set([20, 107, 20, 107]);
    boneTrack.physicsToggles[0] = 1;

    const morphTrack = new MmdMorphAnimationTrack(unicodeMorphName, 1);
    morphTrack.frameNumbers[0] = 3;
    morphTrack.weights[0] = 0.625;

    const propertyTrack = new MmdPropertyAnimationTrack(1, [unicodeIkName]);
    propertyTrack.frameNumbers[0] = 9;
    propertyTrack.visibles[0] = 1;
    propertyTrack.getIkState(0)[0] = 0;

    const cameraTrack = new MmdCameraAnimationTrack(1);
    cameraTrack.frameNumbers[0] = 12;
    cameraTrack.positions.set([1, 2, 3]);
    cameraTrack.positionInterpolations.fill(20);
    cameraTrack.rotations.set([0.1, 0.2, 0.3]);
    cameraTrack.rotationInterpolations.fill(20);
    cameraTrack.distances[0] = -35;
    cameraTrack.distanceInterpolations.fill(20);
    cameraTrack.fovs[0] = 42;
    cameraTrack.fovInterpolations.fill(20);

    return new MmdAnimation(
        "編集モーション_龙🐉",
        [boneTrack],
        [],
        [morphTrack],
        propertyTrack,
        cameraTrack,
    );
}

function loadBvmd(bytes: Uint8Array): MmdAnimation {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
        return new BvmdLoader(scene).loadFromBuffer("roundtrip", bytes.buffer);
    } finally {
        scene.dispose();
        engine.dispose();
    }
}

describe("BVMD edited-motion exporter", () => {
    it("exports model tracks as BVMD 3.0 and preserves UTF-8 names exactly", () => {
        const bytes = serializeModelBvmd(createSourceAnimation());

        expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("BVMD");
        expect(Array.from(bytes.slice(4, 7))).toEqual([3, 0, 0]);

        const animation = loadBvmd(bytes);
        expect(animation.boneTracks.map((track) => track.name)).toEqual([unicodeBoneName]);
        expect(animation.morphTracks.map((track) => track.name)).toEqual([unicodeMorphName]);
        expect(animation.propertyTrack.ikBoneNames).toEqual([unicodeIkName]);
        expect(animation.boneTracks[0]?.frameNumbers[0]).toBe(7);
        expect(animation.morphTracks[0]?.weights[0]).toBeCloseTo(0.625);
        expect(animation.propertyTrack.frameNumbers[0]).toBe(9);
        expect(animation.cameraTrack.frameNumbers).toHaveLength(0);
    });

    it("exports only the camera track for a camera BVMD", () => {
        const bytes = serializeCameraBvmd(createSourceAnimation());
        const animation = loadBvmd(bytes);

        expect(animation.boneTracks).toHaveLength(0);
        expect(animation.movableBoneTracks).toHaveLength(0);
        expect(animation.morphTracks).toHaveLength(0);
        expect(animation.propertyTrack.frameNumbers).toHaveLength(0);
        expect(animation.propertyTrack.ikBoneNames).toHaveLength(0);
        expect(animation.cameraTrack.frameNumbers).toEqual(new Uint32Array([12]));
        expect(animation.cameraTrack.positions).toEqual(new Float32Array([1, 2, 3]));
        expect(animation.cameraTrack.fovs[0]).toBeCloseTo(42);
    });

    it("rejects an export when the selected track group has no keys", () => {
        const emptyAnimation = new MmdAnimation(
            "empty",
            [],
            [],
            [],
            new MmdPropertyAnimationTrack(0, []),
            new MmdCameraAnimationTrack(0),
        );

        expect(() => serializeModelBvmd(emptyAnimation)).toThrow(/model keyframes/i);
        expect(() => serializeCameraBvmd(emptyAnimation)).toThrow(/camera keyframes/i);
    });

    it("rejects unsorted source tracks before conversion", () => {
        const source = createSourceAnimation();
        const invalidTrack = new MmdBoneAnimationTrack("invalid", 2);
        invalidTrack.frameNumbers.set([10, 1]);
        invalidTrack.rotations.set([0, 0, 0, 1, 0, 0, 0, 1]);
        invalidTrack.rotationInterpolations.fill(20);
        invalidTrack.physicsToggles.fill(1);
        const invalidAnimation = new MmdAnimation(
            "invalid",
            [invalidTrack],
            [],
            [],
            source.propertyTrack,
            source.cameraTrack,
        );

        expect(() => serializeModelBvmd(invalidAnimation)).toThrow(/sorted/i);
    });
});

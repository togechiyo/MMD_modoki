import { describe, expect, it } from "vitest";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdBoneAnimationTrack, MmdMovableBoneAnimationTrack, MmdCameraAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import { mergeModelAnimations } from "../../src/editor/timeline-edit-service";
import { deserializeModelAnimation, serializeModelAnimation } from "../../src/project/project-codec";

function motion(movable: boolean, frames: number[]): MmdAnimation {
    const track = movable ? new MmdMovableBoneAnimationTrack("センター", frames.length) : new MmdBoneAnimationTrack("センター", frames.length);
    track.frameNumbers.set(frames);
    track.rotationInterpolations.fill(42);
    track.physicsToggles.fill(movable ? 0 : 1);
    for (let i = 0; i < frames.length; i++) track.rotations[i * 4 + 3] = 1;
    if (track instanceof MmdMovableBoneAnimationTrack) track.positions.fill(3);
    return new MmdAnimation("motion", movable ? [] : [track], movable ? [track as MmdMovableBoneAnimationTrack] : [], [], new MmdPropertyAnimationTrack(0, []), new MmdCameraAnimationTrack(0));
}

describe("model motion track kind normalization", () => {
    it.each([false, true])("merges both directions with overlay precedence (base movable=%s)", baseMovable => {
        const base = motion(baseMovable, [0, 10]);
        const overlay = motion(!baseMovable, [10, 20]);
        const merged = mergeModelAnimations(base, overlay);
        expect(merged.boneTracks).toHaveLength(0);
        expect(merged.movableBoneTracks).toHaveLength(1);
        const track = merged.movableBoneTracks[0];
        expect([...track.frameNumbers]).toEqual([0, 10, 20]);
        expect([...track.positions.slice(3, 6)]).toEqual(baseMovable ? [0, 0, 0] : [3, 3, 3]);
        expect([...track.physicsToggles]).toEqual(baseMovable ? [0, 1, 1] : [1, 0, 0]);
        expect([...track.rotationInterpolations]).toEqual(Array(12).fill(42));
        expect(base.boneTracks.length + base.movableBoneTracks.length).toBe(1);
        expect([...(baseMovable ? base.movableBoneTracks[0].frameNumbers : base.boneTracks[0].frameNumbers)]).toEqual([0, 10]);
    });

    it("repairs a legacy project with colliding tracks, retaining non-overlapping frames", () => {
        const rotation = motion(false, [0, 10]);
        const translated = motion(true, [10, 20]);
        const legacy = new MmdAnimation("legacy", rotation.boneTracks, translated.movableBoneTracks, [], rotation.propertyTrack, rotation.cameraTrack);
        const restored = deserializeModelAnimation(serializeModelAnimation(legacy), "fallback");
        if (!restored) throw new Error("restore failed");
        expect(restored?.boneTracks).toHaveLength(0);
        expect(restored?.movableBoneTracks).toHaveLength(1);
        expect([...restored.movableBoneTracks[0].frameNumbers]).toEqual([0, 10, 20]);
        expect([...restored.movableBoneTracks[0].positions]).toEqual([0, 0, 0, 3, 3, 3, 3, 3, 3]);
    });
});

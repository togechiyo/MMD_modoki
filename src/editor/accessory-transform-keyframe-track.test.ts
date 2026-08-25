import { describe, expect, it } from "vitest";

import {
    createAccessoryTransformKeyframeTrack,
    deserializeAccessoryTransformKeyframeTrack,
    evaluateAccessoryTransformKeyframeTrack,
    moveAccessoryTransformKeyframe,
    readAccessoryTransformKeyframe,
    removeAccessoryTransformKeyframes,
    serializeAccessoryTransformKeyframeTrack,
    upsertAccessoryTransformKeyframe,
} from "./accessory-transform-keyframe-track";

const base = {
    position: { x: 1, y: 2, z: 3 },
    rotationDeg: { x: 0, y: 10, z: 20 },
    scale: 1,
};

describe("accessory transform keyframe track", () => {
    it("uses the static transform before the first key and linearly evaluates registered keys", () => {
        let track = createAccessoryTransformKeyframeTrack(base);
        track = upsertAccessoryTransformKeyframe(track, 10, {
            position: { x: 10, y: 0, z: -10 },
            rotationDeg: { x: 20, y: 40, z: 60 },
            scale: 2,
        });
        track = upsertAccessoryTransformKeyframe(track, 20, {
            position: { x: 20, y: 10, z: 0 },
            rotationDeg: { x: 40, y: 60, z: 80 },
            scale: 4,
        });

        expect(evaluateAccessoryTransformKeyframeTrack(track, 5)).toEqual(base);
        expect(evaluateAccessoryTransformKeyframeTrack(track, 15)).toEqual({
            position: { x: 15, y: 5, z: -5 },
            rotationDeg: { x: 30, y: 50, z: 70 },
            scale: 3,
        });
        expect(evaluateAccessoryTransformKeyframeTrack(track, 30)).toEqual({
            position: { x: 20, y: 10, z: 0 },
            rotationDeg: { x: 40, y: 60, z: 80 },
            scale: 4,
        });
    });

    it("supports overwrite, move, delete, and packed project round-trip", () => {
        let track = createAccessoryTransformKeyframeTrack(base);
        track = upsertAccessoryTransformKeyframe(track, 10, base);
        track = upsertAccessoryTransformKeyframe(track, 10, {
            position: { x: 9, y: 8, z: 7 },
            rotationDeg: { x: 6, y: 5, z: 4 },
            scale: 3,
        });
        track = upsertAccessoryTransformKeyframe(track, 30, {
            position: { x: 30, y: 0, z: 0 },
            rotationDeg: { x: 0, y: 30, z: 0 },
            scale: 2,
        });

        const moved = moveAccessoryTransformKeyframe(track, 30, 20);
        expect(moved).not.toBeNull();
        if (!moved) throw new Error("expected accessory keyframe move to succeed");
        expect(moved?.keyframes.map((keyframe) => keyframe.frame)).toEqual([10, 20]);
        expect(moveAccessoryTransformKeyframe(moved, 10, 20)).toBeNull();

        const restored = deserializeAccessoryTransformKeyframeTrack(
            serializeAccessoryTransformKeyframeTrack(moved),
            base,
        );
        expect(readAccessoryTransformKeyframe(restored, 10)).toEqual({
            position: { x: 9, y: 8, z: 7 },
            rotationDeg: { x: 6, y: 5, z: 4 },
            scale: 3,
        });
        expect(readAccessoryTransformKeyframe(restored, 20)).toEqual({
            position: { x: 30, y: 0, z: 0 },
            rotationDeg: { x: 0, y: 30, z: 0 },
            scale: 2,
        });
        expect(removeAccessoryTransformKeyframes(restored, [10, 20])?.keyframes).toEqual([]);
    });
});

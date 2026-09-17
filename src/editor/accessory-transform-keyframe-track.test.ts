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
    visible: true,
};

describe("accessory transform keyframe track", () => {
    it("steps visibility at the exact key and preserves the pre-key value across saving", () => {
        let track = createAccessoryTransformKeyframeTrack({ ...base, visible: false });
        track = upsertAccessoryTransformKeyframe(track, 10, { ...base, visible: true });
        track = upsertAccessoryTransformKeyframe(track, 20, { ...base, visible: false });
        track = upsertAccessoryTransformKeyframe(track, 30, { ...base, visible: true });
        const restored = deserializeAccessoryTransformKeyframeTrack(
            serializeAccessoryTransformKeyframeTrack(track), { ...base, visible: true },
        );
        for (const candidate of [track, restored]) {
            expect([0, 9, 10, 19, 20, 29, 30, 99].map(frame =>
                evaluateAccessoryTransformKeyframeTrack(candidate, frame).visible,
            )).toEqual([false, false, true, true, false, false, true, true]);
        }
        const moved = moveAccessoryTransformKeyframe(restored, 20, 25);
        if (!moved) throw new Error("move failed");
        expect(evaluateAccessoryTransformKeyframeTrack(moved, 24).visible).toBe(true);
        expect(evaluateAccessoryTransformKeyframeTrack(moved, 25).visible).toBe(false);
        const deleted = removeAccessoryTransformKeyframes(moved, [25]);
        if (!deleted) throw new Error("delete failed");
        expect(evaluateAccessoryTransformKeyframeTrack(deleted, 25).visible).toBe(true);
    });

    it.each([false, true])("keeps legacy static visibility %s when keys contain no visibility", visible => {
        const legacy = { frameNumbers: [10, 20], positions: [0, 0, 0, 1, 0, 0],
            rotations: [0, 0, 0, 0, 0, 0], scales: [1, 1] };
        const restored = deserializeAccessoryTransformKeyframeTrack(legacy, { ...base, visible });
        expect([0, 10, 15, 20, 30].map(frame =>
            evaluateAccessoryTransformKeyframeTrack(restored, frame).visible,
        )).toEqual([visible, visible, visible, visible, visible]);
    });

    it("uses the static transform before the first key and linearly evaluates registered keys", () => {
        let track = createAccessoryTransformKeyframeTrack(base);
        track = upsertAccessoryTransformKeyframe(track, 10, {
            position: { x: 10, y: 0, z: -10 },
            rotationDeg: { x: 20, y: 40, z: 60 },
            scale: 2,
            visible: true,
        });
        track = upsertAccessoryTransformKeyframe(track, 20, {
            position: { x: 20, y: 10, z: 0 },
            rotationDeg: { x: 40, y: 60, z: 80 },
            scale: 4,
            visible: true,
        });

        expect(evaluateAccessoryTransformKeyframeTrack(track, 5)).toEqual(base);
        expect(evaluateAccessoryTransformKeyframeTrack(track, 15)).toEqual({
            position: { x: 15, y: 5, z: -5 },
            rotationDeg: { x: 30, y: 50, z: 70 },
            scale: 3,
            visible: true,
        });
        expect(evaluateAccessoryTransformKeyframeTrack(track, 30)).toEqual({
            position: { x: 20, y: 10, z: 0 },
            rotationDeg: { x: 40, y: 60, z: 80 },
            scale: 4,
            visible: true,
        });
    });

    it("supports overwrite, move, delete, and packed project round-trip", () => {
        let track = createAccessoryTransformKeyframeTrack(base);
        track = upsertAccessoryTransformKeyframe(track, 10, base);
        track = upsertAccessoryTransformKeyframe(track, 10, {
            position: { x: 9, y: 8, z: 7 },
            rotationDeg: { x: 6, y: 5, z: 4 },
            scale: 3,
            visible: true,
        });
        track = upsertAccessoryTransformKeyframe(track, 30, {
            position: { x: 30, y: 0, z: 0 },
            rotationDeg: { x: 0, y: 30, z: 0 },
            scale: 2,
            visible: true,
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
            visible: true,
        });
        expect(readAccessoryTransformKeyframe(restored, 20)).toEqual({
            position: { x: 30, y: 0, z: 0 },
            rotationDeg: { x: 0, y: 30, z: 0 },
            scale: 2,
            visible: true,
        });
        expect(removeAccessoryTransformKeyframes(restored, [10, 20])?.keyframes).toEqual([]);
    });
});

import { describe, expect, it } from "vitest";
import { buildAutomationTimelineTransform } from "../../src/automation/timeline-transform";
import { createIdentityKeyframeValueCorrection } from "../../src/editor/keyframe-value-correction";
import type { CommandTrackRef } from "../../src/actions/command-types";
import type { TimelineKeyframePayload } from "../../src/editor/timeline-edit-service";
import { executeKeyframeTransaction } from "../../src/actions/keyframe-transaction";

const owner = { kind: "model" as const, modelInstanceId: "model" };
const track = { category: "morph" as const, name: "smile" };
const weight = (value: number): TimelineKeyframePayload => ({ kind: "morph", weights: [value] });
const bone = (): Extract<TimelineKeyframePayload, { kind: "movableBone" }> => ({ kind: "movableBone", positions: [2, 3, 4], rotations: [0, 0, 0, 1], physicsToggles: [0], positionInterpolations: [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107], rotationInterpolations: [20, 107, 20, 107] });

describe("MCP timeline transforms", () => {
    it.each(["insertFrames", "deleteFrames"] as const)("%s shifts all affected slots and undoes overlapping replacements", action => {
        const keys = new Map<number, TimelineKeyframePayload>([[0, weight(0)], [10, weight(0.1)], [12, weight(0.2)], [20, weight(0.3)]]);
        const original = structuredClone(keys);
        const read = (_track: CommandTrackRef, frame: number) => keys.get(frame) ?? null;
        const diff = buildAutomationTimelineTransform(owner, { action, frame: 10, count: 3 }, [{ ...track, frames: [...keys.keys()] }], read);
        expect(keys).toEqual(original);
        const host = { scope: () => owner, read, write: (_track: CommandTrackRef, frame: number, payload: TimelineKeyframePayload | null) => {
            if (payload) keys.set(frame, payload); else keys.delete(frame);
            return true;
        }, begin: () => undefined, end: () => undefined };
        expect(executeKeyframeTransaction(diff, "apply", host)).toBe(true);
        expect([...keys.keys()].sort((a, b) => a - b)).toEqual(action === "insertFrames" ? [0, 13, 15, 23] : [0, 17]);
        expect(executeKeyframeTransaction(diff, "revert", host)).toBe(true);
        expect(keys).toEqual(original);
    });
    it("does not clamp overflowing frames or allocate an unbounded edit", () => {
        expect(() => buildAutomationTimelineTransform(owner, { action: "insertFrames", frame: 0, count: 1 }, [{ ...track, frames: [1000000] }], () => weight(0))).toThrow("FRAME_OUT_OF_RANGE");
        expect(() => buildAutomationTimelineTransform(owner, { action: "deleteFrames", frame: 0, count: 1 }, [{ ...track, frames: Array.from({ length: 1001 }, (_, i) => i) }], () => weight(0))).toThrow("EDIT_TOO_LARGE");
    });
    it("mirrors into the counterpart's actual category and keeps source interpolation", () => {
        const left = { category: "bone" as const, name: "左腕", frames: [10] };
        const right = { category: "semi-standard" as const, name: "右腕", frames: [] };
        const source = bone();
        const diff = buildAutomationTimelineTransform(owner, { action: "mirror", keys: [{ track: { category: left.category, name: left.name }, frame: 10 }], frameOffset: 5, collision: "reject" }, [left, right], (track, frame) => track.name === left.name && frame === 10 ? source : null);
        expect(diff.items).toHaveLength(1);
        expect(diff.items[0]).toMatchObject({ track: { category: right.category, name: right.name }, frame: 15, before: null, after: { positions: [-2, 3, 4], rotationInterpolations: [20, 107, 20, 107] } });
        expect(source).toEqual(bone());
    });
    it("refuses to lose an external parent or silently mirror a non-bone key", () => {
        const source = { ...bone(), externalParent: { childBoneName: "smile", parentModelPath: "parent.pmx", parentBoneName: "root" } };
        const operation = { action: "mirror" as const, keys: [{ track, frame: 10 }], frameOffset: 0, collision: "replace" as const };
        expect(() => buildAutomationTimelineTransform(owner, operation, [{ ...track, frames: [10] }], () => source)).toThrow("EXTERNAL_PARENT_KEY_UNSUPPORTED");
        expect(() => buildAutomationTimelineTransform(owner, operation, [{ ...track, frames: [10] }], () => weight(0.1))).toThrow("KEY_KIND_MISMATCH");
    });
    it("applies the existing correction math and rejects out-of-range source results", () => {
        const correction = { kind: "morph" as const, weight: { multiply: 2, add: 0.1 } };
        const operation = { action: "correct" as const, keys: [{ track, frame: 10 }], correction };
        const diff = buildAutomationTimelineTransform(owner, operation, [{ ...track, frames: [10] }], () => weight(0.2));
        expect(diff.items[0].after).toEqual(weight(0.5));
        expect(() => buildAutomationTimelineTransform(owner, operation, [{ ...track, frames: [10] }], () => weight(0.8))).toThrow("KEY_VALUE_OUT_OF_RANGE");
        expect(buildAutomationTimelineTransform(owner, { ...operation, correction: createIdentityKeyframeValueCorrection("morph") }, [{ ...track, frames: [10] }], () => weight(0.2)).items).toEqual([]);
    });
    it("does not accept an unknown source track or missing key", () => {
        const operation = { action: "correct" as const, keys: [{ track, frame: 10 }], correction: createIdentityKeyframeValueCorrection("morph") };
        expect(() => buildAutomationTimelineTransform(owner, operation, [], () => weight(0.2))).toThrow("TRACK_NOT_UNIQUE");
        expect(() => buildAutomationTimelineTransform(owner, operation, [{ ...track, frames: [] }], () => null)).toThrow("KEY_NOT_FOUND");
    });
});

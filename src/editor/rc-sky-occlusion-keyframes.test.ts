import { describe, expect, it, vi } from "vitest";
import { executeCommand, type CommandExecutionContext } from "../actions/command-executor";
import type { BuiltCommand } from "../actions/command-types";
import { effectKeyframePayloadSchema, makeEffectPayload } from "./effect-keyframe-definitions";
import { EffectSceneTrackStore } from "./effect-scene-track-store";
import { EffectTimelineViewState } from "./effect-timeline-view-state";
import { FRAME_GRAPH_INSTANCE_EFFECT_TYPES } from "./frame-graph-instance-effects";
import { isFrameGraphPostEffectId } from "../shared/frame-graph-post-effect-stack";

const id = "rcSkyOcclusion";
const base = { enabled: false, strength: 0.75 };
const first = makeEffectPayload(id, { enabled: true, strength: 0.2 });
const lastValue = { enabled: false, strength: 0.8 };
const last = makeEffectPayload(id, lastValue);
const createStore = () => new EffectSceneTrackStore(false, [id]);

describe("RC sky occlusion scene keys", () => {
    it("keeps authored ON demand across OFF frames and previews, and drops it after the last ON key is removed", () => {
        const store = createStore();
        expect(store.canBeEnabled(id)).toBe(false);
        store.apply(id, 0, last, base);
        expect(store.canBeEnabled(id)).toBe(false);
        store.apply(id, 30, first, base);
        expect(store.evaluate(id, 0)?.enabled).toBe(false);
        expect(store.canBeEnabled(id)).toBe(true);
        store.preview(id, 30, { enabled: false, strength: 0 }, base);
        expect(store.evaluate(id, 30, true)?.enabled).toBe(false);
        expect(store.canBeEnabled(id)).toBe(true);
        store.clearPreviews();
        store.move(id, 30, 60);
        expect(store.canBeEnabled(id)).toBe(true);
        const snapshot = store.snapshot(id);
        store.remove(id, [60]);
        expect(store.canBeEnabled(id)).toBe(false);
        store.restoreSnapshot(id, snapshot);
        expect(store.canBeEnabled(id)).toBe(true);
        store.restoreSnapshot(id, null);
        expect(store.canBeEnabled(id)).toBe(false);
        store.ensure(id, { ...base, enabled: true });
        expect(store.canBeEnabled(id)).toBe(true);
        store.restore(null);
        expect(store.canBeEnabled(id)).toBe(false);
    });

    it("enables only the scene singleton while retaining shelved keys and future fields verbatim", () => {
        const legacy = { effectId: "gamma", valueVersion: 1, base: { enabled: true, gamma: 99 },
            keys: [{ frame: 0, value: { gamma: 20, enabled: true } }], preview: { frame: 5, value: { gamma: 25 } }, extra: "preserve" };
        const store = createStore();
        store.restore({ version: 1, extraBlockField: { future: true }, tracks: [legacy] });
        expect(store.evaluate("gamma", 0)).toBeNull();
        expect(store.apply("gamma", 0, makeEffectPayload("gamma", { enabled: false, gamma: 1 }), {})).toBe(false);
        expect(store.apply(id, 30, last, base)).toBe(true);
        expect(store.apply(id, 10, first, base)).toBe(true);
        expect(store.ids()).toEqual([id]);
        const saved = store.serialize(), restored = createStore(); restored.restore(saved);
        expect(saved).toMatchObject({ extraBlockField: { future: true } });
        expect(saved.tracks[0]).toEqual(legacy);
        for (const frame of [0, 10, 20, 30, 90, 20, 9, 30]) {
            const expected = frame < 10 ? base : frame < 30 ? { enabled: true, strength: 0.2 + (frame - 10) * 0.03 } : lastValue;
            expect(restored.evaluate(id, frame)?.enabled).toBe(expected.enabled);
            expect(restored.evaluate(id, frame)?.strength).toBeCloseTo(expected.strength);
        }
        expect(restored.serialize()).toEqual(saved);
        expect(isFrameGraphPostEffectId(id)).toBe(true);
        expect(FRAME_GRAPH_INSTANCE_EFFECT_TYPES).not.toContain(id);
        expect(effectKeyframePayloadSchema.safeParse(first).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ ...first, instanceId: "fx-sky" }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ ...first, value: { ...first.value, minimum: 0.2 } }).success).toBe(false);
    });

    it("restores preview presence exactly without altering other tracks, and separates editing from playback/export", () => {
        const store = createStore(), absent = store.snapshot(id);
        store.apply(id, 10, first, base); store.apply(id, 30, last, base);
        const before = store.snapshot(id);
        store.preview(id, 20, { enabled: false, strength: 1 }, base);
        const preview = store.snapshot(id);
        expect(store.evaluate(id, 20, true)).toEqual({ enabled: false, strength: 1 });
        expect(store.evaluate(id, 20, false)?.strength).toBeCloseTo(0.5);
        expect(store.evaluate(id, 21, true)?.strength).toBeCloseTo(0.53);
        store.restoreSnapshot(id, before);
        expect(store.snapshot(id)).toEqual(before);
        expect(store.evaluate(id, 20, true)?.strength).toBeCloseTo(0.5);
        store.restoreSnapshot(id, preview);
        const saved = store.serialize(), restored = createStore(); restored.restore(saved);
        expect(restored.evaluate(id, 20, true)).toEqual({ enabled: false, strength: 1 });
        restored.clearPreviewsOutside(21);
        expect(restored.evaluate(id, 20, true)?.strength).toBeCloseTo(0.5);
        expect(store.restoreSnapshot(id, absent)).toBe(true);
        expect(store.has(id)).toBe(false);
        expect(store.evaluate(id, 20, true)).toBeNull();
        expect(store.restoreSnapshot("gamma", null)).toBe(false);
    });

    it("reuses registration, move, overwrite and delete Commands with timeline visibility and undo/redo", () => {
        const store = createStore(), track = { category: "effect" as const, name: id }, view = new EffectTimelineViewState();
        const context: CommandExecutionContext = {
            addTimelineKeyframe: (_track, frame) => store.apply(id, frame, first, base),
            removeTimelineKeyframe: (_track, frame) => store.apply(id, frame, null, base),
            moveTimelineKeyframe: (_track, from, to) => store.move(id, from, to),
            applyTimelineKeyframePayload: (_track, frame, value) => {
                if (!value) return store.apply(id, frame, null, base);
                return value.kind === "effect" ? store.apply(id, frame, value, base) : false;
            },
            setSelectedFrame: vi.fn(), seekToBoundary: vi.fn(), refreshAfterKeyframeEdit: () => view.setTracks([{ ...track, frames: store.frames(id) }]),
        };
        const command = (diff: BuiltCommand["diff"]): BuiltCommand => ({ id: "rc-sky-test", scope: "keyframe", label: "RC sky", createdAtMs: 0, diff });
        const register = command({ type: "keyframe.paste", track, frame: 10, before: null, after: first });
        expect(executeCommand(register, "apply", context)).toBe(true); expect(view.visibleTracks()).toHaveLength(1);
        expect(executeCommand(register, "revert", context)).toBe(true); expect(view.visibleTracks()).toHaveLength(0);
        expect(executeCommand(register, "apply", context)).toBe(true);
        store.apply(id, 30, last, base);
        const original = store.serialize();
        const move = command({ type: "keyframe.move", track, fromFrame: 30, toFrame: 40, beforeFrames: [10, 30], afterFrames: [10, 40] });
        expect(executeCommand(move, "apply", context)).toBe(true); expect(store.evaluate(id, 25)?.strength).toBeCloseTo(0.5);
        expect(executeCommand(move, "revert", context)).toBe(true); expect(store.serialize()).toEqual(original);
        const overwrite = command({ type: "keyframe.paste", track, frame: 10, before: first, after: last });
        expect(executeCommand(overwrite, "apply", context)).toBe(true); expect(store.evaluate(id, 20)).toEqual(last.value);
        expect(executeCommand(overwrite, "revert", context)).toBe(true); expect(store.serialize()).toEqual(original);
        const remove = command({ type: "keyframe.batchDelete", items: [{ track, frame: 10, before: first }, { track, frame: 30, before: last }] });
        expect(executeCommand(remove, "apply", context)).toBe(true); expect(view.visibleTracks()).toHaveLength(0);
        expect(store.evaluate(id, 20)).toEqual(base);
        expect(executeCommand(remove, "revert", context)).toBe(true); expect(store.serialize()).toEqual(original);
        expect(view.visibleTracks()).toHaveLength(1);
    });

    it("does not overwrite a newer serialized animation block", () => {
        const future = { version: 2, tracks: [{ effectId: id, future: true }] }, store = createStore();
        store.restore(future);
        expect(() => store.apply(id, 0, first, base)).toThrow("newer effect animation format");
        expect(store.restoreSnapshot(id, null)).toBe(true);
        expect(() => store.restoreSnapshot(id, { base, keys: [] })).toThrow("newer effect animation format");
        expect(store.serialize()).toEqual(future);
    });
});

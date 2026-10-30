import { describe, expect, it, vi } from "vitest";
import { canExecuteEditorAction, type EditorActionAvailabilitySnapshot } from "../actions/action-availability";
import { executeCommand, type CommandExecutionContext } from "../actions/command-executor";
import type { BuiltCommand } from "../actions/command-types";
import { effectKeyframePayloadSchema, getEffectDefinition, makeEffectPayload, normalizeEffectValue } from "./effect-keyframe-definitions";
import { EffectSceneTrackStore } from "./effect-scene-track-store";
import { FRAME_GRAPH_INSTANCE_EFFECT_TYPES } from "./frame-graph-instance-effects";
import { isFrameGraphPostEffectId } from "../shared/frame-graph-post-effect-stack";

const id = "rcDiffuseGi", base = { enabled: false, strength: 0.5 };
const payload = (enabled: boolean, strength: number) => makeEffectPayload(id, { enabled, strength });
const createStore = () => new EffectSceneTrackStore(false, ["rcSkyOcclusion", id]);

describe("RC GI scene keys", () => {
    it("uses UI 25 for strength .5, supports 0..2, and permits singleton registration without reviving legacy effects", () => {
        const definition = getEffectDefinition(id), slider = definition.sliders[0];
        expect(normalizeEffectValue(definition, {})).toEqual(base);
        expect(slider.toValue(25)).toBe(0.5); expect(slider.toPosition(2)).toBe(100);
        expect(normalizeEffectValue(definition, { enabled: true, strength: 9 })).toEqual({ enabled: true, strength: 2 });
        expect(isFrameGraphPostEffectId(id)).toBe(false);
        expect(FRAME_GRAPH_INSTANCE_EFFECT_TYPES).not.toContain(id);
        const first = payload(true, 1.4);
        expect(effectKeyframePayloadSchema.safeParse(first).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ ...first, instanceId: "fx-gi" }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ ...first, value: { ...first.value, volume: null } }).success).toBe(false);
        const snapshot: EditorActionAvailabilitySnapshot = { hasSelectedTimelineTrack: false, hasSelectedFrame: false, selectedTrackKeyframeCount: 0, hasEditableInterpolationChannels: false, hasInterpolationClipboard: false };
        expect(canExecuteEditorAction({ type: "keyframe.registerEffect", source: "panel", instanceId: id }, snapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "keyframe.registerEffect", source: "panel", instanceId: "gamma" }, snapshot)).toBe(false);
        expect(canExecuteEditorAction({ type: "effect.setRcDiffuseGi", source: "panel", settings: { enabled: true } }, snapshot)).toBe(true);
    });

    it("saves linear strength and step enabled independently of sky and retained legacy keys", () => {
        const store = createStore();
        const legacy = { effectId: "gamma", valueVersion: 1, base: { enabled: true, gamma: 2 }, keys: [] };
        store.restore({ version: 1, tracks: [legacy] });
        store.apply("rcSkyOcclusion", 0, makeEffectPayload("rcSkyOcclusion", { enabled: true, strength: 0.75 }), { enabled: false, strength: 0.75 });
        store.apply(id, 10, payload(true, 0.4), base); store.apply(id, 30, payload(false, 1.6), base);
        const saved = store.serialize(), restored = createStore(); restored.restore(saved);
        for (const frame of [0, 10, 20, 30, 20, 9]) {
            expect(restored.evaluate(id, frame)?.enabled).toBe(frame >= 10 && frame < 30);
            expect(restored.evaluate(id, frame)?.strength).toBeCloseTo(frame < 10 ? 0.5 : frame < 30 ? 0.4 + (frame - 10) * 0.06 : 1.6);
            expect(restored.evaluate("rcSkyOcclusion", frame)).toEqual({ enabled: true, strength: 0.75 });
            expect(restored.evaluate("gamma", frame)).toBeNull();
        }
        expect(saved.tracks[0]).toEqual(legacy);
        expect(restored.serialize()).toEqual(saved);
    });

    it("keeps future ON demand through OFF keys and separates preview from capture", () => {
        const store = createStore();
        store.apply(id, 0, payload(false, 0.2), base); store.apply(id, 30, payload(true, 1.4), base);
        expect(store.canBeEnabled(id)).toBe(true);
        const original = store.snapshot(id);
        store.preview(id, 10, { enabled: true, strength: 2 }, base);
        expect(store.evaluate(id, 10, true)).toEqual({ enabled: true, strength: 2 });
        expect(store.evaluate(id, 10, false)?.enabled).toBe(false);
        expect(store.evaluate(id, 10, false)?.strength).toBeCloseTo(0.6);
        store.restoreSnapshot(id, original); expect(store.snapshot(id)).toEqual(original);
        store.remove(id, [30]); expect(store.canBeEnabled(id)).toBe(false);
        store.restoreSnapshot(id, original); expect(store.canBeEnabled(id)).toBe(true);
    });

    it("uses the timeline Command path for registration, movement and undo without touching sky", () => {
        const store = createStore(), track = { category: "effect" as const, name: id };
        store.apply("rcSkyOcclusion", 0, makeEffectPayload("rcSkyOcclusion", { enabled: true, strength: 0.75 }), { enabled: false, strength: 0.75 });
        const sky = store.snapshot("rcSkyOcclusion");
        const context: CommandExecutionContext = {
            addTimelineKeyframe: () => false, removeTimelineKeyframe: (_track, frame) => store.apply(id, frame, null, base),
            moveTimelineKeyframe: (_track, from, to) => store.move(id, from, to),
            applyTimelineKeyframePayload: (_track, frame, value) => {
                if (!value) return store.apply(id, frame, null, base);
                return value.kind === "effect" ? store.apply(id, frame, value, base) : false;
            },
            setSelectedFrame: vi.fn(), seekToBoundary: vi.fn(), refreshAfterKeyframeEdit: vi.fn(),
        };
        const command = (diff: BuiltCommand["diff"]): BuiltCommand => ({ id: "gi-key", scope: "keyframe", label: "GI", createdAtMs: 0, diff });
        const register = command({ type: "keyframe.paste", track, frame: 10, before: null, after: payload(true, 1.5) });
        expect(executeCommand(register, "apply", context)).toBe(true);
        const move = command({ type: "keyframe.move", track, fromFrame: 10, toFrame: 20, beforeFrames: [10], afterFrames: [20] });
        expect(executeCommand(move, "apply", context)).toBe(true); expect(Array.from(store.frames(id))).toEqual([20]);
        expect(executeCommand(move, "revert", context)).toBe(true); expect(Array.from(store.frames(id))).toEqual([10]);
        expect(executeCommand(register, "revert", context)).toBe(true); expect(Array.from(store.frames(id))).toEqual([]);
        expect(store.snapshot("rcSkyOcclusion")).toEqual(sky);
    });
});

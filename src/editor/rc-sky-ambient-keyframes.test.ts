import { describe, expect, it } from "vitest";
import { canExecuteEditorAction } from "../actions/action-availability";
import { EffectSceneTrackStore } from "./effect-scene-track-store";
import { effectKeyframePayloadSchema, getEffectDefinition, makeEffectPayload } from "./effect-keyframe-definitions";
import { FRAME_GRAPH_INSTANCE_EFFECT_TYPES } from "./frame-graph-instance-effects";

const id = "rcSkyAmbient";
const base = { enabled: false, strength: 0.95 };
const createStore = () => new EffectSceneTrackStore(false, [id]);

describe("Sky Ambient RC scene keys", () => {
    it("exposes a singleton key action without the experimental timeline flag", () => {
        const snapshot = { hasSelectedTimelineTrack: false, hasSelectedFrame: false,
            selectedTrackKeyframeCount: 0, hasEditableInterpolationChannels: false, hasInterpolationClipboard: false };
        expect(canExecuteEditorAction({ type: "keyframe.registerEffect", source: "button", instanceId: id }, snapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.setRcSkyAmbient", source: "button", settings: { strength: 1.5 } }, snapshot)).toBe(true);
        expect(canExecuteEditorAction({ type: "effect.recalculateRcSkyAmbientVolume", source: "button" }, snapshot)).toBe(true);
        expect(FRAME_GRAPH_INSTANCE_EFFECT_TYPES as readonly string[]).not.toContain(id);
        const payload = makeEffectPayload(id, { enabled: true, strength: 1.6 });
        expect(effectKeyframePayloadSchema.safeParse(payload).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ ...payload, instanceId: "fx-sky" }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ ...payload, value: { ...payload.value, fill: 0.1 } }).success).toBe(false);
        expect(getEffectDefinition(id).sliders[0].toValue(100)).toBe(2);
    });

    it("interpolates strength, steps enabled, and keeps authored ON demand through OFF previews", () => {
        const store = createStore();
        const on = makeEffectPayload(id, { enabled: true, strength: 0.4 });
        const off = makeEffectPayload(id, { enabled: false, strength: 1.6 });
        store.apply(id, 10, on, base); store.apply(id, 30, off, base);
        expect(store.evaluate(id, 20)).toEqual({ enabled: true, strength: 1 });
        expect(store.evaluate(id, 30)).toEqual({ enabled: false, strength: 1.6 });
        store.preview(id, 20, { enabled: false, strength: 0 }, base);
        expect(store.evaluate(id, 20, true)).toEqual({ enabled: false, strength: 0 });
        expect(store.canBeEnabled(id)).toBe(true);
        store.clearPreviews();
        const restored = createStore(); restored.restore(store.serialize());
        expect(restored.evaluate(id, 20)).toEqual({ enabled: true, strength: 1 });
        restored.remove(id, [10]);
        expect(restored.canBeEnabled(id)).toBe(false);
    });

    it("retains current edits while preserving unsupported future animation blocks", () => {
        const store = createStore(), future = { version: 99, tracks: [{ effectId: id, future: true }] };
        store.restore(future);
        expect(() => store.apply(id, 0, makeEffectPayload(id, base), base)).toThrow("newer effect animation format");
        expect(store.serialize()).toEqual(future);
    });
});

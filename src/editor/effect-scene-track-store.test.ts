import { describe, expect, it } from "vitest";
import { EffectSceneTrackStore } from "./effect-scene-track-store";
import { effectKeyframePayloadSchema, interpolateEffectValue, makeEffectPayload, type EffectDefinition } from "./effect-keyframe-definitions";

const base = { enabled: false, gamma: 1 };
describe("effect scene track foundation", () => {
    it("evaluates step enabled and logarithmic gamma in either seek direction without changing authored values", () => {
        const store = new EffectSceneTrackStore();
        store.apply("gamma", 10, makeEffectPayload("gamma", { enabled: true, gamma: 0.5 }), base);
        store.apply("gamma", 30, makeEffectPayload("gamma", { enabled: false, gamma: 2 }), base);
        const saved = store.serialize();
        expect(store.evaluate("gamma", 0)).toEqual(base);
        expect(store.evaluate("gamma", 20)).toEqual({ enabled: true, gamma: 1 });
        expect(store.evaluate("gamma", 30)).toEqual({ enabled: false, gamma: 2 });
        expect(store.evaluate("gamma", 90)).toEqual({ enabled: false, gamma: 2 });
        expect(store.evaluate("gamma", 20)).toEqual({ enabled: true, gamma: 1 });
        expect(store.serialize()).toEqual(saved);
    });
    it("separates preview from playback/export, restores it and invalidates same-frame results on edits", () => {
        const store = new EffectSceneTrackStore();
        store.apply("gamma", 0, makeEffectPayload("gamma", { enabled: true, gamma: 0.5 }), base);
        store.preview("gamma", 0, { enabled: false, gamma: 2 }, base);
        expect(store.evaluate("gamma", 0, true)?.gamma).toBe(2);
        expect(store.evaluate("gamma", 0)?.gamma).toBe(0.5);
        expect(store.base("gamma")).toEqual(base);
        const restored = new EffectSceneTrackStore(); restored.restore(store.serialize());
        expect(restored.evaluate("gamma", 0, true)?.gamma).toBe(2);
        restored.clearPreviewsOutside(10);
        expect(restored.evaluate("gamma", 0, true)?.gamma).toBe(0.5);
        store.apply("gamma", 0, makeEffectPayload("gamma", { enabled: true, gamma: 4 }), base);
        expect(store.evaluate("gamma", 0)?.gamma).toBe(4);
    });
    it("edits effects independently, rejects cross-effect payloads and removes keys atomically", () => {
        const store = new EffectSceneTrackStore();
        const key = makeEffectPayload("grain", { enabled: true, intensity: 50 });
        expect(store.apply("gamma", 0, key, base)).toBe(false);
        store.apply("grain", 0, key, { enabled: false, intensity: 0 });
        store.apply("grain", 20, makeEffectPayload("grain", { enabled: false, intensity: 100 }), {});
        expect(store.evaluate("grain", 10)).toEqual({ enabled: true, intensity: 75 });
        const saved = store.serialize();
        expect(store.remove("grain", [0, 999])).toBe(false);
        expect(store.serialize()).toEqual(saved);
        expect(store.move("grain", 20, 40)).toBe(true);
        expect([...store.frames("grain")]).toEqual([0, 40]);
        store.remove("grain", [0, 40]);
        expect(store.evaluate("grain", 40)).toEqual({ enabled: false, intensity: 0 });
        store.apply("grain", 0, key, {});
        expect(store.read("grain", 0)).toEqual(key);
    });
    it("round-trips empty tracks and unknown effects, normalizes invalid data, ignores the old gamma format", () => {
        const store = new EffectSceneTrackStore();
        store.restore({ gammaAnimation: { gammas: [2] } });
        expect(store.ids()).toEqual([]);
        const unknown = { effectId: "future", valueVersion: 3, keys: [{ frame: 1, value: { extra: 4 } }] };
        store.restore({ version: 1, tracks: [unknown, { effectId: "gamma", valueVersion: 1, base, keys: [
            { frame: -1, value: {} }, { frame: 10, value: { gamma: 99 } }, { frame: 10, value: { enabled: true, gamma: 0 } },
        ] }] });
        expect(store.read("gamma", 10)?.value).toEqual({ enabled: true, gamma: 0.25 });
        expect(store.serialize().tracks[0]).toEqual(unknown);
        store.preview("grain", 12, { enabled: false, intensity: 23 }, {});
        const restored = new EffectSceneTrackStore(); restored.restore(store.serialize());
        expect(restored.serialize()).toEqual(store.serialize());
    });
    it("preserves an unsupported block verbatim and refuses edits that would overwrite it", () => {
        const store = new EffectSceneTrackStore();
        const future = { version: 2, tracks: [{ effectId: "gamma", newValue: 123 }], extra: "retain" };
        store.restore(future);
        expect(store.evaluate("gamma", 0)).toBeNull();
        expect(() => store.preview("gamma", 0, base, base)).toThrow("newer effect animation format");
        expect(store.serialize()).toEqual(future);
    });
    it("supports several independent fields atomically without adding store branches", () => {
        const definition: EffectDefinition = { id: "grain", slider: { field: "weight", min: 0, max: 1, toValue: n => n, toPosition: n => n }, fields: {
            enabled: { kind: "step", default: false }, weight: { kind: "linear", min: 0, max: 2, default: 1 }, threshold: { kind: "linear", min: 0, max: 2, default: 1 },
        } };
        expect(interpolateEffectValue(definition, { enabled: true, weight: 0, threshold: 2 }, { enabled: false, weight: 2, threshold: 0 }, 0.25))
            .toEqual({ enabled: true, weight: 0.5, threshold: 1.5 });
    });
    it("validates automation values against the same field definitions", () => {
        expect(effectKeyframePayloadSchema.safeParse(makeEffectPayload("grain", { enabled: true, intensity: 20 })).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ kind: "effect", effectId: "gamma", value: { enabled: true, intensity: 20 } }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ kind: "effect", effectId: "grain", value: { enabled: true, intensity: 101 } }).success).toBe(false);
    });
});

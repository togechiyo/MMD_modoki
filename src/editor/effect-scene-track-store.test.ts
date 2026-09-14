import { describe, expect, it } from "vitest";
import { EffectSceneTrackStore } from "./effect-scene-track-store";
import { effectKeyframePayloadSchema, getEffectDefinition, interpolateEffectValue, makeEffectPayload, type EffectDefinition, type EffectId } from "./effect-keyframe-definitions";

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
        const definition: EffectDefinition = { id: "grain", sliders: [{ field: "weight", min: 0, max: 1, toValue: n => n, toPosition: n => n }], fields: {
            enabled: { kind: "step", default: false }, weight: { kind: "linear", min: 0, max: 2, default: 1 }, threshold: { kind: "linear", min: 0, max: 2, default: 1 },
        } };
        expect(interpolateEffectValue(definition, { enabled: true, weight: 0, threshold: 2 }, { enabled: false, weight: 2, threshold: 0 }, 0.25))
            .toEqual({ enabled: true, weight: 0.5, threshold: 1.5 });
    });
    it("registers, interpolates, previews and round-trips the complete bloom value", () => {
        const store = new EffectSceneTrackStore();
        const from = makeEffectPayload("bloom", { enabled: true, weight: 2, threshold: 0 });
        const to = makeEffectPayload("bloom", { enabled: false, weight: 0, threshold: 2 });
        store.apply("bloom", 0, from, {});
        store.apply("bloom", 20, to, {});
        expect(store.evaluate("bloom", 5)).toEqual({ enabled: true, weight: 1.5, threshold: 0.5, kernel: 100 });
        expect(store.evaluate("bloom", 20)).toEqual(to.value);
        store.preview("bloom", 5, { enabled: false, weight: 0.2, threshold: 0.8 }, {});
        expect(store.evaluate("bloom", 5)).toEqual({ enabled: true, weight: 1.5, threshold: 0.5, kernel: 100 });
        const restored = new EffectSceneTrackStore(); restored.restore(store.serialize());
        expect(restored.evaluate("bloom", 5, true)).toEqual({ enabled: false, weight: 0.2, threshold: 0.8, kernel: 100 });
        expect(restored.read("bloom", 0)).toEqual(from);
        expect(effectKeyframePayloadSchema.safeParse(from).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ kind: "effect", effectId: "bloom", value: { enabled: true, weight: 1 } }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ kind: "effect", effectId: "bloom", value: { enabled: true, weight: 1, threshold: 3 } }).success).toBe(false);
    });
    it.each([
        ["vignette", "weight", 4], ["sharpen", "edge", 4], ["chromatic", "amount", 200],
        ["edgeBlur", "strength", 3], ["distortion", "influence", 1], ["lut", "intensity", 1], ["luminous", "intensity", 4],
    ] as const)("round-trips independent %s keys and interpolates only their scalar", (id: EffectId, field, max) => {
        const store = new EffectSceneTrackStore();
        const from = makeEffectPayload(id, { enabled: true, [field]: max });
        const to = makeEffectPayload(id, { enabled: false, [field]: 0 });
        store.apply(id, 0, from, {});
        store.apply(id, 20, to, {});
        const restored = new EffectSceneTrackStore(); restored.restore(store.serialize());
        expect(restored.evaluate(id, 5)).toEqual({ ...from.value, enabled: true, [field]: max * 0.75 });
        expect(restored.evaluate(id, 20)).toEqual(to.value);
        expect(effectKeyframePayloadSchema.safeParse(from).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ ...from, value: { enabled: true, [field]: max + 1 } }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ ...from, value: { enabled: true, wrongField: max } }).success).toBe(false);
    });
    it("restores newly added shape fields from static settings and preserves them in old previews", () => {
        const store = new EffectSceneTrackStore();
        store.restore({ version: 1, tracks: [{ effectId: "luminous", valueVersion: 1,
            base: { enabled: true, intensity: 1 }, keys: [{ frame: 0, value: { enabled: true, intensity: 2 } }],
            preview: { frame: 0, value: { enabled: false, intensity: 3 } },
        }] }, () => ({ enabled: false, intensity: 0.5, threshold: 1.25, radius: 73 }));
        expect(store.evaluate("luminous", 0)).toEqual({ enabled: true, intensity: 2, threshold: 1.25, radius: 73 });
        expect(store.evaluate("luminous", 0, true)).toEqual({ enabled: false, intensity: 3, threshold: 1.25, radius: 73 });
    });
    it("interpolates all luminous shape fields while keeping the OFF state separate", () => {
        const store = new EffectSceneTrackStore();
        store.apply("luminous", 0, makeEffectPayload("luminous", { enabled: false, intensity: 4, threshold: 0, radius: 1 }), {});
        store.apply("luminous", 20, makeEffectPayload("luminous", { enabled: true, intensity: 2, threshold: 1.5, radius: 128 }), {});
        expect(store.evaluate("luminous", 10)).toEqual({ enabled: false, intensity: 3, threshold: 0.75, radius: 64.5 });
        store.apply("bloom", 0, makeEffectPayload("bloom", { enabled: true, weight: 2, threshold: 0, kernel: 1 }), {});
        store.apply("bloom", 20, makeEffectPayload("bloom", { enabled: false, weight: 0, threshold: 2, kernel: 256 }), {});
        expect(store.evaluate("bloom", 10)).toEqual({ enabled: true, weight: 1, threshold: 1, kernel: 128.5 });
    });
    it("round-trips aerial distance keys and keeps OFF separate from interpolated shape", () => {
        const store = new EffectSceneTrackStore();
        const base = { enabled: false, strength: 0.18, start: 55, range: 180 };
        store.apply("aerialPerspective", 0, makeEffectPayload("aerialPerspective", { enabled: false, strength: 0, start: 0, range: 20 }), base);
        store.apply("aerialPerspective", 20, makeEffectPayload("aerialPerspective", { enabled: true, strength: 0.6, start: 500, range: 1000 }), base);
        expect(store.evaluate("aerialPerspective", 10)).toEqual({ enabled: false, strength: 0.3, start: 250, range: 510 });
        const restored = new EffectSceneTrackStore();
        restored.restore(store.serialize());
        expect(restored.evaluate("aerialPerspective", 20)).toEqual({ enabled: true, strength: 0.6, start: 500, range: 1000 });
        expect(restored.evaluate("aerialPerspective", 10)).toEqual(store.evaluate("aerialPerspective", 10));
        expect(effectKeyframePayloadSchema.safeParse(restored.read("aerialPerspective", 20)).success).toBe(true);
    });
    it.each(["directionalLightShafts", "offsetShadow", "offsetHighlight"] as const)("round-trips every public slider of %s and preserves fractional interpolation", id => {
        const definition = getEffectDefinition(id);
        const from = makeEffectPayload(id, { enabled: false });
        const to = makeEffectPayload(id, { enabled: true });
        for (const slider of definition.sliders) {
            Object.assign(from.value, { [slider.field]: slider.toValue(0) });
            Object.assign(to.value, { [slider.field]: slider.toValue(100) });
        }
        const store = new EffectSceneTrackStore();
        store.apply(id, 0, from, from.value); store.apply(id, 20, to, from.value);
        const midpoint = store.evaluate(id, 10);
        expect(midpoint?.enabled).toBe(false);
        for (const slider of definition.sliders) expect(midpoint?.[slider.field]).toBeCloseTo((Number(Reflect.get(from.value, slider.field)) + Number(Reflect.get(to.value, slider.field))) / 2);
        const restored = new EffectSceneTrackStore(); restored.restore(store.serialize());
        expect(restored.evaluate(id, 10)).toEqual(midpoint);
        expect(restored.evaluate(id, 20)).toEqual(to.value);
        expect(effectKeyframePayloadSchema.safeParse(restored.read(id, 20)).success).toBe(true);
    });
    it("validates automation values against the same field definitions", () => {
        expect(effectKeyframePayloadSchema.safeParse(makeEffectPayload("grain", { enabled: true, intensity: 20 })).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ kind: "effect", effectId: "gamma", value: { enabled: true, intensity: 20 } }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ kind: "effect", effectId: "grain", value: { enabled: true, intensity: 101 } }).success).toBe(false);
    });
});

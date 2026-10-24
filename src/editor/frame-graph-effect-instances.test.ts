import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";
import { effectKeyframePayloadSchema, getEffectDefinition } from "./effect-keyframe-definitions";

describe("FrameGraph effect instances", () => {
    it("keeps the existing Luminous add-menu defaults independently of other instances", () => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a", undefined, undefined, "luminous");
        expect(store.staticValue("fx-a")).toEqual({ enabled: true, intensity: 1, threshold: 0.15, radius: 48 });
    });
    it.each(["luminous", "ssao", "ssgi", "ssr", "motionBlur"] as const)("interpolates %s values, steps enabled and preserves independent fixed settings on restore", type => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a", undefined, undefined, type); store.add("fx-b", undefined, undefined, type);
        const definition = getEffectDefinition(type);
        const from = store.capture("fx-a", 0), to = store.capture("fx-a", 20);
        from.value.enabled = false;
        for (const slider of definition.sliders) { Reflect.set(from.value, slider.field, slider.toValue(slider.min)); Reflect.set(to.value, slider.field, slider.toValue(slider.max)); }
        store.apply("fx-a", 0, from); store.apply("fx-a", 20, to);
        expect(store.value("fx-a", 10).enabled).toBe(false); expect(store.value("fx-a", 20).enabled).toBe(true);
        for (const slider of definition.sliders) expect(store.value("fx-a", 10)[slider.field]).toBeCloseTo((Number(Reflect.get(from.value, slider.field)) + Number(Reflect.get(to.value, slider.field))) / 2);
        expect(effectKeyframePayloadSchema.safeParse(store.read("fx-a", 20)).success).toBe(true);
        if (type !== "ssr") store.setFixedSettings("fx-a", { color: { r: 1, g: 0, b: 0 }, toonInfluence: 0.2, blendMode: "overlay", samples: 64, radiance: { enabled: true, strength: 3, range: 20 } });
        const before = store.serialize(); store.duplicate("fx-a", "fx-c");
        const copy = store.serialize().instances.find(item => item.instanceId === "fx-c");
        expect(copy?.fixedSettings).toEqual(before.instances[0].fixedSettings);
        store.restore(before); expect(store.serialize()).toEqual(before);
        expect(store.frames("fx-b")).toHaveLength(0);
    });
    it.each(["grain", "sharpen", "chromatic", "vignette", "edgeBlur", "distortion", "bloom", "lut", "aerialPerspective", "directionalLightShafts", "offsetShadow", "offsetHighlight", "luminous", "ssao", "ssgi", "ssr", "motionBlur"] as const)("owns independent %s settings and tracks", type => {
        const store = new FrameGraphEffectInstances();
        store.add("fx-a", undefined, undefined, type); store.add("fx-b", undefined, undefined, type);
        expect(store.type("fx-a")).toBe(type);
        const initial = store.capture("fx-a", 0);
        const field = Object.keys(initial.value).find(key => key !== "enabled") ?? "";
        const other = store.staticValue("fx-b");
        store.setValue("fx-a", { ...initial.value, [field]: 0.5 }, 0);
        expect(store.staticValue("fx-b")).toEqual(other);
        expect(initial.effectId).toBe(type);
        expect(store.apply("fx-a", 0, initial)).toBe(true);
        expect(store.frames("fx-b")).toHaveLength(0);
        expect(store.apply("fx-a", 10, { kind: "effect", effectId: "gamma", instanceId: "fx-a", value: { enabled: true, gamma: 2 } })).toBe(false);
        const saved = store.serialize(); store.restore(saved); expect(store.serialize()).toEqual(saved);
    });
    it("duplicates Bloom color without sharing it and preserves it across key edits", () => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a", undefined, undefined, "bloom");
        store.setBloomColor("fx-a", { r: 0.2, g: 0.3, b: 0.4 });
        store.apply("fx-a", 0, store.capture("fx-a", 0)); store.duplicate("fx-a", "fx-b");
        store.setBloomColor("fx-b", { r: 1, g: 0, b: 0 });
        expect(store.bloomColor("fx-a")).toEqual({ r: 0.2, g: 0.3, b: 0.4 });
        store.restore(store.serialize()); expect(store.bloomColor("fx-b")).toEqual({ r: 1, g: 0, b: 0 });
        expect(store.capture("fx-b", 0).instanceId).toBe("fx-b");
    });
    it("keeps same-type values and keys independent across reordering and preview", () => {
        const store = new FrameGraphEffectInstances(); store.syncLegacyOrder(["bloom"]);
        store.add("fx-a"); store.add("fx-b");
        store.setValue("fx-a", { enabled: true, gamma: 0.5 }, 0);
        store.setValue("fx-b", { enabled: true, gamma: 2 }, 0);
        store.apply("fx-a", 0, store.capture("fx-a", 0));
        store.setValue("fx-a", { enabled: false, gamma: 2 }, 20);
        store.apply("fx-a", 20, store.capture("fx-a", 20));
        expect(store.value("fx-a", 10, false)).toEqual({ enabled: true, gamma: 1 });
        expect(store.value("fx-b", 10, false).gamma).toBe(2);
        store.setOrder(["fx-a", "bloom", "fx-b"]); store.syncLegacyOrder(["bloom", "ssao"]);
        expect(store.order()).toEqual(["fx-a", "bloom", "fx-b", "ssao"]);
        const saved = store.serialize(); store.setValue("fx-a", { enabled: false, gamma: 4 }, 10);
        expect(store.value("fx-a", 10, true).gamma).toBe(4);
        expect(store.value("fx-a", 10, false).gamma).toBe(1);
        store.restore(saved); expect(store.value("fx-a", 10, true).gamma).toBe(1);
        expect(store.read("fx-b", 0)).toBeNull();
    });
    it("suspends the same identity, duplicates keys, rejects wrong references and restores atomically", () => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a");
        store.apply("fx-a", 10, store.capture("fx-a", 0)); store.duplicate("fx-a", "fx-b");
        expect(store.frames("fx-b")).toEqual(new Uint32Array([10]));
        expect(store.apply("fx-b", 20, store.capture("fx-a", 0))).toBe(false);
        store.suspend("fx-a"); expect(store.order()).toEqual(["fx-b"]);
        expect(store.frames("fx-a")).toEqual(new Uint32Array([10]));
        store.resume("fx-a"); expect(store.order()).toEqual(["fx-b", "fx-a"]);
        const saved = store.serialize();
        expect(() => store.restore({ ...saved, order: ["fx-a", "fx-a"] })).toThrow();
        expect(store.serialize()).toEqual(saved);
    });
});

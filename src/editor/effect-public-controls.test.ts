import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";
import { effectKeyframePayloadSchema, getEffectDefinition, EFFECT_KEYFRAME_DEFINITIONS } from "./effect-keyframe-definitions";
import { visibleInstanceFixedFields } from "./frame-graph-instance-fixed-settings";

describe("public effect controls", () => {
    it("keys only enabled, public sliders and the DoF target selectors for every effect", () => {
        for (const definition of EFFECT_KEYFRAME_DEFINITIONS) {
            const selectors = definition.id === "dof" ? ["focusMode", "targetModelInstanceId", "targetBoneName"] : [];
            expect(Object.keys(definition.fields).sort(), definition.id).toEqual(["enabled", ...selectors, ...definition.sliders.map(item => item.field)].sort());
        }
        expect(getEffectDefinition("dof").sliders.map(item => item.field)).toEqual(["focusOffset", "lensSize"]);
    });
    it("does not expose internal fixed settings just because a stored value exists", () => {
        expect(visibleInstanceFixedFields("ssao")).toEqual([]); expect(visibleInstanceFixedFields("ssgi")).toEqual([]);
        expect(visibleInstanceFixedFields("offsetShadow")).toEqual(["color"]);
        expect(visibleInstanceFixedFields("luminous")).toEqual(["radiance"]);
        expect(visibleInstanceFixedFields("motionBlur")).toEqual(["samples"]);
    });
    it("drops hidden optics from loaded settings, key bases, keys and previews, preserving target keys", () => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a", undefined, undefined, "dof");
        const hidden = { focusDistance: 12345, fStop: 7, focalLength: 90 };
        store.setValue("fx-a", { ...store.staticValue("fx-a"), focusMode: "model-target", targetModelInstanceId: "model-a", targetBoneName: "頭" }, 0);
        store.apply("fx-a", 10, store.capture("fx-a", 10));
        const saved = store.serialize(), instance = saved.instances[0]; Object.assign(instance.settings, hidden);
        const track = instance.animation.tracks[0] as { base: object; keys: { frame: number; value: object }[]; preview?: { frame: number; value: object } };
        Object.assign(track.base, hidden); Object.assign(track.keys[0].value, hidden); track.preview = { frame: 10, value: { ...track.keys[0].value, ...hidden } };
        store.restore(saved);
        const normalized = store.serialize();
        for (const field of Object.keys(hidden)) expect(JSON.stringify(normalized)).not.toContain(`"${field}"`);
        expect(store.frames("fx-a")).toEqual(new Uint32Array([10]));
        expect(store.capture("fx-a", 10).value).toMatchObject({ targetModelInstanceId: "model-a", targetBoneName: "頭" });
        expect(effectKeyframePayloadSchema.safeParse(store.capture("fx-a", 10)).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ ...store.capture("fx-a", 10), value: { ...store.capture("fx-a", 10).value, ...hidden } }).success).toBe(false);
        store.setValue("fx-a", { ...store.staticValue("fx-a"), focusMode: "manual", ...hidden }, 20);
        expect(store.value("fx-a", 20, true).focusMode).toBe("person-auto");
    });
});

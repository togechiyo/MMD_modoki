import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";
import { FRAME_GRAPH_INSTANCE_EFFECT_TYPES, isEffectInstanceSupported } from "./frame-graph-instance-effects";

describe("effect instance backend support", () => {
    it("skips GPU-only instances on WebGL without losing saved settings or animation", () => {
        const store = new FrameGraphEffectInstances();
        for (const type of FRAME_GRAPH_INSTANCE_EFFECT_TYPES) store.add(`fx-${type}`, undefined, undefined, type);
        store.apply("fx-ssgi", 30, store.capture("fx-ssgi", 30));
        const saved = store.serialize();
        const renderable = (webgpu: boolean, compute: boolean) => store.ids().filter(id => {
            const type = store.type(id);
            return type !== null && isEffectInstanceSupported(type, webgpu, compute);
        });
        const webgl = renderable(false, false);
        expect(store.ids().filter(id => !webgl.includes(id))).toEqual([
            "fx-directionalLightShafts", "fx-luminousRadiance", "fx-ssgi",
        ]);
        expect(store.serialize()).toEqual(saved);
        const restored = new FrameGraphEffectInstances(); restored.restore(saved);
        expect(restored.serialize()).toEqual(saved);
        expect(renderable(true, true)).toEqual(store.ids());
        expect(renderable(true, false)).toContain("fx-directionalLightShafts");
        expect(renderable(true, false)).not.toContain("fx-ssgi");
        expect(renderable(true, false)).not.toContain("fx-luminousRadiance");
    });
});

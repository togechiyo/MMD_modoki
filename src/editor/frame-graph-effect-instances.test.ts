import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";

describe("FrameGraph effect instances", () => {
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

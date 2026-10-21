import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances } from "../editor/frame-graph-effect-instances";
import { applyEffectInstanceDiff, buildEffectInstanceDiff } from "./effect-instance-command";

describe("effect instance command diffs", () => {
    it("captures only changed instances and preserves later key changes while undoing a rename", () => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a"); store.add("fx-b");
        const before = store.serialize(); store.rename("fx-a", "A");
        const diff = buildEffectInstanceDiff(before, store.serialize());
        expect(diff?.changes.map(item => item.instanceId)).toEqual(["fx-a"]);
        store.apply("fx-a", 10, store.capture("fx-a", 10));
        const reverted = applyEffectInstanceDiff(store.serialize(), diff, "revert");
        expect(reverted?.instances[0].label).toBe("Gamma 1");
        expect(reverted?.instances[0].animation.tracks).toHaveLength(1);
        expect(store.label("fx-a")).toBe("A");
    });
    it("undoes creation after an undone first key and rejects a stale authored value without partial changes", () => {
        const store = new FrameGraphEffectInstances(), before = store.serialize();
        store.add("fx-a"); const after = store.serialize(), diff = buildEffectInstanceDiff(before, after);
        store.apply("fx-a", 10, store.capture("fx-a", 10)); store.apply("fx-a", 10, null);
        expect(applyEffectInstanceDiff(store.serialize(), diff, "revert")).toEqual(before);
        store.setValue("fx-a", { enabled: true, gamma: 2 }, 0);
        expect(applyEffectInstanceDiff(store.serialize(), diff, "revert")).toEqual(before);
        store.delete("fx-a"); store.restore(after); store.setValue("fx-a", { enabled: true, gamma: 2 }, 0);
        expect(applyEffectInstanceDiff(store.serialize(), diff, "revert")).toBeNull();
        expect(store.staticValue("fx-a").gamma).toBe(2);
    });
    it("reorders across a singleton effect and requires the matching order before undo", () => {
        const store = new FrameGraphEffectInstances(); store.syncLegacyOrder(["bloom"]); store.add("fx-a");
        const before = store.serialize(); store.setOrder(["fx-a", "bloom"]);
        const diff = buildEffectInstanceDiff(before, store.serialize());
        expect(diff?.changes).toEqual([]);
        expect(applyEffectInstanceDiff(store.serialize(), diff, "revert")).toEqual(before);
        store.setOrder(["fx-a"]);
        expect(applyEffectInstanceDiff(store.serialize(), diff, "revert")).toBeNull();
    });
});

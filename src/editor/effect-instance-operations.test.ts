import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";
import { editEffectInstances } from "./effect-instance-operations";
import { applyEffectInstanceDiff, buildEffectInstanceDiff } from "../actions/effect-instance-command";

describe("effect stack drag operations", () => {
    it.each([
        ["fx-a", "fx-c", "before", ["bloom", "fx-b", "fx-c", "fx-a"]],
        ["fx-c", "fx-a", "after", ["fx-c", "fx-a", "bloom", "fx-b"]],
        ["bloom", "fx-c", "before", ["fx-a", "fx-b", "fx-c", "bloom"]],
    ] as const)("moves %s %s %s in display order with a single reversible order diff", (draggedId, targetId, placement, expected) => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a"); store.add("fx-b"); store.add("fx-c");
        store.apply("fx-a", 10, store.capture("fx-a", 10)); store.setOrder(["fx-a", "bloom", "fx-b", "fx-c"]);
        const before = store.serialize(); editEffectInstances(store, { action: "reorder", draggedId, targetId, placement });
        expect(store.order()).toEqual(expected); expect(store.serialize().instances).toEqual(before.instances);
        const diff = buildEffectInstanceDiff(before, store.serialize()); expect(diff?.changes).toEqual([]);
        expect(applyEffectInstanceDiff(store.serialize(), diff, "revert")).toEqual(before);
    });
    it.each([["fx-a", "fx-a"], ["missing", "fx-a"], ["fx-a", "missing"], ["fx-suspended", "fx-a"]])("ignores a missing, suspended or identical target: %s to %s", (draggedId, targetId) => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a"); store.add("fx-suspended"); store.suspend("fx-suspended");
        const before = store.serialize(); editEffectInstances(store, { action: "reorder", draggedId, targetId, placement: "after" });
        expect(store.serialize()).toEqual(before);
    });
});

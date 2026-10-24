import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";
import { buildEffectInstanceDiff, applyEffectInstanceDiff } from "../actions/effect-instance-command";

const lut = "0 1\n0 0 0\n0 0 4095\n0 4095 0\n0 4095 4095\n4095 0 0\n4095 0 4095\n4095 4095 0\n4095 4095 4095";
describe("instance fixed settings", () => {
    it("copies and persists an embedded LUT independently of the key track", () => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a", undefined, undefined, "lut");
        store.setFixedSettings("fx-a", { lut: { kind: "external", name: "test.3dl", runtimeText: lut } });
        store.apply("fx-a", 0, store.capture("fx-a", 0)); store.duplicate("fx-a", "fx-b");
        store.setFixedSettings("fx-b", { lut: { kind: "builtin", preset: "sepia" } });
        const saved = store.serialize(); store.restore(saved);
        expect(store.fixedSettings("fx-a")?.lut).toEqual({ kind: "external", name: "test.3dl", runtimeText: lut });
        expect(store.fixedSettings("fx-b")?.lut).toEqual({ kind: "builtin", preset: "sepia" });
        expect(store.renderState("fx-a", 0, false).fixedSettings).toBe(store.renderState("fx-a", 20, false).fixedSettings);
    });
    it("rejects malformed LUTs before replacing state and preserves later keys when undoing fixed settings", () => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a", undefined, undefined, "offsetShadow");
        const before = store.serialize(); store.setFixedSettings("fx-a", { color: { r: 1, g: 0, b: 0 }, thickness: 0.4, softness: 2 });
        const diff = buildEffectInstanceDiff(before, store.serialize()); store.apply("fx-a", 10, store.capture("fx-a", 10));
        const reverted = applyEffectInstanceDiff(store.serialize(), diff, "revert");
        expect(reverted?.instances[0].fixedSettings).toEqual(before.instances[0].fixedSettings);
        expect(reverted?.instances[0].animation.tracks).toHaveLength(1);
        const saved = store.serialize();
        expect(() => store.restore({ version: 1, order: ["fx-invalid"], instances: [{ instanceId: "fx-invalid", type: "lut", label: "LUT", fixedSettings: { lut: { kind: "external", name: "bad.3dl", runtimeText: "invalid" } } }] })).toThrow();
        expect(store.serialize()).toEqual(saved);
    });
});

import { describe, expect, it } from "vitest";
import { EffectKeyframeEditState } from "./effect-keyframe-edit-state";

const before = { enabled: true, strength: 1 }, after = { enabled: true, strength: 1.5 };
describe("effect keyframe edit state", () => {
    it("starts empty and marks only the changed instance", () => {
        const edits = new EffectKeyframeEditState();
        expect(edits.state("fx-a", 0, before, null)).toBe("none");
        edits.mark("fx-a", 0, before, after);
        expect(edits.state("fx-a", 0, after, null)).toBe("dirty");
        expect(edits.state("fx-b", 0, after, null)).toBe("none");
    });
    it("recognizes Undo, Redo, and returning to the original static value", () => {
        const edits = new EffectKeyframeEditState();
        edits.mark("fx-a", 0, before, after);
        expect(edits.state("fx-a", 0, before, null)).toBe("none");
        expect(edits.state("fx-a", 0, after, null)).toBe("dirty");
        edits.mark("fx-a", 0, after, before);
        expect(edits.state("fx-a", 0, before, null)).toBe("none");
    });
    it("prioritizes the actual key, returning to dirty when a registration is undone", () => {
        const edits = new EffectKeyframeEditState(); edits.mark("fx-a", 0, before, after);
        expect(edits.state("fx-a", 0, after, after)).toBe("registered");
        expect(edits.state("fx-a", 0, before, after)).toBe("dirty");
        expect(edits.state("fx-a", 0, after, after)).toBe("registered");
        expect(edits.state("fx-a", 0, after, null)).toBe("dirty");
    });
    it("clears pending edits on seek and reset, preserving restored key indicators", () => {
        const edits = new EffectKeyframeEditState(); edits.mark("fx-a", 0, before, after);
        expect(edits.state("fx-a", 10, after, null)).toBe("none");
        expect(edits.state("fx-a", 0, after, null)).toBe("none");
        edits.mark("fx-a", 0, before, after); edits.reset();
        expect(edits.state("fx-a", 0, after, null)).toBe("none");
        expect(edits.state("fx-a", 0, after, after)).toBe("registered");
    });
    it("compares DoF target references and ON/OFF without depending on field order", () => {
        const edits = new EffectKeyframeEditState();
        const value = { ...before, targetModelInstanceId: "model-a", targetBoneName: "頭" };
        expect(edits.state("fx-a", 0, { targetBoneName: "頭", targetModelInstanceId: "model-a", strength: 1 + 1e-12, enabled: true }, value)).toBe("registered");
        expect(edits.state("fx-a", 0, { ...value, targetModelInstanceId: "model-b" }, value)).toBe("dirty");
        expect(edits.state("fx-a", 0, { ...value, enabled: false }, value)).toBe("dirty");
    });
    it("does not create a pending key for unchanged values or fixed-setting-only edits", () => {
        const edits = new EffectKeyframeEditState(); edits.mark("fx-a", 0, before, { ...before });
        expect(edits.state("fx-a", 0, before, null)).toBe("none");
    });
});

import { describe, expect, it } from "vitest";
import { buildClipboardOperations, buildSelectionOperations, keySelectionSchema, resolveKeySelection } from "../../src/automation/keyframe-selection";
import { buildAutomationKeyframeEdit } from "../../src/automation/keyframe-edit";

const track = { category: "morph" as const, name: "smile" };
const payload = { kind: "morph" as const, weights: [0.5] };
const tracks = [{ ...track, frames: [0, 10, 20] }, { category: "morph" as const, name: "blink", frames: [10, 30] }];
describe("MCP key selection and clipboard", () => {
    it("selects inclusive sparse ranges with optional track filtering", () => {
        expect(resolveKeySelection({ kind: "range", startFrame: 10, endFrame: 20, tracks: [track] }, tracks)).toEqual([{ track, frame: 10 }, { track, frame: 20 }]);
        expect(resolveKeySelection({ kind: "range", startFrame: 10, endFrame: 20 }, tracks)).toHaveLength(3);
        expect(resolveKeySelection({ kind: "clear" }, tracks)).toEqual([]);
    });
    it("rejects missing, duplicate or ambiguous keys before changing a selection", () => {
        expect(() => resolveKeySelection({ kind: "keys", keys: [{ track, frame: 1 }] }, tracks)).toThrow("KEY_NOT_FOUND");
        expect(() => resolveKeySelection({ kind: "keys", keys: [{ track, frame: 10 }, { track, frame: 10 }] }, tracks)).toThrow("DUPLICATE_KEY");
        expect(() => resolveKeySelection({ kind: "range", startFrame: 0, endFrame: 20 }, [tracks[0], tracks[0]])).toThrow("TRACK_NOT_UNIQUE");
        expect(keySelectionSchema.safeParse({ kind: "range", startFrame: 20, endFrame: 10 }).success).toBe(false);
    });
    it("bounds a broad range without silently truncating", () => {
        expect(() => resolveKeySelection({ kind: "range", startFrame: 0, endFrame: 1000 }, [{ ...track, frames: Array.from({ length: 101 }, (_, i) => i) }])).toThrow("KEY_SELECTION_TOO_LARGE");
    });
    it("pastes snapshots at relative frames independently of changes to the source", () => {
        const ops = buildClipboardOperations([{ track, frameOffset: 0, payload }, { track, frameOffset: 10, payload }], 40);
        expect(ops.map(op => op.frame)).toEqual([40, 50]);
        const diff = buildAutomationKeyframeEdit({ kind: "model", modelInstanceId: "m" }, ops, "replace", () => null);
        expect(diff.items.map(item => item.after)).toEqual([payload, payload]);
        expect(diff.items[0].after).not.toBe(payload);
    });
    it("rejects overflow, empty and oversized clipboard edits", () => {
        expect(() => buildClipboardOperations([{ track, frameOffset: 10, payload }], 1000000)).toThrow("FRAME_OUT_OF_RANGE");
        expect(() => buildClipboardOperations([], 0)).toThrow("KEY_SELECTION_EMPTY");
        expect(() => buildSelectionOperations(Array.from({ length: 101 }, (_, frame) => ({ track, frame })), "delete")).toThrow("KEY_SELECTION_TOO_LARGE");
        expect(() => buildSelectionOperations([{ track, frame: 0 }], "move", -1)).toThrow("FRAME_OUT_OF_RANGE");
    });
    it("uses existing transactional collision handling for paste and overlapping moves", () => {
        const scope = { kind: "model" as const, modelInstanceId: "m" };
        const read = (_track: typeof track, frame: number) => frame === 10 || frame === 20 ? { ...payload, weights: [frame / 100] } : null;
        const ops = buildSelectionOperations([{ track, frame: 10 }, { track, frame: 20 }], "move", 10);
        const diff = buildAutomationKeyframeEdit(scope, ops, "reject", read);
        expect(diff.items.find(item => item.frame === 20).after).toEqual({ ...payload, weights: [0.1] });
        expect(diff.items.find(item => item.frame === 30).after).toEqual({ ...payload, weights: [0.2] });
        expect(() => buildAutomationKeyframeEdit(scope, buildClipboardOperations([{ track, frameOffset: 0, payload }], 10), "reject", read)).toThrow("KEY_COLLISION");
    });
});

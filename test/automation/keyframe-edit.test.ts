import { describe, expect, it } from "vitest";
import { buildAutomationKeyframeEdit } from "../../src/automation/keyframe-edit";
import { keyframeOperationSchema } from "../../src/automation/keyframe-schema";
import { executeKeyframeTransaction, keyframeValuesEqual, type KeyframeScope } from "../../src/actions/keyframe-transaction";
import type { TimelineKeyframePayload } from "../../src/editor/timeline-edit-service";

const track = { category: "morph" as const, name: "smile" };
const owner: KeyframeScope = { kind: "model", modelInstanceId: "model-1" };
const value = (weight: number): TimelineKeyframePayload => ({ kind: "morph", weights: [weight] });
describe("MCP keyframe transaction", () => {
    it("moves overlapping keys from original snapshots and undoes them as one batch", () => {
        const keys = new Map<number, TimelineKeyframePayload>([[0, value(0.1)], [10, value(0.2)]]);
        const read = (_track: unknown, frame: number) => keys.get(frame) ?? null;
        const diff = buildAutomationKeyframeEdit(owner, [
            { action: "move", track, frame: 0, toFrame: 10 }, { action: "move", track, frame: 10, toFrame: 20 },
        ], "reject", read);
        let batches = 0;
        const host = { scope: () => owner, read, write: (_track: unknown, frame: number, payload: TimelineKeyframePayload | null) => {
            if (payload) keys.set(frame, structuredClone(payload)); else keys.delete(frame);
            return true;
        }, begin: () => { batches++; }, end: () => { batches--; } };
        expect(executeKeyframeTransaction(diff, "apply", host)).toBe(true);
        expect([...keys.keys()].sort()).toEqual([10, 20]);
        expect(keys.get(10)).toEqual(value(0.1));
        expect(keys.get(20)).toEqual(value(0.2));
        expect(executeKeyframeTransaction(diff, "revert", host)).toBe(true);
        expect(keys.get(0)).toEqual(value(0.1));
        expect(keys.get(10)).toEqual(value(0.2));
        expect(batches).toBe(0);
    });
    it("rejects collisions, duplicates and absent source keys without writing", () => {
        const read = () => value(0.5);
        expect(() => buildAutomationKeyframeEdit(owner, [{ action: "set", track, frame: 1, payload: { kind: "morph", weights: [0.7] } }], "reject", read)).toThrow("KEY_COLLISION");
        expect(() => buildAutomationKeyframeEdit(owner, [0, 0].map(frame => ({ action: "copy", track, frame, toFrame: 3 })), "replace", read)).toThrow("DUPLICATE_KEY");
        expect(() => buildAutomationKeyframeEdit(owner, [{ action: "delete", track, frame: 1 }], "replace", () => null)).toThrow("KEY_NOT_FOUND");
    });
    it("rejects changed scope and manual edits before the first mutation", () => {
        const diff = buildAutomationKeyframeEdit(owner, [{ action: "set", track, frame: 0, payload: { kind: "morph", weights: [0.7] } }], "replace", () => value(0.1));
        let writes = 0;
        const host = { scope: () => ({ kind: "camera" as const }), read: () => value(0.1), write: () => { writes++; return true; }, begin: () => undefined, end: () => undefined };
        expect(executeKeyframeTransaction(diff, "apply", host)).toBe(false);
        expect(executeKeyframeTransaction(diff, "revert", { ...host, scope: () => owner, read: () => value(0.9) })).toBe(false);
        expect(writes).toBe(0);
    });
    it("rolls back even a partially mutated failing write and balances the batch", () => {
        const keys = new Map<number, TimelineKeyframePayload>([[0, value(0.1)], [1, value(0.2)]]);
        const read = (_track: unknown, frame: number) => keys.get(frame) ?? null;
        const diff = buildAutomationKeyframeEdit(owner, [0, 1].map(frame => ({ action: "set", track, frame, payload: { kind: "morph", weights: [0.8] } })), "replace", read);
        let failed = false;
        let batches = 0;
        expect(executeKeyframeTransaction(diff, "apply", { scope: () => owner, read,
            write: (_track, frame, payload) => {
                if (payload) keys.set(frame, payload); else keys.delete(frame);
                if (frame === 1 && !failed) { failed = true; return false; }
                return true;
            }, begin: () => { batches++; }, end: () => { batches--; },
        })).toBe(false);
        expect(keys.get(0)).toEqual(value(0.1));
        expect(keys.get(1)).toEqual(value(0.2));
        expect(batches).toBe(0);
    });
    it("accepts Float32 readback and field ordering, while retaining value conflicts", () => {
        expect(keyframeValuesEqual(value(0.1), { weights: [Math.fround(0.1)], kind: "morph" })).toBe(true);
        expect(keyframeValuesEqual(value(0.1), value(0.2))).toBe(false);
        expect(keyframeValuesEqual({ modelPath: null }, { modelPath: null, modelInstanceId: null })).toBe(true);
        expect(buildAutomationKeyframeEdit(owner, [{ action: "set", track, frame: 0, payload: { kind: "morph", weights: [0.1] } }], "replace", () => value(Math.fround(0.1))).items).toEqual([]);
    });
    it("rejects geometry, malformed arrays, and non-unit quaternions", () => {
        const operation = { action: "set", track, frame: 0, payload: { kind: "morph", weights: [0.1] } };
        expect(keyframeOperationSchema.safeParse(operation).success).toBe(true);
        expect(keyframeOperationSchema.safeParse({ ...operation, payload: { ...operation.payload, vertices: [1, 2, 3] } }).success).toBe(false);
        expect(keyframeOperationSchema.safeParse({ ...operation, payload: { kind: "morph", weights: [0, 1] } }).success).toBe(false);
        expect(keyframeOperationSchema.safeParse({ ...operation, payload: { kind: "bone", rotations: [0, 0, 0, 0], rotationInterpolations: [20, 20, 107, 107], physicsToggles: [0] } }).success).toBe(false);
    });
});

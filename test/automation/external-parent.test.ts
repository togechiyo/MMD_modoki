import { describe, expect, it } from "vitest";
import { validateExternalParentTransaction, type ExternalParentModel } from "../../src/editor/external-parent-transaction";
import { buildExternalParentEdit } from "../../src/automation/external-parent-edit";
import type { KeyframeTransaction } from "../../src/actions/keyframe-transaction";
import type { MovableBoneKeyframePayload } from "../../src/editor/timeline-edit-service";

const link = (id: string | null) => ({ childBoneName: "center", parentModelInstanceId: id, parentModelPath: id ? `${id}.pmx` : null, parentBoneName: id ? "center" : null });
const bone = (id: string | null): MovableBoneKeyframePayload => ({ kind: "movableBone", positions: [2, 3, 4], positionInterpolations: Array(12).fill(20), rotations: [0, 0, 0, 1], rotationInterpolations: [20, 107, 20, 107], physicsToggles: [1], externalParent: link(id) });
const node = (id: string, entries: [number, string | null][] = []): ExternalParentModel => ({ instanceId: id, path: `${id}.pmx`, boneNames: ["center", "other"], keys: entries.map(([frame, parent]) => ({ frame, ...link(parent) })), fallback: null });
const diff = (frame: number, before: MovableBoneKeyframePayload | null, after: MovableBoneKeyframePayload | null): KeyframeTransaction => ({ type: "keyframe.transaction", owner: { kind: "model", modelInstanceId: "a" }, items: [{ frame, track: { category: "root", name: "center" }, before, after }] });

describe("external-parent transaction validation", () => {
    it("rejects a cycle that starts only at a future switch", () => {
        expect(validateExternalParentTransaction([node("a"), node("b", [[30, "a"]])], diff(0, null, bone("b")), "apply")).toMatchObject({ code: "EXTERNAL_PARENT_CYCLE", frame: 30 });
    });
    it("rejects deleting the release that previously broke a future cycle", () => {
        expect(validateExternalParentTransaction([node("a", [[0, "b"], [20, null]]), node("b", [[30, "a"]])], diff(20, bone(null), null), "apply")).toMatchObject({ code: "EXTERNAL_PARENT_CYCLE", frame: 30 });
    });
    it("validates the whole batch, even when its first write alone would cycle", () => {
        const transaction = diff(0, null, bone("b"));
        transaction.items.push(...diff(20, null, bone(null)).items);
        expect(validateExternalParentTransaction([node("a"), node("b", [[30, "a"]])], transaction, "apply")).toBeNull();
    });
    it("does not resurrect an evaluated link after deleting the last key", () => {
        const a = { ...node("a", [[0, "b"]]), fallback: link("b") };
        expect(validateExternalParentTransaction([a, node("b", [[30, "a"]])], diff(0, bone("b"), null), "apply")).toBeNull();
    });
    it("revalidates Undo against other models' current relationships", () => {
        expect(validateExternalParentTransaction([node("a"), node("b", [[0, "a"]])], diff(0, bone("b"), null), "revert")).toMatchObject({ code: "EXTERNAL_PARENT_CYCLE" });
    });
    it("rejects stale identity and a different bone's occupied frame", () => {
        const value = bone("b");
        if (value.externalParent) value.externalParent.parentModelPath = "wrong.pmx";
        expect(validateExternalParentTransaction([node("a"), node("b")], diff(0, null, value), "apply")?.code).toBe("EXTERNAL_PARENT_TARGET_CHANGED");
        const a = node("a", [[0, "b"]]);
        a.keys = a.keys.map(key => ({ ...key, childBoneName: "other" }));
        expect(validateExternalParentTransaction([a, node("b")], diff(0, null, bone("b")), "apply")?.code).toBe("EXTERNAL_PARENT_FRAME_CONFLICT");
    });
    it("rejects self parenting and forged child names", () => {
        expect(validateExternalParentTransaction([node("a")], diff(0, null, bone("a")), "apply")?.code).toBe("EXTERNAL_PARENT_CYCLE");
        const value = bone(null);
        if (value.externalParent) value.externalParent.childBoneName = "other";
        expect(validateExternalParentTransaction([node("a")], diff(0, null, value), "apply")?.code).toBe("EXTERNAL_PARENT_CHILD_MISMATCH");
    });
    it("does not remove bone relationships when a morph shares its name", () => {
        const transaction = diff(0, null, null);
        transaction.items[0].track.category = "morph";
        expect(validateExternalParentTransaction([node("a", [[0, "b"]]), node("b", [[30, "a"]])], transaction, "apply")?.code).toBe("EXTERNAL_PARENT_CYCLE");
    });
});

describe("external-parent convenience edit", () => {
    const input = { scope: { kind: "model" as const, modelInstanceId: "a" }, track: { category: "root" as const, name: "center" }, collision: "replace" as const, currentFrame: 0,
        read: () => null, capture: () => bone(null), resolveParent: (instanceId: string) => ({ instanceId, path: `${instanceId}.pmx` }) };
    it("snaps at arbitrary frames without seeking or changing captured values", () => {
        const original = bone(null);
        const result = buildExternalParentEdit({ ...input, capture: () => original, operations: [{ action: "set", frame: 30, parent: { modelInstanceId: "b", boneName: "center" }, poseMode: "snap" }] });
        expect(result.items[0].after).toMatchObject({ positions: [0, 0, 0], physicsToggles: [1], externalParent: link("b") });
        expect(original.positions).toEqual([2, 3, 4]);
    });
    it("keeps the existing local pose and interpolation on release", () => {
        const result = buildExternalParentEdit({ ...input, read: () => bone("b"), operations: [{ action: "set", frame: 30, parent: null, poseMode: "keepLocal" }] });
        expect(result.items[0].after).toEqual(bone(null));
    });
    it("requires an actual local pose instead of reusing the current frame at another time", () => {
        expect(() => buildExternalParentEdit({ ...input, operations: [{ action: "set", frame: 30, parent: null, poseMode: "keepLocal" }] })).toThrow("EXTERNAL_PARENT_LOCAL_POSE_REQUIRED");
    });
    it("distinguishes release from deleting the coupled pose key", () => {
        const result = buildExternalParentEdit({ ...input, read: () => bone("b"), operations: [{ action: "delete", frame: 0 }] });
        expect(result.items[0].after).toBeNull();
    });
    it("normalizes camera parent distance and validates the exact parent identity", () => {
        const camera = { kind: "camera" as const, positions: [1, 2, 3], positionInterpolations: Array(12).fill(20), rotations: [0, 0, 0], rotationInterpolations: [20, 107, 20, 107], distances: [-45], distanceInterpolations: [20, 107, 20, 107], fovs: [30], fovInterpolations: [20, 107, 20, 107], externalParent: { modelInstanceId: null, modelPath: null, boneName: null } };
        const result = buildExternalParentEdit({ ...input, scope: { kind: "camera" }, track: { category: "camera", name: "Camera" }, capture: () => camera,
            operations: [{ action: "set", frame: 0, parent: { modelInstanceId: "b", boneName: "center" }, poseMode: "keepLocal" }] });
        expect(result.items[0].after).toMatchObject({ positions: [1, 2, 3], distances: [0], externalParent: { modelInstanceId: "b" } });
        expect(validateExternalParentTransaction([node("b")], result, "apply")).toBeNull();
        expect(validateExternalParentTransaction([node("a")], result, "apply")?.code).toBe("EXTERNAL_PARENT_TARGET_CHANGED");
    });
});

import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";
import { effectKeyframePayloadSchema } from "./effect-keyframe-definitions";
import { dofInstanceFocusDistanceMm, resolveDofInstanceFocusTarget } from "./dof-instance-focus";

describe("DoF instance target keys", () => {
    it("switches the complete target atomically at a key and interpolates only optics", () => {
        const store = new FrameGraphEffectInstances(); store.add("fx-a", undefined, undefined, "dof");
        const from = { ...store.value("fx-a", 0), focusMode: "model-target", targetModelInstanceId: "same-file-a", targetBoneName: "頭", focusOffset: 0 };
        store.setValue("fx-a", from, 0); store.apply("fx-a", 0, store.capture("fx-a", 0));
        store.setValue("fx-a", { ...from, targetModelInstanceId: "same-file-b", targetBoneName: "首", focusOffset: 2000 }, 20);
        store.apply("fx-a", 20, store.capture("fx-a", 20));
        expect(store.value("fx-a", 19)).toMatchObject({ targetModelInstanceId: "same-file-a", targetBoneName: "頭", focusOffset: 1900 });
        expect(store.value("fx-a", 20)).toMatchObject({ targetModelInstanceId: "same-file-b", targetBoneName: "首" });
        expect(store.value("fx-a", 10)).toMatchObject({ targetModelInstanceId: "same-file-a", targetBoneName: "頭", focusOffset: 1000 });
        const saved = store.serialize(); store.duplicate("fx-a", "fx-b"); store.restore(saved);
        expect(store.read("fx-a", 20)?.value).toMatchObject({ targetModelInstanceId: "same-file-b" });
        expect(effectKeyframePayloadSchema.safeParse(store.capture("fx-a", 20)).success).toBe(true);
        expect(effectKeyframePayloadSchema.safeParse({ ...store.capture("fx-a", 20), instanceId: undefined }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ ...store.capture("fx-a", 20), value: { ...from, focusMode: "unknown" } }).success).toBe(false);
        expect(effectKeyframePayloadSchema.safeParse({ ...store.capture("fx-a", 20), value: { ...from, fStop: "2" } }).success).toBe(false);
        store.duplicate("fx-a", "fx-b");
        store.setValue("fx-b", { ...from, targetModelInstanceId: "third", targetBoneName: "" }, 20);
        store.apply("fx-b", 20, store.capture("fx-b", 20));
        expect(store.value("fx-a", 20).targetModelInstanceId).toBe("same-file-b");
    });
    it("keeps missing identity authored and falls back without borrowing another model", () => {
        const value = { enabled: true, focusMode: "model-target", targetModelInstanceId: "missing", targetBoneName: "頭", focusOffset: 500 };
        const saved = structuredClone(value), camera = { z: 15 };
        expect(resolveDofInstanceFocusTarget(value, camera, () => null, () => ({ z: 5 }))).toBe(camera);
        expect(value).toEqual(saved);
        expect(dofInstanceFocusDistanceMm(value, 15, 0.1)).toBe(14500);
        expect(dofInstanceFocusDistanceMm(value, -15, 0.1)).toBe(14500);
        expect(dofInstanceFocusDistanceMm({ ...value, focusOffset: 20000 }, 15, 0.1)).toBe(100);
        expect(dofInstanceFocusDistanceMm({ ...value, focusMode: "manual", focusDistance: 4200 }, 15, 0.1)).toBe(4200);
    });
});

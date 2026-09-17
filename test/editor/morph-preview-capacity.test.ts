import { describe, expect, it, vi } from "vitest";
import { enableDynamicMorphCapacityForPreview } from "../../src/editor/morph-preview-capacity";

function manager(capacity: number, texture = true) {
    const setCapacity = vi.fn((value: number) => { capacity = value; });
    return {
        isUsingTextureForTargets: texture,
        get numMaxInfluencers() { return capacity; },
        set numMaxInfluencers(value: number) { setCapacity(value); },
        setCapacity,
    };
}

describe("manual morph preview capacity", () => {
    it("releases animation-only limits before targets have been evaluated", () => {
        const face = manager(1);
        const eyes = manager(3);
        const otherModel = manager(1);
        enableDynamicMorphCapacityForPreview([face, eyes]);
        expect([face.numMaxInfluencers, eyes.numMaxInfluencers]).toEqual([0, 0]);
        expect(otherModel.setCapacity).not.toHaveBeenCalled();
    });

    it("does not resynchronize an already dynamic manager or attribute targets", () => {
        const dynamic = manager(0);
        const attribute = manager(2, false);
        enableDynamicMorphCapacityForPreview([dynamic, attribute]);
        expect(dynamic.setCapacity).not.toHaveBeenCalled();
        expect(attribute.setCapacity).not.toHaveBeenCalled();
    });

    it("releases a newly rebound animation's limit on the next edit only", () => {
        const face = manager(1);
        enableDynamicMorphCapacityForPreview([face]);
        enableDynamicMorphCapacityForPreview([face]);
        expect(face.setCapacity).toHaveBeenCalledTimes(1);
        face.numMaxInfluencers = 2; // registration, motion load or project restore
        expect(face.numMaxInfluencers).toBe(2);
        enableDynamicMorphCapacityForPreview([face]);
        expect(face.numMaxInfluencers).toBe(0);
    });
});

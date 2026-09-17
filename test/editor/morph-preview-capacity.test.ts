import { describe, expect, it, vi } from "vitest";
import { MorphPreviewCapacityController } from "../../src/editor/morph-preview-capacity";

function model(registered = 0, texture = true) {
    let capacity = registered;
    const setCapacity = vi.fn((value: number) => { capacity = value; });
    const manager = {
        isUsingTextureForTargets: texture, numInfluencers: 0,
        get numMaxInfluencers() { return capacity; },
        set numMaxInfluencers(value: number) { setCapacity(value); },
    };
    return { currentAnimation: (registered ? {} : null) as object | null,
        morph: { morphTargetManagers: [manager] }, manager, setCapacity };
}

describe("morph preview reserved capacity", () => {
    it.each([[0, 8], [2, 8], [6, 10], [12, 16]])("reserves registered %i plus slack as %i", (registered, expected) => {
        const target = model(registered);
        new MorphPreviewCapacityController().update(target);
        expect(target.manager.numMaxInfluencers).toBe(expected);
    });

    it("holds capacity across active-count changes, growing only on overflow", () => {
        const controller = new MorphPreviewCapacityController();
        const target = model(1);
        controller.update(target);
        for (const active of [1, 8, 0, 7]) {
            target.manager.numInfluencers = active;
            controller.update(target);
        }
        expect(target.setCapacity).toHaveBeenCalledTimes(1);
        target.manager.numInfluencers = 13; // a group expands vertex and UV targets
        controller.update(target);
        expect(target.manager.numMaxInfluencers).toBe(17);
        target.manager.numInfluencers = 0;
        controller.update(target);
        expect(target.manager.numMaxInfluencers).toBe(17);
        expect(target.setCapacity).toHaveBeenCalledTimes(2);
    });

    it("reads a new binding once and can shrink only on rebind", () => {
        const controller = new MorphPreviewCapacityController();
        const target = model(12);
        controller.update(target);
        target.currentAnimation = {};
        target.manager.numMaxInfluencers = 2;
        controller.update(target);
        expect(target.manager.numMaxInfluencers).toBe(8);
        // A newly bound count can equal our old capacity: identity still matters.
        target.currentAnimation = {};
        target.manager.numMaxInfluencers = 8;
        controller.update(target);
        expect(target.manager.numMaxInfluencers).toBe(12);
        controller.update(target);
        expect(target.manager.numMaxInfluencers).toBe(12);
    });

    it("covers delayed evaluation, no animation, and independent models", () => {
        const controller = new MorphPreviewCapacityController();
        const first = model();
        const second = model(6);
        controller.update(first);
        controller.update(second);
        first.manager.numInfluencers = 9; // WASM's later evaluation before drawing
        controller.update(first);
        expect(first.manager.numMaxInfluencers).toBe(13);
        expect(second.manager.numMaxInfluencers).toBe(10);
        second.currentAnimation = null;
        controller.update(second);
        expect(second.manager.numMaxInfluencers).toBe(8);
    });

    it("does not change vertex attribute managers or require a model", () => {
        const target = model(2, false);
        const controller = new MorphPreviewCapacityController();
        controller.update(target);
        controller.update(null);
        expect(target.setCapacity).not.toHaveBeenCalled();
    });
});

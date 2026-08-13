import { describe, expect, it } from "vitest";
import { externalParentSubtreeHasDynamicRigidBody } from "../../src/physics/model-external-parent-physics";

describe("externalParentSubtreeHasDynamicRigidBody", () => {
    const root = { parentBone: null };
    const child = { parentBone: root };
    const outsideRoot = { parentBone: null };

    it("detects a dynamic rigid body below the external-parent root", () => {
        expect(externalParentSubtreeHasDynamicRigidBody(root, [root, child], [
            { boneIndex: 0, physicsMode: 0 },
            { boneIndex: 1, physicsMode: 1 },
        ])).toBe(true);
    });

    it("ignores follow-bone bodies and dynamic bodies outside the subtree", () => {
        expect(externalParentSubtreeHasDynamicRigidBody(root, [root, child, outsideRoot], [
            { boneIndex: 1, physicsMode: 0 },
            { boneIndex: 2, physicsMode: 1 },
        ])).toBe(false);
    });

    it("stops safely when malformed bone data contains a parent cycle", () => {
        type CyclicBone = { parentBone: CyclicBone | null };
        const first: CyclicBone = { parentBone: null };
        const second: CyclicBone = { parentBone: first };
        first.parentBone = second;

        expect(externalParentSubtreeHasDynamicRigidBody(root, [first], [
            { boneIndex: 0, physicsMode: 1 },
        ])).toBe(false);
    });
});

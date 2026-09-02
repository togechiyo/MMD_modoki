import { describe, expect, it } from "vitest";

import { buildBoneTransformCommand } from "../../src/actions/bone-transform-command-builder";
import type { BoneTransformCommandSnapshot } from "../../src/actions/command-types";

const before: BoneTransformCommandSnapshot = {
    position: { x: 0, y: 1, z: 2 },
    rotation: { x: 3, y: 4, z: 5 },
};

const after: BoneTransformCommandSnapshot = {
    position: { x: 1, y: 2, z: 3 },
    rotation: { x: 4, y: 5, z: 6 },
};

describe("buildBoneTransformCommand", () => {
    it("builds a command from before and after snapshots", () => {
        const command = buildBoneTransformCommand({
            modelInstanceId: "alicia-2",
            boneName: "センター",
            frame: 12.8,
            before,
            after,
        }, 100);

        expect(command).toEqual({
            id: "edit.boneTransform:alicia-2:センター:12:100",
            label: "Edit bone transform: センター",
            scope: "edit",
            diff: {
                type: "edit.boneTransform",
                modelInstanceId: "alicia-2",
                boneName: "センター",
                frame: 12,
                before,
                after,
            },
            mergeKey: "edit.boneTransform:alicia-2:センター",
            createdAtMs: 100,
        });
    });

    it("returns null for missing bone or unchanged snapshots", () => {
        expect(buildBoneTransformCommand({
            modelInstanceId: "alicia-2",
            boneName: null,
            frame: 0,
            before,
            after,
        }, 100)).toBeNull();

        expect(buildBoneTransformCommand({
            modelInstanceId: "alicia-2",
            boneName: "センター",
            frame: 0,
            before,
            after: before,
        }, 100)).toBeNull();

        expect(buildBoneTransformCommand({
            modelInstanceId: null,
            boneName: "センター",
            frame: 0,
            before,
            after,
        }, 100)).toBeNull();
    });
});

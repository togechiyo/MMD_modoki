import { describe, expect, it } from "vitest";
import {
    OBJECT_MOTION_BLUR_MAX_UNIFORM_BONES,
    ObjectMotionBlurBoneVelocityMode,
    type ObjectMotionBlurMeshLike,
    type ObjectMotionBlurSkeletonLike,
} from "./object-motion-blur-bone-velocity";

function createSkeleton(boneCount: number, useTexture = true): ObjectMotionBlurSkeletonLike {
    return {
        bones: Array.from({ length: boneCount }),
        useTextureToStoreBoneMatrices: useTexture,
        get isUsingTextureForMatrices() {
            return this.useTextureToStoreBoneMatrices;
        },
    };
}

function createMesh(skeleton: ObjectMotionBlurSkeletonLike): ObjectMotionBlurMeshLike {
    return {
        useBones: true,
        computeBonesUsingShaders: true,
        skeleton,
    };
}

describe("ObjectMotionBlurBoneVelocityMode", () => {
    it("temporarily switches an eligible skeleton from bone textures to uniforms", () => {
        const skeleton = createSkeleton(128);
        const mode = new ObjectMotionBlurBoneVelocityMode();

        expect(mode.synchronize([createMesh(skeleton)])).toEqual({
            eligibleSkeletonCount: 1,
            forcedUniformSkeletonCount: 1,
            skippedTextureSkeletonCount: 0,
        });
        expect(skeleton.useTextureToStoreBoneMatrices).toBe(false);

        expect(mode.synchronize([createMesh(skeleton)]).forcedUniformSkeletonCount).toBe(0);
        mode.restore();
        expect(skeleton.useTextureToStoreBoneMatrices).toBe(true);
    });

    it("preserves existing uniform mode and skips oversized texture skeletons", () => {
        const existingUniformSkeleton = createSkeleton(64, false);
        const largeTextureSkeleton = createSkeleton(OBJECT_MOTION_BLUR_MAX_UNIFORM_BONES + 1);
        const mode = new ObjectMotionBlurBoneVelocityMode();

        expect(mode.synchronize([
            createMesh(existingUniformSkeleton),
            createMesh(largeTextureSkeleton),
        ])).toEqual({
            eligibleSkeletonCount: 1,
            forcedUniformSkeletonCount: 0,
            skippedTextureSkeletonCount: 1,
        });

        mode.restore();
        expect(existingUniformSkeleton.useTextureToStoreBoneMatrices).toBe(false);
        expect(largeTextureSkeleton.useTextureToStoreBoneMatrices).toBe(true);
    });
});

export const OBJECT_MOTION_BLUR_MAX_UNIFORM_BONES = 256;

export type ObjectMotionBlurSkeletonLike = {
    bones: readonly unknown[];
    useTextureToStoreBoneMatrices: boolean;
    readonly isUsingTextureForMatrices: boolean;
};

export type ObjectMotionBlurMeshLike = {
    useBones: boolean;
    computeBonesUsingShaders: boolean;
    skeleton: ObjectMotionBlurSkeletonLike | null;
};

export type ObjectMotionBlurBoneVelocityReport = {
    eligibleSkeletonCount: number;
    forcedUniformSkeletonCount: number;
    skippedTextureSkeletonCount: number;
};

/**
 * Babylon 9.2 only emits per-bone geometry velocity when the current and
 * previous bone matrices are uniforms. Keep the override local and reversible,
 * and leave unusually large skeletons on bone textures to avoid oversized
 * geometry-renderer uniform buffers.
 */
export class ObjectMotionBlurBoneVelocityMode {
    private readonly originalTextureModes = new Map<ObjectMotionBlurSkeletonLike, boolean>();

    synchronize(meshes: readonly ObjectMotionBlurMeshLike[]): ObjectMotionBlurBoneVelocityReport {
        const skeletons = new Set<ObjectMotionBlurSkeletonLike>();
        for (const mesh of meshes) {
            if (!mesh.useBones || !mesh.computeBonesUsingShaders || !mesh.skeleton) {
                continue;
            }
            skeletons.add(mesh.skeleton);
        }

        let eligibleSkeletonCount = 0;
        let forcedUniformSkeletonCount = 0;
        let skippedTextureSkeletonCount = 0;
        for (const skeleton of skeletons) {
            if (skeleton.bones.length > OBJECT_MOTION_BLUR_MAX_UNIFORM_BONES) {
                if (skeleton.isUsingTextureForMatrices) {
                    skippedTextureSkeletonCount += 1;
                }
                continue;
            }

            eligibleSkeletonCount += 1;
            if (this.originalTextureModes.has(skeleton)) {
                continue;
            }
            if (skeleton.isUsingTextureForMatrices) {
                this.originalTextureModes.set(skeleton, skeleton.useTextureToStoreBoneMatrices);
                skeleton.useTextureToStoreBoneMatrices = false;
                forcedUniformSkeletonCount += 1;
            }
        }

        return {
            eligibleSkeletonCount,
            forcedUniformSkeletonCount,
            skippedTextureSkeletonCount,
        };
    }

    restore(): void {
        for (const [skeleton, originalMode] of this.originalTextureModes) {
            skeleton.useTextureToStoreBoneMatrices = originalMode;
        }
        this.originalTextureModes.clear();
    }
}

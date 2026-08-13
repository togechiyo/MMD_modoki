export type ExternalParentPhysicsBone = {
    parentBone: ExternalParentPhysicsBone | null;
};

export type ExternalParentRigidBody = {
    boneIndex: number;
    physicsMode: number;
};

export function externalParentSubtreeHasDynamicRigidBody(
    externalParentRoot: ExternalParentPhysicsBone | null | undefined,
    runtimeBones: readonly ExternalParentPhysicsBone[] | null | undefined,
    rigidBodies: readonly ExternalParentRigidBody[] | null | undefined,
): boolean {
    if (!externalParentRoot || !runtimeBones || !rigidBodies) return false;

    for (const rigidBody of rigidBodies) {
        if (rigidBody.physicsMode === 0) continue;
        let bone = runtimeBones[rigidBody.boneIndex] ?? null;
        const visitedBones = new Set<ExternalParentPhysicsBone>();
        while (bone && bone !== externalParentRoot) {
            if (visitedBones.has(bone)) {
                bone = null;
                break;
            }
            visitedBones.add(bone);
            bone = bone.parentBone;
        }
        if (bone === externalParentRoot) return true;
    }
    return false;
}

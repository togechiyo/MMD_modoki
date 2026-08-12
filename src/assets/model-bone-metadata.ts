import type { BoneControlInfo } from "../types";

const PMX_BONE_FLAG_VISIBLE = 0x0008;
const PMX_BONE_FLAG_ROTATABLE = 0x0002;
const PMX_BONE_FLAG_MOVABLE = 0x0004;

export type ModelBoneMetadata = {
    name: string;
    flag: number;
    ik?: {
        target?: number;
        links: readonly { target?: number }[];
    };
};

export type ModelRigidBodyMetadata = {
    physicsMode?: number;
    boneIndex?: number;
};

export type CollectedModelBoneInfo = {
    boneNames: string[];
    physicsBoneNames: string[];
    boneControlInfos: BoneControlInfo[];
};

export function collectModelBoneInfo(
    metadataBones: readonly ModelBoneMetadata[],
    metadataRigidBodies: readonly ModelRigidBodyMetadata[],
): CollectedModelBoneInfo {
    const physicsBoneIndices = new Set<number>();
    for (const rigidBody of metadataRigidBodies) {
        if (!rigidBody || rigidBody.physicsMode === 0) continue;
        if (typeof rigidBody.boneIndex !== "number" || rigidBody.boneIndex < 0) continue;
        physicsBoneIndices.add(rigidBody.boneIndex);
    }

    const ikBoneIndices = new Set<number>();
    const ikAffectedBoneIndices = new Set<number>();
    for (let boneIndex = 0; boneIndex < metadataBones.length; boneIndex += 1) {
        const bone = metadataBones[boneIndex];
        if (!bone?.ik) continue;

        ikBoneIndices.add(boneIndex);
        if (typeof bone.ik.target === "number" && bone.ik.target >= 0) {
            ikAffectedBoneIndices.add(bone.ik.target);
        }
        for (const ikLink of bone.ik.links) {
            if (typeof ikLink.target === "number" && ikLink.target >= 0) {
                ikAffectedBoneIndices.add(ikLink.target);
            }
        }
    }

    const boneNames: string[] = [];
    const physicsBoneNames: string[] = [];
    const boneControlInfos: BoneControlInfo[] = [];
    const seenBoneNames = new Set<string>();
    const seenPhysicsBoneNames = new Set<string>();
    const seenBoneControlNames = new Set<string>();

    for (let boneIndex = 0; boneIndex < metadataBones.length; boneIndex += 1) {
        const bone = metadataBones[boneIndex];
        if (!bone) continue;

        const isVisible = (bone.flag & PMX_BONE_FLAG_VISIBLE) !== 0;
        const isPhysicsBone = physicsBoneIndices.has(boneIndex);
        if (isPhysicsBone && !seenPhysicsBoneNames.has(bone.name)) {
            seenPhysicsBoneNames.add(bone.name);
            physicsBoneNames.push(bone.name);
        }

        // A dynamic rigid body does not cancel the PMX editor visibility flag.
        // Visible physics bones remain normal editing targets, while hidden
        // physics-only bones are still available through the explicit toggle.
        if (isVisible && !seenBoneNames.has(bone.name)) {
            seenBoneNames.add(bone.name);
            boneNames.push(bone.name);
        }

        if ((isVisible || isPhysicsBone) && !seenBoneControlNames.has(bone.name)) {
            seenBoneControlNames.add(bone.name);
            boneControlInfos.push({
                name: bone.name,
                movable: (bone.flag & PMX_BONE_FLAG_MOVABLE) !== 0,
                rotatable: (bone.flag & PMX_BONE_FLAG_ROTATABLE) !== 0,
                isIk: ikBoneIndices.has(boneIndex),
                isIkAffected: ikAffectedBoneIndices.has(boneIndex),
            });
        }
    }

    return { boneNames, physicsBoneNames, boneControlInfos };
}

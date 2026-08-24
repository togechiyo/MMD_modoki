import type {
    VmdBoneKey,
    VmdExportDocument,
    VmdMorphKey,
    VmdPropertyKey,
    VmdQuaternion,
    VmdVector3,
} from "../export/vmd-export-document";
import {
    classifyModelBodyMotionTrack,
    createModelBodyCorrectionPlan,
    createModelBodyProfile,
    getModelBodyMotionPositionScale,
    type ModelRestBone,
} from "../editor/model-body-motion-correction";

export type VmdRetargetBone = {
    name: string;
    englishName?: string;
    position: VmdVector3;
    parentBoneIndex: number;
    tailPosition: number | VmdVector3;
    rotatable: boolean;
};

export type VmdRetargetMorph = {
    name: string;
    englishName?: string;
};

export type VmdRetargetModel = {
    modelName: string;
    bones: readonly VmdRetargetBone[];
    morphs: readonly VmdRetargetMorph[];
};

export type VmdRetargetOptions = {
    retargetRotations: boolean;
    correctRootPosition: boolean;
    correctFootIkPosition: boolean;
};

export type VmdRetargetReport = {
    sourceModelName: string;
    targetModelName: string;
    inputBoneKeyCount: number;
    outputBoneKeyCount: number;
    mappedBoneTrackCount: number;
    rotationKeyCount: number;
    positionKeyCount: number;
    mappedMorphTrackCount: number;
    omittedBoneTracks: string[];
    omittedMorphTracks: string[];
    warnings: string[];
};

export type VmdRetargetResult = {
    document: VmdExportDocument;
    report: VmdRetargetReport;
};

type IndexedBone = VmdRetargetBone & { index: number };

const STANDARD_BONE_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
    ["root", ["全ての親", "all parent", "allparent", "root"]],
    ["center", ["センター", "center", "hips"]],
    ["groove", ["グルーブ", "groove"]],
    ["waist", ["腰", "waist"]],
    ["lowerBody", ["下半身", "lower body", "lowerbody", "pelvis"]],
    ["upperBody", ["上半身", "upper body", "upperbody", "spine"]],
    ["upperBody2", ["上半身2", "上半身２", "upper body 2", "upperbody2", "chest"]],
    ["upperBody3", ["上半身3", "上半身３", "upper body 3", "upperbody3", "upperchest"]],
    ["neck", ["首", "neck"]],
    ["head", ["頭", "head"]],
    ["leftShoulder", ["左肩", "left shoulder", "leftshoulder"]],
    ["leftArm", ["左腕", "left arm", "leftarm", "leftupperarm"]],
    ["leftElbow", ["左ひじ", "左肘", "left elbow", "leftelbow", "leftlowerarm"]],
    ["leftWrist", ["左手首", "left wrist", "leftwrist", "lefthand"]],
    ["rightShoulder", ["右肩", "right shoulder", "rightshoulder"]],
    ["rightArm", ["右腕", "right arm", "rightarm", "rightupperarm"]],
    ["rightElbow", ["右ひじ", "右肘", "right elbow", "rightelbow", "rightlowerarm"]],
    ["rightWrist", ["右手首", "right wrist", "rightwrist", "righthand"]],
    ["leftLeg", ["左足", "left leg", "leftleg", "leftupperleg"]],
    ["leftKnee", ["左ひざ", "左膝", "left knee", "leftknee", "leftlowerleg"]],
    ["leftAnkle", ["左足首", "left ankle", "leftankle", "leftfoot"]],
    ["leftToe", ["左つま先", "左爪先", "left toe", "lefttoe", "lefttoebase"]],
    ["rightLeg", ["右足", "right leg", "rightleg", "rightupperleg"]],
    ["rightKnee", ["右ひざ", "右膝", "right knee", "rightknee", "rightlowerleg"]],
    ["rightAnkle", ["右足首", "right ankle", "rightankle", "rightfoot"]],
    ["rightToe", ["右つま先", "右爪先", "right toe", "righttoe", "righttoebase"]],
    ["leftLegIkParent", ["左足ik親", "left leg ik parent", "leftlegikparent"]],
    ["leftLegIk", ["左足ik", "left leg ik", "leftlegik"]],
    ["leftToeIk", ["左つま先ik", "左爪先ik", "left toe ik", "lefttoeik"]],
    ["rightLegIkParent", ["右足ik親", "right leg ik parent", "rightlegikparent"]],
    ["rightLegIk", ["右足ik", "right leg ik", "rightlegik"]],
    ["rightToeIk", ["右つま先ik", "右爪先ik", "right toe ik", "righttoeik"]],
];

const STANDARD_ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of STANDARD_BONE_ALIASES) {
    STANDARD_ALIAS_TO_CANONICAL.set(normalizeName(canonical), canonical);
    for (const alias of aliases) STANDARD_ALIAS_TO_CANONICAL.set(normalizeName(alias), canonical);
}

function normalizeName(name: string): string {
    return name.normalize("NFKC").toLowerCase().replace(/[\s_\-・.:]/g, "");
}

function canonicalBoneName(name: string): string | null {
    return STANDARD_ALIAS_TO_CANONICAL.get(normalizeName(name)) ?? null;
}

function createBoneIndexes(model: VmdRetargetModel): {
    byName: Map<string, IndexedBone>;
    byCanonical: Map<string, IndexedBone>;
} {
    const byName = new Map<string, IndexedBone>();
    const byCanonical = new Map<string, IndexedBone>();
    model.bones.forEach((bone, index) => {
        const indexed = { ...bone, index };
        const names = [bone.name, bone.englishName ?? ""].filter(Boolean);
        for (const name of names) {
            byName.set(normalizeName(name), indexed);
            const canonical = canonicalBoneName(name);
            if (canonical && !byCanonical.has(canonical)) byCanonical.set(canonical, indexed);
        }
    });
    return { byName, byCanonical };
}

function resolveBone(
    name: string,
    sourceIndexes: ReturnType<typeof createBoneIndexes>,
    targetIndexes: ReturnType<typeof createBoneIndexes>,
): { source: IndexedBone | null; target: IndexedBone | null } {
    const normalized = normalizeName(name);
    const source = sourceIndexes.byName.get(normalized)
        ?? sourceIndexes.byCanonical.get(canonicalBoneName(name) ?? "")
        ?? null;
    const canonical = canonicalBoneName(source?.name ?? "")
        ?? canonicalBoneName(source?.englishName ?? "")
        ?? canonicalBoneName(name);
    const target = targetIndexes.byName.get(normalized)
        ?? (source ? targetIndexes.byName.get(normalizeName(source.name)) : undefined)
        ?? (source?.englishName ? targetIndexes.byName.get(normalizeName(source.englishName)) : undefined)
        ?? (canonical ? targetIndexes.byCanonical.get(canonical) : undefined)
        ?? null;
    return { source, target };
}

function subtract(left: VmdVector3, right: VmdVector3): VmdVector3 {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function vectorLength(value: VmdVector3): number {
    return Math.hypot(value[0], value[1], value[2]);
}

function normalizeVector(value: VmdVector3): VmdVector3 | null {
    const length = vectorLength(value);
    if (!Number.isFinite(length) || length <= 1e-8) return null;
    return [value[0] / length, value[1] / length, value[2] / length];
}

function boneDirection(model: VmdRetargetModel, bone: IndexedBone): VmdVector3 | null {
    if (typeof bone.tailPosition === "number") {
        const tail = model.bones[bone.tailPosition];
        if (tail) {
            const direction = normalizeVector(subtract(tail.position, bone.position));
            if (direction) return direction;
        }
    } else {
        const direction = normalizeVector(bone.tailPosition);
        if (direction) return direction;
    }
    const child = model.bones.find((candidate) => candidate.parentBoneIndex === bone.index);
    if (child) {
        const direction = normalizeVector(subtract(child.position, bone.position));
        if (direction) return direction;
    }
    const parent = model.bones[bone.parentBoneIndex];
    return parent ? normalizeVector(subtract(bone.position, parent.position)) : null;
}

function normalizeQuaternion(value: VmdQuaternion): VmdQuaternion | null {
    const length = Math.hypot(value[0], value[1], value[2], value[3]);
    if (!Number.isFinite(length) || length <= 1e-8) return null;
    return [value[0] / length, value[1] / length, value[2] / length, value[3] / length];
}

function multiplyQuaternion(left: VmdQuaternion, right: VmdQuaternion): VmdQuaternion {
    const [lx, ly, lz, lw] = left;
    const [rx, ry, rz, rw] = right;
    return [
        lw * rx + lx * rw + ly * rz - lz * ry,
        lw * ry - lx * rz + ly * rw + lz * rx,
        lw * rz + lx * ry - ly * rx + lz * rw,
        lw * rw - lx * rx - ly * ry - lz * rz,
    ];
}

function conjugateQuaternion(value: VmdQuaternion): VmdQuaternion {
    return [-value[0], -value[1], -value[2], value[3]];
}

function directionAlignment(source: VmdVector3, target: VmdVector3): VmdQuaternion | null {
    const from = normalizeVector(source);
    const to = normalizeVector(target);
    if (!from || !to) return null;
    const dot = Math.max(-1, Math.min(1, from[0] * to[0] + from[1] * to[1] + from[2] * to[2]));
    if (dot > 1 - 1e-8) return [0, 0, 0, 1];
    if (dot < -1 + 1e-8) {
        const reference: VmdVector3 = Math.abs(from[0]) < Math.abs(from[1])
            ? (Math.abs(from[0]) < Math.abs(from[2]) ? [1, 0, 0] : [0, 0, 1])
            : (Math.abs(from[1]) < Math.abs(from[2]) ? [0, 1, 0] : [0, 0, 1]);
        const axis = normalizeVector([
            from[1] * reference[2] - from[2] * reference[1],
            from[2] * reference[0] - from[0] * reference[2],
            from[0] * reference[1] - from[1] * reference[0],
        ]);
        return axis ? [axis[0], axis[1], axis[2], 0] : null;
    }
    return normalizeQuaternion([
        from[1] * to[2] - from[2] * to[1],
        from[2] * to[0] - from[0] * to[2],
        from[0] * to[1] - from[1] * to[0],
        1 + dot,
    ]);
}

function retargetRotation(
    rotation: VmdQuaternion,
    sourceModel: VmdRetargetModel,
    targetModel: VmdRetargetModel,
    sourceBone: IndexedBone,
    targetBone: IndexedBone,
): VmdQuaternion | null {
    const sourceDirection = boneDirection(sourceModel, sourceBone);
    const targetDirection = boneDirection(targetModel, targetBone);
    if (!sourceDirection || !targetDirection) return null;
    const alignment = directionAlignment(sourceDirection, targetDirection);
    const normalized = normalizeQuaternion(rotation);
    if (!alignment || !normalized) return null;
    return normalizeQuaternion(multiplyQuaternion(
        multiplyQuaternion(alignment, normalized),
        conjugateQuaternion(alignment),
    ));
}

function createBodyRestBones(model: VmdRetargetModel): ModelRestBone[] {
    return model.bones.flatMap((bone) => {
        const result: ModelRestBone[] = [{ name: bone.name, position: bone.position }];
        if (bone.englishName && normalizeName(bone.englishName) !== normalizeName(bone.name)) {
            result.push({ name: bone.englishName, position: bone.position });
        }
        return result;
    });
}

function mapMorphName(
    name: string,
    sourceModel: VmdRetargetModel,
    targetModel: VmdRetargetModel,
): string | null {
    const normalized = normalizeName(name);
    const source = sourceModel.morphs.find((morph) => (
        normalizeName(morph.name) === normalized || normalizeName(morph.englishName ?? "") === normalized
    ));
    const candidates = [name, source?.name ?? "", source?.englishName ?? ""].filter(Boolean).map(normalizeName);
    const target = targetModel.morphs.find((morph) => candidates.includes(normalizeName(morph.name))
        || candidates.includes(normalizeName(morph.englishName ?? "")));
    return target?.name ?? null;
}

function uniqueSorted(values: ReadonlySet<string>): string[] {
    return [...values].sort((left, right) => left.localeCompare(right, "ja"));
}

export function retargetVmdDocument(
    sourceModel: VmdRetargetModel,
    targetModel: VmdRetargetModel,
    sourceDocument: VmdExportDocument,
    options: VmdRetargetOptions,
): VmdRetargetResult {
    if (sourceDocument.kind !== "model") {
        throw new Error("VMD retargeting requires a model motion document");
    }

    const sourceIndexes = createBoneIndexes(sourceModel);
    const targetIndexes = createBoneIndexes(targetModel);
    const bodyPlan = createModelBodyCorrectionPlan(
        createModelBodyProfile(createBodyRestBones(sourceModel)),
        createModelBodyProfile(createBodyRestBones(targetModel)),
    );
    const mappedBoneTracks = new Set<string>();
    const omittedBoneTracks = new Set<string>();
    const mappedMorphTracks = new Set<string>();
    const omittedMorphTracks = new Set<string>();
    const warnings = new Set<string>();
    let rotationKeyCount = 0;
    let positionKeyCount = 0;

    const boneKeys: VmdBoneKey[] = [];
    for (const key of sourceDocument.boneKeys) {
        const { source, target } = resolveBone(key.boneName, sourceIndexes, targetIndexes);
        if (!source || !target) {
            omittedBoneTracks.add(key.boneName);
            continue;
        }
        mappedBoneTracks.add(key.boneName);
        let rotation = key.rotation;
        if (options.retargetRotations && source.rotatable && target.rotatable) {
            const converted = retargetRotation(key.rotation, sourceModel, targetModel, source, target);
            if (converted) {
                rotation = converted;
                rotationKeyCount += 1;
            } else {
                warnings.add(`回転軸を計算できないボーン: ${key.boneName}`);
            }
        }

        let position = key.position;
        const positionKind = classifyModelBodyMotionTrack(target.name);
        const shouldScale = positionKind === "global"
            ? options.correctRootPosition
            : positionKind === "leftLegIk" || positionKind === "rightLegIk"
                ? options.correctFootIkPosition
                : false;
        const scale = shouldScale ? getModelBodyMotionPositionScale(target.name, bodyPlan) : null;
        if (scale !== null && Number.isFinite(scale)) {
            position = [key.position[0] * scale, key.position[1] * scale, key.position[2] * scale];
            positionKeyCount += 1;
        }

        boneKeys.push({
            ...key,
            boneName: target.name,
            position,
            rotation,
        });
    }

    const morphKeys: VmdMorphKey[] = [];
    for (const key of sourceDocument.morphKeys) {
        const targetName = mapMorphName(key.morphName, sourceModel, targetModel);
        if (!targetName) {
            omittedMorphTracks.add(key.morphName);
            continue;
        }
        mappedMorphTracks.add(key.morphName);
        morphKeys.push({ ...key, morphName: targetName });
    }

    const propertyKeys: VmdPropertyKey[] = sourceDocument.propertyKeys.map((key) => ({
        ...key,
        ikStates: key.ikStates.flatMap((state) => {
            const { target } = resolveBone(state.boneName, sourceIndexes, targetIndexes);
            return target ? [{ ...state, boneName: target.name }] : [];
        }),
    }));

    if (!bodyPlan.valid && (options.correctRootPosition || options.correctFootIkPosition)) {
        warnings.add("標準ボーンから体格比を計測できなかったため、位置補正を省略しました");
    }

    const document: VmdExportDocument = {
        kind: "model",
        modelName: targetModel.modelName,
        boneKeys,
        morphKeys,
        propertyKeys,
        unsupportedExternalParentKeyCount: 0,
    };
    return {
        document,
        report: {
            sourceModelName: sourceModel.modelName,
            targetModelName: targetModel.modelName,
            inputBoneKeyCount: sourceDocument.boneKeys.length,
            outputBoneKeyCount: boneKeys.length,
            mappedBoneTrackCount: mappedBoneTracks.size,
            rotationKeyCount,
            positionKeyCount,
            mappedMorphTrackCount: mappedMorphTracks.size,
            omittedBoneTracks: uniqueSorted(omittedBoneTracks),
            omittedMorphTracks: uniqueSorted(omittedMorphTracks),
            warnings: uniqueSorted(warnings),
        },
    };
}

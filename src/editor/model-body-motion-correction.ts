import type { MovableBoneKeyframePayload } from "./timeline-edit-service";

export type ModelRestBone = {
    name: string;
    position: readonly [number, number, number];
};

export type ModelBodyProfile = {
    valid: boolean;
    centerHeight: number | null;
    leftLegLength: number | null;
    rightLegLength: number | null;
    leftArmLength: number | null;
    rightArmLength: number | null;
};

export type ModelBodyCorrectionPlan = {
    valid: boolean;
    globalScale: number;
    leftLegScale: number;
    rightLegScale: number;
    leftArmScale: number;
    rightArmScale: number;
};

export type ModelBodyCorrectionModel = {
    index: number;
    instanceId: string;
    name: string;
    active: boolean;
    restBones: ModelRestBone[];
};

export type ModelBodyMotionCorrectionPreview = {
    valid: boolean;
    sourceModelName: string;
    targetModelName: string;
    plan: ModelBodyCorrectionPlan;
    compatibleTrackCount: number;
    compatibleKeyCount: number;
    changedKeyCount: number;
};

export type ModelBodyMotionTrackKind = "global" | "leftLegIk" | "rightLegIk";

const MIN_MEASURE = 1e-6;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

function normalizeBoneName(name: string): string {
    return name.normalize("NFKC").toLowerCase().replace(/[\s_\-・]/g, "");
}

function findBone(
    bonesByName: ReadonlyMap<string, ModelRestBone>,
    ...aliases: readonly string[]
): ModelRestBone | null {
    for (const alias of aliases) {
        const bone = bonesByName.get(normalizeBoneName(alias));
        if (bone) return bone;
    }
    return null;
}

function distance(a: ModelRestBone | null, b: ModelRestBone | null): number | null {
    if (!a || !b) return null;
    const value = Math.hypot(
        a.position[0] - b.position[0],
        a.position[1] - b.position[1],
        a.position[2] - b.position[2],
    );
    return Number.isFinite(value) && value > MIN_MEASURE ? value : null;
}

function chainLength(...bones: Array<ModelRestBone | null>): number | null {
    let total = 0;
    for (let index = 1; index < bones.length; index += 1) {
        const segment = distance(bones[index - 1], bones[index]);
        if (segment === null) return null;
        total += segment;
    }
    return total > MIN_MEASURE ? total : null;
}

function average(values: Array<number | null>): number | null {
    const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
    return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

export function createModelBodyProfile(bones: readonly ModelRestBone[]): ModelBodyProfile {
    const bonesByName = new Map<string, ModelRestBone>();
    for (const bone of bones) {
        if (!bone.name || bone.position.length < 3 || !bone.position.every(Number.isFinite)) continue;
        bonesByName.set(normalizeBoneName(bone.name), bone);
    }

    const center = findBone(bonesByName, "センター", "center");
    const leftLeg = findBone(bonesByName, "左足", "leftleg", "leftupperleg");
    const leftKnee = findBone(bonesByName, "左ひざ", "左膝", "leftknee", "leftlowerleg");
    const leftAnkle = findBone(bonesByName, "左足首", "leftankle", "leftfoot");
    const rightLeg = findBone(bonesByName, "右足", "rightleg", "rightupperleg");
    const rightKnee = findBone(bonesByName, "右ひざ", "右膝", "rightknee", "rightlowerleg");
    const rightAnkle = findBone(bonesByName, "右足首", "rightankle", "rightfoot");
    const leftArm = findBone(bonesByName, "左腕", "leftarm", "leftupperarm");
    const leftElbow = findBone(bonesByName, "左ひじ", "左肘", "leftelbow", "leftlowerarm");
    const leftWrist = findBone(bonesByName, "左手首", "leftwrist", "lefthand");
    const rightArm = findBone(bonesByName, "右腕", "rightarm", "rightupperarm");
    const rightElbow = findBone(bonesByName, "右ひじ", "右肘", "rightelbow", "rightlowerarm");
    const rightWrist = findBone(bonesByName, "右手首", "rightwrist", "righthand");

    const groundY = average([leftAnkle?.position[1] ?? null, rightAnkle?.position[1] ?? null]);
    const centerHeight = center && groundY !== null
        ? Math.abs(center.position[1] - groundY)
        : null;
    const leftLegLength = chainLength(leftLeg, leftKnee, leftAnkle);
    const rightLegLength = chainLength(rightLeg, rightKnee, rightAnkle);
    const leftArmLength = chainLength(leftArm, leftElbow, leftWrist);
    const rightArmLength = chainLength(rightArm, rightElbow, rightWrist);
    const usableCenterHeight = centerHeight !== null && centerHeight > MIN_MEASURE ? centerHeight : null;

    return {
        valid: usableCenterHeight !== null || leftLegLength !== null || rightLegLength !== null,
        centerHeight: usableCenterHeight,
        leftLegLength,
        rightLegLength,
        leftArmLength,
        rightArmLength,
    };
}

function safeRatio(target: number | null, source: number | null, fallback: number): number {
    if (target === null || source === null || source <= MIN_MEASURE) return fallback;
    const ratio = target / source;
    if (!Number.isFinite(ratio)) return fallback;
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, ratio));
}

export function createModelBodyCorrectionPlan(
    source: ModelBodyProfile,
    target: ModelBodyProfile,
): ModelBodyCorrectionPlan {
    const sourceGlobal = source.centerHeight ?? average([source.leftLegLength, source.rightLegLength]);
    const targetGlobal = target.centerHeight ?? average([target.leftLegLength, target.rightLegLength]);
    const valid = source.valid && target.valid && sourceGlobal !== null && targetGlobal !== null;
    const globalScale = valid ? safeRatio(targetGlobal, sourceGlobal, 1) : 1;
    return {
        valid,
        globalScale,
        leftLegScale: valid ? safeRatio(target.leftLegLength, source.leftLegLength, globalScale) : 1,
        rightLegScale: valid ? safeRatio(target.rightLegLength, source.rightLegLength, globalScale) : 1,
        leftArmScale: valid ? safeRatio(target.leftArmLength, source.leftArmLength, globalScale) : 1,
        rightArmScale: valid ? safeRatio(target.rightArmLength, source.rightArmLength, globalScale) : 1,
    };
}

export function classifyModelBodyMotionTrack(trackName: string): ModelBodyMotionTrackKind | null {
    const normalized = normalizeBoneName(trackName);
    if (["全ての親", "allparent", "root", "センター", "center", "グルーブ", "groove", "腰", "waist"]
        .some((name) => normalized === normalizeBoneName(name))) {
        return "global";
    }
    if (["左足ik親", "左足ik", "左つま先ik", "leftlegikparent", "leftlegik", "lefttoeik"]
        .some((name) => normalized === normalizeBoneName(name))) {
        return "leftLegIk";
    }
    if (["右足ik親", "右足ik", "右つま先ik", "rightlegikparent", "rightlegik", "righttoeik"]
        .some((name) => normalized === normalizeBoneName(name))) {
        return "rightLegIk";
    }
    return null;
}

export function getModelBodyMotionPositionScale(
    trackName: string,
    plan: ModelBodyCorrectionPlan,
): number | null {
    switch (classifyModelBodyMotionTrack(trackName)) {
        case "global":
            return plan.globalScale;
        case "leftLegIk":
            return plan.leftLegScale;
        case "rightLegIk":
            return plan.rightLegScale;
        default:
            return null;
    }
}

export function applyModelBodyMotionCorrection(
    trackName: string,
    payload: MovableBoneKeyframePayload,
    plan: ModelBodyCorrectionPlan,
): MovableBoneKeyframePayload | null {
    if (!plan.valid) return null;
    const scale = getModelBodyMotionPositionScale(trackName, plan);
    if (scale === null || !Number.isFinite(scale)) return null;
    const positions = payload.positions.slice(0, 3).map((value) => value * scale);
    if (!positions.every(Number.isFinite)) return null;
    return { ...payload, positions };
}

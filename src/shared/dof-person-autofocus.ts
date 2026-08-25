export type DofFocusMode = "camera-target" | "person-auto" | "model-target";

export const DEFAULT_DOF_FOCUS_MODE: DofFocusMode = "person-auto";

export const DOF_PERSON_AUTO_FOCUS_SWITCH_RATIO = 1.25;

const DOF_PERSON_FOCUS_BONE_CANDIDATES = [
    "頭",
    "head",
    "首",
    "neck",
    "上半身2",
    "upperbody2",
    "upper body2",
    "upperbody",
    "上半身",
] as const;

export type DofPersonAutoFocusCandidate = {
    modelInstanceId: string;
    boneName: string;
    screenX: number;
    screenY: number;
    depth: number;
    cameraDistance: number;
};

export type DofPersonAutoFocusSelection = DofPersonAutoFocusCandidate & {
    score: number;
};

export function normalizeDofFocusMode(value: unknown): DofFocusMode {
    switch (value) {
        case "person-auto":
        case "model-target":
        case "camera-target":
            return value;
        default:
            return DEFAULT_DOF_FOCUS_MODE;
    }
}

function normalizeBoneName(value: string): string {
    return value.trim().replace(/\s+/g, "").toLowerCase();
}

export function findDofPersonFocusBoneName(boneNames: readonly string[]): string | null {
    const normalizedToActual = new Map<string, string>();
    for (const boneName of boneNames) {
        if (typeof boneName !== "string") continue;
        const normalized = normalizeBoneName(boneName);
        if (normalized && !normalizedToActual.has(normalized)) {
            normalizedToActual.set(normalized, boneName);
        }
    }

    for (const candidate of DOF_PERSON_FOCUS_BONE_CANDIDATES) {
        const actual = normalizedToActual.get(normalizeBoneName(candidate));
        if (actual) {
            return actual;
        }
    }

    return null;
}

export function scoreDofPersonAutoFocusCandidate(
    candidate: DofPersonAutoFocusCandidate,
): number {
    if (
        !candidate.modelInstanceId
        || !candidate.boneName
        || !Number.isFinite(candidate.screenX)
        || !Number.isFinite(candidate.screenY)
        || !Number.isFinite(candidate.depth)
        || !Number.isFinite(candidate.cameraDistance)
        || candidate.cameraDistance < 0
        || candidate.depth < 0
        || candidate.depth > 1
        || Math.abs(candidate.screenX) > 1.05
        || Math.abs(candidate.screenY) > 1.05
    ) {
        return 0;
    }

    const radialDistanceSquared = candidate.screenX * candidate.screenX
        + candidate.screenY * candidate.screenY;
    return Math.exp(-1.6 * radialDistanceSquared);
}

export function selectDofPersonAutoFocusCandidate(
    candidates: readonly DofPersonAutoFocusCandidate[],
    lockedModelInstanceId: string | null,
    switchRatio = DOF_PERSON_AUTO_FOCUS_SWITCH_RATIO,
): DofPersonAutoFocusSelection | null {
    const scored = candidates
        .map((candidate) => ({
            ...candidate,
            score: scoreDofPersonAutoFocusCandidate(candidate),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort((a, b) => (
            b.score - a.score
            || a.cameraDistance - b.cameraDistance
            || a.modelInstanceId.localeCompare(b.modelInstanceId)
        ));

    const best = scored[0] ?? null;
    if (!best || !lockedModelInstanceId) {
        return best;
    }

    const locked = scored.find((candidate) => candidate.modelInstanceId === lockedModelInstanceId) ?? null;
    if (!locked || best.modelInstanceId === locked.modelInstanceId) {
        return best;
    }

    const normalizedSwitchRatio = Number.isFinite(switchRatio)
        ? Math.max(1, switchRatio)
        : DOF_PERSON_AUTO_FOCUS_SWITCH_RATIO;
    return best.score >= locked.score * normalizedSwitchRatio ? best : locked;
}

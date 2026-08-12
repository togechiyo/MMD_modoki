export const FRAME_GRAPH_POST_EFFECT_IDS = [
    "ssr",
    "ssgi",
    "ssao",
    "ocean",
    "offsetShadow",
    "offsetHighlight",
    "dof",
    "luminous",
    "bloom",
    "lut",
    "motionBlur",
    "sharpen",
    "grain",
    "chromatic",
    "vignette",
    "edgeBlur",
    "distortion",
] as const;

export type FrameGraphPostEffectId = typeof FRAME_GRAPH_POST_EFFECT_IDS[number];

export type FrameGraphPostEffectStackEntry = {
    id: FrameGraphPostEffectId;
    enabled: boolean;
};

export type FrameGraphPostEffectActivationSettings = {
    dofEnabled: boolean;
    luminousEnabled: boolean;
    luminousIntensity: number;
    bloomEnabled: boolean;
    lutEnabled: boolean;
    motionBlurEnabled: boolean;
    motionBlurStrength: number;
    sharpenEdge: number;
    grainIntensity: number;
    chromaticAberration: number;
    vignetteEnabled: boolean;
    vignetteWeight: number;
    edgeBlurStrength: number;
    lensDistortionEnabled: boolean;
    lensDistortion: number;
    ssaoEnabled: boolean;
    ssaoStrength: number;
    offsetShadowEnabled: boolean;
    offsetShadowStrength: number;
    offsetHighlightEnabled: boolean;
    offsetHighlightStrength: number;
    ssrEnabled: boolean;
    ssrStrength: number;
    ssgiEnabled: boolean;
    ssgiStrength: number;
    ssgiSampleRadius: number;
    oceanEnabled: boolean;
};

const FRAME_GRAPH_POST_EFFECT_ID_SET = new Set<string>(FRAME_GRAPH_POST_EFFECT_IDS);
const RETIRED_FRAME_GRAPH_POST_EFFECT_ID_SET = new Set<FrameGraphPostEffectId>([
    "ocean",
]);

export function isRetiredFrameGraphPostEffectId(id: FrameGraphPostEffectId): boolean {
    return RETIRED_FRAME_GRAPH_POST_EFFECT_ID_SET.has(id);
}

export function isFrameGraphPostEffectId(value: string): value is FrameGraphPostEffectId {
    return FRAME_GRAPH_POST_EFFECT_ID_SET.has(value);
}

export function normalizeFrameGraphPostEffectIds(
    ids: readonly unknown[] | null | undefined,
    activeIds: readonly FrameGraphPostEffectId[] = [],
): FrameGraphPostEffectId[] {
    const result: FrameGraphPostEffectId[] = [];
    const seen = new Set<FrameGraphPostEffectId>();

    const add = (value: unknown): void => {
        if (
            typeof value !== "string"
            || !isFrameGraphPostEffectId(value)
            || isRetiredFrameGraphPostEffectId(value)
            || seen.has(value)
        ) {
            return;
        }
        seen.add(value);
        result.push(value);
    };

    ids?.forEach(add);
    FRAME_GRAPH_POST_EFFECT_IDS.forEach((id) => {
        if (activeIds.includes(id)) {
            add(id);
        }
    });
    return result;
}

export function normalizeFrameGraphPostEffectStack(
    entries: readonly unknown[] | null | undefined,
): FrameGraphPostEffectStackEntry[] {
    const result: FrameGraphPostEffectStackEntry[] = [];
    const seen = new Set<FrameGraphPostEffectId>();
    for (const entry of entries ?? []) {
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const candidate = entry as { id?: unknown; enabled?: unknown };
        if (
            typeof candidate.id !== "string"
            || !isFrameGraphPostEffectId(candidate.id)
            || isRetiredFrameGraphPostEffectId(candidate.id)
            || seen.has(candidate.id)
        ) {
            continue;
        }
        seen.add(candidate.id);
        result.push({
            id: candidate.id,
            enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : false,
        });
    }
    return result;
}

export function isFrameGraphPostEffectActiveInSettings(
    settings: FrameGraphPostEffectActivationSettings,
    id: FrameGraphPostEffectId,
): boolean {
    if (isRetiredFrameGraphPostEffectId(id)) {
        return false;
    }
    switch (id) {
        case "ssr":
            return settings.ssrEnabled && settings.ssrStrength > 0.00001;
        case "ssgi":
            return settings.ssgiEnabled;
        case "ssao":
            return settings.ssaoEnabled && settings.ssaoStrength > 0.00001;
        case "ocean":
            return settings.oceanEnabled;
        case "offsetShadow":
            return settings.offsetShadowEnabled && settings.offsetShadowStrength > 0.0001;
        case "offsetHighlight":
            return settings.offsetHighlightEnabled && settings.offsetHighlightStrength > 0.0001;
        case "dof":
            return settings.dofEnabled;
        case "luminous":
            return settings.luminousEnabled && settings.luminousIntensity > 0.0001;
        case "bloom":
            return settings.bloomEnabled;
        case "lut":
            return settings.lutEnabled;
        case "motionBlur":
            return settings.motionBlurEnabled;
        case "sharpen":
            return settings.sharpenEdge > 0.0001;
        case "grain":
            return settings.grainIntensity > 0.0001;
        case "chromatic":
            return settings.chromaticAberration > 0.0001;
        case "vignette":
            return settings.vignetteEnabled && settings.vignetteWeight > 0.0001;
        case "edgeBlur":
            return settings.edgeBlurStrength > 0.0001;
        case "distortion":
            return settings.lensDistortionEnabled;
    }
}

export function getActiveFrameGraphPostEffectIdsFromSettings(
    settings: FrameGraphPostEffectActivationSettings,
): FrameGraphPostEffectId[] {
    return FRAME_GRAPH_POST_EFFECT_IDS.filter((id) => isFrameGraphPostEffectActiveInSettings(settings, id));
}

export function addFrameGraphPostEffectId(
    currentIds: readonly FrameGraphPostEffectId[],
    id: FrameGraphPostEffectId,
): FrameGraphPostEffectId[] {
    if (isRetiredFrameGraphPostEffectId(id)) {
        return [...currentIds].filter((candidate) => !isRetiredFrameGraphPostEffectId(candidate));
    }
    if (currentIds.includes(id)) {
        return [...currentIds];
    }
    const next = [...currentIds];
    const canonicalIndex = FRAME_GRAPH_POST_EFFECT_IDS.indexOf(id);
    const insertBeforeIndex = next.findIndex((candidate) => (
        FRAME_GRAPH_POST_EFFECT_IDS.indexOf(candidate) > canonicalIndex
    ));
    if (insertBeforeIndex < 0) {
        next.push(id);
    } else {
        next.splice(insertBeforeIndex, 0, id);
    }
    return next;
}

export function moveFrameGraphPostEffectId(
    currentIds: readonly FrameGraphPostEffectId[],
    id: FrameGraphPostEffectId,
    direction: -1 | 1,
): FrameGraphPostEffectId[] {
    const index = currentIds.indexOf(id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= currentIds.length) {
        return [...currentIds];
    }
    const next = [...currentIds];
    const [entry] = next.splice(index, 1);
    next.splice(targetIndex, 0, entry);
    return next;
}


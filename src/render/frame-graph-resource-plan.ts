import {
    FRAME_GRAPH_POST_EFFECT_IDS,
    getActiveFrameGraphPostEffectIdsFromSettings,
    normalizeFrameGraphPostEffectIds,
    type FrameGraphPostEffectActivationSettings,
    type FrameGraphPostEffectId,
} from "../shared/frame-graph-post-effect-stack";

export type FrameGraphSharedResourceKey =
    | "sceneColor"
    | "depthScene"
    | "viewDepth"
    | "viewNormal"
    | "velocity"
    | "reflectivity"
    | "luminousMask";

export type FrameGraphResourcePlanSettings = FrameGraphPostEffectActivationSettings & {
    imageProcessingEnabled: boolean;
    antialiasEnabled: boolean;
};

export type FrameGraphResourceRequirement = {
    key: FrameGraphSharedResourceKey;
    consumers: FrameGraphPostEffectId[];
    producer: "import" | "depthRenderer" | "geometryRenderer" | "luminousMask";
    resolution: "full";
};

export type FrameGraphResourcePlan = {
    effectOrder: FrameGraphPostEffectId[];
    activeEffects: FrameGraphPostEffectId[];
    requirements: FrameGraphResourceRequirement[];
    requirementKeys: FrameGraphSharedResourceKey[];
    needsGeometryRenderer: boolean;
    needsDepthRenderer: boolean;
    needsLuminousMask: boolean;
    fixedTasks: {
        imageProcessing: boolean;
        fxaa: boolean;
    };
};

function addConsumer(
    consumersByKey: Map<FrameGraphSharedResourceKey, Set<FrameGraphPostEffectId>>,
    key: FrameGraphSharedResourceKey,
    consumer: FrameGraphPostEffectId,
): void {
    const consumers = consumersByKey.get(key) ?? new Set<FrameGraphPostEffectId>();
    consumers.add(consumer);
    consumersByKey.set(key, consumers);
}

function getProducer(key: FrameGraphSharedResourceKey): FrameGraphResourceRequirement["producer"] {
    switch (key) {
        case "sceneColor":
            return "import";
        case "depthScene":
            return "depthRenderer";
        case "viewDepth":
        case "viewNormal":
        case "velocity":
        case "reflectivity":
            return "geometryRenderer";
        case "luminousMask":
            return "luminousMask";
    }
}

export function buildFrameGraphResourcePlan(
    settings: FrameGraphResourcePlanSettings,
    effectOrder: readonly FrameGraphPostEffectId[] = FRAME_GRAPH_POST_EFFECT_IDS,
): FrameGraphResourcePlan {
    const activeEffects = getActiveFrameGraphPostEffectIdsFromSettings(settings);
    const normalizedOrder = normalizeFrameGraphPostEffectIds(effectOrder, activeEffects);
    const consumersByKey = new Map<FrameGraphSharedResourceKey, Set<FrameGraphPostEffectId>>();

    for (const id of activeEffects) {
        addConsumer(consumersByKey, "sceneColor", id);
    }

    if (activeEffects.includes("ssr")) {
        addConsumer(consumersByKey, "viewDepth", "ssr");
        addConsumer(consumersByKey, "viewNormal", "ssr");
        addConsumer(consumersByKey, "reflectivity", "ssr");
    }

    if (activeEffects.includes("ssgi")) {
        addConsumer(consumersByKey, "viewDepth", "ssgi");
        addConsumer(consumersByKey, "viewNormal", "ssgi");
    }

    if (activeEffects.includes("ssao")) {
        addConsumer(consumersByKey, "viewDepth", "ssao");
        addConsumer(consumersByKey, "viewNormal", "ssao");
    }

    if (activeEffects.includes("offsetShadow")) {
        addConsumer(consumersByKey, "viewDepth", "offsetShadow");
    }

    if (activeEffects.includes("offsetHighlight")) {
        addConsumer(consumersByKey, "viewDepth", "offsetHighlight");
    }

    if (activeEffects.includes("dof")) {
        addConsumer(consumersByKey, "depthScene", "dof");
    }

    if (activeEffects.includes("ocean")) {
        addConsumer(consumersByKey, "viewDepth", "ocean");
        addConsumer(consumersByKey, "viewNormal", "ocean");
    }

    if (activeEffects.includes("aerialPerspective")) {
        addConsumer(consumersByKey, "viewDepth", "aerialPerspective");
    }

    if (activeEffects.includes("motionBlur")) {
        addConsumer(consumersByKey, "velocity", "motionBlur");
    }

    if (activeEffects.includes("luminous")) {
        addConsumer(consumersByKey, "luminousMask", "luminous");
    }

    const requirementKeys = Array.from(consumersByKey.keys());
    const requirements = requirementKeys.map((key) => ({
        key,
        consumers: Array.from(consumersByKey.get(key) ?? []),
        producer: getProducer(key),
        resolution: "full" as const,
    }));

    return {
        effectOrder: normalizedOrder,
        activeEffects,
        requirements,
        requirementKeys,
        needsGeometryRenderer: consumersByKey.has("viewDepth")
            || consumersByKey.has("viewNormal")
            || consumersByKey.has("velocity")
            || consumersByKey.has("reflectivity"),
        needsDepthRenderer: consumersByKey.has("depthScene"),
        needsLuminousMask: consumersByKey.has("luminousMask"),
        fixedTasks: {
            imageProcessing: settings.imageProcessingEnabled,
            fxaa: settings.antialiasEnabled,
        },
    };
}

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
    | "radianceAlbedo"
    | "velocity"
    | "reflectivity"
    | "luminousMask";

export type FrameGraphResourcePlanSettings = FrameGraphPostEffectActivationSettings & {
    effectInstances?: readonly { type: FrameGraphPostEffectId; fixedSettings?: { radiance?: { enabled: boolean } } }[];
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
    needsLuminousRadiance: boolean;
    fixedTasks: {
        imageProcessing: boolean;
        fxaa: boolean;
    };
};

// Toggle only recorded tasks. Texture connections and allocated formats stay fixed.
export function canReuseFrameGraphForActivation(
    allocated: FrameGraphResourcePlan,
    requested: FrameGraphResourcePlan,
    connectedEffects: readonly FrameGraphPostEffectId[],
): boolean {
    return allocated.needsLuminousRadiance === requested.needsLuminousRadiance
        && requested.activeEffects.every(id => connectedEffects.includes(
        id === "edgeBlur" ? "vignette" : id,
    )) && requested.requirementKeys.every(key => allocated.requirementKeys.includes(key));
}

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
        case "radianceAlbedo":
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

    const resourceEffects = [...new Set([...activeEffects, ...settings.effectInstances?.map(item => item.type) ?? []])];
    for (const id of resourceEffects) {
        addConsumer(consumersByKey, "sceneColor", id);
    }

    if (resourceEffects.includes("ssr")) {
        addConsumer(consumersByKey, "viewDepth", "ssr");
        addConsumer(consumersByKey, "viewNormal", "ssr");
        addConsumer(consumersByKey, "reflectivity", "ssr");
    }

    if (resourceEffects.includes("ssgi")) {
        addConsumer(consumersByKey, "viewDepth", "ssgi");
        addConsumer(consumersByKey, "viewNormal", "ssgi");
    }

    if (resourceEffects.includes("ssao")) {
        addConsumer(consumersByKey, "viewDepth", "ssao");
        addConsumer(consumersByKey, "viewNormal", "ssao");
    }

    if (resourceEffects.includes("offsetShadow")) {
        addConsumer(consumersByKey, "viewDepth", "offsetShadow");
    }

    if (resourceEffects.includes("offsetHighlight")) {
        addConsumer(consumersByKey, "viewDepth", "offsetHighlight");
    }

    if (resourceEffects.includes("dof")) {
        addConsumer(consumersByKey, "depthScene", "dof");
    }

    if (resourceEffects.includes("ocean")) {
        addConsumer(consumersByKey, "viewDepth", "ocean");
        addConsumer(consumersByKey, "viewNormal", "ocean");
    }

    if (resourceEffects.includes("aerialPerspective")) {
        addConsumer(consumersByKey, "viewDepth", "aerialPerspective");
    }

    if (resourceEffects.includes("directionalLightShafts")) {
        addConsumer(consumersByKey, "viewDepth", "directionalLightShafts");
    }

    if (resourceEffects.includes("motionBlur")) {
        addConsumer(consumersByKey, "velocity", "motionBlur");
    }

    if (resourceEffects.includes("luminous")) {
        addConsumer(consumersByKey, "luminousMask", "luminous");
    }
    if (resourceEffects.includes("luminousRadiance")) {
        addConsumer(consumersByKey, "viewDepth", "luminousRadiance");
        addConsumer(consumersByKey, "viewNormal", "luminousRadiance");
        addConsumer(consumersByKey, "radianceAlbedo", "luminousRadiance");
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
        needsLuminousRadiance: resourceEffects.includes("luminousRadiance"),
        fixedTasks: {
            imageProcessing: settings.imageProcessingEnabled,
            fxaa: settings.antialiasEnabled,
        },
    };
}

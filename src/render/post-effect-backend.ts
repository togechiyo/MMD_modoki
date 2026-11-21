export type PostEffectBackend = "classic" | "frameGraph";
export type FrameGraphOutput = "direct" | "cameraFxaa" | "frameGraph";

/** Select the final pass when no effect stack or image processing task needs the graph. */
export function resolveAaOnlyOutput(
    antialiasEnabled: boolean,
    engineType: string,
    contrast: number,
    screenSpaceScattering: boolean,
): FrameGraphOutput {
    if (!antialiasEnabled) return "direct";
    // The graph also applies global contrast and owns the SSS scene-color prepass.
    if (engineType === "WebGL2" && contrast === 1 && !screenSpaceScattering) return "cameraFxaa";
    return "frameGraph";
}

export const POST_EFFECT_BACKEND_STORAGE_KEY = "mmd_modoki.postEffectBackend";

export function normalizePostEffectBackend(value: unknown, fallback: PostEffectBackend = "frameGraph"): PostEffectBackend {
    if (typeof value !== "string") {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "framegraph" || normalized === "frame-graph" || normalized === "frame_graph") {
        return "frameGraph";
    }
    if (normalized === "classic") {
        return "classic";
    }
    return fallback;
}

export function readPostEffectBackendLocalStorage(fallback: PostEffectBackend = "frameGraph"): PostEffectBackend {
    try {
        return normalizePostEffectBackend(globalThis.localStorage?.getItem(POST_EFFECT_BACKEND_STORAGE_KEY), fallback);
    } catch {
        return fallback;
    }
}

import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";

type EffectCacheEngine = {
    isWebGPU?: boolean;
    releaseEffects?: () => void;
};

/** Keep the existing WebGPU invalidation without destroying live WebGL programs. */
export function releaseWebGpuEffects(engine: EffectCacheEngine | null | undefined): void {
    // Babylon 9.2 releaseEffects force-disposes even effects still referenced by
    // shadow/post-process draw wrappers. Material dirty flags do not clear them.
    if (engine?.isWebGPU === true) engine.releaseEffects?.();
}

/** Include the three values baked into MMD GLSL in its normal effect cache key. */
export function prepareMmdToonGlslDefines(
    defines: MaterialDefines,
    selfShadowSoftness: number,
    occlusionShadowSoftness: number,
    flatLightColorInfluence: number,
): void {
    if (defines.MMD_TOON_SELF_SHADOW_SOFTNESS === selfShadowSoftness
        && defines.MMD_TOON_OCCLUSION_SHADOW_SOFTNESS === occlusionShadowSoftness
        && defines.MMD_TOON_FLAT_LIGHT_COLOR_INFLUENCE === flatLightColorInfluence) return;

    const needsRebuild = defines.MMD_TOON_SELF_SHADOW_SOFTNESS === undefined
        || defines.MMD_TOON_OCCLUSION_SHADOW_SOFTNESS === undefined
        || defines.MMD_TOON_FLAT_LIGHT_COLOR_INFLUENCE === undefined;
    defines.MMD_TOON_SELF_SHADOW_SOFTNESS = selfShadowSoftness;
    defines.MMD_TOON_OCCLUSION_SHADOW_SOFTNESS = occlusionShadowSoftness;
    defines.MMD_TOON_FLAT_LIGHT_COLOR_INFLUENCE = flatLightColorInfluence;
    // New properties must also enter MaterialDefines._keys, used by toString().
    if (needsRebuild) defines.rebuild();
    defines.markAsUnprocessed();
}

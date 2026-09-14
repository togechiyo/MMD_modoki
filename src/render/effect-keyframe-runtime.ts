import type { EffectValue } from "../editor/effect-keyframe-definitions";

/** Authored values remain intact; OFF/stack suspension only affects render values. */
export function effectRenderValues(gamma: EffectValue | null, grain: EffectValue | null, staticGamma: number, staticGrain: number, gammaPresent: boolean, grainPresent: boolean) {
    return {
        gammaPower: gamma ? (gammaPresent && gamma.enabled ? Number(gamma.gamma) : 1) : staticGamma,
        grainIntensity: grain ? (grainPresent && grain.enabled ? Number(grain.intensity) : 0) : staticGrain,
        grainPrepared: grain !== null && grainPresent,
    };
}

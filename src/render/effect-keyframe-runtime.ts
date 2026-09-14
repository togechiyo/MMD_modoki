import type { EffectValue } from "../editor/effect-keyframe-definitions";

/** Zero disables these scalar effects without changing their authored values. */
export function scalarEffectRenderValue(value: EffectValue | null, field: string, present: boolean, fallback: number): number {
    return value ? (present && value.enabled ? Number(value[field]) : 0) : fallback;
}

/** Preserve the existing camera-FoV linkage while animating its influence. */
export function lensDistortionForFov(fovRadians: number, influence: number, minTele: number, neutral: number, maxWide: number): number {
    const degrees = Math.max(minTele, Math.min(maxWide, fovRadians * 180 / Math.PI));
    const distortion = degrees >= neutral ? (degrees - neutral) / Math.max(0.0001, maxWide - neutral)
        : -(neutral - degrees) / Math.max(0.0001, neutral - minTele);
    return Math.max(-1, Math.min(1, distortion * influence));
}

/** Authored values remain intact; OFF/stack suspension only affects render values. */
export function effectRenderValues(gamma: EffectValue | null, grain: EffectValue | null, staticGamma: number, staticGrain: number, gammaPresent: boolean, grainPresent: boolean, bloom: { value: EffectValue | null; present: boolean; weight: number; threshold: number }) {
    return {
        gammaPower: gamma ? (gammaPresent && gamma.enabled ? Number(gamma.gamma) : 1) : staticGamma,
        grainIntensity: grain ? (grainPresent && grain.enabled ? Number(grain.intensity) : 0) : staticGrain,
        grainPrepared: grain !== null && grainPresent,
        bloomWeight: bloom.value ? (bloom.present && bloom.value.enabled ? Number(bloom.value.weight) : 0) : bloom.weight,
        bloomThreshold: bloom.value ? Number(bloom.value.threshold) : bloom.threshold,
    };
}

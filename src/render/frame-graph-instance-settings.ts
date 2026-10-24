import type { EvaluatedEffectInstance } from "../editor/frame-graph-instance-effects";
import type { FrameGraphPostEffectsSettings } from "./frame-graph-post-effects-controller";

/** Each pass receives its own values; shared vignette/blur shaders cannot apply its neighbour. */
export function frameGraphInstanceSettings(base: FrameGraphPostEffectsSettings, instance: EvaluatedEffectInstance): FrameGraphPostEffectsSettings {
    const value = instance.value;
    switch (instance.type) {
        case "gamma": return { ...base, gammaEnabled: value.enabled, gammaPower: Number(value.gamma) };
        case "grain": return { ...base, grainIntensity: Number(value.intensity) };
        case "sharpen": return { ...base, sharpenEdge: Number(value.edge) };
        case "chromatic": return { ...base, chromaticAberration: Number(value.amount) };
        case "vignette": return { ...base, vignetteEnabled: value.enabled, vignetteWeight: Number(value.weight), edgeBlurStrength: 0 };
        case "edgeBlur": return { ...base, vignetteEnabled: false, vignetteWeight: 0, edgeBlurStrength: Number(value.strength) };
        case "distortion": return { ...base, lensDistortion: Number(value.influence) };
        case "bloom": return { ...base, bloomEnabled: value.enabled, bloomWeight: Number(value.weight), bloomThreshold: Number(value.threshold), bloomKernel: Number(value.kernel), bloomPrepared: true, bloomColor: instance.bloomColor ?? { r: 1, g: 1, b: 1 } };
    }
}

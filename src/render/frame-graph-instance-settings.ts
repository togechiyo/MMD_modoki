import type { EvaluatedEffectInstance } from "../editor/frame-graph-instance-effects";
import type { FrameGraphPostEffectsSettings } from "./frame-graph-post-effects-controller";

/** Each pass receives its own values; shared vignette/blur shaders cannot apply its neighbour. */
export function frameGraphInstanceSettings(base: FrameGraphPostEffectsSettings, instance: EvaluatedEffectInstance): FrameGraphPostEffectsSettings {
    const value = instance.value;
    switch (instance.type) {
        case "dof": return { ...base, dofEnabled: value.enabled, dofFocusDistanceMm: instance.dofFocusDistanceMm ?? Number(value.focusDistance), dofEffectiveFStop: Number(value.fStop), dofLensSize: Number(value.lensSize), dofFocalLength: Number(value.focalLength), dofBlurLevel: 1 };
        case "gamma": return { ...base, gammaEnabled: value.enabled, gammaPower: Number(value.gamma) };
        case "grain": return { ...base, grainIntensity: Number(value.intensity) };
        case "sharpen": return { ...base, sharpenEdge: Number(value.edge) };
        case "chromatic": return { ...base, chromaticAberration: Number(value.amount) };
        case "vignette": return { ...base, vignetteEnabled: value.enabled, vignetteWeight: Number(value.weight), edgeBlurStrength: 0 };
        case "edgeBlur": return { ...base, vignetteEnabled: false, vignetteWeight: 0, edgeBlurStrength: Number(value.strength) };
        case "distortion": return { ...base, lensDistortion: Number(value.influence) };
        case "bloom": return { ...base, bloomEnabled: value.enabled, bloomWeight: Number(value.weight), bloomThreshold: Number(value.threshold), bloomKernel: Number(value.kernel), bloomPrepared: true, bloomColor: instance.bloomColor ?? { r: 1, g: 1, b: 1 } };
        case "lut": return { ...base, lutEnabled: value.enabled, lutIntensity: Number(value.intensity), lutRuntimeText: instance.lutText ?? null, lutTextureKey: instance.instanceId };
        case "aerialPerspective": return { ...base, aerialPerspectiveEnabled: value.enabled, aerialPerspectiveStrength: Number(value.strength), aerialPerspectiveStart: Number(value.start), aerialPerspectiveRange: Number(value.range), aerialPerspectiveColor: instance.fixedSettings?.color ?? { r: 0.72, g: 0.79, b: 0.83 } };
        case "directionalLightShafts": return { ...base, directionalLightShaftsEnabled: value.enabled, directionalLightShaftsStrength: Number(value.strength), directionalLightShaftsPhaseG: Number(value.phaseG), directionalLightShaftsLightColor: instance.fixedSettings?.color ?? { r: 1, g: 1, b: 1 }, directionalLightShaftsShadowColor: instance.fixedSettings?.shadowColor ?? { r: 0, g: 0, b: 0 } };
        case "offsetShadow": return { ...base, offsetShadowEnabled: value.enabled, offsetShadowStrength: Number(value.strength), offsetShadowOffsetX: Number(value.offsetX), offsetShadowOffsetY: Number(value.offsetY), offsetShadowDepthBias: Number(value.depthBias), offsetShadowMaxDepth: Number(value.maxDepth), offsetShadowDepthScale: Number(value.depthScale), offsetShadowThickness: instance.fixedSettings?.thickness ?? 1, offsetShadowSoftness: instance.fixedSettings?.softness ?? 0, offsetShadowColor: instance.fixedSettings?.color ?? { r: 0.29, g: 0.21, b: 0.16 }, offsetShadowDebugView: false };
        case "offsetHighlight": return { ...base, offsetHighlightEnabled: value.enabled, offsetHighlightStrength: Number(value.strength), offsetHighlightOffsetX: Number(value.offsetX), offsetHighlightOffsetY: Number(value.offsetY), offsetHighlightDepthScale: Number(value.depthScale), offsetHighlightColor: instance.fixedSettings?.color ?? { r: 1, g: 1, b: 1 }, offsetHighlightDebugView: false };
    }
}

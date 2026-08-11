export const FRAME_GRAPH_EFFECT_SLIDER_MIN = 0;
export const FRAME_GRAPH_EFFECT_SLIDER_MAX = 100;

export type FrameGraphEffectSliderSpec = {
    actualMin: number;
    actualMax: number;
    actualStep?: number;
    curve?: "linear" | "logarithmic";
};

/**
 * Runtime and project values remain in their native units. This table only
 * defines how the FrameGraph detail panel maps them onto its common 0..100
 * interaction range.
 */
export const FRAME_GRAPH_EFFECT_SLIDER_SPECS = {
    bloomWeight: { actualMin: 0, actualMax: 2 },
    bloomThreshold: { actualMin: 0, actualMax: 2 },
    bloomKernel: { actualMin: 1, actualMax: 256, actualStep: 1 },
    luminousIntensity: { actualMin: 0, actualMax: 2 },
    luminousThreshold: { actualMin: 0, actualMax: 1.5 },
    luminousRadius: { actualMin: 1, actualMax: 128, actualStep: 1 },
    dofFocusOffset: { actualMin: -20_000, actualMax: 20_000, actualStep: 100 },
    dofLensSize: { actualMin: 1, actualMax: 4_096, actualStep: 1, curve: "logarithmic" },
    lutIntensity: { actualMin: 0, actualMax: 1 },
    motionBlurStrength: { actualMin: 0, actualMax: 10 },
    motionBlurSamples: { actualMin: 8, actualMax: 64, actualStep: 1 },
    ssaoStrength: { actualMin: 0, actualMax: 1 },
    ssaoRadius: { actualMin: 0.01, actualMax: 5, actualStep: 0.01 },
    ssgiStrength: { actualMin: 0, actualMax: 1 },
    ssgiSampleRadius: { actualMin: 1, actualMax: 256, actualStep: 1 },
    offsetShadowStrength: { actualMin: 0, actualMax: 2 },
    offsetShadowOffsetX: { actualMin: -64, actualMax: 64, actualStep: 1 },
    offsetShadowOffsetY: { actualMin: -64, actualMax: 64, actualStep: 1 },
    offsetShadowDepthBias: { actualMin: 0, actualMax: 0.4, actualStep: 0.001 },
    offsetShadowMaxDepth: { actualMin: 0.001, actualMax: 4, actualStep: 0.001 },
    offsetShadowDepthScale: { actualMin: 0, actualMax: 1 },
    offsetHighlightStrength: { actualMin: 0, actualMax: 1 },
    offsetHighlightOffsetX: { actualMin: -256, actualMax: 256, actualStep: 1 },
    offsetHighlightOffsetY: { actualMin: -256, actualMax: 256, actualStep: 1 },
    offsetHighlightDepthScale: { actualMin: 0, actualMax: 1 },
    ssrStrength: { actualMin: 0, actualMax: 2 },
    ssrStep: { actualMin: 1, actualMax: 8, actualStep: 1 },
    vignetteWeight: { actualMin: 0, actualMax: 4 },
    grainIntensity: { actualMin: 0, actualMax: 100, actualStep: 1 },
    sharpenEdge: { actualMin: 0, actualMax: 4 },
    chromaticAberration: { actualMin: 0, actualMax: 200, actualStep: 1 },
    edgeBlur: { actualMin: 0, actualMax: 1 },
    distortion: { actualMin: 0, actualMax: 1 },
} as const satisfies Record<string, FrameGraphEffectSliderSpec>;

export type FrameGraphEffectSliderField = keyof typeof FRAME_GRAPH_EFFECT_SLIDER_SPECS;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getSpec(field: FrameGraphEffectSliderField): FrameGraphEffectSliderSpec {
    return FRAME_GRAPH_EFFECT_SLIDER_SPECS[field];
}

function normalizeActualValue(spec: FrameGraphEffectSliderSpec, actualValue: number): number {
    const value = Number.isFinite(actualValue) ? actualValue : spec.actualMin;
    const clamped = clamp(value, spec.actualMin, spec.actualMax);
    if (spec.curve === "logarithmic") {
        const minLog = Math.log(spec.actualMin);
        const maxLog = Math.log(spec.actualMax);
        return (Math.log(clamped) - minLog) / (maxLog - minLog);
    }
    return (clamped - spec.actualMin) / (spec.actualMax - spec.actualMin);
}

function denormalizeActualValue(spec: FrameGraphEffectSliderSpec, normalized: number): number {
    if (spec.curve === "logarithmic") {
        const minLog = Math.log(spec.actualMin);
        const maxLog = Math.log(spec.actualMax);
        return Math.exp(minLog + normalized * (maxLog - minLog));
    }
    return spec.actualMin + normalized * (spec.actualMax - spec.actualMin);
}

function quantizeActualValue(spec: FrameGraphEffectSliderSpec, value: number): number {
    if (!spec.actualStep) {
        return clamp(value, spec.actualMin, spec.actualMax);
    }
    const steps = Math.round((value - spec.actualMin) / spec.actualStep);
    const quantized = spec.actualMin + steps * spec.actualStep;
    return clamp(Number(quantized.toFixed(10)), spec.actualMin, spec.actualMax);
}

export function isFrameGraphEffectSliderField(value: string): value is FrameGraphEffectSliderField {
    return Object.prototype.hasOwnProperty.call(FRAME_GRAPH_EFFECT_SLIDER_SPECS, value);
}

export function toFrameGraphEffectSliderValue(
    field: FrameGraphEffectSliderField,
    actualValue: number,
): number {
    const normalized = normalizeActualValue(getSpec(field), actualValue);
    return Math.round(FRAME_GRAPH_EFFECT_SLIDER_MIN
        + normalized * (FRAME_GRAPH_EFFECT_SLIDER_MAX - FRAME_GRAPH_EFFECT_SLIDER_MIN));
}

export function fromFrameGraphEffectSliderValue(
    field: FrameGraphEffectSliderField,
    sliderValue: number,
): number {
    const safeSliderValue = Number.isFinite(sliderValue) ? sliderValue : FRAME_GRAPH_EFFECT_SLIDER_MIN;
    const normalized = (
        clamp(safeSliderValue, FRAME_GRAPH_EFFECT_SLIDER_MIN, FRAME_GRAPH_EFFECT_SLIDER_MAX)
        - FRAME_GRAPH_EFFECT_SLIDER_MIN
    ) / (FRAME_GRAPH_EFFECT_SLIDER_MAX - FRAME_GRAPH_EFFECT_SLIDER_MIN);
    const spec = getSpec(field);
    return quantizeActualValue(spec, denormalizeActualValue(spec, normalized));
}

import { z } from "zod";

export type EffectValueById = {
    aerialPerspective: { enabled: boolean; strength: number; start: number; range: number };
    gamma: { enabled: boolean; gamma: number };
    grain: { enabled: boolean; intensity: number };
    bloom: { enabled: boolean; weight: number; threshold: number; kernel: number };
    vignette: { enabled: boolean; weight: number };
    sharpen: { enabled: boolean; edge: number };
    chromatic: { enabled: boolean; amount: number };
    edgeBlur: { enabled: boolean; strength: number };
    distortion: { enabled: boolean; influence: number };
    lut: { enabled: boolean; intensity: number };
    luminous: { enabled: boolean; intensity: number; threshold: number; radius: number };
};
export type EffectId = keyof EffectValueById;
export type EffectKeyframePayload = {
    [K in EffectId]: { kind: "effect"; effectId: K; value: EffectValueById[K] }
}[EffectId];
export type EffectValue = { enabled: boolean; [field: string]: number | boolean };
type Field = { kind: "step"; default: boolean } | { kind: "linear" | "log"; default: number; min: number; max: number };
export type EffectSlider = { field: string; panelField?: string; labelKey?: string; min: number; max: number; toValue: (position: number) => number; toPosition: (value: number) => number };
export type EffectDefinition = {
    id: EffectId;
    fields: Readonly<Record<string, Field>>;
    sliders: readonly EffectSlider[];
    fixedSettingsLabelKey?: string;
};
export const EFFECT_KEYFRAME_DEFINITIONS: readonly EffectDefinition[] = [
    { id: "gamma", fields: { enabled: { kind: "step", default: false }, gamma: { kind: "log", default: 1, min: 0.25, max: 4 } },
        sliders: [{ field: "gamma", panelField: "gammaPower", min: -100, max: 100, toValue: position => 2 ** (-position / 100), toPosition: value => -Math.log2(value) * 100 }] },
    { id: "grain", fields: { enabled: { kind: "step", default: false }, intensity: { kind: "linear", default: 0, min: 0, max: 100 } },
        sliders: [{ field: "intensity", panelField: "grainIntensity", min: 0, max: 100, toValue: position => position, toPosition: value => value }] },
    { id: "bloom", fields: { enabled: { kind: "step", default: false }, weight: { kind: "linear", default: 1, min: 0, max: 2 }, threshold: { kind: "linear", default: 1, min: 0, max: 2 }, kernel: { kind: "linear", default: 100, min: 1, max: 256 } },
        sliders: [
            { field: "weight", panelField: "bloomWeight", labelKey: "effect.frameGraphPost.controls.weight", min: 0, max: 200, toValue: position => position / 100, toPosition: value => value * 100 },
            { field: "threshold", panelField: "bloomThreshold", labelKey: "effect.frameGraphPost.controls.threshold", min: 0, max: 200, toValue: position => position / 100, toPosition: value => value * 100 },
            { field: "kernel", panelField: "bloomKernel", labelKey: "effect.frameGraphPost.controls.kernel", min: 0, max: 100, toValue: position => 1 + position * 255 / 100, toPosition: value => (value - 1) / 255 * 100 },
        ] },
    { id: "vignette", fields: { enabled: { kind: "step", default: false }, weight: { kind: "linear", default: 0.3, min: 0, max: 4 } },
        sliders: [{ field: "weight", panelField: "vignetteWeight", min: 0, max: 100, toValue: position => position * 4 / 100, toPosition: value => value / 4 * 100 }] },
    { id: "sharpen", fields: { enabled: { kind: "step", default: false }, edge: { kind: "linear", default: 0, min: 0, max: 4 } },
        sliders: [{ field: "edge", panelField: "sharpenEdge", min: 0, max: 100, toValue: position => position * 4 / 100, toPosition: value => value / 4 * 100 }] },
    { id: "chromatic", fields: { enabled: { kind: "step", default: false }, amount: { kind: "linear", default: 0, min: 0, max: 200 } },
        sliders: [{ field: "amount", panelField: "chromaticAberration", min: 0, max: 100, toValue: position => position * 200 / 100, toPosition: value => value / 200 * 100 }] },
    { id: "edgeBlur", fields: { enabled: { kind: "step", default: false }, strength: { kind: "linear", default: 0, min: 0, max: 3 } },
        sliders: [{ field: "strength", panelField: "edgeBlur", min: 0, max: 300, toValue: position => position / 100, toPosition: value => value * 100 }] },
    { id: "distortion", fields: { enabled: { kind: "step", default: false }, influence: { kind: "linear", default: 0, min: 0, max: 1 } },
        sliders: [{ field: "influence", panelField: "distortion", labelKey: "effect.frameGraphPost.controls.influence", min: 0, max: 100, toValue: position => position * 1 / 100, toPosition: value => value / 1 * 100 }] },
    { id: "lut", fixedSettingsLabelKey: "timeline.lutFixedSettings", fields: { enabled: { kind: "step", default: false }, intensity: { kind: "linear", default: 1, min: 0, max: 1 } },
        sliders: [{ field: "intensity", panelField: "lutIntensity", min: 0, max: 100, toValue: position => position / 100, toPosition: value => value * 100 }] },
    { id: "luminous", fixedSettingsLabelKey: "timeline.luminousFixedSettings", fields: { enabled: { kind: "step", default: false }, intensity: { kind: "linear", default: 0.5, min: 0, max: 4 }, threshold: { kind: "linear", default: 0.5, min: 0, max: 1.5 }, radius: { kind: "linear", default: 20, min: 1, max: 128 } },
        sliders: [
            { field: "intensity", panelField: "luminousIntensity", labelKey: "effect.frameGraphPost.controls.intensity", min: 0, max: 400, toValue: position => position / 100, toPosition: value => value * 100 },
            { field: "threshold", panelField: "luminousThreshold", labelKey: "effect.frameGraphPost.controls.threshold", min: 0, max: 150, toValue: position => position / 100, toPosition: value => value * 100 },
            { field: "radius", panelField: "luminousRadius", labelKey: "effect.frameGraphPost.controls.radius", min: 0, max: 100, toValue: position => 1 + position * 127 / 100, toPosition: value => (value - 1) / 127 * 100 },
        ] },
    { id: "aerialPerspective", fixedSettingsLabelKey: "timeline.aerialPerspectiveFixedSettings", fields: {
        enabled: { kind: "step", default: false }, strength: { kind: "linear", default: 0.18, min: 0, max: 0.6 },
        start: { kind: "linear", default: 55, min: 0, max: 2000 }, range: { kind: "linear", default: 180, min: 1, max: 4000 },
    }, sliders: [
        { field: "strength", panelField: "aerialPerspectiveStrength", labelKey: "effect.frameGraphPost.controls.strength", min: 0, max: 100, toValue: position => position * 0.6 / 100, toPosition: value => value / 0.6 * 100 },
        { field: "start", panelField: "aerialPerspectiveStart", labelKey: "effect.frameGraphPost.controls.startDistance", min: 0, max: 100, toValue: position => position * 5, toPosition: value => value / 5 },
        { field: "range", panelField: "aerialPerspectiveRange", labelKey: "effect.frameGraphPost.controls.transitionRange", min: 0, max: 100, toValue: position => Math.round(20 * 50 ** (position / 100)), toPosition: value => Math.log(value / 20) / Math.log(50) * 100 },
    ] },
];
export function isEffectId(id: string): id is EffectId {
    return EFFECT_KEYFRAME_DEFINITIONS.some(definition => definition.id === id);
}
export function getEffectDefinition(id: EffectId): EffectDefinition {
    const definition = EFFECT_KEYFRAME_DEFINITIONS.find(candidate => candidate.id === id);
    if (!definition) throw new Error(`Unknown effect: ${id}`);
    return definition;
}
export function normalizeEffectValue(definition: EffectDefinition, input: unknown, fallback?: EffectValue): EffectValue {
    const values = input && typeof input === "object" ? input as Record<string, unknown> : {};
    return Object.fromEntries(Object.entries(definition.fields).map(([key, field]) => {
        const value = values[key] ?? fallback?.[key] ?? field.default;
        return [key, field.kind === "step" ? (typeof value === "boolean" ? value : field.default)
            : typeof value === "number" && Number.isFinite(value) ? Math.max(field.min, Math.min(field.max, value)) : field.default];
    })) as EffectValue;
}
export function interpolateEffectValue(definition: EffectDefinition, from: EffectValue, to: EffectValue, amount: number): EffectValue {
    return Object.fromEntries(Object.entries(definition.fields).map(([key, field]) => {
        const a = from[key], b = to[key];
        if (field.kind === "step" || typeof a !== "number" || typeof b !== "number") return [key, a];
        return [key, field.kind === "log" ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * amount) : a + (b - a) * amount];
    })) as EffectValue;
}
function valueSchema(id: EffectId) {
    return z.object(Object.fromEntries(Object.entries(getEffectDefinition(id).fields).map(([key, field]) =>
        [key, field.kind === "step" ? z.boolean() : z.number().finite().min(field.min).max(field.max)]))).strict();
}
export const effectKeyframePayloadSchema = z.object({
    kind: z.literal("effect"), effectId: z.enum(["aerialPerspective", "gamma", "grain", "bloom", "vignette", "sharpen", "chromatic", "edgeBlur", "distortion", "lut", "luminous"]), value: z.record(z.string(), z.union([z.number(), z.boolean()])),
}).strict().superRefine((payload, context) => {
    const parsed = valueSchema(payload.effectId).safeParse(payload.value);
    if (!parsed.success) context.addIssue({ code: "custom", path: ["value"], message: "Effect values do not match the effect definition" });
}).transform(payload => payload as EffectKeyframePayload);
export function makeEffectPayload(id: EffectId, value: unknown): EffectKeyframePayload {
    return { kind: "effect", effectId: id, value: normalizeEffectValue(getEffectDefinition(id), value) } as EffectKeyframePayload;
}

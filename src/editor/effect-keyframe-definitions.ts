import { z } from "zod";

export type EffectValueById = {
    gamma: { enabled: boolean; gamma: number };
    grain: { enabled: boolean; intensity: number };
    bloom: { enabled: boolean; weight: number; threshold: number };
};
export type EffectId = keyof EffectValueById;
export type EffectKeyframePayload = {
    [K in EffectId]: { kind: "effect"; effectId: K; value: EffectValueById[K] }
}[EffectId];
export type EffectValue = { enabled: boolean; [field: string]: number | boolean };
type Field = { kind: "step"; default: boolean } | { kind: "linear" | "log"; default: number; min: number; max: number };
export type EffectSlider = { field: string; labelKey?: string; min: number; max: number; toValue: (position: number) => number; toPosition: (value: number) => number };
export type EffectDefinition = {
    id: EffectId;
    fields: Readonly<Record<string, Field>>;
    sliders: readonly EffectSlider[];
};
export const EFFECT_KEYFRAME_DEFINITIONS: readonly EffectDefinition[] = [
    { id: "gamma", fields: { enabled: { kind: "step", default: false }, gamma: { kind: "log", default: 1, min: 0.25, max: 4 } },
        sliders: [{ field: "gamma", min: -100, max: 100, toValue: position => 2 ** (-position / 100), toPosition: value => -Math.log2(value) * 100 }] },
    { id: "grain", fields: { enabled: { kind: "step", default: false }, intensity: { kind: "linear", default: 0, min: 0, max: 100 } },
        sliders: [{ field: "intensity", min: 0, max: 100, toValue: position => position, toPosition: value => value }] },
    { id: "bloom", fields: { enabled: { kind: "step", default: false }, weight: { kind: "linear", default: 1, min: 0, max: 2 }, threshold: { kind: "linear", default: 1, min: 0, max: 2 } },
        sliders: [
            { field: "weight", labelKey: "effect.frameGraphPost.controls.weight", min: 0, max: 200, toValue: position => position / 100, toPosition: value => value * 100 },
            { field: "threshold", labelKey: "effect.frameGraphPost.controls.threshold", min: 0, max: 200, toValue: position => position / 100, toPosition: value => value * 100 },
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
    kind: z.literal("effect"), effectId: z.enum(["gamma", "grain", "bloom"]), value: z.record(z.string(), z.union([z.number(), z.boolean()])),
}).strict().superRefine((payload, context) => {
    const parsed = valueSchema(payload.effectId).safeParse(payload.value);
    if (!parsed.success) context.addIssue({ code: "custom", path: ["value"], message: "Effect values do not match the effect definition" });
}).transform(payload => payload as EffectKeyframePayload);
export function makeEffectPayload(id: EffectId, value: unknown): EffectKeyframePayload {
    return { kind: "effect", effectId: id, value: normalizeEffectValue(getEffectDefinition(id), value) } as EffectKeyframePayload;
}

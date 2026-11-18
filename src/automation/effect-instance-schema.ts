import { z } from "zod";
import { FRAME_GRAPH_INSTANCE_EFFECT_TYPES } from "../editor/frame-graph-instance-effects";
import { INSTANCE_LUT_PRESETS } from "../editor/frame-graph-instance-lut-presets";

// Main-process tool discovery must not import editor stores or renderer resources.
const instanceId = z.string().regex(/^fx-[a-zA-Z0-9-]{1,190}$/);
const color = z.object({ r: z.number().finite().min(0).max(1), g: z.number().finite().min(0).max(1), b: z.number().finite().min(0).max(1) }).strict();
const radiance = z.object({
    strength: z.number().finite().min(0).max(8).optional(),
    range: z.number().finite().min(1).max(100).optional(),
    softness: z.number().finite().min(0).max(1).optional(),
}).strict().refine(value => Object.values(value).some(field => field !== undefined), "At least one radiance field required");
const fixedSettings = z.object({
    bloomColor: color.optional(), color: color.optional(), shadowColor: color.optional(),
    samples: z.number().int().min(8).max(64).optional(),
    lut: z.object({ kind: z.literal("builtin"), preset: z.enum(INSTANCE_LUT_PRESETS.map(item => item.id)) }).strict().optional(),
    radiance: radiance.optional(),
}).strict().refine(value => Object.values(value).some(field => field !== undefined), "At least one fixed field required");

export const effectInstanceOperationSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("add"), effectType: z.enum(FRAME_GRAPH_INSTANCE_EFFECT_TYPES) }).strict(),
    z.object({ action: z.literal("duplicate"), instanceId }).strict(),
    z.object({ action: z.literal("suspend"), instanceId }).strict(),
    z.object({ action: z.literal("resume"), instanceId }).strict(),
    z.object({ action: z.literal("delete"), instanceId }).strict(),
    z.object({ action: z.literal("rename"), instanceId,
        label: z.string().trim().min(1).max(80).refine(value => ![...value].some(character => character.charCodeAt(0) < 32), "Invalid name") }).strict(),
    z.object({ action: z.literal("reorder"), instanceId, targetId: z.string().min(1).max(200), placement: z.enum(["before", "after"]) }).strict(),
    z.object({ action: z.literal("fixed"), instanceId, settings: fixedSettings }).strict(),
]);
export type AutomationEffectInstanceOperation = z.infer<typeof effectInstanceOperationSchema>;
export type AutomationEffectFixedPatch = z.infer<typeof fixedSettings>;

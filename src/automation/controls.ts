import { z } from "zod";
import type { MmdManager } from "../mmd-manager";
import { AutomationError } from "./diagnostics";
import { FRAME_GRAPH_POST_EFFECT_IDS } from "../shared/frame-graph-post-effect-stack";

type NumericKey = { [K in keyof MmdManager]: MmdManager[K] extends number ? K : never }[keyof MmdManager];
type BooleanKey = { [K in keyof MmdManager]: MmdManager[K] extends boolean ? K : never }[keyof MmdManager];
type Control = { id: string; unit: string; schema: z.ZodType; read: (manager: MmdManager) => unknown;
    write: (manager: MmdManager, value: unknown) => void; available: (manager: MmdManager) => boolean };
const available = () => true;
const frameGraph = (m: MmdManager) => m.getPostEffectBackend() === "frameGraph";
function numeric<K extends NumericKey>(id: string, key: K, min: number, max: number, unit = "scalar", integer = false, enabled: Control["available"] = available): Control {
    const schema = integer ? z.number().int().min(min).max(max) : z.number().finite().min(min).max(max);
    return { id, unit, schema, available: enabled, read: m => m[key], write: (m, value) => { m[key] = schema.parse(value) as MmdManager[K]; } };
}
function flag<K extends BooleanKey>(id: string, key: K, enabled: Control["available"] = available): Control {
    return { id, unit: "boolean", schema: z.boolean(), available: enabled, read: m => m[key], write: (m, value) => { m[key] = z.boolean().parse(value) as MmdManager[K]; } };
}
const rgb = z.object({ r: z.number().min(0).max(1), g: z.number().min(0).max(1), b: z.number().min(0).max(1) }).strict();
const stack = z.array(z.object({ id: z.enum(FRAME_GRAPH_POST_EFFECT_IDS), enabled: z.boolean() }).strict()).max(FRAME_GRAPH_POST_EFFECT_IDS.length)
    .refine(value => new Set(value.map(entry => entry.id)).size === value.length, "Duplicate effect ID");
function color(id: string, read: (m: MmdManager) => { r: number; g: number; b: number }, write: (m: MmdManager, r: number, g: number, b: number) => void): Control {
    return { id, unit: "RGB 0..1", schema: rgb, read, available, write: (m, value) => { const v = rgb.parse(value); write(m, v.r, v.g, v.b); } };
}

/** Explicit allowlist. These are the same runtime setters used by the GUI; no reflection-based method execution. */
export const automationControls: readonly Control[] = [
    { id: "render.stack", unit: "ordered effects", schema: stack, available: frameGraph, read: m => m.getFrameGraphPostEffectStackEntries(), write: (m, value) => m.setFrameGraphPostEffectStackEntries(stack.parse(value)) },
    flag("bloom.enabled", "postEffectBloomEnabled"),
    numeric("bloom.weight", "postEffectBloomWeight", 0, 2),
    numeric("bloom.threshold", "postEffectBloomThreshold", 0, 2),
    numeric("bloom.kernel", "postEffectBloomKernel", 1, 256, "pixels", true),
    color("bloom.color", m => m.getPostEffectBloomColor(), (m, r, g, b) => m.setPostEffectBloomColor(r, g, b)),
    flag("ssao.enabled", "postEffectSsaoEnabled"),
    numeric("ssao.strength", "postEffectSsaoStrength", 0, 1),
    numeric("ssao.radius", "postEffectSsaoRadius", 0.01, 5),
    numeric("ssao.fadeEnd", "postEffectSsaoFadeEnd", 4, 200, "meters"),
    flag("ssao.debug", "postEffectSsaoDebugView"),
    flag("ssr.enabled", "postEffectSsrEnabled"),
    numeric("ssr.strength", "postEffectSsrStrength", 0, 1),
    flag("fog.enabled", "postEffectFogEnabled"),
    numeric("fog.start", "postEffectFogStart", 0, 10000, "scene units"),
    numeric("fog.end", "postEffectFogEnd", 0, 10000, "scene units"),
    numeric("fog.density", "postEffectFogDensity", 0, 1),
    numeric("fog.opacity", "postEffectFogOpacity", 0, 1),
    color("fog.color", m => m.getPostEffectFogColor(), (m, r, g, b) => m.setPostEffectFogColor(r, g, b)),
    flag("dof.enabled", "dofEnabled"),
    numeric("dof.quality", "dofBlurLevel", 0, 2, "0=low,1=medium,2=high", true),
    numeric("dof.focusDistance", "dofFocusDistanceMm", 1, 1000000, "millimeters", false, m => !m.dofAutoFocusEnabled),
    numeric("dof.focusOffset", "dofAutoFocusNearOffsetMm", -100000, 100000, "millimeters"),
    numeric("dof.nearSuppression", "dofNearSuppressionScale", 0, 1),
    numeric("dof.lensBlurStrength", "dofLensBlurStrength", 0, 1),
    flag("dof.lensBlurEnabled", "dofLensBlurEnabled"),
    flag("dof.focalLengthInverted", "dofFocalLengthDistanceInverted"),
    numeric("lens.edgeBlur", "dofLensEdgeBlur", 0, 1),
    numeric("lens.distortionInfluence", "dofLensDistortionInfluence", 0, 1),
    numeric("lens.chromaticAberration", "postEffectChromaticAberration", 0, 200),
    numeric("light.intensity", "lightIntensity", 0, 2),
    numeric("light.ambientIntensity", "ambientIntensity", 0, 2),
    numeric("light.temperature", "lightColorTemperature", 1000, 20000, "kelvin", true),
    numeric("light.flatStrength", "lightFlatStrength", 0, 0.1),
    numeric("light.flatColorInfluence", "lightFlatColorInfluence", 0, 1),
    color("light.color", m => m.getLightColor(), (m, r, g, b) => m.setLightColor(r, g, b)),
    numeric("shadow.darkness", "shadowDarkness", 0, 1),
    numeric("shadow.distanceMultiplier", "shadowDistanceMultiplier", 1, 10, "multiplier", true),
    numeric("shadow.filteringQuality", "shadowFilteringQuality", 0, 2, "0=high,1=medium,2=low", true),
    flag("shadow.penumbra", "shadowPenumbraEnabled"),
    flag("edge.uniformWidth", "modelEdgeUniformWidthEnabled"),
    flag("edge.colorOverride", "modelEdgeColorOverrideEnabled"),
    numeric("edge.width", "modelEdgeWidth", 0, 0.1),
    color("edge.color", m => m.getModelEdgeColor(), (m, r, g, b) => m.setModelEdgeColor(r, g, b)),
    flag("contactShadow.enabled", "characterContactShadowEnabled", frameGraph),
    numeric("contactShadow.opacity", "characterContactShadowOpacity", 0, 1, "scalar", false, frameGraph),
    numeric("contactShadow.scale", "characterContactShadowScale", 0.1, 4, "multiplier", false, frameGraph),
    numeric("iblShadow.opacity", "iblShadowOpacity", 0, 1),
    numeric("iblShadow.distanceScale", "iblShadowDistanceScale", 0.1, 4),
    { id: "environment.enabled", unit: "boolean", schema: z.boolean(), available, read: m => m.isEnvironmentLightingEnabled(), write: (m, v) => { m.setEnvironmentLightingEnabled(z.boolean().parse(v)); } },
    { id: "environment.intensity", unit: "multiplier", schema: z.number().min(0).max(4), available, read: m => m.getEnvironmentLightingIntensity(), write: (m, v) => { m.setEnvironmentLightingIntensity(z.number().parse(v)); } },
    { id: "iblShadow.enabled", unit: "boolean", schema: z.boolean(), available, read: m => m.isIblShadowsEnabled(), write: (m, v) => { m.setIblShadowsEnabled(z.boolean().parse(v)); } },
    { id: "physics.buffered", unit: "boolean", schema: z.boolean(), available: m => m.isPhysicsAvailable(), read: m => m.getPhysicsBufferedEvaluationEnabled(), write: (m, v) => { m.setPhysicsBufferedEvaluationEnabled(z.boolean().parse(v)); } },
    { id: "physics.fullyDampedCorrection", unit: "boolean", schema: z.boolean(), available: m => m.isPhysicsAvailable(), read: m => m.getFullyDampedRigidBodyCorrectionEnabled(), write: (m, v) => { m.setFullyDampedRigidBodyCorrectionEnabled(z.boolean().parse(v)); } },
];
const byId = new Map(automationControls.map(control => [control.id, control]));
const [first, ...rest] = automationControls.map(control => z.object({ id: z.literal(control.id), value: control.schema }).strict());
if (!first) throw new Error("Control catalog must not be empty");
export const automationControlSchema = z.discriminatedUnion("id", [first, ...rest]);
export type AutomationControl = z.infer<typeof automationControlSchema>;
export function readAutomationControls(manager: MmdManager, query: string, offset: number, limit: number) {
    const matches = automationControls.filter(control => control.id.toLowerCase().includes(query.toLowerCase()));
    return { totalCount: matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null,
        items: matches.slice(offset, offset + limit).map(control => ({ id: control.id, unit: control.unit, value: control.read(manager),
            available: control.available(manager), valueSchema: z.toJSONSchema(control.schema), undoable: false })) };
}
export function applyAutomationControl(manager: MmdManager, input: AutomationControl) {
    const control = byId.get(input.id);
    if (!control) throw new AutomationError("SETTING_UNAVAILABLE");
    const value = control.schema.parse(input.value);
    if (!control.available(manager)) throw new AutomationError("SETTING_UNAVAILABLE");
    const before = control.read(manager);
    if (JSON.stringify(before) !== JSON.stringify(value)) control.write(manager, value);
    const applied = control.read(manager);
    return { id: input.id, requested: value, applied, changed: JSON.stringify(before) !== JSON.stringify(applied), undoable: false };
}

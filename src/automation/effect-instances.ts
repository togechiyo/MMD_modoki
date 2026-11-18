import { buildEffectInstanceDiff, type EffectInstanceDiff } from "../actions/effect-instance-command";
import { editEffectInstances } from "../editor/effect-instance-operations";
import { getEffectDefinition, type EffectValue } from "../editor/effect-keyframe-definitions";
import { FrameGraphEffectInstances, type SerializedEffectInstances } from "../editor/frame-graph-effect-instances";
import type { EffectInstanceType, InstanceColor } from "../editor/frame-graph-instance-effects";
import { visibleInstanceFixedFields, type InstanceFixedSettings } from "../editor/frame-graph-instance-fixed-settings";
import { AutomationError } from "./diagnostics";
import { effectInstanceOperationSchema, type AutomationEffectInstanceOperation, type AutomationEffectFixedPatch } from "./effect-instance-schema";
export { effectInstanceOperationSchema, type AutomationEffectInstanceOperation } from "./effect-instance-schema";
export type AutomationEffectInstancePlan = {
    action: AutomationEffectInstanceOperation["action"];
    instanceId: string;
    sourceInstanceId?: string;
    effectType: EffectInstanceType;
    changed: boolean;
    displayOrder: string[];
};

function editFixed(store: FrameGraphEffectInstances, id: string, type: EffectInstanceType, patch: AutomationEffectFixedPatch): void {
    const visible = visibleInstanceFixedFields(type);
    for (const field of Object.keys(patch) as (keyof typeof patch)[]) {
        if (patch[field] !== undefined && !visible.includes(field)) throw new AutomationError("INVALID_EDIT", { field: `settings.${field}` });
    }
    if (patch.bloomColor !== undefined) {
        editEffectInstances(store, { action: "color", instanceId: id, color: patch.bloomColor });
        return;
    }
    const settings: InstanceFixedSettings = store.fixedSettings(id) ?? {};
    if (patch.color !== undefined) settings.color = patch.color;
    if (patch.shadowColor !== undefined) settings.shadowColor = patch.shadowColor;
    if (patch.samples !== undefined) settings.samples = patch.samples;
    if (patch.lut !== undefined) settings.lut = patch.lut;
    if (patch.radiance !== undefined) settings.radiance = {
        ...settings.radiance ?? { enabled: true, strength: 1, range: 12 }, ...patch.radiance,
    };
    editEffectInstances(store, { action: "fixed", instanceId: id, settings });
}

/** Build the same authored diff as the GUI without mutating the live state, including during dry runs. */
export function buildAutomationEffectInstanceEdit(state: SerializedEffectInstances, input: AutomationEffectInstanceOperation): {
    diff: EffectInstanceDiff | null; plan: AutomationEffectInstancePlan;
} {
    const operation = effectInstanceOperationSchema.parse(input);
    const next = new FrameGraphEffectInstances();
    next.restore(state);
    const previousIds = new Set(next.ids());
    const type = operation.action === "add" ? operation.effectType : next.type(operation.instanceId);
    if (!type) throw new AutomationError("INVALID_EDIT", { field: "instanceId" });
    if (operation.action === "reorder") {
        if (!next.present(operation.instanceId)) throw new AutomationError("INVALID_EDIT", { field: "instanceId" });
        if (!next.present(operation.targetId)) throw new AutomationError("INVALID_EDIT", { field: "targetId" });
        // The shared GUI helper uses display order, which is reverse compositing order.
        editEffectInstances(next, { ...operation, draggedId: operation.instanceId });
    } else if (operation.action === "fixed") {
        editFixed(next, operation.instanceId, type, operation.settings);
    } else {
        editEffectInstances(next, operation);
    }
    const after = next.serialize(), diff = buildEffectInstanceDiff(state, after);
    const generatedId = next.ids().find(id => !previousIds.has(id));
    const affectedId = operation.action === "add" || operation.action === "duplicate" ? generatedId : operation.instanceId;
    if (!affectedId) throw new AutomationError("OPERATION_FAILED");
    return { diff, plan: { action: operation.action, instanceId: affectedId, effectType: type,
        ...(operation.action === "duplicate" ? { sourceInstanceId: operation.instanceId } : {}),
        changed: diff !== null, displayOrder: [...after.order].reverse() } };
}

export type AutomationEffectInstanceInspectionSource = {
    instanceId: string; type: EffectInstanceType; label: string; suspended: boolean; value: EffectValue;
    bloomColor?: InstanceColor; fixedSettings?: InstanceFixedSettings;
};
type PublicFixedSettings = {
    bloomColor?: InstanceColor; color?: InstanceColor; shadowColor?: InstanceColor; samples?: number;
    lut?: { kind: "builtin"; preset: string } | { kind: "external" };
    radiance?: { strength: number; range: number; softness: number };
};
const copyColor = ({ r, g, b }: InstanceColor): InstanceColor => ({ r, g, b });

/** Uses lightweight runtime metadata; never serializes animation or reads external LUT contents/names. */
export function inspectAutomationEffectInstance(source: AutomationEffectInstanceInspectionSource) {
    const valueFields = Object.keys(getEffectDefinition(source.type).fields), fixedFields = visibleInstanceFixedFields(source.type);
    const settings: PublicFixedSettings = {}, fixed = source.fixedSettings;
    if (fixedFields.includes("bloomColor") && source.bloomColor) settings.bloomColor = copyColor(source.bloomColor);
    if (fixedFields.includes("color") && fixed?.color) settings.color = copyColor(fixed.color);
    if (fixedFields.includes("shadowColor") && fixed?.shadowColor) settings.shadowColor = copyColor(fixed.shadowColor);
    if (fixedFields.includes("samples") && fixed?.samples !== undefined) settings.samples = fixed.samples;
    if (fixedFields.includes("lut") && fixed?.lut) settings.lut = fixed.lut.kind === "builtin"
        ? { kind: "builtin", preset: fixed.lut.preset } : { kind: "external" };
    if (fixedFields.includes("radiance") && fixed?.radiance) settings.radiance = {
        strength: fixed.radiance.strength, range: fixed.radiance.range, softness: fixed.radiance.softness ?? 0,
    };
    const value: EffectValue = { enabled: source.value.enabled };
    for (const field of valueFields) if (Object.hasOwn(source.value, field)) value[field] = source.value[field];
    return { instanceId: source.instanceId, effectType: source.type, label: source.label, suspended: source.suspended,
        value, fixedSettings: settings, publicFields: { value: valueFields, fixed: [...fixedFields] } };
}

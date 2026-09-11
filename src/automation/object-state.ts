import { z } from "zod";
import type { MmdManager } from "../mmd-manager";
import type { ObjectState, ObjectSubject } from "../editor/object-state-edit";
import { AutomationError } from "./diagnostics";

const name = z.string().min(1).max(200);
export const objectSubjectSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("model"), modelInstanceId: name }).strict(),
    z.object({ kind: z.literal("accessory"), accessoryIndex: z.number().int().nonnegative(), expectedPath: z.string().min(1).max(4096) }).strict(),
]);
const vector = (min: number, max: number) => z.object({ x: z.number().min(min).max(max), y: z.number().min(min).max(max), z: z.number().min(min).max(max) }).strict();
export const objectPatchSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("model"), visible: z.boolean().optional(), castsShadow: z.boolean().optional(),
        ikStates: z.array(z.object({ boneName: name, enabled: z.boolean() }).strict()).min(1).max(200).refine(items => new Set(items.map(item => item.boneName)).size === items.length, "Duplicate IK").optional() }).strict(),
    z.object({ kind: z.literal("accessory"), visible: z.boolean().optional(), castsShadow: z.boolean().optional(),
        transform: z.object({ position: vector(-100, 100), rotationDeg: vector(-180, 180), scale: z.number().min(0.01).max(50) }).strict().optional(),
        parent: z.object({ modelInstanceId: name, boneName: name.nullable() }).strict().nullable().optional() }).strict(),
]).refine(value => Object.keys(value).some(key => key !== "kind"), "At least one field required");

export function normalizeObjectPatch(patch: z.infer<typeof objectPatchSchema>): ObjectState {
    if (patch.kind === "model") return patch;
    const { parent, ...fields } = patch;
    return { ...fields, ...(parent !== undefined ? { parent: parent ? { modelInstanceId: parent.modelInstanceId, boneName: parent.boneName ?? null } : null } : {}) };
}

export function readObjectState(manager: MmdManager, subject: ObjectSubject): ObjectState {
    if (subject.kind === "model") {
        const value = manager.getModelEditingState(subject.modelInstanceId);
        if (!value) throw new AutomationError("MODEL_NOT_FOUND");
        return { kind: "model", ...value };
    }
    const item = manager.getLoadedAccessories().find(item => item.index === subject.accessoryIndex && item.path === subject.expectedPath);
    if (!item) throw new AutomationError("ASSET_CHANGED");
    const transform = manager.getAccessoryTransform(item.index);
    if (!transform) throw new AutomationError("ASSET_CHANGED");
    const link = manager.getAccessoryParent(item.index);
    const parent = manager.getLoadedModels().find(model => model.index === link?.modelIndex);
    return { kind: "accessory", transform, visible: item.visible, castsShadow: item.castsShadow,
        parent: parent ? { modelInstanceId: parent.instanceId, boneName: link?.boneName ?? null } : null };
}

export function validateObjectState(manager: MmdManager, subject: ObjectSubject, patch: ObjectState): void {
    const current = readObjectState(manager, subject);
    if (current.kind !== patch.kind) throw new AutomationError("KEY_KIND_MISMATCH");
    if (patch.kind === "model" && current.kind === "model") {
        for (const [operationIndex, value] of (patch.ikStates ?? []).entries()) {
            if (current.ikStates.filter(item => item.boneName === value.boneName).length !== 1) throw new AutomationError("IK_NOT_UNIQUE", { operationIndex });
        }
    }
    if (patch.kind === "accessory" && patch.parent) {
        const model = manager.getLoadedModels().find(item => item.instanceId === patch.parent.modelInstanceId);
        if (!model) throw new AutomationError("MODEL_NOT_FOUND");
        if (patch.parent.boneName !== null && manager.getModelBoneNames(model.index).filter(name => name === patch.parent.boneName).length !== 1) throw new AutomationError("BONE_NOT_UNIQUE");
    }
}

/** Same setters as the panels; callers provide selection, validation, history, and UI refresh. */
export function writeObjectState(manager: MmdManager, subject: ObjectSubject, patch: ObjectState): void {
    if (subject.kind === "model" && patch.kind === "model") {
        if (patch.visible !== undefined) manager.setActiveModelVisibility(patch.visible);
        if (patch.castsShadow !== undefined && !manager.setActiveModelCastsShadow(patch.castsShadow)) throw new Error("Model shadow unavailable");
        for (const value of patch.ikStates ?? []) if (!manager.setActiveModelIkState(value.boneName, value.enabled)) throw new Error("IK unavailable");
    } else if (subject.kind === "accessory" && patch.kind === "accessory") {
        if (patch.parent !== undefined) {
            const model = patch.parent ? manager.getLoadedModels().find(item => item.instanceId === patch.parent.modelInstanceId) : null;
            if (!manager.setAccessoryParent(subject.accessoryIndex, model?.index ?? null, patch.parent?.boneName ?? null)) throw new Error("Accessory parent unavailable");
        }
        if (patch.transform && !manager.setAccessoryTransform(subject.accessoryIndex, patch.transform)) throw new Error("Accessory transform unavailable");
        if (patch.visible !== undefined) manager.setAccessoryVisibility(subject.accessoryIndex, patch.visible);
        if (patch.castsShadow !== undefined && !manager.setAccessoryCastsShadow(subject.accessoryIndex, patch.castsShadow)) throw new Error("Accessory shadow unavailable");
    }
}

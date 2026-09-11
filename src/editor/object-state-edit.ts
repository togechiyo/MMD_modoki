import type { CommandDirection } from "../actions/command-types";
import { keyframeValuesEqual } from "../actions/keyframe-transaction";

export type ObjectSubject = { kind: "model"; modelInstanceId: string } | { kind: "accessory"; accessoryIndex: number; expectedPath: string };
export type ObjectTransform = { position: { x: number; y: number; z: number }; rotationDeg: { x: number; y: number; z: number }; scale: number };
export type ObjectState =
    | { kind: "model"; visible?: boolean; castsShadow?: boolean; ikStates?: { boneName: string; enabled: boolean }[] }
    | { kind: "accessory"; visible?: boolean; castsShadow?: boolean; transform?: ObjectTransform; parent?: { modelInstanceId: string; boneName: string | null } | null };
export type ObjectStateEdit = { type: "edit.objectState"; subject: ObjectSubject; frame: number; before: ObjectState; after: ObjectState };

/** Only the requested fields belong to this command; other settings and IK switches stay untouched. */
export function selectObjectStateFields(state: ObjectState, fields: ObjectState): ObjectState | null {
    if (state.kind !== fields.kind) return null;
    const result: ObjectState = { kind: state.kind };
    if (fields.visible !== undefined) result.visible = state.visible;
    if (fields.castsShadow !== undefined) result.castsShadow = state.castsShadow;
    if (fields.kind === "accessory" && state.kind === "accessory" && result.kind === "accessory") {
        if (fields.transform !== undefined) result.transform = structuredClone(state.transform);
        if (fields.parent !== undefined) result.parent = structuredClone(state.parent);
    }
    if (fields.kind === "model" && state.kind === "model" && result.kind === "model" && fields.ikStates !== undefined) {
        if (fields.ikStates.some(value => state.ikStates?.filter(item => item.boneName === value.boneName).length !== 1)) return null;
        result.ikStates = fields.ikStates.map(value => ({ ...state.ikStates.find(item => item.boneName === value.boneName) }));
    }
    return result;
}

export function buildObjectStateEdit(subject: ObjectSubject, frame: number, current: ObjectState, patch: ObjectState): ObjectStateEdit | null {
    // A local transform can only be undone in the same parent coordinate system.
    if (patch.kind === "accessory" && current.kind === "accessory" && patch.transform !== undefined && patch.parent === undefined) patch = { ...patch, parent: structuredClone(current.parent) };
    const before = selectObjectStateFields(current, patch);
    if (!before) return null;
    return { type: "edit.objectState", subject: { ...subject }, frame, before, after: structuredClone(patch) };
}

export function executeObjectStateEdit(diff: ObjectStateEdit, direction: CommandDirection, host: {
    matches(subject: ObjectSubject, frame: number): boolean;
    read(subject: ObjectSubject): ObjectState | null;
    validate(subject: ObjectSubject, state: ObjectState): boolean;
    write(subject: ObjectSubject, state: ObjectState): void;
}): boolean {
    if (!host.matches(diff.subject, diff.frame)) return false;
    const source = direction === "apply" ? diff.before : diff.after;
    const destination = direction === "apply" ? diff.after : diff.before;
    const matches = (expected: ObjectState): boolean => {
        const current = host.read(diff.subject);
        return Boolean(current && keyframeValuesEqual(selectObjectStateFields(current, expected), expected));
    };
    if (!matches(source) || !host.validate(diff.subject, destination)) return false;
    try {
        host.write(diff.subject, destination);
        if (!matches(destination)) throw new Error("Object state write mismatch");
    } catch {
        host.write(diff.subject, source);
        if (!matches(source)) throw new Error("Object state rollback failed");
        return false;
    }
    return true;
}

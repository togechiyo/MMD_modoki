import type { CommandTrackRef } from "../actions/command-types";
import { keyframeValuesEqual, type KeyframeScope, type KeyframeTransaction } from "../actions/keyframe-transaction";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";
import { AutomationError } from "./contracts";
import type { AutomationKeyframeOperation } from "./keyframe-schema";

function normalizeInputPayload(payload: Extract<AutomationKeyframeOperation, { action: "set" }>["payload"]): TimelineKeyframePayload {
    // Preserve required nullable fields even under this repository's strictNullChecks:false.
    if (payload.kind === "camera") return { ...payload, externalParent: { ...payload.externalParent, modelInstanceId: payload.externalParent.modelInstanceId ?? null, modelPath: payload.externalParent.modelPath ?? null, boneName: payload.externalParent.boneName ?? null } };
    if (payload.kind === "bone" || payload.kind === "movableBone") return { ...payload, externalParent: payload.externalParent ? { ...payload.externalParent, parentModelPath: payload.externalParent.parentModelPath ?? null, parentBoneName: payload.externalParent.parentBoneName ?? null } : undefined };
    return payload;
}

export function buildAutomationKeyframeEdit(
    owner: KeyframeScope,
    operations: readonly AutomationKeyframeOperation[],
    collision: "reject" | "replace",
    read: (track: CommandTrackRef, frame: number) => TimelineKeyframePayload | null,
): KeyframeTransaction {
    const key = (track: CommandTrackRef, frame: number): string => JSON.stringify([track.category, track.name, frame]);
    const removed = new Set<string>();
    const destinations = new Set<string>();
    const items = new Map<string, KeyframeTransaction["items"][number]>();
    const put = (track: CommandTrackRef, frame: number, after: TimelineKeyframePayload | null): void => {
        const id = key(track, frame);
        const previous = items.get(id);
        items.set(id, { track: { ...track }, frame, before: previous?.before ?? read(track, frame), after });
    };
    for (const [operationIndex, operation] of operations.entries()) {
        if (operation.action === "delete" || (operation.action === "move" && operation.toFrame !== operation.frame)) {
            const id = key(operation.track, operation.frame);
            if (removed.has(id)) throw new AutomationError("DUPLICATE_KEY", { operationIndex, frame: operation.frame });
            if (!read(operation.track, operation.frame)) throw new AutomationError("KEY_NOT_FOUND", { operationIndex, frame: operation.frame });
            removed.add(id);
            put(operation.track, operation.frame, null);
        }
    }
    for (const [operationIndex, operation] of operations.entries()) {
        if (operation.action === "delete") continue;
        const frame = operation.action === "set" ? operation.frame : operation.toFrame;
        const id = key(operation.track, frame);
        if (destinations.has(id)) throw new AutomationError("DUPLICATE_KEY", { operationIndex, frame });
        destinations.add(id);
        const payload = operation.action === "set" ? normalizeInputPayload(operation.payload) : read(operation.track, operation.frame);
        if (!payload) throw new AutomationError("KEY_NOT_FOUND", { operationIndex, frame: operation.frame });
        const existing = read(operation.track, frame);
        if (collision === "reject" && existing && !removed.has(id) && !keyframeValuesEqual(existing, payload)) throw new AutomationError("KEY_COLLISION", { operationIndex, frame });
        put(operation.track, frame, payload);
    }
    // A delete plus a set/copy of the same slot is ambiguous; moving into a vacated slot is supported.
    for (const operation of operations) if (operation.action === "delete" && destinations.has(key(operation.track, operation.frame))) throw new AutomationError("DUPLICATE_KEY");
    return { type: "keyframe.transaction", owner, items: structuredClone([...items.values()].filter(item => !keyframeValuesEqual(item.before, item.after))) };
}

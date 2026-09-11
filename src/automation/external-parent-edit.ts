import type { CommandTrackRef } from "../actions/command-types";
import type { KeyframeScope, KeyframeTransaction } from "../actions/keyframe-transaction";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";
import type { ExternalParentOperation } from "./external-parent-schema";
import { buildAutomationKeyframeEdit } from "./keyframe-edit";
import { AutomationError } from "./diagnostics";

/** No seeking or runtime mutations while constructing a reviewable key transaction. */
export function buildExternalParentEdit(input: {
    scope: KeyframeScope; track: CommandTrackRef; operations: readonly ExternalParentOperation[];
    collision: "reject" | "replace"; currentFrame: number;
    read(frame: number): TimelineKeyframePayload | null;
    capture(): TimelineKeyframePayload | null;
    resolveParent(instanceId: string, boneName: string): { instanceId: string; path: string };
}): KeyframeTransaction {
    const operations = input.operations.map((operation, operationIndex) => {
        const { frame } = operation;
        const existing = input.read(frame);
        if (operation.action === "delete") {
            if (!existing || !("externalParent" in existing) || !existing.externalParent) throw new AutomationError("KEY_NOT_FOUND", { frame, operationIndex });
            return { action: "delete" as const, track: input.track, frame };
        }
        if (operation.poseMode === "keepLocal" && !existing && frame !== Math.floor(input.currentFrame)) throw new AutomationError("EXTERNAL_PARENT_LOCAL_POSE_REQUIRED", { frame, operationIndex });
        const base = existing ?? input.capture();
        if (!base || (base.kind !== "bone" && base.kind !== "movableBone" && base.kind !== "camera")) throw new AutomationError("KEY_KIND_MISMATCH", { frame, operationIndex });
        let parent: { instanceId: string; path: string } | null = null;
        if (operation.parent) {
            try { parent = input.resolveParent(operation.parent.modelInstanceId, operation.parent.boneName); }
            catch (error) {
                if (error instanceof AutomationError) throw new AutomationError(error.code, { ...error.details, frame, operationIndex });
                throw error;
            }
        }
        const payload = structuredClone(base);
        if (payload.kind === "camera") {
            payload.externalParent = { modelInstanceId: parent?.instanceId ?? null, modelPath: parent?.path ?? null, boneName: operation.parent?.boneName ?? null };
            if (operation.poseMode === "snap") {
                payload.positions = [0, 0, 0]; payload.rotations = [0, 0, 0];
                payload.distances = [parent ? 0 : -45];
            }
            if (parent) payload.distances = [0]; // Camera external-parent source convention.
        } else {
            payload.externalParent = { childBoneName: input.track.name, parentModelInstanceId: parent?.instanceId ?? null, parentModelPath: parent?.path ?? null, parentBoneName: operation.parent?.boneName ?? null };
            if (operation.poseMode === "snap") {
                payload.rotations = [0, 0, 0, 1];
                if (payload.kind === "movableBone") payload.positions = [0, 0, 0];
            }
        }
        return { action: "set" as const, track: input.track, frame, payload };
    });
    return buildAutomationKeyframeEdit(input.scope, operations, input.collision, (_track, frame) => input.read(frame));
}

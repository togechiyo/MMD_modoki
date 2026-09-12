import type { BuiltCommand } from "../actions/command-types";
import type { ProjectMotionImport, ProjectSerializedModelAnimation } from "../types";
import type { ModelExternalParentKeyframeLike } from "../shared/model-external-parent";

export type ModelMotionState = {
    animation: ProjectSerializedModelAnimation | null;
    imports: ProjectMotionImport[];
    externalParentKeyframes: ModelExternalParentKeyframeLike[];
};

export type ModelMotionClearDiff = {
    type: "edit.modelMotionClear";
    modelInstanceId: string;
    before: ModelMotionState;
};

export function hasModelMotionState(state: ModelMotionState): boolean {
    const animation = state.animation;
    return state.imports.length > 0 || state.externalParentKeyframes.length > 0
        || Boolean(animation && (
            [...animation.boneTracks, ...animation.movableBoneTracks, ...animation.morphTracks]
                .some(track => track.frameNumbers.length > 0)
            || animation.propertyTrack.frameNumbers.length > 0
        ));
}

// The snapshot contains this model's motion only, packed per track rather than
// millions of per-key command objects. Restore deserializes into fresh arrays.
export function buildClearModelMotionCommand(modelInstanceId: string, before: ModelMotionState, nowMs: number): BuiltCommand | null {
    if (!modelInstanceId || !hasModelMotionState(before)) return null;
    return {
        id: `edit.modelMotionClear:${modelInstanceId}:${nowMs}`,
        label: "Clear model motion",
        scope: "edit",
        createdAtMs: nowMs,
        diff: { type: "edit.modelMotionClear", modelInstanceId, before },
    };
}

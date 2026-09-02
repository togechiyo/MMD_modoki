import type { BuiltCommand, BoneTransformCommandSnapshot, EditCommandDiff } from "./command-types";

const SNAPSHOT_EPSILON = 0.0001;

export type BoneTransformCommandInput = {
    modelInstanceId: string | null;
    boneName: string | null;
    frame: number;
    before: BoneTransformCommandSnapshot | null;
    after: BoneTransformCommandSnapshot | null;
};

export function buildBoneTransformCommand(
    input: BoneTransformCommandInput,
    nowMs = Date.now(),
): BuiltCommand | null {
    const modelInstanceId = input.modelInstanceId?.trim();
    const boneName = input.boneName?.trim();
    if (!modelInstanceId || !boneName) return null;

    const frame = normalizeFrame(input.frame);
    if (frame === null) return null;
    if (!input.before || !input.after) return null;
    if (areSnapshotsEqual(input.before, input.after)) return null;

    const diff: EditCommandDiff = {
        type: "edit.boneTransform",
        modelInstanceId,
        boneName,
        frame,
        before: cloneSnapshot(input.before),
        after: cloneSnapshot(input.after),
    };

    return {
        id: `edit.boneTransform:${modelInstanceId}:${boneName}:${frame}:${nowMs}`,
        label: `Edit bone transform: ${boneName}`,
        scope: "edit",
        diff,
        mergeKey: `edit.boneTransform:${modelInstanceId}:${boneName}`,
        createdAtMs: nowMs,
    };
}

function normalizeFrame(frame: number): number | null {
    if (!Number.isFinite(frame) || frame < 0) return null;
    return Math.floor(frame);
}

function cloneSnapshot(snapshot: BoneTransformCommandSnapshot): BoneTransformCommandSnapshot {
    return {
        position: { ...snapshot.position },
        rotation: { ...snapshot.rotation },
    };
}

function areSnapshotsEqual(
    left: BoneTransformCommandSnapshot,
    right: BoneTransformCommandSnapshot,
): boolean {
    return areVectorValuesEqual(left.position, right.position)
        && areVectorValuesEqual(left.rotation, right.rotation);
}

function areVectorValuesEqual(
    left: { x: number; y: number; z: number },
    right: { x: number; y: number; z: number },
): boolean {
    return Math.abs(left.x - right.x) <= SNAPSHOT_EPSILON
        && Math.abs(left.y - right.y) <= SNAPSHOT_EPSILON
        && Math.abs(left.z - right.z) <= SNAPSHOT_EPSILON;
}

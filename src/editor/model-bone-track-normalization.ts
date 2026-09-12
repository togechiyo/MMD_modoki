import { MmdBoneAnimationTrack, MmdMovableBoneAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import { mergeFrameNumbers } from "../shared/timeline-helpers";

export function promoteBoneTrack(track: MmdBoneAnimationTrack): MmdMovableBoneAnimationTrack {
    const promoted = new MmdMovableBoneAnimationTrack(track.name, track.frameNumbers.length);
    promoted.frameNumbers.set(track.frameNumbers);
    promoted.rotations.set(track.rotations);
    promoted.rotationInterpolations.set(track.rotationInterpolations);
    promoted.physicsToggles.set(track.physicsToggles);
    const linear = [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107];
    for (let i = 0; i < track.frameNumbers.length; i++) {
        promoted.positionInterpolations.set(linear, i * 12);
    }
    return promoted;
}

// Promote only names that need translation. Existing movable keys win collisions
// in legacy snapshots; non-overlapping rotation keys retain zero translation.
export function normalizeModelBoneTracks(
    boneTracks: readonly MmdBoneAnimationTrack[],
    movableBoneTracks: readonly MmdMovableBoneAnimationTrack[],
    movableNames: ReadonlySet<string> = new Set(movableBoneTracks.map(track => track.name)),
): { boneTracks: MmdBoneAnimationTrack[]; movableBoneTracks: MmdMovableBoneAnimationTrack[] } {
    const remaining: MmdBoneAnimationTrack[] = [];
    const movable = new Map(movableBoneTracks.map(track => [track.name, track]));
    for (const bone of boneTracks) {
        if (!movableNames.has(bone.name)) {
            remaining.push(bone);
            continue;
        }
        const promoted = promoteBoneTrack(bone);
        const existing = movable.get(bone.name);
        if (!existing) {
            movable.set(bone.name, promoted);
            continue;
        }
        const frames = mergeFrameNumbers(bone.frameNumbers, existing.frameNumbers);
        const combined = new MmdMovableBoneAnimationTrack(bone.name, frames.length);
        combined.frameNumbers.set(frames);
        const boneIndexes = new Map(Array.from(bone.frameNumbers, (frame, i) => [frame, i]));
        const movableIndexes = new Map(Array.from(existing.frameNumbers, (frame, i) => [frame, i]));
        for (let i = 0; i < frames.length; i++) {
            const movableIndex = movableIndexes.get(frames[i]);
            const source = movableIndex === undefined ? promoted : existing;
            const sourceIndex = movableIndex ?? boneIndexes.get(frames[i]);
            if (sourceIndex === undefined) continue;
            for (const [field, stride] of [
                ["positions", 3], ["positionInterpolations", 12], ["rotations", 4],
                ["rotationInterpolations", 4], ["physicsToggles", 1],
            ] as const) {
                combined[field].set(source[field].subarray(sourceIndex * stride, (sourceIndex + 1) * stride), i * stride);
            }
        }
        movable.set(bone.name, combined);
    }
    return { boneTracks: remaining, movableBoneTracks: [...movable.values()] };
}

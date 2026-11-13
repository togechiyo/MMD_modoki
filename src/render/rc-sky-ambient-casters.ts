type SkeletalAnimation = {
    boneTracks: readonly { frameNumbers: ArrayLike<number> }[];
    movableBoneTracks: readonly { frameNumbers: ArrayLike<number> }[];
};

/** Keep morph/property edits and fixed bone poses eligible, independent of playback. */
export function isRcSkyAmbientStaticModel(input: {
    animationCount: number;
    sourceAnimation?: SkeletalAnimation | null;
    dynamicPhysics: boolean;
    externalParent: boolean;
}): boolean {
    if (input.dynamicPhysics || input.externalParent) return false;
    const animation = input.sourceAnimation;
    // A runtime handle also exists after the first morph key, or after Undo leaves
    // empty tracks. Inspect the source keys instead of discarding the whole stage.
    // Existing scene inputs track morph deformation and material visibility.
    // One key clamps to the same pose at every frame. Count per bone track so a
    // stage can position several bones without becoming a moving character.
    if (animation) return !animation.boneTracks.some(track => track.frameNumbers.length > 1)
        && !animation.movableBoneTracks.some(track => track.frameNumbers.length > 1);
    // Unknown runtime-only animation retains the conservative receiver-only path.
    return input.animationCount === 0;
}

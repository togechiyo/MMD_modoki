export type ScenePlaybackKeyframeCounts = {
    camera: number;
    light: number;
    shadow: number;
    gravity: number;
};

export type ScenePlaybackControlLocks = {
    camera: boolean;
    light: boolean;
    shadow: boolean;
    gravity: boolean;
};

/** Only an authored key track owns values during playback. */
export function isPlaybackValueEditLocked(isPlaying: boolean, hasKeyframes: boolean): boolean {
    return isPlaying && hasKeyframes;
}

export function getScenePlaybackControlLocks(
    isPlaying: boolean,
    keyframeCounts: ScenePlaybackKeyframeCounts,
): ScenePlaybackControlLocks {
    return {
        camera: isPlaybackValueEditLocked(isPlaying, keyframeCounts.camera > 0),
        light: isPlaybackValueEditLocked(isPlaying, keyframeCounts.light > 0),
        shadow: isPlaybackValueEditLocked(isPlaying, keyframeCounts.shadow > 0),
        gravity: isPlaybackValueEditLocked(isPlaying, keyframeCounts.gravity > 0),
    };
}

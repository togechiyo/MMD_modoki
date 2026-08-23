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

export function getScenePlaybackControlLocks(
    isPlaying: boolean,
    keyframeCounts: ScenePlaybackKeyframeCounts,
): ScenePlaybackControlLocks {
    return {
        camera: isPlaying && keyframeCounts.camera > 0,
        light: isPlaying && keyframeCounts.light > 0,
        shadow: isPlaying && keyframeCounts.shadow > 0,
        gravity: isPlaying && keyframeCounts.gravity > 0,
    };
}

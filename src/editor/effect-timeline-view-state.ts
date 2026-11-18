import type { KeyframeTrack } from "../types";

/** Only effects with registered keys belong in the timeline. */
export class EffectTimelineViewState {
    private tracks: readonly KeyframeTrack[] = [];

    setTracks(tracks: readonly KeyframeTrack[]): void {
        this.tracks = tracks;
    }

    /** Edit targets include effects whose first key has not been registered yet. */
    allTracks(): readonly KeyframeTrack[] {
        return this.tracks;
    }

    visibleTracks(): KeyframeTrack[] {
        return this.tracks.filter(track => track.category !== "effect" || track.frames.length > 0);
    }
}

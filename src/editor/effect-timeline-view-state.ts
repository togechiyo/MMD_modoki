import type { KeyframeTrack } from "../types";

/** Empty effect rows belong to an explicit key-edit session, not normal effect settings. */
export class EffectTimelineViewState {
    private tracks: readonly KeyframeTrack[] = [];
    private editingId: string | null = null;

    setTracks(tracks: readonly KeyframeTrack[]): void {
        this.tracks = tracks;
        if (!tracks.some(track => track.category === "effect" && track.name === this.editingId)) this.editingId = null;
    }

    beginEditing(id: string): boolean {
        if (!this.tracks.some(track => track.category === "effect" && track.name === id)) return false;
        this.editingId = id;
        return true;
    }

    endEditing(): void { this.editingId = null; }

    selectTrack(track: KeyframeTrack | null): boolean {
        if (!this.editingId || (track?.category === "effect" && track.name === this.editingId)) return false;
        this.endEditing();
        return true;
    }

    visibleTracks(): KeyframeTrack[] {
        return this.tracks.filter(track => track.category !== "effect" || track.frames.length > 0 || track.name === this.editingId);
    }
}

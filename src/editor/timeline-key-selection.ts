import type { KeyframeTrack, TrackCategory } from "../types";

export type TimelineKeySelectionRef = {
    trackCategory: TrackCategory;
    trackName: string;
    frame: number;
};

const SELECTION_KEY_SEPARATOR = "\u001f";

export function createTimelineKeySelectionKey(ref: TimelineKeySelectionRef): string {
    return `${ref.trackCategory}${SELECTION_KEY_SEPARATOR}${ref.trackName}${SELECTION_KEY_SEPARATOR}${ref.frame}`;
}

export function normalizeTimelineKeySelection(
    keys: readonly TimelineKeySelectionRef[],
    tracks: readonly Pick<KeyframeTrack, "category" | "name" | "frames">[],
): TimelineKeySelectionRef[] {
    const requested = new Set(keys.map((key) => createTimelineKeySelectionKey({
        trackCategory: key.trackCategory,
        trackName: key.trackName,
        frame: Math.max(0, Math.floor(key.frame)),
    })));
    const normalized: TimelineKeySelectionRef[] = [];

    for (const track of tracks) {
        for (const frame of track.frames) {
            const ref = {
                trackCategory: track.category,
                trackName: track.name,
                frame,
            };
            if (requested.has(createTimelineKeySelectionKey(ref))) {
                normalized.push(ref);
            }
        }
    }

    return normalized;
}

export function toggleTimelineKeySelection(
    keys: readonly TimelineKeySelectionRef[],
    target: TimelineKeySelectionRef,
): TimelineKeySelectionRef[] {
    const targetKey = createTimelineKeySelectionKey(target);
    const next = keys.filter((key) => createTimelineKeySelectionKey(key) !== targetKey);
    return next.length === keys.length ? [...keys, target] : next;
}

export function createTimelineRangeSelection(
    track: Pick<KeyframeTrack, "category" | "name" | "frames">,
    anchor: TimelineKeySelectionRef | null,
    targetFrame: number,
): TimelineKeySelectionRef[] {
    const normalizedTargetFrame = Math.max(0, Math.floor(targetFrame));
    if (!anchor || anchor.trackCategory !== track.category || anchor.trackName !== track.name) {
        return [{
            trackCategory: track.category,
            trackName: track.name,
            frame: normalizedTargetFrame,
        }];
    }

    const start = Math.min(anchor.frame, normalizedTargetFrame);
    const end = Math.max(anchor.frame, normalizedTargetFrame);
    return Array.from(track.frames)
        .filter((frame) => frame >= start && frame <= end)
        .map((frame) => ({
            trackCategory: track.category,
            trackName: track.name,
            frame,
        }));
}

export function createTimelineSelectionScopeKey(
    target: "model" | "camera",
    modelInstanceId: string | null,
): string {
    return target === "camera" ? "camera" : `model:${modelInstanceId ?? "none"}`;
}

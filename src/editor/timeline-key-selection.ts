import type { KeyframeTrack, TrackCategory } from "../types";

export type TimelineKeySelectionRef = {
    trackCategory: TrackCategory;
    trackName: string;
    frame: number;
};

export type TimelineRowSelectionRef = {
    trackCategory: TrackCategory;
    trackName: string;
};

export type TimelineHeaderSelectionMode = "replace" | "toggle" | "range";

const SELECTION_KEY_SEPARATOR = "\u001f";

export function createTimelineKeySelectionKey(ref: TimelineKeySelectionRef): string {
    return `${ref.trackCategory}${SELECTION_KEY_SEPARATOR}${ref.trackName}${SELECTION_KEY_SEPARATOR}${ref.frame}`;
}

export function createTimelineRowSelectionKey(ref: TimelineRowSelectionRef): string {
    return `${ref.trackCategory}${SELECTION_KEY_SEPARATOR}${ref.trackName}`;
}

export function updateTimelineRowSelection(
    selectedRows: readonly TimelineRowSelectionRef[],
    target: TimelineRowSelectionRef,
    anchor: TimelineRowSelectionRef | null,
    tracks: readonly Pick<KeyframeTrack, "category" | "name">[],
    mode: TimelineHeaderSelectionMode,
): TimelineRowSelectionRef[] {
    const orderedRows = tracks.map((track) => ({
        trackCategory: track.category,
        trackName: track.name,
    }));
    const targetKey = createTimelineRowSelectionKey(target);

    if (mode === "replace") return [target];
    if (mode === "toggle") {
        const selectedKeys = new Set(selectedRows.map(createTimelineRowSelectionKey));
        if (selectedKeys.has(targetKey)) selectedKeys.delete(targetKey);
        else selectedKeys.add(targetKey);
        return orderedRows.filter((row) => selectedKeys.has(createTimelineRowSelectionKey(row)));
    }

    const anchorIndex = anchor
        ? orderedRows.findIndex((row) => createTimelineRowSelectionKey(row) === createTimelineRowSelectionKey(anchor))
        : -1;
    const targetIndex = orderedRows.findIndex((row) => createTimelineRowSelectionKey(row) === targetKey);
    if (anchorIndex < 0 || targetIndex < 0) return [target];
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    return orderedRows.slice(start, end + 1);
}

export function updateTimelineFrameColumnSelection(
    selectedFrames: readonly number[],
    targetFrame: number,
    anchorFrame: number | null,
    mode: TimelineHeaderSelectionMode,
): number[] {
    const target = Math.max(0, Math.floor(targetFrame));
    if (mode === "replace") return [target];
    if (mode === "toggle") {
        const next = new Set(selectedFrames.map((frame) => Math.max(0, Math.floor(frame))));
        if (next.has(target)) next.delete(target);
        else next.add(target);
        return Array.from(next).sort((a, b) => a - b);
    }

    const anchor = anchorFrame === null ? target : Math.max(0, Math.floor(anchorFrame));
    const start = Math.min(anchor, target);
    const end = Math.max(anchor, target);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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

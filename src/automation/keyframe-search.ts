import { z } from "zod";
import { automationTrackSchema } from "./keyframe-schema";
import type { CommandTrackRef } from "../actions/command-types";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";

const frame = z.number().int().min(0).max(1000000);
export const keyframeSearchSchema = z.object({
    startFrame: frame.default(0), endFrame: frame.default(1000000),
    categories: z.array(automationTrackSchema.shape.category).min(1).max(10).optional(),
    names: z.array(z.string().min(1).max(200)).min(1).max(100).optional(),
    nameContains: z.string().min(1).max(200).optional(),
    anchorFrame: frame.optional(), includePayload: z.boolean().default(false),
}).strict().refine(value => value.startFrame <= value.endFrame);
export type KeyframeSearch = z.infer<typeof keyframeSearchSchema>;
type SearchTrack = CommandTrackRef & { frames: readonly number[] | Uint32Array };

function lowerBound(frames: SearchTrack["frames"], frame: number): number {
    let lo = 0, hi = frames.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (frames[mid] < frame) lo = mid + 1; else hi = mid; }
    return lo;
}
const normalize = (value: string): string => value.normalize("NFKC").toLowerCase();

/** Timeline frames are sorted. Count by bounds and read payloads only for the returned page. */
export function searchKeyframes(tracks: readonly SearchTrack[], filter: KeyframeSearch, anchor: number, offset: number, limit: number,
    read: (track: CommandTrackRef, frame: number) => TimelineKeyframePayload | null) {
    let totalCount = 0, matchedTrackCount = 0;
    let firstFrame: number | null = null, lastFrame: number | null = null;
    let previousFrame: number | null = null, nextFrame: number | null = null;
    const items: { track: CommandTrackRef; frame: number; payload?: TimelineKeyframePayload | null }[] = [];
    const needle = filter.nameContains ? normalize(filter.nameContains) : null;
    for (const track of tracks) {
        if (filter.categories && !filter.categories.includes(track.category)) continue;
        if (filter.names && !filter.names.includes(track.name)) continue;
        if (needle && !normalize(track.name).includes(needle)) continue;
        const start = lowerBound(track.frames, filter.startFrame), end = lowerBound(track.frames, filter.endFrame + 1);
        if (start === end) continue;
        matchedTrackCount++;
        firstFrame = Math.min(firstFrame ?? Infinity, track.frames[start]);
        lastFrame = Math.max(lastFrame ?? -Infinity, track.frames[end - 1]);
        const prior = Math.min(end, lowerBound(track.frames, anchor)) - 1;
        const next = Math.max(start, lowerBound(track.frames, Math.floor(anchor) + 1));
        if (prior >= start) previousFrame = Math.max(previousFrame ?? -Infinity, track.frames[prior]);
        if (next < end) nextFrame = Math.min(nextFrame ?? Infinity, track.frames[next]);
        const from = Math.max(start, start + offset - totalCount);
        const to = Math.min(end, start + offset + limit - totalCount);
        for (let index = from; index < to; index++) {
            const reference = { category: track.category, name: track.name };
            const frame = track.frames[index];
            items.push({ track: reference, frame, ...(filter.includePayload ? { payload: read(reference, frame) } : {}) });
        }
        totalCount += end - start;
    }
    return { items, totalCount, matchedTrackCount, firstFrame, lastFrame, previousFrame, nextFrame, anchorFrame: anchor,
        nextOffset: offset + limit < totalCount ? offset + limit : null, order: "timeline-track-then-frame" };
}

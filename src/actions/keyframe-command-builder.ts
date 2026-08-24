import type { KeyframeAction } from "./types";
import type { BuiltCommand, CommandTrackRef, KeyframeCommandDiff } from "./command-types";

const TRACK_KEY_SEPARATOR = "\u001f";

export type KeyframeCommandSnapshot = {
    selectedTrack: CommandTrackRef | null;
    selectedFrame: number | null;
    currentFrame: number;
    framesByTrackKey: Record<string, readonly number[]>;
};

export function createCommandTrackKey(track: CommandTrackRef): string {
    return `${track.category}${TRACK_KEY_SEPARATOR}${track.name}`;
}

export function buildKeyframeCommand(
    action: KeyframeAction,
    snapshot: KeyframeCommandSnapshot,
    nowMs = Date.now(),
): BuiltCommand | null {
    switch (action.type) {
        case "keyframe.addCurrent":
            return buildAddCurrentCommand(snapshot, nowMs);
        case "keyframe.deleteSelected":
            return buildDeleteSelectedCommand(snapshot, nowMs);
        case "keyframe.nudgeSelected":
            return buildNudgeSelectedCommand(action, snapshot, nowMs);
        default:
            return null;
    }
}

function buildAddCurrentCommand(
    snapshot: KeyframeCommandSnapshot,
    nowMs: number,
): BuiltCommand | null {
    const track = snapshot.selectedTrack;
    if (!track) return null;

    const frame = normalizeFrame(snapshot.currentFrame);
    if (frame === null) return null;

    const beforeFrames = getTrackFrames(snapshot, track);
    const afterFrames = addFrameNumber(beforeFrames, frame);
    if (afterFrames === beforeFrames) return null;

    return createCommand({
        diff: {
            type: "keyframe.add",
            track,
            frame,
            beforeFrames,
            afterFrames,
        },
        label: `Add keyframe at frame ${frame}`,
        mergeKey: undefined,
        nowMs,
    });
}

function buildDeleteSelectedCommand(
    snapshot: KeyframeCommandSnapshot,
    nowMs: number,
): BuiltCommand | null {
    const track = snapshot.selectedTrack;
    if (!track) return null;

    const frame = normalizeFrame(snapshot.selectedFrame ?? snapshot.currentFrame);
    if (frame === null) return null;

    const beforeFrames = getTrackFrames(snapshot, track);
    const afterFrames = removeFrameNumber(beforeFrames, frame);
    if (afterFrames === beforeFrames) return null;

    return createCommand({
        diff: {
            type: "keyframe.delete",
            track,
            frame,
            beforeFrames,
            afterFrames,
        },
        label: `Delete keyframe at frame ${frame}`,
        mergeKey: undefined,
        nowMs,
    });
}

function buildNudgeSelectedCommand(
    action: Extract<KeyframeAction, { type: "keyframe.nudgeSelected" }>,
    snapshot: KeyframeCommandSnapshot,
    nowMs: number,
): BuiltCommand | null {
    const track = snapshot.selectedTrack;
    if (!track) return null;

    const fromFrame = normalizeFrame(snapshot.selectedFrame);
    if (fromFrame === null) return null;

    const deltaFrames = normalizeDeltaFrames(action.deltaFrames);
    if (deltaFrames === null) return null;

    const toFrame = fromFrame + deltaFrames;
    if (toFrame < 0 || toFrame === fromFrame) return null;

    const beforeFrames = getTrackFrames(snapshot, track);
    const afterFrames = moveFrameNumber(beforeFrames, fromFrame, toFrame);
    if (afterFrames === beforeFrames) return null;

    return createCommand({
        diff: {
            type: "keyframe.move",
            track,
            fromFrame,
            toFrame,
            beforeFrames,
            afterFrames,
        },
        label: `Move keyframe ${fromFrame} -> ${toFrame}`,
        mergeKey: `keyframe.move:${createCommandTrackKey(track)}`,
        nowMs,
    });
}

function createCommand(options: {
    diff: KeyframeCommandDiff;
    label: string;
    mergeKey?: string;
    nowMs: number;
}): BuiltCommand {
    return {
        id: createCommandId(options.diff, options.nowMs),
        label: options.label,
        scope: "keyframe",
        diff: options.diff,
        mergeKey: options.mergeKey,
        createdAtMs: options.nowMs,
    };
}

function createCommandId(diff: KeyframeCommandDiff, nowMs: number): string {
    switch (diff.type) {
        case "keyframe.add":
        case "keyframe.delete":
            return `${diff.type}:${createCommandTrackKey(diff.track)}:${diff.frame}:${nowMs}`;
        case "keyframe.move":
            return `${diff.type}:${createCommandTrackKey(diff.track)}:${diff.fromFrame}:${diff.toFrame}:${nowMs}`;
        case "keyframe.paste":
            return `${diff.type}:${createCommandTrackKey(diff.track)}:${diff.frame}:${nowMs}`;
        case "keyframe.batchDelete":
        case "keyframe.batchMove":
        case "keyframe.batchPaste":
        case "keyframe.batchCorrect":
            return `${diff.type}:${diff.items.length}:${nowMs}`;
    }
}

function getTrackFrames(snapshot: KeyframeCommandSnapshot, track: CommandTrackRef): number[] {
    const key = createCommandTrackKey(track);
    return normalizeFrameList(snapshot.framesByTrackKey[key] ?? []);
}

function normalizeFrame(frame: number | null): number | null {
    if (frame === null || !Number.isFinite(frame) || frame < 0) return null;
    return Math.floor(frame);
}

function normalizeDeltaFrames(deltaFrames: number): -1 | 1 | null {
    if (deltaFrames === -1 || deltaFrames === 1) return deltaFrames;
    return null;
}

function normalizeFrameList(frames: readonly number[]): number[] {
    const uniqueFrames = new Set<number>();
    for (const frame of frames) {
        const normalized = normalizeFrame(frame);
        if (normalized === null) continue;
        uniqueFrames.add(normalized);
    }
    return [...uniqueFrames].sort((a, b) => a - b);
}

function addFrameNumber(frames: number[], frame: number): number[] {
    if (frames.includes(frame)) return frames;
    return [...frames, frame].sort((a, b) => a - b);
}

function removeFrameNumber(frames: number[], frame: number): number[] {
    if (!frames.includes(frame)) return frames;
    return frames.filter((candidate) => candidate !== frame);
}

function moveFrameNumber(frames: number[], fromFrame: number, toFrame: number): number[] {
    if (fromFrame === toFrame) return frames;
    const removed = removeFrameNumber(frames, fromFrame);
    if (removed === frames) return frames;
    return addFrameNumber(removed, toFrame);
}

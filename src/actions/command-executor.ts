import type {
    BoneTransformCommandSnapshot,
    BuiltCommand,
    CameraTransformCommandSnapshot,
    CommandDirection,
    CommandTrackRef,
    EditCommandDiff,
    KeyframeCommandDiff,
} from "./command-types";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";

export type CommandSelectedKeyRef = {
    track: CommandTrackRef;
    frame: number;
};

export type CommandExecutionContext = {
    beginTimelineEditBatch?(): void;
    endTimelineEditBatch?(): void;
    addTimelineKeyframe(track: CommandTrackRef, frame: number): boolean;
    removeTimelineKeyframe(track: CommandTrackRef, frame: number): boolean;
    removeTimelineKeyframePayloads?(track: CommandTrackRef, frames: readonly number[]): boolean;
    moveTimelineKeyframe(track: CommandTrackRef, fromFrame: number, toFrame: number): boolean;
    applyTimelineKeyframePayload?(track: CommandTrackRef, frame: number, payload: TimelineKeyframePayload | null): boolean;
    applyBoneTransform?(boneName: string, snapshot: BoneTransformCommandSnapshot): boolean;
    applyCameraTransform?(snapshot: CameraTransformCommandSnapshot): boolean;
    setSelectedFrame(frame: number | null): void;
    setSelectedKeys?(keys: readonly CommandSelectedKeyRef[]): void;
    seekToBoundary(frame: number): void;
    refreshAfterKeyframeEdit(): void;
};

export function executeCommand(
    command: BuiltCommand,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    switch (command.diff.type) {
        case "keyframe.add":
            return executeKeyframeAdd(command.diff, direction, context);
        case "keyframe.delete":
            return executeKeyframeDelete(command.diff, direction, context);
        case "keyframe.move":
            return executeKeyframeMove(command.diff, direction, context);
        case "keyframe.paste":
            return executeKeyframePaste(command.diff, direction, context);
        case "keyframe.batchDelete":
            return executeKeyframeBatchDelete(command.diff, direction, context);
        case "keyframe.batchMove":
            return executeKeyframeBatchMove(command.diff, direction, context);
        case "keyframe.batchPaste":
            return executeKeyframeBatchPaste(command.diff, direction, context);
        case "keyframe.batchCorrect":
            return executeKeyframeBatchCorrect(command.diff, direction, context);
        case "keyframe.frameColumnEdit":
            return executeKeyframeFrameColumnEdit(command.diff, direction, context);
        case "edit.boneTransform":
            return executeBoneTransform(command.diff, direction, context);
        case "edit.cameraTransform":
            return executeCameraTransform(command.diff, direction, context);
    }
}

function applyKeyframePayload(
    context: CommandExecutionContext,
    track: CommandTrackRef,
    frame: number,
    payload: TimelineKeyframePayload | null,
): boolean {
    return context.applyTimelineKeyframePayload?.(track, frame, payload) ?? false;
}

function executeKeyframeBatchDelete(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.batchDelete" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyTimelineKeyframePayload) return false;
    context.beginTimelineEditBatch?.();
    try {
        if (direction === "apply" && context.removeTimelineKeyframePayloads) {
            for (const group of groupBatchDeleteItemsByTrack(diff.items)) {
                if (!context.removeTimelineKeyframePayloads(group.track, group.frames)) return false;
            }
        } else {
            const items = direction === "apply" ? diff.items : [...diff.items].reverse();
            for (const item of items) {
                const payload = direction === "apply" ? null : item.before;
                if (!applyKeyframePayload(context, item.track, item.frame, payload)) return false;
            }
        }
    } finally {
        context.endTimelineEditBatch?.();
    }

    if (direction === "apply") {
        context.setSelectedFrame(null);
        context.setSelectedKeys?.([]);
    } else {
        const restored = diff.items.map((item) => ({ track: item.track, frame: item.frame }));
        context.setSelectedFrame(restored[0]?.frame ?? null);
        context.setSelectedKeys?.(restored);
    }
    context.seekToBoundary(diff.items[0]?.frame ?? 0);
    context.refreshAfterKeyframeEdit();
    return true;
}

function groupBatchDeleteItemsByTrack(
    items: Extract<KeyframeCommandDiff, { type: "keyframe.batchDelete" }>["items"],
): { track: CommandTrackRef; frames: number[] }[] {
    const groups = new Map<string, { track: CommandTrackRef; frames: number[] }>();
    for (const item of items) {
        const key = `${item.track.category}\u001f${item.track.name}`;
        let group = groups.get(key);
        if (!group) {
            group = { track: item.track, frames: [] };
            groups.set(key, group);
        }
        group.frames.push(item.frame);
    }
    return Array.from(groups.values());
}

function executeKeyframeBatchMove(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.batchMove" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyTimelineKeyframePayload) return false;

    context.beginTimelineEditBatch?.();
    try {
        if (direction === "apply") {
            for (const item of diff.items) {
                if (!applyKeyframePayload(context, item.track, item.fromFrame, null)) return false;
            }
            for (const item of diff.items) {
                if (!applyKeyframePayload(context, item.track, item.toFrame, item.before)) return false;
            }
            const moved = diff.items.map((item) => ({ track: item.track, frame: item.toFrame }));
            context.setSelectedFrame(moved[0]?.frame ?? null);
            context.setSelectedKeys?.(moved);
            context.seekToBoundary(moved[0]?.frame ?? 0);
        } else {
            for (const item of [...diff.items].reverse()) {
                if (!applyKeyframePayload(context, item.track, item.toFrame, null)) return false;
            }
            for (const item of diff.items) {
                if (item.overwritten && !applyKeyframePayload(context, item.track, item.toFrame, item.overwritten)) {
                    return false;
                }
            }
            for (const item of diff.items) {
                if (!applyKeyframePayload(context, item.track, item.fromFrame, item.before)) return false;
            }
            const restored = diff.items.map((item) => ({ track: item.track, frame: item.fromFrame }));
            context.setSelectedFrame(restored[0]?.frame ?? null);
            context.setSelectedKeys?.(restored);
            context.seekToBoundary(restored[0]?.frame ?? 0);
        }
    } finally {
        context.endTimelineEditBatch?.();
    }

    context.refreshAfterKeyframeEdit();
    return true;
}

function executeKeyframeBatchPaste(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.batchPaste" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyTimelineKeyframePayload) return false;
    context.beginTimelineEditBatch?.();
    try {
        const items = direction === "apply" ? diff.items : [...diff.items].reverse();
        for (const item of items) {
            const payload = direction === "apply" ? item.after : item.before;
            if (!applyKeyframePayload(context, item.track, item.targetFrame, payload)) return false;
        }
    } finally {
        context.endTimelineEditBatch?.();
    }

    if (direction === "apply") {
        const pasted = diff.items.map((item) => ({ track: item.track, frame: item.targetFrame }));
        context.setSelectedFrame(pasted[0]?.frame ?? null);
        context.setSelectedKeys?.(pasted);
    } else {
        context.setSelectedFrame(null);
        context.setSelectedKeys?.([]);
    }
    context.seekToBoundary(diff.pasteBaseFrame);
    context.refreshAfterKeyframeEdit();
    return true;
}

function executeKeyframeFrameColumnEdit(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.frameColumnEdit" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyTimelineKeyframePayload || !context.removeTimelineKeyframePayloads) return false;
    const removeItems = direction === "apply" ? diff.before : diff.after;
    const restoreItems = direction === "apply" ? diff.after : diff.before;
    context.beginTimelineEditBatch?.();
    try {
        for (const group of groupPayloadItemsByTrack(removeItems)) {
            if (!context.removeTimelineKeyframePayloads(group.track, group.frames)) return false;
        }
        for (const item of restoreItems) {
            if (!applyKeyframePayload(context, item.track, item.frame, item.payload)) return false;
        }
    } finally {
        context.endTimelineEditBatch?.();
    }
    context.setSelectedFrame(null);
    context.setSelectedKeys?.([]);
    context.seekToBoundary(diff.anchorFrame);
    context.refreshAfterKeyframeEdit();
    return true;
}

function groupPayloadItemsByTrack(
    items: readonly { track: CommandTrackRef; frame: number }[],
): { track: CommandTrackRef; frames: number[] }[] {
    const groups = new Map<string, { track: CommandTrackRef; frames: number[] }>();
    for (const item of items) {
        const key = `${item.track.category}\u001f${item.track.name}`;
        const group = groups.get(key) ?? { track: item.track, frames: [] };
        group.frames.push(item.frame);
        groups.set(key, group);
    }
    return [...groups.values()];
}

function executeKeyframeBatchCorrect(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.batchCorrect" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyTimelineKeyframePayload) return false;
    context.beginTimelineEditBatch?.();
    try {
        const items = direction === "apply" ? diff.items : [...diff.items].reverse();
        for (const item of items) {
            const payload = direction === "apply" ? item.after : item.before;
            if (!applyKeyframePayload(context, item.track, item.frame, payload)) return false;
        }
    } finally {
        context.endTimelineEditBatch?.();
    }

    const selected = diff.items.map((item) => ({ track: item.track, frame: item.frame }));
    context.setSelectedFrame(selected[0]?.frame ?? null);
    context.setSelectedKeys?.(selected);
    context.seekToBoundary(selected[0]?.frame ?? 0);
    context.refreshAfterKeyframeEdit();
    return true;
}

function executeKeyframePaste(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.paste" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyTimelineKeyframePayload) return false;
    const payload = direction === "apply" ? diff.after : diff.before;
    const applied = context.applyTimelineKeyframePayload(diff.track, diff.frame, payload);
    if (!applied) return false;

    context.setSelectedFrame(direction === "apply" ? diff.frame : (diff.before ? diff.frame : null));
    context.seekToBoundary(diff.frame);
    context.refreshAfterKeyframeEdit();
    return true;
}

function executeKeyframeAdd(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.add" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    const applied = direction === "apply"
        ? context.addTimelineKeyframe(diff.track, diff.frame)
        : context.removeTimelineKeyframe(diff.track, diff.frame);
    if (!applied) return false;

    context.setSelectedFrame(direction === "apply" ? diff.frame : null);
    context.seekToBoundary(diff.frame);
    context.refreshAfterKeyframeEdit();
    return true;
}

function executeBoneTransform(
    diff: Extract<EditCommandDiff, { type: "edit.boneTransform" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyBoneTransform) return false;
    const snapshot = direction === "apply" ? diff.after : diff.before;
    return context.applyBoneTransform(diff.boneName, snapshot);
}

function executeCameraTransform(
    diff: Extract<EditCommandDiff, { type: "edit.cameraTransform" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    if (!context.applyCameraTransform) return false;
    const snapshot = direction === "apply" ? diff.after : diff.before;
    return context.applyCameraTransform(snapshot);
}

function executeKeyframeDelete(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.delete" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    const applied = direction === "apply"
        ? context.removeTimelineKeyframe(diff.track, diff.frame)
        : context.addTimelineKeyframe(diff.track, diff.frame);
    if (!applied) return false;

    context.setSelectedFrame(direction === "apply" ? null : diff.frame);
    context.seekToBoundary(diff.frame);
    context.refreshAfterKeyframeEdit();
    return true;
}

function executeKeyframeMove(
    diff: Extract<KeyframeCommandDiff, { type: "keyframe.move" }>,
    direction: CommandDirection,
    context: CommandExecutionContext,
): boolean {
    const fromFrame = direction === "apply" ? diff.fromFrame : diff.toFrame;
    const toFrame = direction === "apply" ? diff.toFrame : diff.fromFrame;
    const applied = context.moveTimelineKeyframe(diff.track, fromFrame, toFrame);
    if (!applied) return false;

    context.setSelectedFrame(toFrame);
    context.seekToBoundary(toFrame);
    context.refreshAfterKeyframeEdit();
    return true;
}

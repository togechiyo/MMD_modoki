import type { CommandTrackRef } from "../actions/command-types";
import { keyframeValuesEqual, type KeyframeScope, type KeyframeTransaction } from "../actions/keyframe-transaction";
import { applyKeyframeValueCorrection } from "../editor/keyframe-value-correction";
import { createMirroredKeyframePayload, resolveMirrorBoneName } from "../editor/mirror-paste-service";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";
import { AutomationError } from "./contracts";
import { buildAutomationKeyframeEdit } from "./keyframe-edit";
import { keyframePayloadSchema, type AutomationKeyframeOperation, type AutomationTimelineTransform } from "./keyframe-schema";
import { validationDetails } from "./diagnostics";

type Track = CommandTrackRef & { frames: ArrayLike<number> };
type ReadKey = (track: CommandTrackRef, frame: number) => TimelineKeyframePayload | null;
const slotId = (track: CommandTrackRef, frame: number): string => JSON.stringify([track.category, track.name, frame]);
const checkedFrame = (frame: number): number => {
    if (!Number.isInteger(frame) || frame < 0 || frame > 1000000) throw new AutomationError("FRAME_OUT_OF_RANGE", { field: "frame", actual: frame, minimum: 0, maximum: 1000000 });
    return frame;
};

/** Builds bounded source-key diffs; never mutates the editor or serializes a model. */
export function buildAutomationTimelineTransform(owner: KeyframeScope, operation: AutomationTimelineTransform, tracks: readonly Track[], read: ReadKey): KeyframeTransaction {
    if (operation.action === "insertFrames" || operation.action === "deleteFrames") {
        checkedFrame(operation.frame + operation.count - 1);
        const slots = new Map<string, KeyframeTransaction["items"][number]>();
        const before: { track: CommandTrackRef; frame: number; payload: TimelineKeyframePayload }[] = [];
        for (const track of tracks) for (let index = 0; index < track.frames.length; index++) {
            const frame = track.frames[index];
            if (frame < operation.frame) continue;
            const payload = read(track, frame);
            if (!payload) continue; // Virtual display keys have no source payload, as in the GUI column editor.
            if (before.length === 1000) throw new AutomationError("EDIT_TOO_LARGE", { field: "affectedKeyCount", actual: 1001, maximum: 1000 });
            const reference = { category: track.category, name: track.name };
            const id = slotId(reference, frame);
            if (slots.has(id)) throw new AutomationError("TRACK_NOT_UNIQUE");
            before.push({ track: reference, frame, payload });
            slots.set(id, { track: reference, frame, before: payload, after: null });
        }
        for (const item of before) {
            if (operation.action === "deleteFrames" && item.frame < operation.frame + operation.count) continue;
            const frame = checkedFrame(item.frame + (operation.action === "insertFrames" ? operation.count : -operation.count));
            const id = slotId(item.track, frame);
            const previous = slots.get(id);
            slots.set(id, { track: item.track, frame, before: previous ? previous.before : read(item.track, frame), after: item.payload });
        }
        return { type: "keyframe.transaction", owner, items: structuredClone([...slots.values()].filter(item => !keyframeValuesEqual(item.before, item.after))) };
    }
    const operations: AutomationKeyframeOperation[] = [];
    const boneTracks = tracks.filter(track => ["root", "semi-standard", "bone"].includes(track.category));
    const names = new Set(boneTracks.map(track => track.name));
    for (const [operationIndex, key] of operation.keys.entries()) {
        const details = { operationIndex, frame: key.frame };
        if (tracks.filter(track => track.category === key.track.category && track.name === key.track.name).length !== 1) throw new AutomationError("TRACK_NOT_UNIQUE", details);
        const source = read(key.track, key.frame);
        if (!source) throw new AutomationError("KEY_NOT_FOUND", details);
        if ("externalParent" in source && source.externalParent && Object.values(source.externalParent).some(value => value !== null && value !== undefined)) throw new AutomationError("EXTERNAL_PARENT_KEY_UNSUPPORTED");
        const payload = operation.action === "correct" ? applyKeyframeValueCorrection(source, operation.correction) : createMirroredKeyframePayload(source);
        if (!payload) throw new AutomationError("KEY_KIND_MISMATCH", details);
        let track: CommandTrackRef = key.track;
        let frame = key.frame;
        if (operation.action === "mirror") {
            if (owner.kind !== "model") throw new AutomationError("KEY_KIND_MISMATCH");
            const name = resolveMirrorBoneName(key.track.name, names);
            const matches = boneTracks.filter(candidate => candidate.name === name);
            if (matches.length !== 1) throw new AutomationError("TRACK_NOT_UNIQUE");
            track = { category: matches[0].category, name };
            frame = checkedFrame(frame + operation.frameOffset);
        }
        // Reject out-of-range correction results instead of silently clamping stored source values.
        const validated = keyframePayloadSchema.safeParse(payload);
        if (!validated.success) throw new AutomationError("KEY_VALUE_OUT_OF_RANGE", { ...details, ...validationDetails(validated.error, payload) });
        operations.push({ action: "set", track, frame, payload: validated.data });
    }
    return buildAutomationKeyframeEdit(owner, operations, operation.action === "mirror" ? operation.collision : "replace", read);
}

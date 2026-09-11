import { z } from "zod";
import type { CommandTrackRef } from "../actions/command-types";
import { automationTrackSchema, keyframePayloadSchema, type AutomationKeyframeOperation } from "./keyframe-schema";
import { AutomationError } from "./diagnostics";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";

const frame = z.number().int().min(0).max(1000000);
export const keySelectionSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("clear") }).strict(),
    z.object({ kind: z.literal("keys"), keys: z.array(z.object({ track: automationTrackSchema, frame }).strict()).min(1).max(100) }).strict(),
    z.object({ kind: z.literal("range"), startFrame: frame, endFrame: frame, tracks: z.array(automationTrackSchema).min(1).max(100).optional() }).strict()
        .refine(value => value.startFrame <= value.endFrame),
]);
export type KeySelection = z.infer<typeof keySelectionSchema>;
export type SelectedKey = { track: CommandTrackRef; frame: number };
type Track = CommandTrackRef & { frames: readonly number[] | Uint32Array };
const sameTrack = (a: CommandTrackRef, b: CommandTrackRef): boolean => a.category === b.category && a.name === b.name;

export function resolveKeySelection(selection: KeySelection, tracks: readonly Track[]): SelectedKey[] {
    if (selection.kind === "clear") return [];
    const result: SelectedKey[] = [];
    const ids = new Set<string>();
    const add = (track: CommandTrackRef, frame: number): void => {
        const id = JSON.stringify([track.category, track.name, frame]);
        if (ids.has(id)) throw new AutomationError("DUPLICATE_KEY");
        ids.add(id);
        result.push({ track: { category: track.category, name: track.name }, frame });
        if (result.length > 100) throw new AutomationError("KEY_SELECTION_TOO_LARGE", { maximum: 100 });
    };
    const find = (reference: CommandTrackRef): Track => {
        const matches = tracks.filter(track => sameTrack(track, reference));
        if (matches.length !== 1) throw new AutomationError("TRACK_NOT_UNIQUE");
        return matches[0];
    };
    if (selection.kind === "keys") {
        for (const [operationIndex, key] of selection.keys.entries()) {
            if (!find(key.track).frames.includes(key.frame)) throw new AutomationError("KEY_NOT_FOUND", { operationIndex, frame: key.frame });
            add(key.track, key.frame);
        }
    } else {
        for (const track of (selection.tracks ?? tracks).map(find)) {
            for (const frame of track.frames) if (frame >= selection.startFrame && frame <= selection.endFrame) add(track, frame);
        }
    }
    return result;
}

export type ClipboardKey = { track: CommandTrackRef; frameOffset: number; payload: TimelineKeyframePayload };
export function buildClipboardOperations(items: readonly ClipboardKey[], frame: number): AutomationKeyframeOperation[] {
    assertKeyCount(items.length);
    return items.map((item, operationIndex) => {
        const destination = frame + item.frameOffset;
        if (!Number.isInteger(destination) || destination < 0 || destination > 1000000) throw new AutomationError("FRAME_OUT_OF_RANGE", { operationIndex, frame: destination });
        return { action: "set", track: { ...item.track }, frame: destination, payload: keyframePayloadSchema.parse(item.payload) };
    });
}
export function assertKeyCount(count: number): void {
    if (count === 0) throw new AutomationError("KEY_SELECTION_EMPTY");
    if (count > 100) throw new AutomationError("KEY_SELECTION_TOO_LARGE", { maximum: 100, actual: count });
}
export function buildSelectionOperations(keys: readonly SelectedKey[], action: "delete" | "move", frameOffset = 0): AutomationKeyframeOperation[] {
    assertKeyCount(keys.length);
    return keys.map((key, operationIndex) => {
        if (action === "delete") return { action, ...key };
        const toFrame = key.frame + frameOffset;
        if (!Number.isInteger(toFrame) || toFrame < 0 || toFrame > 1000000) throw new AutomationError("FRAME_OUT_OF_RANGE", { operationIndex, frame: toFrame });
        return { action, ...key, toFrame };
    });
}

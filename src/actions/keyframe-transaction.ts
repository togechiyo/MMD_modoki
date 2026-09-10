import type { CommandDirection, CommandTrackRef } from "./command-types";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";

export type KeyframeScope = { kind: "camera" } | { kind: "model"; modelInstanceId: string } | { kind: "accessory"; accessoryIndex: number };
export type KeyframeTransaction = {
    type: "keyframe.transaction";
    owner: KeyframeScope;
    items: { track: CommandTrackRef; frame: number; before: TimelineKeyframePayload | null; after: TimelineKeyframePayload | null }[];
};
export type KeyframeTransactionHost = {
    scope(): KeyframeScope | null;
    read(track: CommandTrackRef, frame: number): TimelineKeyframePayload | null;
    write(track: CommandTrackRef, frame: number, payload: TimelineKeyframePayload | null): boolean;
    begin(): void;
    end(): void;
};
// Source animation stores floats in Float32 arrays. Object field order is irrelevant.
export function keyframeValuesEqual(a: unknown, b: unknown): boolean {
    if (typeof a === "number" && typeof b === "number") return Math.fround(a) === Math.fround(b);
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const present = ([key, value]: [string, unknown]): boolean => value !== undefined && !(key.endsWith("InstanceId") && value === null);
    const left = Object.entries(a).filter(present);
    const right = Object.entries(b).filter(present);
    return left.length === right.length && left.every(([key, value]) => keyframeValuesEqual(value, (b as Record<string, unknown>)[key]));
}

/** Compare all preconditions before writing; compensate a failed write before ending the batch. */
export function executeKeyframeTransaction(diff: KeyframeTransaction, direction: CommandDirection, host: KeyframeTransactionHost): boolean {
    if (!keyframeValuesEqual(diff.owner, host.scope())) return false;
    const source = direction === "apply" ? "before" : "after";
    const destination = direction === "apply" ? "after" : "before";
    if (diff.items.some(item => !keyframeValuesEqual(host.read(item.track, item.frame), item[source]))) return false;
    const attempted: KeyframeTransaction["items"] = [];
    host.begin();
    try {
        try {
            for (const item of diff.items) {
                attempted.push(item);
                if (!host.write(item.track, item.frame, item[destination]) || !keyframeValuesEqual(host.read(item.track, item.frame), item[destination])) throw new Error("Keyframe write failed");
            }
        } catch {
            for (const item of attempted.reverse()) {
                if (keyframeValuesEqual(host.read(item.track, item.frame), item[source])) continue;
                if (!host.write(item.track, item.frame, item[source]) || !keyframeValuesEqual(host.read(item.track, item.frame), item[source])) throw new Error("Keyframe rollback failed");
            }
            return false;
        }
    } finally {
        host.end();
    }
    return true;
}

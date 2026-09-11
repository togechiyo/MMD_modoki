import type { CommandDirection } from "../actions/command-types";
import { keyframeValuesEqual } from "../actions/keyframe-transaction";

export type MorphWeightBatch = {
    type: "edit.morphWeightBatch";
    modelInstanceId: string;
    frame: number;
    items: { morphName: string; before: number; after: number }[];
};
export function executeMorphWeightBatch(diff: MorphWeightBatch, direction: CommandDirection, host: {
    matches(modelInstanceId: string, frame: number): boolean;
    read(name: string): number | null;
    write(name: string, value: number): boolean;
}): boolean {
    if (!host.matches(diff.modelInstanceId, diff.frame)) return false;
    const source = direction === "apply" ? "before" : "after", destination = direction === "apply" ? "after" : "before";
    if (diff.items.some(item => !keyframeValuesEqual(host.read(item.morphName), item[source]))) return false;
    const attempted: MorphWeightBatch["items"] = [];
    try {
        for (const item of diff.items) {
            attempted.push(item);
            if (!host.write(item.morphName, item[destination])) throw new Error("Morph batch write failed");
        }
    } catch {
        let restored = true;
        for (const item of attempted.reverse()) {
            try { if (!host.write(item.morphName, item[source])) restored = false; } catch { restored = false; }
        }
        if (!restored) throw new Error("Morph batch rollback failed");
        return false;
    }
    return true;
}

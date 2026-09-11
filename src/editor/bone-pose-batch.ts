import type { BoneTransformCommandSnapshot, CommandDirection } from "../actions/command-types";
import { areBoneTransformSnapshotsEqual } from "../actions/bone-transform-command-builder";

export type BonePoseBatch = {
    type: "edit.bonePoseBatch";
    modelInstanceId: string;
    frame: number;
    items: { boneName: string; before: BoneTransformCommandSnapshot; after: BoneTransformCommandSnapshot }[];
};

/** Preconditions for every bone are checked before any write. Failed writes are compensated. */
export function executeBonePoseBatch(diff: BonePoseBatch, direction: CommandDirection, host: {
    matches(modelInstanceId: string, frame: number): boolean;
    read(boneName: string): BoneTransformCommandSnapshot | null;
    write(boneName: string, value: BoneTransformCommandSnapshot): boolean;
}): boolean {
    if (!host.matches(diff.modelInstanceId, diff.frame)) return false;
    const source = direction === "apply" ? "before" : "after";
    const destination = direction === "apply" ? "after" : "before";
    if (diff.items.some(item => {
        const current = host.read(item.boneName);
        return !current || !areBoneTransformSnapshotsEqual(current, item[source]);
    })) return false;
    const attempted: BonePoseBatch["items"] = [];
    try {
        for (const item of diff.items) {
            attempted.push(item);
            if (!host.write(item.boneName, item[destination])) throw new Error("Bone pose write failed");
        }
    } catch {
        let restored = true;
        for (const item of attempted.reverse()) {
            try { if (!host.write(item.boneName, item[source])) restored = false; } catch { restored = false; }
        }
        if (!restored) throw new Error("Bone pose rollback failed");
        return false;
    }
    return true;
}

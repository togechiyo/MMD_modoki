import { z } from "zod";
import type { BoneTransformCommandSnapshot } from "../actions/command-types";
import type { BonePoseBatch } from "../editor/bone-pose-batch";
import { areBoneTransformSnapshotsEqual } from "../actions/bone-transform-command-builder";
import { AutomationError } from "./diagnostics";

const vector = z.object({ x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000), z: z.number().finite().min(-100000).max(100000) }).strict();
export const bonePoseSchema = z.array(z.object({ boneName: z.string().min(1).max(200), position: vector, rotation: vector }).strict())
    .min(1).max(100).refine(items => new Set(items.map(item => item.boneName)).size === items.length, "Duplicate bone");
export type BonePoseInput = z.infer<typeof bonePoseSchema>;

export function buildBonePoseBatch(modelInstanceId: string, frame: number, poses: BonePoseInput, host: {
    names: readonly string[];
    read(boneName: string): BoneTransformCommandSnapshot | null;
    controls(boneName: string): { movable: boolean; rotatable: boolean };
}): BonePoseBatch {
    const items = poses.map((pose, operationIndex) => {
        const details = { operationIndex };
        if (pose.boneName === "Camera" || host.names.filter(name => name === pose.boneName).length !== 1) throw new AutomationError("BONE_NOT_UNIQUE", details);
        const before = host.read(pose.boneName);
        if (!before) throw new AutomationError("BONE_NOT_FOUND", details);
        const controls = host.controls(pose.boneName);
        const differs = (a: typeof pose.position, b: typeof pose.position): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z)) > 0.0001;
        if ((!controls.movable && differs(before.position, pose.position)) || (!controls.rotatable && differs(before.rotation, pose.rotation))) throw new AutomationError("BONE_CONTROL_LOCKED", details);
        return { boneName: pose.boneName, before: structuredClone(before), after: { position: { ...pose.position }, rotation: { ...pose.rotation } } };
    }).filter(item => !areBoneTransformSnapshotsEqual(item.before, item.after));
    return { type: "edit.bonePoseBatch", modelInstanceId, frame, items };
}

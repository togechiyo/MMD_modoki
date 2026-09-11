import { z } from "zod";
import { AutomationError } from "./diagnostics";
import { keyframeValuesEqual } from "../actions/keyframe-transaction";
import type { MorphWeightBatch } from "../editor/morph-weight-batch";

export const morphBatchSchema = z.array(z.object({ morphName: z.string().min(1).max(200), weight: z.number().finite().min(0).max(1) }).strict())
    .min(1).max(100).refine(items => new Set(items.map(item => item.morphName)).size === items.length, "Duplicate morph");
export type MorphBatchInput = z.infer<typeof morphBatchSchema>;
export function buildMorphWeightBatch(modelInstanceId: string, frame: number, morphs: MorphBatchInput, names: readonly string[],
    read: (name: string) => number): MorphWeightBatch {
    const items = morphs.map((morph, operationIndex) => {
        if (names.filter(name => name === morph.morphName).length !== 1) throw new AutomationError("MORPH_NOT_UNIQUE", { operationIndex });
        const before = read(morph.morphName);
        if (!Number.isFinite(before)) throw new AutomationError("MORPH_NOT_FOUND", { operationIndex });
        return { morphName: morph.morphName, before, after: morph.weight };
    }).filter(item => !keyframeValuesEqual(item.before, item.after));
    return { type: "edit.morphWeightBatch", modelInstanceId, frame, items };
}

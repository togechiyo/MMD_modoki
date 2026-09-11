import { z } from "zod";
import { automationMaterialTargetSchema, type AutomationMaterialTarget } from "./material-schema";
import { AutomationError, toAutomationFailure } from "./diagnostics";

export const materialBatchSchema = z.array(z.object({
    subject: automationMaterialTargetSchema, expectedPath: z.string().min(1).max(4096),
    materialKeys: z.array(z.string().min(1).max(200)).min(1).max(200).refine(keys => new Set(keys).size === keys.length).nullable(),
    action: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("preset"), presetId: z.string().min(1).max(100) }).strict(),
        z.object({ kind: z.literal("reset") }).strict(),
        z.object({ kind: z.literal("visibility"), visible: z.boolean() }).strict(),
    ]),
}).strict()).min(1).max(100);
export type MaterialBatch = z.infer<typeof materialBatchSchema>;
export type MaterialBatchHost = {
    catalog(subject: AutomationMaterialTarget): { sourcePath: string; defaultPresetId: string; available: boolean;
        presets: readonly { id: string }[]; materials: readonly { key: string; visible: boolean; presetId: string }[] };
    preset(subject: AutomationMaterialTarget, key: string, id: string): unknown;
    visibility(subject: AutomationMaterialTarget, key: string, visible: boolean): void;
};
export function runMaterialBatch(host: MaterialBatchHost, entries: MaterialBatch, dryRun: boolean) {
    const plan = entries.map((entry, operationIndex) => {
        const catalog = host.catalog(entry.subject);
        if (catalog.sourcePath !== entry.expectedPath) throw new AutomationError("ASSET_CHANGED", { operationIndex });
        const keys = entry.materialKeys ?? catalog.materials.map(material => material.key);
        if (!keys.length || keys.some(key => !catalog.materials.some(material => material.key === key))) throw new AutomationError("MATERIAL_NOT_FOUND", { operationIndex });
        const presetId = entry.action.kind === "reset" ? catalog.defaultPresetId : entry.action.kind === "preset" ? entry.action.presetId : null;
        if (presetId && (!catalog.available || !catalog.presets.some(preset => preset.id === presetId))) throw new AutomationError("SETTING_UNAVAILABLE", { operationIndex });
        return { operationIndex, subject: entry.subject, keys, action: entry.action, presetId };
    });
    if (plan.reduce((sum, item) => sum + item.keys.length, 0) > 200) throw new AutomationError("EDIT_TOO_LARGE");
    if (dryRun) return { status: "validated", plan, undoable: false, allSucceeded: true };
    const results: Record<string, unknown>[] = [];
    for (const item of plan) {
        let appliedMaterialCount = 0;
        try {
            for (const key of item.keys) {
                if (item.action.kind === "visibility") host.visibility(item.subject, key, item.action.visible);
                else if (item.presetId) host.preset(item.subject, key, item.presetId);
                appliedMaterialCount++;
            }
            results.push({ operationIndex: item.operationIndex, status: "completed", appliedMaterialCount });
        } catch (error) {
            results.push({ operationIndex: item.operationIndex, status: "failed", appliedMaterialCount, error: toAutomationFailure(error) });
            return { status: "partial_failure", results, allSucceeded: false, undoable: false };
        }
    }
    return { status: "completed", results, allSucceeded: true, undoable: false };
}

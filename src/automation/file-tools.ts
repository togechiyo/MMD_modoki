import { AutomationError, toAutomationFailure } from "./diagnostics";
import type { AutomationFileToolItem } from "./ui-operation-schema";
import type { AutomationJobContext } from "./ui-jobs";

/** Comparisons protect inputs and make every result independent of earlier output files. */
function pathKey(value: string): string {
    const unix = value.replace(/\\/g, "/");
    const normalized: string[] = [];
    for (const part of unix.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") { if (normalized.length > (/^[A-Za-z]:/.test(value) ? 1 : 0)) normalized.pop(); }
        else normalized.push(part);
    }
    const result = normalized.join("/");
    return /^[A-Za-z]:/.test(value) ? result.toLowerCase() : result;
}
export function validateFileToolBatch(items: readonly AutomationFileToolItem[]): void {
    const inputs = new Set(items.flatMap(item => item.kind === "retargetMotion"
        ? [item.sourceModelPath, item.sourceMotionPath, item.targetModelPath] : [item.sourcePath]).map(pathKey));
    const outputs = new Set<string>();
    items.forEach((item, operationIndex) => {
        const valid = item.kind === "retargetMotion"
            ? /\.pmx$/i.test(item.sourceModelPath) && /\.pmx$/i.test(item.targetModelPath) && /\.vmd$/i.test(item.sourceMotionPath) && /\.vmd$/i.test(item.filePath)
            : item.kind === "optimizeModel"
                ? /\.(pmx|pmd)$/i.test(item.sourcePath) && /\.bpmx$/i.test(item.filePath)
                : /\.vmd$/i.test(item.sourcePath) && /\.bvmd$/i.test(item.filePath);
        const key = pathKey(item.filePath);
        if (!valid || inputs.has(key) || outputs.has(key)) throw new AutomationError("INVALID_OUTPUT", { operationIndex });
        outputs.add(key);
    });
}

export async function runFileToolBatch(items: readonly AutomationFileToolItem[], continueOnError: boolean,
    run: (item: AutomationFileToolItem) => Promise<Record<string, unknown>>, authorized: () => Promise<void>, context: AutomationJobContext) {
    validateFileToolBatch(items);
    const results: Record<string, unknown>[] = [];
    for (let index = 0; index < items.length; index++) {
        if (context.signal.aborted) {
            context.report({ phase: "canceled", completedItems: results.length, totalItems: items.length, results });
            throw new AutomationError("OPERATION_CANCELED");
        }
        await authorized();
        const item = items[index];
        context.report({ phase: "converting", operationIndex: index, completedItems: results.length, totalItems: items.length, results: [...results] });
        try {
            const output = await run(item);
            results.push({ ...output, operationIndex: index, kind: item.kind, status: "completed" });
        } catch (error) {
            const failure = toAutomationFailure(error);
            results.push({ operationIndex: index, kind: item.kind, status: "failed", filePath: item.filePath, error: failure });
            context.report({ phase: "item_failed", completedItems: results.length, totalItems: items.length, results: [...results] });
            if (!continueOnError || failure.code === "ACCESS_REVOKED") throw new AutomationError(failure.code, { operationIndex: index });
        }
    }
    const failedItems = results.filter(result => result.status === "failed").length;
    context.report({ phase: "completed", completedItems: results.length, totalItems: items.length, failedItems });
    return { results, failedItems, allSucceeded: failedItems === 0, modelContentShared: false };
}

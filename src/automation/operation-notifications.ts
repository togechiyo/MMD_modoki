import { z } from "zod";
import type { AutomationPermission } from "./ui-operation-schema";

export const operationCompletionSchema = z.object({
    operationId: z.string().uuid(), status: z.enum(["completed", "failed", "canceled"]),
    completedAt: z.string().datetime(), errorCode: z.string().max(80).regex(/^[A-Z_]+$/).optional(),
}).strict();
export type AutomationOperationCompletion = z.infer<typeof operationCompletionSchema>;
export type AutomationOperationSummary = AutomationOperationCompletion | { operationId: string; status: "running" };
export const operationNoticeSchema = operationCompletionSchema.extend({ sessionId: z.string().uuid(), grant: z.number().int().nonnegative() }).strict();
export type AutomationOperationNotice = z.infer<typeof operationNoticeSchema>;
const operationResourceSchema = z.object({ sessionId: z.string().uuid(), grant: z.number().int().nonnegative(), operationId: z.string().uuid() });
export const operationResourceTemplate = "mmd://operations/{sessionId}/{grant}/{operationId}";
export function operationResourceScope(permission: AutomationPermission): string {
    return `mmd://operations/${permission.sessionId}/${permission.grant}/`;
}
export function parseOperationResource(uri: string): z.infer<typeof operationResourceSchema> | undefined {
    const match = /^mmd:\/\/operations\/([^/]+)\/([0-9]+)\/([^/?#]+)$/.exec(uri);
    if (!match) return undefined;
    const parsed = operationResourceSchema.safeParse({ sessionId: match[1], grant: Number(match[2]), operationId: match[3] });
    if (!parsed.success || uri !== operationResourceScope(parsed.data) + parsed.data.operationId) return undefined;
    return parsed.data;
}

/** Small, grant-local resource summaries; no output paths, model data, or progress history. */
export class AutomationOperationNotifications {
    private readonly summaries = new Map<string, AutomationOperationSummary>();
    clear(): void { this.summaries.clear(); }
    register(permission: AutomationPermission, operationId: string): string {
        const uri = operationResourceScope(permission) + operationId;
        if (!parseOperationResource(uri)) throw new Error("INVALID_OPERATION_RESOURCE");
        if (!this.summaries.has(uri)) this.store(uri, { operationId, status: "running" });
        return uri;
    }
    complete(permission: AutomationPermission, completion: AutomationOperationCompletion): string | undefined {
        const summary = operationCompletionSchema.parse(completion);
        const uri = operationResourceScope(permission) + summary.operationId;
        if (!parseOperationResource(uri)) throw new Error("INVALID_OPERATION_RESOURCE");
        if (JSON.stringify(this.summaries.get(uri)) === JSON.stringify(summary)) return undefined;
        this.store(uri, summary);
        return uri;
    }
    read(uri: string): AutomationOperationSummary | undefined {
        const summary = this.summaries.get(uri);
        return summary ? { ...summary } : undefined;
    }
    private store(uri: string, summary: AutomationOperationSummary): void {
        this.summaries.set(uri, summary);
        if (this.summaries.size > 100) {
            const oldest = this.summaries.keys().next().value;
            if (oldest) this.summaries.delete(oldest);
        }
    }
}

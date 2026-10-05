import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { AutomationOperationNotifications, operationResourceScope, parseOperationResource, operationNoticeSchema } from "../../src/automation/operation-notifications";

const permission = { sessionId: "11111111-1111-4111-8111-111111111111", grant: 4 };
const operationId = "22222222-2222-4222-8222-222222222222";
const completed = { operationId, status: "completed" as const, completedAt: "2026-10-05T11:00:00.000Z" };

describe("operation notification summaries", () => {
    it("uses grant-bound resource URIs and rejects malformed or arbitrary resource locations", () => {
        const store = new AutomationOperationNotifications();
        const uri = store.register(permission, operationId);
        expect(uri).toBe(`${operationResourceScope(permission)}${operationId}`);
        expect(parseOperationResource(uri)).toEqual({ ...permission, operationId });
        for (const value of [uri + "?extra=1", uri + "#fragment", uri.replace("/4/", "/-1/"), "file:///private.pmx", uri.replace(operationId, "../private"), uri.replace("mmd://", "https://")]) {
            expect(parseOperationResource(value)).toBeUndefined();
        }
    });
    it("handles completion before the start reply, deduplicates, and exposes only a small summary", () => {
        const store = new AutomationOperationNotifications();
        const uri = store.complete(permission, completed);
        expect(uri).toBeDefined();
        expect(store.register(permission, operationId)).toBe(uri);
        expect(store.read(uri ?? "")).toEqual(completed);
        expect(store.complete(permission, completed)).toBeUndefined();
        expect(operationNoticeSchema.safeParse({ ...permission, ...completed, output: { filePath: "PRIVATE" } }).success).toBe(false);
        store.clear();
        expect(store.read(uri ?? "")).toBeUndefined();
    });
    it("bounds retained summaries and keeps failure/cancellation distinct", () => {
        const store = new AutomationOperationNotifications();
        const first = store.register(permission, operationId);
        for (let i = 0; i < 100; i++) store.register(permission, randomUUID());
        expect(store.read(first)).toBeUndefined();
        const failed = { ...completed, operationId: randomUUID(), status: "failed" as const, errorCode: "OUTPUT_EXISTS" };
        const canceled = { ...completed, operationId: randomUUID(), status: "canceled" as const, errorCode: "OPERATION_CANCELED" };
        const failedUri = store.complete(permission, failed);
        const canceledUri = store.complete(permission, canceled);
        expect(store.read(failedUri ?? "")).toEqual(failed);
        expect(store.read(canceledUri ?? "")).toEqual(canceled);
    });
});

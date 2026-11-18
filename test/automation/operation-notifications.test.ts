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
    it("retains early waiting notices and deduplicates state changes without reopening a completed job", () => {
        const store = new AutomationOperationNotifications();
        const waiting = { operationId, status: "running" as const, phase: "waiting_for_user" as const };
        const working = { operationId, status: "running" as const, phase: "working" as const };
        const uri = store.complete(permission, waiting);
        expect(store.register(permission, operationId)).toBe(uri);
        expect(store.read(uri ?? "")).toEqual(waiting);
        expect(store.complete(permission, waiting)).toBeUndefined();
        expect(store.complete(permission, working)).toBe(uri);
        expect(store.read(uri ?? "")).toEqual(working);
        expect(store.complete(permission, working)).toBeUndefined();
        expect(store.complete(permission, waiting)).toBe(uri);
        expect(store.complete(permission, completed)).toBe(uri);
        expect(store.complete(permission, waiting)).toBeUndefined();
        expect(store.complete(permission, working)).toBeUndefined();
        expect(store.read(uri ?? "")).toEqual(completed);
    });
    it("accepts only small running-state notices and preserves terminal payload compatibility", () => {
        const waiting = { ...permission, operationId, status: "running", phase: "waiting_for_user" };
        expect(operationNoticeSchema.safeParse(waiting).success).toBe(true);
        expect(operationNoticeSchema.safeParse({ ...permission, ...completed }).success).toBe(true);
        for (const extra of [{ comment: "PRIVATE" }, { filePath: "PRIVATE" }, { progress: {} }, { userAction: { message: "PRIVATE" } }, { completedAt: completed.completedAt }]) {
            expect(operationNoticeSchema.safeParse({ ...waiting, ...extra }).success).toBe(false);
        }
        expect(operationNoticeSchema.safeParse({ ...waiting, phase: undefined }).success).toBe(false);
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

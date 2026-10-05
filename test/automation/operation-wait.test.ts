import { describe, expect, it, vi } from "vitest";
import { waitForAutomationOperation } from "../../src/main/automation/operation-wait";
import { AutomationError } from "../../src/automation/diagnostics";

describe("operation completion wait", () => {
    it.each(["completed", "failed", "canceled"])("returns %s as soon as local work reaches its terminal state", async status => {
        vi.useFakeTimers();
        try {
            const read = vi.fn().mockResolvedValueOnce({ data: { status: "running" } }).mockResolvedValue({ data: { status, operationId: "one" } });
            const result = waitForAutomationOperation(read, 30000);
            await vi.advanceTimersByTimeAsync(1000);
            expect(await result).toEqual({ data: { status, operationId: "one" } });
            expect(read).toHaveBeenCalledTimes(2);
        } finally { vi.useRealTimers(); }
    });
    it("bounds the wait and makes a zero wait a single read", async () => {
        vi.useFakeTimers();
        try {
            const read = vi.fn().mockResolvedValue({ data: { status: "running", progress: { frames: 4 } } });
            expect(await waitForAutomationOperation(read, 0)).toEqual({ data: { status: "running", progress: { frames: 4 } } });
            read.mockClear();
            const result = waitForAutomationOperation(read, 2500);
            await vi.advanceTimersByTimeAsync(2500);
            expect(await result).toMatchObject({ data: { status: "running", waitTimedOut: true } });
            expect(read).toHaveBeenCalledTimes(4);
        } finally { vi.useRealTimers(); }
    });
    it.each(["unknown", "completed", "failed", "canceled"])("does not wait on %s", async status => {
        const read = vi.fn().mockResolvedValue({ data: { status } });
        expect(await waitForAutomationOperation(read, 30000)).toEqual({ data: { status } });
        expect(read).toHaveBeenCalledTimes(1);
    });
    it("returns immediately when a user action is required", async () => {
        const read = vi.fn().mockResolvedValue({ data: { status: "running", phase: "waiting_for_user" } });
        expect(await waitForAutomationOperation(read, 30000)).toMatchObject({ data: { phase: "waiting_for_user" } });
        expect(read).toHaveBeenCalledTimes(1);
    });
    it("stops after grant revocation without converting it into a job result", async () => {
        vi.useFakeTimers();
        try {
            const read = vi.fn().mockResolvedValueOnce({ data: { status: "running" } }).mockRejectedValue(new AutomationError("ACCESS_REVOKED"));
            const result = waitForAutomationOperation(read, 30000);
            const rejected = expect(result).rejects.toThrow("ACCESS_REVOKED");
            await vi.advanceTimersByTimeAsync(1000);
            await rejected;
            expect(read).toHaveBeenCalledTimes(2);
        } finally { vi.useRealTimers(); }
    });
    it("aborts only the wait when the calling request is canceled", async () => {
        vi.useFakeTimers();
        try {
            const controller = new AbortController();
            const read = vi.fn().mockResolvedValue({ data: { status: "running" } });
            const result = waitForAutomationOperation(read, 30000, controller.signal);
            const rejected = expect(result).rejects.toThrow("WAIT_CANCELED");
            await vi.advanceTimersByTimeAsync(0);
            expect(read).toHaveBeenCalledTimes(1);
            expect(vi.getTimerCount()).toBe(1);
            controller.abort();
            await rejected;
            expect(vi.getTimerCount()).toBe(0);
            await vi.advanceTimersByTimeAsync(30000);
            expect(read).toHaveBeenCalledTimes(1);
        } finally { vi.useRealTimers(); }
    });
});

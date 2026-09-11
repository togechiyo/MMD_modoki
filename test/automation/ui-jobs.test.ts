import { describe, it, expect, vi } from "vitest";
import { AutomationUiJobs } from "../../src/automation/ui-jobs";
import { AutomationError } from "../../src/automation/diagnostics";

describe("UI operation lifecycle", () => {
    it("returns running, deduplicates while pending, and keeps completion after scene changes", async () => {
        const jobs = new AutomationUiJobs();
        let finish: (value: Record<string, unknown>) => void = () => undefined;
        const task = vi.fn(() => new Promise<Record<string, unknown>>(resolve => { finish = resolve; }));
        expect(jobs.start("one", "input", task, () => true).status).toBe("running");
        await Promise.resolve();
        expect(jobs.replay("one", "input")?.status).toBe("running");
        expect(() => jobs.replay("one", "different")).toThrow("OPERATION_ID_REUSED");
        expect(() => jobs.start("two", "input", task, () => true)).toThrow("EDITOR_BUSY");
        finish({ filePath: "local" });
        await vi.waitFor(() => expect(jobs.busy).toBe(false));
        expect(task).toHaveBeenCalledTimes(1);
        expect(jobs.get("one")).toMatchObject({ status: "completed", output: { filePath: "local" } });
    });
    it("does not execute a revoked pending task or retain its values", async () => {
        const jobs = new AutomationUiJobs();
        const task = vi.fn(async () => ({ secret: "not returned" }));
        jobs.start("one", "input", task, () => false);
        jobs.clear();
        await vi.waitFor(() => expect(jobs.busy).toBe(false));
        expect(task).not.toHaveBeenCalled();
        expect(jobs.get("one")).toBeUndefined();
    });
    it("sanitizes runtime failures and unlocks editing", async () => {
        const jobs = new AutomationUiJobs();
        jobs.start("one", "input", async () => { throw new Error("SECRET_MODEL_DATA"); }, () => true);
        await vi.waitFor(() => expect(jobs.busy).toBe(false));
        expect(jobs.get("one")).toMatchObject({ status: "failed", diagnostic: { error: { code: "OPERATION_FAILED" } } });
        expect(JSON.stringify(jobs.get("one"))).not.toContain("SECRET_MODEL_DATA");
    });
    it("holds the lock after cancellation until the exporter confirms its terminal state", async () => {
        const jobs = new AutomationUiJobs();
        let finish: () => void = () => undefined;
        let signal: AbortSignal | undefined;
        jobs.start("video", "input", context => {
            signal = context.signal;
            return new Promise((_resolve, reject) => { finish = () => reject(new AutomationError("OPERATION_CANCELED")); });
        }, () => true, true);
        await Promise.resolve();
        expect(jobs.cancel("video")).toBe(true);
        expect(signal?.aborted).toBe(true);
        expect(jobs.busy).toBe(true);
        finish();
        await vi.waitFor(() => expect(jobs.busy).toBe(false));
        expect(jobs.get("video")?.status).toBe("canceled");
    });
});

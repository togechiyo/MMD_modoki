import { AutomationError, describeAutomationFailure, toAutomationFailure } from "./diagnostics";

/** Grant-local results survive scene replacement. Running local work keeps the edit gate locked even after revocation. */
export class AutomationUiJobs {
    private readonly jobs = new Map<string, { input: string; result: Record<string, unknown> }>();
    private active = false;
    get busy(): boolean { return this.active; }
    clear(): void { this.jobs.clear(); }
    get(id: string): Record<string, unknown> | undefined { return this.jobs.get(id)?.result; }
    replay(id: string, input: string): Record<string, unknown> | undefined {
        const job = this.jobs.get(id);
        if (job && job.input !== input) throw new AutomationError("OPERATION_ID_REUSED");
        return job?.result;
    }
    start(id: string, input: string, task: () => Promise<Record<string, unknown>>, authorized: () => boolean): Record<string, unknown> {
        const prior = this.replay(id, input);
        if (prior) return prior;
        if (this.active) throw new AutomationError("EDITOR_BUSY");
        this.active = true;
        const job = { input, result: { operationId: id, status: "running", startedAt: new Date().toISOString(), undoable: false } as Record<string, unknown> };
        this.jobs.set(id, job);
        if (this.jobs.size > 100) { const oldest = this.jobs.keys().next().value; if (oldest) this.jobs.delete(oldest); }
        void Promise.resolve().then(async () => {
            if (!authorized()) throw new AutomationError("ACCESS_REVOKED");
            const output = await task();
            if (!authorized()) throw new AutomationError("ACCESS_REVOKED");
            job.result = { ...job.result, status: "completed", completedAt: new Date().toISOString(), output };
        }).catch(error => {
            job.result = { ...job.result, status: "failed", completedAt: new Date().toISOString(), diagnostic: describeAutomationFailure(toAutomationFailure(error)) };
        }).finally(() => { this.active = false; });
        return job.result;
    }
}

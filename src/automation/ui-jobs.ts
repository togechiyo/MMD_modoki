import { AutomationError, describeAutomationFailure, toAutomationFailure } from "./diagnostics";
import type { AutomationOperationCompletion, AutomationOperationUpdate } from "./operation-notifications";

export type AutomationJobContext = { signal: AbortSignal; report(progress: Record<string, unknown>): void };

/** Grant-local results survive scene replacement. Running local work keeps the edit gate locked even after revocation. */
export class AutomationUiJobs {
    constructor(private readonly notifications?: { complete(update: AutomationOperationUpdate): void; failed(error: unknown): void }) {}
    private readonly jobs = new Map<string, { input: string; result: Record<string, unknown> }>();
    private active = false;
    private cancellation: { id: string; controller: AbortController } | null = null;
    private updateUserWait: ((waiting: boolean) => void) | undefined;
    get busy(): boolean { return this.active; }
    clear(): void { this.cancellation?.controller.abort(); this.jobs.clear(); this.updateUserWait = undefined; }
    setWaitingForUser(waiting: boolean): void { this.updateUserWait?.(waiting); }
    cancel(id: string): boolean {
        if (this.cancellation?.id !== id) throw new AutomationError("OPERATION_NOT_CANCELABLE");
        this.cancellation.controller.abort();
        const job = this.jobs.get(id);
        if (job) job.result = { ...job.result, cancelRequested: true };
        return true;
    }
    get(id: string): Record<string, unknown> | undefined { return this.jobs.get(id)?.result; }
    replay(id: string, input: string): Record<string, unknown> | undefined {
        const job = this.jobs.get(id);
        if (job && job.input !== input) throw new AutomationError("OPERATION_ID_REUSED");
        return job?.result;
    }
    start(id: string, input: string, task: (context: AutomationJobContext) => Promise<Record<string, unknown>>, authorized: () => boolean, cancellable = false): Record<string, unknown> {
        const prior = this.replay(id, input);
        if (prior) return prior;
        if (this.active) throw new AutomationError("EDITOR_BUSY");
        this.active = true;
        const controller = new AbortController();
        this.cancellation = cancellable ? { id, controller } : null;
        const job = { input, result: { operationId: id, status: "running", startedAt: new Date().toISOString(), cancellable, undoable: false } as Record<string, unknown> };
        let completion: AutomationOperationCompletion | undefined;
        this.jobs.set(id, job);
        let waitingForUser = false;
        this.updateUserWait = waiting => {
            if (waiting === waitingForUser || job.result.status !== "running" || this.jobs.get(id) !== job || !authorized()) return;
            waitingForUser = waiting;
            const update = { operationId: id, status: "running" as const, phase: waiting ? "waiting_for_user" as const : "working" as const };
            job.result = { ...job.result, phase: update.phase };
            this.notify(update);
        };
        if (this.jobs.size > 100) { const oldest = this.jobs.keys().next().value; if (oldest) this.jobs.delete(oldest); }
        void Promise.resolve().then(async () => {
            if (!authorized()) throw new AutomationError("ACCESS_REVOKED");
            const output = await task({ signal: controller.signal, report: progress => { job.result = { ...job.result, progress }; } });
            if (!authorized()) throw new AutomationError("ACCESS_REVOKED");
            completion = { operationId: id, status: "completed", completedAt: new Date().toISOString() };
            job.result = { ...job.result, ...completion, output };
        }).catch(error => {
            const failure = toAutomationFailure(error);
            completion = { operationId: id, status: failure.code === "OPERATION_CANCELED" ? "canceled" : "failed", completedAt: new Date().toISOString(), errorCode: failure.code };
            job.result = { ...job.result, status: completion.status, completedAt: completion.completedAt, diagnostic: describeAutomationFailure(failure) };
        }).finally(() => {
            this.active = false;
            this.cancellation = null;
            this.updateUserWait = undefined;
            delete job.result.phase;
            if (completion && this.jobs.get(id) === job && authorized()) {
                this.notify(completion);
            }
        });
        return job.result;
    }
    private notify(update: AutomationOperationUpdate): void {
        try { this.notifications?.complete(update); }
        catch (error) { this.notifications?.failed(error); }
    }
}

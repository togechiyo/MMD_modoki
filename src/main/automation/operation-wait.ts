import { AutomationError, type AutomationResult } from "../../automation/contracts";

function pause(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const finish = (error?: AutomationError): void => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            if (error) reject(error);
            else resolve();
        };
        const timer = setTimeout(() => finish(), ms);
        const abort = (): void => finish(new AutomationError("WAIT_CANCELED"));
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
    });
}

/** Poll locally while holding one MCP call. The reader must revalidate the original grant. */
export async function waitForAutomationOperation(read: () => Promise<AutomationResult>, waitMs: number, signal?: AbortSignal): Promise<AutomationResult> {
    const deadline = performance.now() + waitMs;
    for (;;) {
        if (signal?.aborted) throw new AutomationError("WAIT_CANCELED");
        const result = await read();
        if (signal?.aborted) throw new AutomationError("WAIT_CANCELED");
        if (result.data.status !== "running" || result.data.phase === "waiting_for_user" || waitMs === 0) return result;
        const remaining = deadline - performance.now();
        if (remaining <= 0) return { ...result, data: { ...result.data, waitTimedOut: true } };
        await pause(Math.min(1000, remaining), signal);
    }
}

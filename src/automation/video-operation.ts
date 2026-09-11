import type { ElectronAPI, WebmExportLaunchResult, WebmExportProgress, WebmExportResult } from "../types";
import type { AutomationJobContext } from "./ui-jobs";
import { AutomationError } from "./diagnostics";

type VideoApi = Pick<ElectronAPI, "onWebmExportProgress" | "onWebmExportResult" | "cancelWebmExportJob">;
/** Subscribe before launch: very short exports may finish before the launch IPC resolves. */
export async function runAutomationVideo(api: VideoApi, start: () => Promise<WebmExportLaunchResult | null | void>, context: AutomationJobContext): Promise<Record<string, unknown>> {
    let jobId: string | null = null;
    let settle: (result: WebmExportResult) => void = () => undefined;
    const done = new Promise<WebmExportResult>(resolve => { settle = resolve; });
    const early = new Map<string, WebmExportResult>();
    const report = (p: WebmExportProgress) => context.report({ phase: p.phase, encodedFrames: p.encoded, totalFrames: p.total,
        frame: p.frame, capturedFrames: p.captured ?? null, observedAt: p.timestampMs });
    const unsubscribeProgress = api.onWebmExportProgress(p => { if (p.jobId === jobId) report(p); });
    const unsubscribeResult = api.onWebmExportResult(result => {
        if (result.jobId === jobId) settle(result);
        else if (!jobId && early.size < 16) early.set(result.jobId, result);
    });
    const cancel = () => {
        if (jobId) void api.cancelWebmExportJob(jobId).then(accepted => context.report({ phase: "canceling", accepted }),
            () => context.report({ phase: "canceling", accepted: false }));
    };
    context.signal.addEventListener("abort", cancel);
    try {
        if (context.signal.aborted) throw new AutomationError("OPERATION_CANCELED");
        const launched = await start();
        if (!launched) throw new AutomationError("VIDEO_EXPORT_FAILED");
        if (launched.errorCode) throw new AutomationError(launched.errorCode);
        if (!launched.jobId) throw new AutomationError("VIDEO_EXPORT_FAILED");
        jobId = launched.jobId;
        if (early.has(jobId)) settle(early.get(jobId) as WebmExportResult);
        if (context.signal.aborted) cancel();
        const result = await done;
        if (result.status === "canceled") throw new AutomationError("OPERATION_CANCELED");
        if (result.status !== "completed") throw new AutomationError(result.errorCode ?? "VIDEO_EXPORT_FAILED");
        return { filePath: result.filePath, byteLength: result.byteLength, format: "webm" };
    } finally { unsubscribeProgress(); unsubscribeResult(); context.signal.removeEventListener("abort", cancel); }
}

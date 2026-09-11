import type { ElectronAPI, AutomationPngSequenceResult, PngSequenceExportLaunchResult } from "../types";
import type { AutomationJobContext } from "./ui-jobs";
import { AutomationError } from "./diagnostics";

export async function runAutomationPngSequence(api: Pick<ElectronAPI, "onPngSequenceExportProgress" | "onPngSequenceExportResult" | "cancelPngSequenceExportJob">,
    start: () => Promise<PngSequenceExportLaunchResult | null | void>, outputDirectoryPath: string, context: AutomationJobContext): Promise<Record<string, unknown>> {
    if (context.signal.aborted) throw new AutomationError("OPERATION_CANCELED");
    let jobId: string | null = null;
    let finished = false;
    let settle: (result: AutomationPngSequenceResult) => void = () => undefined;
    const done = new Promise<AutomationPngSequenceResult>(resolve => { settle = resolve; });
    const early = new Map<string, AutomationPngSequenceResult>();
    const offProgress = api.onPngSequenceExportProgress(p => {
        if (p.jobId === jobId) context.report({ phase: "exporting", outputDirectoryPath, savedFiles: p.saved, capturedFrames: p.captured, totalFiles: p.total, frame: p.frame });
    });
    const offResult = api.onPngSequenceExportResult(result => {
        if (result.jobId === jobId) settle(result);
        else if (!jobId && early.size < 16) early.set(result.jobId, result);
    });
    const cancel = () => {
        if (jobId) void api.cancelPngSequenceExportJob(jobId).then(accepted => { if (!finished) context.report({ phase: "canceling", outputDirectoryPath, accepted }); },
            () => { if (!finished) context.report({ phase: "canceling", outputDirectoryPath, accepted: false }); });
    };
    context.signal.addEventListener("abort", cancel);
    try {
        context.report({ phase: "starting", outputDirectoryPath });
        const launched = await start();
        if (!launched || !launched.jobId) throw new AutomationError(launched ? launched.errorCode ?? "PNG_EXPORT_FAILED" : "PNG_EXPORT_FAILED");
        jobId = launched.jobId;
        const cached = early.get(jobId);
        if (cached) settle(cached);
        if (context.signal.aborted) cancel();
        const result = await done;
        finished = true;
        context.report({ phase: result.status, outputDirectoryPath: result.outputDirectoryPath, savedFiles: result.savedFiles,
            totalFiles: result.totalFiles, byteLength: result.byteLength, partialOutput: result.status !== "completed" });
        if (result.status === "canceled") throw new AutomationError("OPERATION_CANCELED");
        if (result.status !== "completed") throw new AutomationError(result.errorCode ?? "PNG_EXPORT_FAILED");
        return { outputDirectoryPath: result.outputDirectoryPath, savedFiles: result.savedFiles, totalFiles: result.totalFiles, byteLength: result.byteLength, format: "png-sequence" };
    } finally { offProgress(); offResult(); context.signal.removeEventListener("abort", cancel); }
}

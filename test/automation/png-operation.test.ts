import { it, expect, vi } from "vitest";
import { runAutomationPngSequence } from "../../src/automation/png-operation";
import type { AutomationPngSequenceResult, PngSequenceExportProgress } from "../../src/types";

function harness() {
    let result: (value: AutomationPngSequenceResult) => void = () => undefined;
    let progress: (value: PngSequenceExportProgress) => void = () => undefined;
    const dispose = vi.fn();
    const api = { onPngSequenceExportResult: (cb: typeof result) => { result = cb; return dispose; },
        onPngSequenceExportProgress: (cb: typeof progress) => { progress = cb; return dispose; }, cancelPngSequenceExportJob: vi.fn(async () => true) };
    return { api, dispose, result: (value: AutomationPngSequenceResult) => result(value), progress: (value: PngSequenceExportProgress) => progress(value) };
}
const completed: AutomationPngSequenceResult = { jobId: "job", status: "completed", outputDirectoryPath: "local", savedFiles: 2, totalFiles: 2, byteLength: 123 };
it("observes completion before launch resolves and returns only output metadata", async () => {
    const h = harness();
    const report = vi.fn();
    const result = await runAutomationPngSequence(h.api, async () => { h.result(completed); return { jobId: "job" }; }, "local", { signal: new AbortController().signal, report });
    expect(result).toMatchObject({ savedFiles: 2, format: "png-sequence" });
    expect(h.dispose).toHaveBeenCalledTimes(2);
});
it("preserves partial-output metadata on cancellation during launch", async () => {
    const h = harness();
    const controller = new AbortController();
    const report = vi.fn();
    h.api.cancelPngSequenceExportJob.mockImplementation(async () => { h.result({ ...completed, status: "canceled", savedFiles: 1 }); return true; });
    await expect(runAutomationPngSequence(h.api, async () => { controller.abort(); return { jobId: "job" }; }, "local", { signal: controller.signal, report })).rejects.toThrow("OPERATION_CANCELED");
    expect(h.api.cancelPngSequenceExportJob).toHaveBeenCalledWith("job");
    expect(report.mock.calls.at(-1)[0]).toMatchObject({ phase: "canceled", savedFiles: 1, partialOutput: true });
    expect(h.dispose).toHaveBeenCalledTimes(2);
});
it("propagates an explicit launch failure and disposes listeners", async () => {
    const h = harness();
    await expect(runAutomationPngSequence(h.api, async () => ({ jobId: "", errorCode: "OUTPUT_EXISTS" }), "local", { signal: new AbortController().signal, report: vi.fn() })).rejects.toThrow("OUTPUT_EXISTS");
    expect(h.dispose).toHaveBeenCalledTimes(2);
});

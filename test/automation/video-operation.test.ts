import { it, expect, vi } from "vitest";
import { runAutomationVideo } from "../../src/automation/video-operation";
import type { WebmExportResult, WebmExportProgress } from "../../src/types";

it("preserves classified encoder failure details from early terminal results", async () => {
    let callback: (value: WebmExportResult) => void = () => undefined;
    const failure = { code: "VIDEO_ENCODER_UNAVAILABLE" as const, details: { stage: "initializing" as const, secureContext: true, videoEncoderAvailable: false } };
    const api = { onWebmExportResult: (cb: typeof callback) => { callback = cb; return () => undefined; }, onWebmExportProgress: () => () => undefined, cancelWebmExportJob: async () => true };
    await expect(runAutomationVideo(api, async () => {
        callback({ jobId: "failure", status: "failed", errorCode: failure.code, failure });
        return { jobId: "failure" };
    }, { signal: new AbortController().signal, report: () => undefined })).rejects.toMatchObject(failure);
});

it("observes early completion and never forwards the raw progress message", async () => {
    let result: (value: WebmExportResult) => void = () => undefined;
    let progress: (value: WebmExportProgress) => void = () => undefined;
    const disposed = vi.fn();
    const api = { onWebmExportResult: (callback: typeof result) => { result = callback; return disposed; },
        onWebmExportProgress: (callback: typeof progress) => { progress = callback; return disposed; }, cancelWebmExportJob: vi.fn(async () => true) };
    const report = vi.fn();
    expect(await runAutomationVideo(api, async () => {
        progress({ jobId: "one", phase: "failed", encoded: 0, total: 0, frame: 0, timestampMs: 1, message: "PRIVATE" });
        result({ jobId: "one", status: "completed", filePath: "local.webm", byteLength: 123 });
        return { jobId: "one" };
    }, { signal: new AbortController().signal, report })).toEqual({ filePath: "local.webm", byteLength: 123, format: "webm" });
    expect(JSON.stringify(report.mock.calls)).not.toContain("PRIVATE");
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ phase: "failed", totalFrames: 0, capturedFrames: null }));
    expect(disposed).toHaveBeenCalledTimes(2);
});

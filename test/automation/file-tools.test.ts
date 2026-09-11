import { expect, it, vi } from "vitest";
import { runFileToolBatch, validateFileToolBatch } from "../../src/automation/file-tools";
import { uiOperationSchema, type AutomationFileToolItem } from "../../src/automation/ui-operation-schema";
import { AutomationError } from "../../src/automation/diagnostics";
const item: AutomationFileToolItem = { kind: "optimizeMotion", sourcePath: "C:/in.vmd", filePath: "C:/out.bvmd", overwrite: false };
it("validates the whole batch and forbids output collisions and input overwrites", () => {
    expect(() => validateFileToolBatch([item])).not.toThrow();
    expect(() => validateFileToolBatch([item, { ...item, filePath: "C:/a/../OUT.bvmd" }])).toThrow("INVALID_OUTPUT");
    expect(() => validateFileToolBatch([{ kind: "retargetMotion", sourceModelPath: "C:/a.pmx", targetModelPath: "C:/b.pmx", sourceMotionPath: "C:/in.vmd",
        filePath: "C:/IN.vmd", overwrite: true, options: { retargetRotations: true, correctRootPosition: true, correctFootIkPosition: true } }])).toThrow("INVALID_OUTPUT");
    expect(uiOperationSchema.safeParse({ kind: "fileTools", items: [{ ...item, bytes: [1] }], continueOnError: false }).success).toBe(false);
});
it("returns individual outcomes when continuation is requested without leaking raw exceptions", async () => {
    const result = await runFileToolBatch([item, { ...item, filePath: "C:/second.bvmd" }], true,
        vi.fn().mockRejectedValueOnce(new Error("PRIVATE")).mockResolvedValueOnce({ status: "saved", byteLength: 10 }), async () => undefined,
        { signal: new AbortController().signal, report: vi.fn() });
    expect(result).toMatchObject({ allSucceeded: false, failedItems: 1 });
    expect(result.results.map(r => r.status)).toEqual(["failed", "completed"]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("stops after an error and reports previous successful output", async () => {
    const report = vi.fn();
    const run = vi.fn().mockResolvedValueOnce({ byteLength: 3 }).mockRejectedValue(new AutomationError("OUTPUT_EXISTS"));
    await expect(runFileToolBatch([item, { ...item, filePath: "C:/second.bvmd" }, { ...item, filePath: "C:/third.bvmd" }], false,
        run, async () => undefined, { signal: new AbortController().signal, report })).rejects.toThrow("OUTPUT_EXISTS");
    expect(run).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.at(-1)[0].results).toHaveLength(2);
});
it("cancels between items and retains completed results", async () => {
    const controller = new AbortController(), report = vi.fn();
    const run = vi.fn(async () => { controller.abort(); return { byteLength: 1 }; });
    await expect(runFileToolBatch([item, { ...item, filePath: "C:/second.bvmd" }], true, run, async () => undefined,
        { signal: controller.signal, report })).rejects.toThrow("OPERATION_CANCELED");
    expect(run).toHaveBeenCalledTimes(1);
    expect(report.mock.calls.at(-1)[0]).toMatchObject({ phase: "canceled", completedItems: 1 });
});

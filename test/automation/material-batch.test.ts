import { it, expect, vi } from "vitest";
import { materialBatchSchema, runMaterialBatch, type MaterialBatch, type MaterialBatchHost } from "../../src/automation/material-batch";
const subject = { kind: "model" as const, modelInstanceId: "model" };
const entry: MaterialBatch[number] = { subject, expectedPath: "local.pmx", materialKeys: ["a"], action: { kind: "reset" } };
function host(): MaterialBatchHost {
    return { catalog: () => ({ sourcePath: "local.pmx", defaultPresetId: "default", available: true, presets: [{ id: "default" }],
        materials: [{ key: "a", visible: true, presetId: "other" }, { key: "b", visible: true, presetId: "default" }] }), preset: vi.fn(), visibility: vi.fn() };
}
it("validates every target before modifying anything", () => {
    const h = host();
    expect(() => runMaterialBatch(h, [entry, { ...entry, expectedPath: "changed.pmx" }], false)).toThrow("ASSET_CHANGED");
    expect(h.preset).not.toHaveBeenCalled();
    expect(() => runMaterialBatch(h, [{ ...entry, action: { kind: "preset", presetId: "hidden" } }], false)).toThrow("SETTING_UNAVAILABLE");
});
it("dry-run resolves default and all materials without mutation", () => {
    const h = host(), result = runMaterialBatch(h, [{ ...entry, materialKeys: null }], true);
    expect(result).toMatchObject({ status: "validated", plan: [{ keys: ["a", "b"], presetId: "default" }] });
    expect(h.preset).not.toHaveBeenCalled();
});
it("applies reset and visibility in requested order, and marks partial failures", () => {
    const h = host();
    h.visibility = vi.fn(() => { throw new Error("private"); });
    const result = runMaterialBatch(h, [entry, { ...entry, action: { kind: "visibility", visible: false } }], false);
    expect(h.preset).toHaveBeenCalledWith(subject, "a", "default");
    expect(result).toMatchObject({ status: "partial_failure", allSucceeded: false, results: [{ status: "completed" }, { status: "failed" }] });
    expect(JSON.stringify(result)).not.toContain("private");
});
it("rejects duplicate keys and source material data in input", () => {
    expect(materialBatchSchema.safeParse([{ ...entry, materialKeys: ["a", "a"] }]).success).toBe(false);
    expect(materialBatchSchema.safeParse([{ ...entry, vertices: [] }]).success).toBe(false);
});

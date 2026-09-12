import { describe, expect, it } from "vitest";
import { checkMetadataBudget, checkProjectEffectCount, checkTextBudget, WGSL_SOURCE_BYTES } from "./limits";
import { parseEffectFile } from "./single-file";
import { parseEffectManifest, validateEffectSources } from "./contract";

const metadata = { apiVersion: 1, kind: "mmd-material", name: "Test", hooks: { finalColor: "shade" } };
describe("WGSL resource budgets", () => {
    it("bounds the number of project assets before sidecar IO", () => {
        expect(() => checkProjectEffectCount(Array(128).fill(null))).not.toThrow();
        expect(() => checkProjectEffectCount(Array(129).fill(null))).toThrow(/128/);
    });
    it("counts UTF-8 bytes, including the boundary", () => {
        expect(checkTextBudget("あ", 3, "test")).toBe(3);
        expect(() => checkTextBudget("あ", 2, "test")).toThrow(/exceeds/);
        expect(() => parseEffectFile(" ".repeat(WGSL_SOURCE_BYTES + 1))).toThrow(/exceeds/);
    });
    it("rejects deep/cyclic/wide metadata before recursive schema and hash work", () => {
        let deep: unknown = {}; for (let i = 0; i < 18; i++) deep = { nested: deep };
        expect(() => checkMetadataBudget(deep)).toThrow(/nesting/);
        const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
        expect(() => checkMetadataBudget(cyclic)).toThrow(/nesting/);
        expect(() => checkMetadataBudget(Array.from({ length: 4097 }, () => 1))).toThrow(/entries/);
        expect(() => parseEffectFile(`/* @modoki\n${JSON.stringify({ ...metadata, description: "x".repeat(65536) })}\n*/`)).toThrow(/metadata.*exceeds/);
    });
    it("bounds the combined uniform layout and normalized legacy sources", () => {
        const parameters = Object.fromEntries(Array.from({ length: 129 }, (_, i) => ["P" + i, { type: "f32", default: 0 }]));
        expect(() => parseEffectManifest({ ...metadata, sources: ["a"], parameters })).toThrow(/128/);
        const manifest = parseEffectManifest({ ...metadata, sources: ["a", "b"] });
        expect(() => validateEffectSources(manifest, [{ path: "a", text: " ".repeat(600000) }, { path: "b", text: " ".repeat(600000) }])).toThrow(/combined/);
    });
});

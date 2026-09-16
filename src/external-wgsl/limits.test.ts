import { describe, expect, it } from "vitest";
import { checkMetadataBudget, checkProjectEffectCount, checkTextBudget, WGSL_SOURCE_BYTES } from "./limits";
import { parseEffectFile } from "./single-file";


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
        expect(() => checkMetadataBudget({ name: "x".repeat(65536) })).toThrow(/metadata.*exceeds/);
    });
    it("requires a material hook even for a version-only source", () => {
        expect(() => parseEffectFile("const MODOKI_API_VERSION: u32 = 2u;")).toThrow(/hook/);
    });
});

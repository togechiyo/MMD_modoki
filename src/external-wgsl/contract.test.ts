import { describe, expect, it } from "vitest";
import { parseEffectManifest, validateEffectSources, maskWgslComments, canonicalEffectContent, defaultEffectAssignment, setEffectAssignment } from "./contract";
import { parseEffectFile } from "./single-file";

const source = "const MODOKI_API_VERSION: u32 = 2u;\nstruct EffectInputs { TIME: f32, WORLD: mat4x4f, }\nvar<uniform> effectInputs: EffectInputs;\nfn effectFinalColor(s: ModokiFinalColor) -> vec3f { return s.color; }";
describe("external material snapshot contract", () => {
    it("ignores nested comments while preserving lines", () => {
        expect(maskWgslComments("/* a\nb */x")).toBe("    \n    x");
        expect(() => maskWgslComments("/* nested /* */")).toThrow();
    });
    it.each(["../main.wgsl", "/main.wgsl", "C:/main.wgsl", "https://example/main.wgsl", "a\\b.wgsl"])("rejects package escape %s", path => {
        expect(() => parseEffectFile(source, path)).toThrow();
    });
    it("rejects v1 snapshots and parameter-bearing assignments", () => {
        const { manifest } = parseEffectFile(source);
        expect(() => parseEffectManifest({ ...manifest, apiVersion: 1 })).toThrow();
        expect(() => setEffectAssignment({}, { effectRevision: "a".repeat(64), enabled: true, parameters: {} } as never)).toThrow();
        expect(defaultEffectAssignment({ ...parseEffectFile(source), revision: "a".repeat(64) })).toEqual({ effectRevision: "a".repeat(64), enabled: true });
    });
    it("checks snapshot descriptor against source including uniform order and hooks", () => {
        const { manifest, sources } = parseEffectFile(source);
        expect(() => validateEffectSources(manifest, sources)).not.toThrow();
        expect(() => validateEffectSources({ ...manifest, inputOrder: ["WORLD", "TIME"] }, sources)).toThrow(/does not match/);
        expect(() => validateEffectSources({ ...manifest, name: "fake" }, sources)).toThrow(/does not match/);
        expect(() => validateEffectSources(manifest, [{ ...sources[0], text: source.replace("TIME: f32", "TIME: vec3f") }])).toThrow(/requires f32/);
        expect(() => parseEffectManifest({ ...manifest, inputOrder: ["TIME", "TIME"] })).toThrow(/order/);
    });
    it("canonicalizes object keys but preserves semantic array/source order and Unicode", () => {
        const a = parseEffectFile(source, "色.wgsl");
        const b = { sources: a.sources, manifest: { ...a.manifest, inputs: { WORLD: a.manifest.inputs.WORLD, TIME: a.manifest.inputs.TIME } } };
        expect(canonicalEffectContent(a)).toBe(canonicalEffectContent(b));
        expect(canonicalEffectContent(a)).toContain("色");
        expect(canonicalEffectContent(a)).not.toBe(canonicalEffectContent({ ...a, manifest: { ...a.manifest, inputOrder: ["WORLD", "TIME"] } }));
    });
});

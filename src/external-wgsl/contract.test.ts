import { describe, expect, it } from "vitest";
import { parseEffectManifest, validateEffectSources, maskWgslComments, canonicalEffectContent, validateParameter } from "./contract";

const manifest = () => ({ apiVersion: 1, kind: "mmd-material", name: "色", sources: ["main.wgsl"], hooks: { finalColor: "shade" }, inputs: { Time: { type: "f32", semantic: "TIME", annotations: { SyncInEditMode: true } } } });
describe("external material contract", () => {
    it("accepts function return and ignores nested comments when checking declarations", () => {
        const m = parseEffectManifest(manifest());
        expect(() => validateEffectSources(m, [{ path: "main.wgsl", text: "/* @fragment /* discard */ */\nfn shade(s: ModokiFinalColor) -> vec3f { return s.color; }" }])).not.toThrow();
        expect(maskWgslComments("/* a\nb */x")).toBe("    \n    x");
    });
    it.each(["../main.wgsl", "/main.wgsl", "C:/main.wgsl", "https://example/main.wgsl", "a\\b.wgsl"])("rejects package escape %s", path => {
        expect(() => parseEffectManifest({ ...manifest(), sources: [path] })).toThrow();
    });
    it("rejects missing time policy, unknown inputs and unsupported hooks", () => {
        expect(() => parseEffectManifest({ ...manifest(), inputs: { Time: { type: "f32", semantic: "TIME" } } })).toThrow();
        expect(() => parseEffectManifest({ ...manifest(), inputs: { X: { type: "f32", semantic: "TYPO" } } })).toThrow();
        expect(() => parseEffectManifest({ ...manifest(), hooks: { light: "shade" } })).toThrow();
    });
    it("rejects resource declarations and incomplete comments", () => {
        expect(() => validateEffectSources(parseEffectManifest(manifest()), [{ path: "main.wgsl", text: "var<uniform> x: f32;" }])).toThrow(/main.wgsl:1/);
        expect(() => maskWgslComments("/* nested /* */")).toThrow();
    });
    it("checks vector shape, ranges and finite GPU values", () => {
        const p = { type: "vec3f", default: [1, 1, 1], ui: { min: 0, max: 1 } } as const;
        expect(() => validateParameter({ ...p, default: [...p.default] }, [1, 1])).toThrow();
        expect(() => validateParameter({ ...p, default: [...p.default] }, [1, 2, 1])).toThrow();
        expect(() => validateParameter({ type: "f32", default: 0 }, 1e100)).toThrow();
    });
    it("canonicalizes field order without changing source order or Unicode", () => {
        const m = parseEffectManifest(manifest());
        const a = { manifest: m, sources: [{ path: "main.wgsl", text: "日本語" }] };
        const b = { sources: a.sources, manifest: { ...m, name: "色" } };
        expect(canonicalEffectContent(a)).toBe(canonicalEffectContent(b));
        expect(canonicalEffectContent(a)).toContain("日本語");
    });
});

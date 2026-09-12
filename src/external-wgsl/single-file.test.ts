import { describe, expect, it } from "vitest";
import { parseEffectFile } from "./single-file";

const metadata = { apiVersion: 1, kind: "mmd-material", name: "Sample", hooks: { finalColor: "shade" } };
const body = "fn shade(s: ModokiFinalColor) -> vec3f { return s.color; }";
const file = (value: unknown = metadata) => `/* @modoki\n${JSON.stringify(value)}\n*/\n${body}`;

describe("single-file WGSL", () => {
    it("extracts metadata and preserves source line numbers with BOM and CRLF", () => {
        const source = "\uFEFF" + file().replace(/\n/g, "\r\n");
        const parsed = parseEffectFile(source, "sample.wgsl");
        expect(parsed.manifest).toEqual({ ...metadata, sources: ["sample.wgsl"] });
        expect(parsed.sources[0].text.split("\n")[3]).toBe(body);
        expect(parsed.sources[0].text).not.toContain("@modoki");
    });
    it.each([body, JSON.stringify(metadata), `// header\n${file()}`])("requires an initial metadata block", source => {
        expect(() => parseEffectFile(source, "sample.wgsl")).toThrow(/sample.wgsl.*@modoki/);
    });
    it("reports malformed and unterminated metadata", () => {
        expect(() => parseEffectFile("/* @modoki\n{bad}\n*/\n" + body)).toThrow(/metadata/);
        expect(() => parseEffectFile("/* @modoki\n{}\n")).toThrow(/Unterminated/);
    });
    it("rejects external source lists and duplicate metadata blocks", () => {
        expect(() => parseEffectFile(file({ ...metadata, sources: ["other.wgsl"] }))).toThrow(/sources/);
        expect(() => parseEffectFile(file() + "\n" + file())).toThrow(/Duplicate/);
    });
    it("keeps semantic and hook validation", () => {
        expect(() => parseEffectFile(file({ ...metadata, hooks: { finalColor: "missing" } }))).toThrow(/Missing hook/);
        expect(() => parseEffectFile(file({ ...metadata, inputs: { T: { type: "f32", semantic: "UNKNOWN" } } }))).toThrow(/Unsupported semantic/);
    });
    it("reports forbidden WGSL declarations at their original file line", () => {
        expect(() => parseEffectFile(file() + "\nvar<uniform> forbidden: f32;", "sample.wgsl")).toThrow("sample.wgsl:5:");
    });
});

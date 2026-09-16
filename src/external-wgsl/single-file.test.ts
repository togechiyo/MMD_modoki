import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEffectFile } from "./single-file";

const version = "const MODOKI_API_VERSION: u32 = 2u;";
const hook = "fn effectFinalColor(s: ModokiFinalColor) -> vec3f { return s.color; }";
const file = (declarations = "") => version + "\n" + declarations + "\n" + hook;

describe("WGSL v2 author declarations", () => {
    it("keeps BOM/CRLF source locations and derives the label from the filename", () => {
        const source = "\uFEFF" + file("/* nested /* var<storage> */ comment */").replace(/\n/g, "\r\n");
        const parsed = parseEffectFile(source, "色.WGSL");
        expect(parsed.manifest.name).toBe("色");
        expect(parsed.sources[0].text).toBe(source.slice(1));
        expect(parsed.manifest.hooks).toEqual({ finalColor: "effectFinalColor" });
    });
    it("accepts ordinary constant expressions without interpreting or clamping them", () => {
        expect(() => parseEffectFile(file("const GAIN = 2.0 * 8.0; const ENABLED: bool = true;"))).not.toThrow();
    });
    it("recognizes versions, UV requirement, generic types and both hooks", () => {
        const source = file(`const MODOKI_EFFECT_VERSION: vec3<u32> = vec3<u32>(1u, 2u, 3u);
const MODOKI_REQUIRE_UV0: bool = true;
struct EffectInputs { TIME: f32, CAMERA_POSITION: vec3<f32>, WORLD: mat4x4<f32>, }
var<uniform> effectInputs: EffectInputs;
fn effectSurface(s: ModokiSurface,) -> ModokiSurfaceOutput { return ModokiSurfaceOutput(s.baseColor, s.diffuseColor, s.normalWS); }`);
        const m = parseEffectFile(source).manifest;
        expect(m.effectVersion).toEqual([1, 2, 3]); expect(m.requires).toEqual(["uv0"]);
        expect(m.inputOrder).toEqual(["TIME", "CAMERA_POSITION", "WORLD"]);
        expect(m.inputs.CAMERA_POSITION.type).toBe("vec3f");
        expect(m.hooks.surface).toBe("effectSurface");
    });
    it.each([
        ["const MODOKI_API_VERSION: u32 = 1u;", /old WGSL/],
        ["const MODOKI_API_VERSION: u32 = 1u + 1u;", /must be u32/],
        ["override MODOKI_API_VERSION: u32 = 2u;", /module const/],
        ["/* @modoki { \"apiVersion\": 1 } */", /Missing const/],
        ["", /Missing const/],
    ])("rejects unsupported contract declaration %s", (source, error) => {
        expect(() => parseEffectFile(source + "\n" + hook)).toThrow(error);
    });
    it.each([
        ["const MODOKI_API_VERSION: u32 = 2u;", /Duplicate/],
        ["const MODOKI_REQUIRE_UV0: bool = 1;", /bool literal/],
        ["const MODOKI_EFFECT_VERSION: vec3u = vec3u(1u);", /requires vec3u/],
        ["const MODOKI_EFFECT_VERSION: vec3u = vec3u(4294967296u, 0u, 0u);", /requires vec3u/],
        ["struct EffectInputs { TIME: f32, }", /together/],
        ["var<uniform> effectInputs: EffectInputs;", /together/],
        ["struct EffectInputs {} var<uniform> effectInputs: EffectInputs;", /empty/],
        ["struct EffectInputs { Typo: f32, } var<uniform> effectInputs: EffectInputs;", /Unknown/],
        ["struct EffectInputs { TIME: vec3f, } var<uniform> effectInputs: EffectInputs;", /requires f32/],
        ["struct EffectInputs { TIME: f32, TIME: f32, } var<uniform> effectInputs: EffectInputs;", /Duplicate input/],
        ["struct EffectInputs { @align(16) TIME: f32, } var<uniform> effectInputs: EffectInputs;", /Unknown/],
        ["alias Seconds = f32; struct EffectInputs { TIME: Seconds, } var<uniform> effectInputs: EffectInputs;", /requires f32/],
        ["fn helper() { const MODOKI_REQUIRE_UV0: bool = true; }", /module scope/],
        ["var<uniform> other: f32;", /Only var/],
        ["var<storage, read> other: f32;", /resource/],
        ["@group(0) var<uniform> effectInputs: EffectInputs;", /Unsupported/],
        ["@fragment fn entry() {}", /Unsupported/],
        ["fn helper() { discard; }", /Unsupported/],
        ["const modokiPrivate = 1.0;", /Reserved identifier/],
        ["const MODOKI_TYPO = 1.0;", /Unknown reserved/],
        ["fn effectSurface(s: ModokiSurface) -> vec3f { return s.baseColor; }", /Invalid signature/],
    ])("reports rejected declarations with file and position: %s", (source, error) => {
        expect(() => parseEffectFile(file(source), "sample.wgsl")).toThrow(error);
        expect(() => parseEffectFile(file(source), "sample.wgsl")).toThrow(/sample.wgsl:\d+:\d+:/);
    });
    it("does not mistake function calls or commented hooks for declarations", () => {
        expect(() => parseEffectFile(version + "\n// " + hook + "\nfn helper() { effectFinalColor(); }")).toThrow(/At least one/);
    });
    it("rejects unclosed comments and bodies", () => {
        expect(() => parseEffectFile(file("/*"))).toThrow(/Unterminated/);
        expect(() => parseEffectFile(file() + "\nfn helper() {")).toThrow(/Unclosed/);
    });
    it("loads every shipped sample without metadata or runtime parameter copies", () => {
        const directory = new URL("../../wgsl/", import.meta.url);
        for (const name of readdirSync(directory).filter(name => name.endsWith(".wgsl"))) {
            const source = readFileSync(new URL(name, directory), "utf8");
            const parsed = parseEffectFile(source, name);
            expect(parsed.manifest.apiVersion).toBe(2);
            expect(source).not.toMatch(/@modoki|modokiInputs/);
            expect(parsed.manifest).not.toHaveProperty("parameters");
        }
    });
});

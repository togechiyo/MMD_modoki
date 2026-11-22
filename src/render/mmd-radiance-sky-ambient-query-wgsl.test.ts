import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { MaterialPluginManager } from "@babylonjs/core/Materials/materialPluginManager";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Process } from "@babylonjs/core/Engines/Processors/shaderProcessor";
import { defaultPixelShaderWGSL } from "@babylonjs/core/ShadersWGSL/default.fragment";
import { lightFragmentWGSL } from "@babylonjs/core/ShadersWGSL/ShadersInclude/lightFragment";
import { MmdPluginMaterial } from "babylon-mmd/esm/Loader/ShadersWGSL/mmdStandard";
import { MMD_RADIANCE_SKY_QUERY_WGSL, MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATTERN,
    MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATCH } from "./mmd-radiance-sky-query-wgsl";
import { MMD_RADIANCE_SKY_AMBIENT_CUSTOM_CODE, MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL,
    MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL,
    MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL } from "./mmd-radiance-sky-ambient-query-wgsl";
import { MMD_RADIANCE_GI_QUERY_WGSL } from "./mmd-radiance-gi-query-wgsl";

type CustomCode = Readonly<Record<string, string>>;
type Injector = { _injectCustomCode(event: { indexParameters: Record<string, number> }): (stage: string, code: string) => string };

// Use installed Babylon's injector/preprocessor, including its $n handling.
function inject(source: string, maps: CustomCode[]): string {
    const manager = Object.assign(Object.create(MaterialPluginManager.prototype), {
        _material: { shaderLanguage: ShaderLanguage.WGSL },
        _activePlugins: maps.map(map => ({ getCustomCode: () => map, resolveIncludes: false })),
        _codeInjectionPoints: { fragment: Object.fromEntries(maps.flatMap(map => Object.keys(map).map(key => [key, true]))) },
    }) as Injector;
    return manager._injectCustomCode({ indexParameters: {} })("fragment", source);
}

async function preprocessed(source: string, defines: string[]): Promise<string> {
    return new Promise(resolve => Process(source, {
        defines: defines.map(define => "#define " + define), indexParameters: {}, isFragment: true,
        shouldUseHighPrecisionShader: true, supportsUniformBuffers: true, shadersRepository: "", includesShadersStore: {},
        processor: { shaderLanguage: ShaderLanguage.WGSL, noPrecision: true }, version: "300", platformName: "WEBGPU", processingContext: null,
        isNDCHalfZRange: true, useReverseDepthBuffer: false,
    }, resolve));
}

const original = defaultPixelShaderWGSL.shader;
const start = original.indexOf("#ifdef EMISSIVEASILLUMINATION");
const diffuseSection = "\n" + original.slice(start, original.indexOf("#ifdef SPECULARTERM", start));
const mmd = MmdPluginMaterial.prototype.getCustomCode("fragment") ?? {};
const oldSky = { [MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATTERN]: MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATCH };
const ambient = MMD_RADIANCE_SKY_AMBIENT_CUSTOM_CODE;
const stageStandard = readFileSync(new URL("../scene/shaders/builtin-toon/stage_standard.wgsl", import.meta.url), "utf8");

// The diffuse math is component-wise. Execute one channel of the actual shader,
// including its helper bodies, instead of restating the composition in JS.
// This is not a substitute for full WGSL compilation/material GPU checks.
function scalarStatements(source: string): string {
    return source.replace(/:\s*(?:vec[234]f|f32|u32|bool)\b/g, "")
        .replace(/->\s*(?:vec[234]f|f32|u32|bool)\b/g, "")
        .replace(/\b(\d+)u\b/g, "$1")
        .replace(/\bfn\b/g, "function").replace(/\bvar\b/g, "let");
}

// Evaluate positions along one cube axis. Its absolute coordinate is also the
// max-absolute radius because the other two coordinates remain at the origin.
function spatialFunctions(source: string, names: string[]): string {
    return names.map(name => shaderFunction(source, name)).join("\n")
        .replace(/relative\.[xyz]/g, "relative");
}

const spatialMath = {
    vec3f: (value: number) => value, u32: Math.trunc, length: Math.abs, abs: Math.abs, max: Math.max,
    clamp: (value: number, low: number, high: number) => Math.min(high, Math.max(low, value)),
    mix: (a: number, b: number, amount: number) => a * (1 - amount) + b * amount,
    smoothstep: (low: number, high: number, value: number) => {
        const t = Math.min(1, Math.max(0, (value - low) / (high - low))); return t * t * (3 - 2 * t);
    },
};

function spatialUniforms(prefix: string, count: number) {
    return {
        [prefix + "Volume"]: { xyz: -64, w: 128 },
        [prefix + "Volume1"]: { xyz: -256, w: 512 },
        [prefix + "Volume2"]: { xyz: -1024, w: 2048 },
        [prefix + "Volume3"]: { xyz: -16384, w: 32768 },
        [prefix + "Spatial"]: { x: count },
    };
}

function spatialQuery(kind: "gi" | "sky", position: number, values: number[], count = 4) {
    const source = kind === "gi" ? MMD_RADIANCE_GI_QUERY_WGSL : MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL;
    const prefix = kind === "gi" ? "rcGi" : "rcSkyAmbient";
    const query = prefix + (kind === "gi" ? "Irradiance" : "VisibilityValidated");
    const sample = prefix + (kind === "gi" ? "IrradianceInVolume" : "VisibilityInVolume");
    const names = [prefix + "VolumeAt", prefix + "VolumeRadius", query];
    const reads: number[] = [];
    const value = runInNewContext(spatialFunctions(source, names) + `\n${query}(position, 1);`, {
        ...spatialMath, uniforms: spatialUniforms(prefix, count), position,
        [sample]: (_position: number, _normal: number, _volume: unknown, level: number) => {
            reads.push(level); return values[level];
        },
    }) as number;
    return { value, reads };
}

function shaderFunction(source: string, name: string): string {
    const offset = source.indexOf("fn " + name + "(");
    if (offset < 0) throw new Error("Missing shader helper: " + name);
    let depth = 0;
    for (let index = source.indexOf("{", offset); index < source.length; index++) {
        if (source[index] === "{") depth++;
        if (source[index] === "}" && --depth === 0) return scalarStatements(source.slice(offset, index + 1));
    }
    throw new Error("Unclosed shader helper: " + name);
}

type Inputs = {
    diffuseBase: number; diffuseColor: number; emissiveColor: number; albedo: number;
    materialAmbient: number; direct: number; factor: number; residual: number; oldFactor: number;
};
const defaults: Inputs = {
    diffuseBase: 1.1, diffuseColor: 0.8, emissiveColor: 0.2, albedo: 0.6,
    materialAmbient: 0.65, direct: 0.5, factor: 0.2, residual: 0.4, oldFactor: 0.5,
};

function diffuseChannel(code: string, opacity: number, input: Partial<Inputs> = {}) {
    const values = { ...defaults, ...input };
    const helpers = shaderFunction(MMD_RADIANCE_SKY_QUERY_WGSL, "rcSkyApplyDiffuse") + "\n"
        + shaderFunction(MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL, "rcSkyAmbientMultiplyFill");
    return runInNewContext(helpers + "\n" + scalarStatements(code) + "\n({ value: finalDiffuse,"
        + " diffuseBase, diffuseColor, emissiveColor, albedo: baseColor.rgb });", {
        uniforms: { rcSkyAmbientControl: { x: 0.95, y: 0.035, z: 0, w: opacity }, vAmbientColor: values.materialAmbient },
        diffuseBase: values.diffuseBase, diffuseColor: values.diffuseColor,
        emissiveColor: values.emissiveColor, baseColor: { rgb: values.albedo },
        rcSkyAmbientDirect: values.direct, rcSkyAmbientFactor: values.factor,
        rcSkyResidual: values.residual, rcSkyFactor: values.oldFactor,
        vec3f: (value: number) => value,
        clamp: (value: number, low: number, high: number) => Math.min(high, Math.max(low, value)),
        max: Math.max, min: Math.min, mix: (a: number, b: number, amount: number) => a * (1 - amount) + b * amount,
        toLinearSpaceVec3: (value: number) => value ** 2.2,
        toGammaSpaceVec3: (value: number) => value ** (1 / 2.2),
    }) as { value: number; diffuseBase: number; diffuseColor: number; emissiveColor: number; albedo: number };
}

async function composed(defines: string[], oldFirst = true): Promise<string> {
    return preprocessed(inject(diffuseSection, [mmd, ...(oldFirst ? [oldSky, ambient] : [ambient, oldSky])]), defines);
}

// Exercise the same expanded Babylon light section the app compiles. Custom
// lighting may replace the native statement; the Sky hook stays outside it.
function lightSection(index: number, shading?: string) {
    const begin = lightFragmentWGSL.shader.indexOf("#ifdef SHADOWCSMDEBUG{X}\ndiffuseBase+=");
    const end = lightFragmentWGSL.shader.indexOf("#ifdef SPECULARTERM", begin);
    if (begin < 0 || end < 0) throw new Error("Babylon diffuse lighting section was not found");
    const section = lightFragmentWGSL.shader.slice(begin, end).replaceAll("{X}", String(index));
    return shading === undefined ? section : section.replace("diffuseBase+=info.diffuse*shadow;", shading);
}

describe("Sky Ambient multiplies the auxiliary part of common diffuse lighting", () => {
    it("selects the finest containing level and blends only the adjacent field at all three seams", () => {
        for (const kind of ["gi", "sky"] as const) {
            const values = [0.2, 0.6, 0.8, 1];
            expect(spatialQuery(kind, 0, values)).toEqual({ value: 0.2, reads: [0] });
            expect(spatialQuery(kind, -48, values)).toEqual({ value: 0.2, reads: [0] });
            expect(spatialQuery(kind, 56, values)).toEqual({ value: 0.4, reads: [0, 1] });
            expect(spatialQuery(kind, 64, values)).toEqual({ value: 0.6, reads: [0, 1] });
            expect(spatialQuery(kind, 65, values)).toEqual({ value: 0.6, reads: [1] });
            expect(spatialQuery(kind, 224, values)).toEqual({ value: 0.7, reads: [1, 2] });
            expect(spatialQuery(kind, 256, values)).toEqual({ value: 0.8, reads: [1, 2] });
            expect(spatialQuery(kind, 257, values)).toEqual({ value: 0.8, reads: [2] });
            expect(spatialQuery(kind, 896, values)).toEqual({ value: 0.9, reads: [2, 3] });
            expect(spatialQuery(kind, 1024, values)).toEqual({ value: 1, reads: [2, 3] });
            expect(spatialQuery(kind, 1025, values)).toEqual({ value: 1, reads: [3] });
            for (const edge of [64, 256, 1024]) {
                expect(spatialQuery(kind, edge - 0.00001, values).value)
                    .toBeCloseTo(spatialQuery(kind, edge + 0.00001, values).value, 10);
            }
            // Manual mode has no transition, even at the former blend edge.
            expect(spatialQuery(kind, 64, values, 1)).toEqual({ value: 0.2, reads: [0] });
        }
    });

    it("fades outer GI to neutral and keeps valid sky visibility when its neighbor is unknown", () => {
        expect(spatialQuery("gi", 12288, [2, 4, 8, 16])).toEqual({ value: 16, reads: [3] });
        expect(spatialQuery("gi", 14336, [2, 4, 8, 16])).toEqual({ value: 8, reads: [3] });
        expect(spatialQuery("gi", 16384, [2, 4, 8, 16])).toEqual({ value: 0, reads: [3] });
        expect(spatialQuery("gi", 16385, [2, 4, 8, 16])).toEqual({ value: 0, reads: [] });
        expect(spatialQuery("sky", 16385, [0.2, 0.6, 0.8, 1])).toEqual({ value: -1, reads: [] });
        expect(spatialQuery("sky", 56, [-1, 0.6, 0.8, 1])).toEqual({ value: 0.6, reads: [0, 1] });
        expect(spatialQuery("sky", 56, [0.2, -1, 0.8, 1])).toEqual({ value: 0.2, reads: [0, 1] });
    });

    for (const oldFirst of [true, false]) for (const foldedAmbient of [true, false]) {
        for (const emission of ["normal", "linked", "illumination"] as const) {
            it("preserves diffuse branches and opacity: oldFirst=" + oldFirst + ", folded=" + foldedAmbient + ", emission=" + emission, async () => {
                const defines = ["RC_SKY_AMBIENT", "RC_SKY_OCCLUSION",
                    ...(foldedAmbient ? ["APPLY_AMBIENT_COLOR_TO_DIFFUSE"] : []),
                    ...(emission === "linked" ? ["LINKEMISSIVEWITHDIFFUSE"] : []),
                    ...(emission === "illumination" ? ["EMISSIVEASILLUMINATION"] : [])];
                const result = await composed(defines, oldFirst);
                expect(result.match(/var finalDiffuse:/g)).toHaveLength(2);
                const native = await preprocessed(inject(diffuseSection, [mmd, oldSky]), defines);
                const originalValue = diffuseChannel(native, 0).value;
                // 1.1 - max(0.6 * 0.8, 0.4 * 0.5) = 0.62 light.
                // Only separate ambient becomes 0.65 * 0.2; emission stays intact.
                const endpoints = foldedAmbient
                    ? { normal: 0.4176, linked: 0.3936, illumination: 0.2976 }
                    : { normal: 0.4956, linked: 0.4716, illumination: 0.3756 };
                const skyValue = endpoints[emission];
                expect(diffuseChannel(result, 0).value).toBe(originalValue);
                expect(diffuseChannel(result, 1).value).toBeCloseTo(skyValue, 12);
                expect(diffuseChannel(result, 0.5).value)
                    .toBeCloseTo(((originalValue ** 2.2 + skyValue ** 2.2) / 2) ** (1 / 2.2), 12);
                const unchanged = diffuseChannel(result, 1);
                expect(unchanged.diffuseBase).toBe(defaults.diffuseBase);
                expect(unchanged.diffuseColor).toBe(defaults.diffuseColor);
                expect(unchanged.emissiveColor).toBe(defaults.emissiveColor);
                expect(unchanged.albedo).toBe(defaults.albedo);
            });
        }
    }

    it("retains the direct-light contrast when the ambient-equivalent base is unchanged", async () => {
        const code = await composed(["RC_SKY_AMBIENT", "APPLY_AMBIENT_COLOR_TO_DIFFUSE"]);
        const input = { diffuseColor: 1, emissiveColor: 0, albedo: 1, factor: 0.25 };
        const shadowed = diffuseChannel(code, 1, { ...input, diffuseBase: 0.5, direct: 0.1 }).value;
        const lit = diffuseChannel(code, 1, { ...input, diffuseBase: 0.8, direct: 0.4 }).value;
        expect(shadowed).toBeCloseTo(0.2, 12);
        expect(lit).toBeCloseTo(0.5, 12);
        expect(lit - shadowed).toBeCloseTo(0.3, 12);
    });

    it("uses the stronger occlusion once instead of subtracting both from the same base", async () => {
        for (const oldFirst of [true, false]) {
            const code = await composed(["RC_SKY_AMBIENT", "RC_SKY_OCCLUSION", "APPLY_AMBIENT_COLOR_TO_DIFFUSE"], oldFirst);
            const input = { diffuseBase: 0.8, diffuseColor: 1, emissiveColor: 0, albedo: 1,
                direct: 0.4, factor: 0.5, residual: 0.3 };
            expect(diffuseChannel(code, 1, { ...input, oldFactor: 1 }).value).toBeCloseTo(0.6, 12);
            expect(diffuseChannel(code, 1, { ...input, oldFactor: 0.5 }).value).toBeCloseTo(0.6, 12);
            expect(diffuseChannel(code, 1, { ...input, oldFactor: 0 }).value).toBeCloseTo(0.5, 12);
        }
    });

    it("does not suppress emission when its light base is fully occluded", async () => {
        for (const linked of [false, true]) {
            const code = await composed(["RC_SKY_AMBIENT", "APPLY_AMBIENT_COLOR_TO_DIFFUSE", ...(linked ? ["LINKEMISSIVEWITHDIFFUSE"] : [])]);
            const input = { diffuseBase: 0.4, diffuseColor: 0.8, albedo: 0.6, direct: 0, factor: 0 };
            const low = diffuseChannel(code, 1, { ...input, emissiveColor: 0.1 }).value;
            const high = diffuseChannel(code, 1, { ...input, emissiveColor: 0.3 }).value;
            expect(high - low).toBeCloseTo(linked ? 0.096 : 0.12, 12);
        }
    });

    it("keeps the old result at neutral factor even with separate ambient and old Sky active", async () => {
        const defines = ["RC_SKY_AMBIENT", "RC_SKY_OCCLUSION"];
        const code = await composed(defines);
        const native = await preprocessed(inject(diffuseSection, [mmd, oldSky]), defines);
        for (const opacity of [0, 0.5, 1]) {
            expect(diffuseChannel(code, opacity, { factor: 1 }).value)
                .toBeCloseTo(diffuseChannel(native, 0, { factor: 1 }).value, 12);
        }
    });

    it("leaves the original expression when the Sky Ambient define is absent", async () => {
        const native = await preprocessed(inject(diffuseSection, [mmd]), ["APPLY_AMBIENT_COLOR_TO_DIFFUSE"]);
        const patched = await preprocessed(inject(diffuseSection, [mmd, ambient]), ["APPLY_AMBIENT_COLOR_TO_DIFFUSE"]);
        expect(patched.trim()).toBe(native.trim());
    });

    it("preserves the shadowed direct light once for both Toon and native diffuse", async () => {
        const customLighting = "diffuseBase += 0.4;";
        for (const toon of [false, true]) {
            const injected = inject(lightSection(2, customLighting), [ambient]);
            const code = await preprocessed(injected, ["RC_SKY_AMBIENT", ...(toon ? ["TOON_TEXTURE"] : [])]);
            expect(code).not.toContain("$");
            const direct = runInNewContext(scalarStatements(code) + "\nrcSkyAmbientDirect;", {
                info: { diffuse: toon ? 0.8 : 0.4, isToon: 1, ndl: 0.5 }, shadow: 0.5,
                diffuseBase: 0, rcSkyAmbientDirect: 0, rcSkyAmbientFactor: 0.5,
                ...spatialMath, min: Math.min,
            });
            expect(direct).toBeCloseTo(0.2, 12);
        }
    });

    it("uses MMD's unshaded no-Toon contribution as fill regardless of shadow-map visibility", async () => {
        const source = inject(inject(lightSection(0), [mmd]), [ambient]);
        const light = await preprocessed(source, ["RC_SKY_AMBIENT", "IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED"]);
        const multiply = shaderFunction(MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL, "rcSkyAmbientMultiplyFill");
        const evaluate = multiply + "\n" + scalarStatements(light)
            + "\nrcSkyAmbientMultiplyFill(diffuseBase, rcSkyAmbientDirect, rcSkyAmbientFactor, 0);";
        for (const shadow of [0.05, 0.5, 1]) {
            const shaded = runInNewContext(evaluate, {
                info: { diffuse: 0.8 }, shadow, diffuseBase: 0,
                rcSkyAmbientDirect: 0, rcSkyAmbientFactor: 0.5, ...spatialMath, min: Math.min,
            });
            expect(shaded).toBeCloseTo(0.4, 12);
        }
    });

    it("bounds each light by its own shaded contribution and treats every hemispheric light as fill", async () => {
        const source = [
            lightSection(0, "diffuseBase += 0.9;"),  // Hemispheric
            lightSection(1, "diffuseBase += 0.1;"),  // Dark band authored by the preset
            lightSection(2, "diffuseBase += 0.7;"),  // Direct reference is 0.4
        ].join("\n");
        const code = await preprocessed(inject(source, [ambient]), ["RC_SKY_AMBIENT", "HEMILIGHT0"]);
        const result = runInNewContext(scalarStatements(code) + "\n({ total: diffuseBase, direct: rcSkyAmbientDirect });", {
            info: { diffuse: 0.8 }, shadow: 0.5, rcSkyAmbientFactor: 0.5,
            diffuseBase: 0, rcSkyAmbientDirect: 0, ...spatialMath, min: Math.min,
        });
        expect(result.total).toBeCloseTo(1.7, 12);
        expect(result.direct).toBeCloseTo(0.5, 12);
    });

    it("wraps native MMD and Stage Standard at the same point outside preset code", async () => {
        for (const source of [inject(lightSection(0), [mmd]), lightSection(0, stageStandard)]) {
            const code = await preprocessed(inject(source, [ambient]), ["RC_SKY_AMBIENT", "TOON_TEXTURE", "TOON_TEXTURE_COLOR"]);
            expect(code.match(/rcSkyAmbientDirect \+=/g)).toHaveLength(1);
            expect(code.indexOf("let rcSkyAmbientBeforeLight")).toBeLessThan(code.indexOf("diffuseBase+="));
            expect(code.indexOf("diffuseBase+=")).toBeLessThan(code.indexOf("rcSkyAmbientDirect +="));
        }
    });

    it.each([
        { material: "standard", defines: [], flat: false },
        { material: "MMD with a Toon ramp", defines: ["IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED", "TOON_TEXTURE"], flat: false },
        { material: "flat MMD", defines: ["IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED"], flat: true },
    ])("attenuates open, occluded and downward faces for $material", async ({ defines, flat }) => {
        const source = await preprocessed(MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL, ["RC_SKY_AMBIENT", ...defines]);
        // Unit normals are supplied directly; scalar coordinates stand in for
        // an interior/outside point. Execute the actual exposure/factor branches.
        const helpers = spatialFunctions(MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL,
            ["rcSkyAmbientVolumeAt", "rcSkyAmbientVolumeRadius", "rcSkyAmbientOuterVolume", "rcSkyAmbientSpatialCoverage"]);
        const code = helpers + "\n" + scalarStatements(source).replace("normalW / normalLength", "normalW");
        const evaluate = (y: number, visibility: number, position = 0.5, automatic = false, screen = -1) => {
            let reads = 0;
            const value = runInNewContext(code + "\n({ factor: rcSkyAmbientFactor, exposure: rcSkyAmbientIrradiance });", {
                ...spatialMath,
                uniforms: { rcSkyAmbientControl: { x: 0.95, y: 0.035, w: 1 },
                    ...spatialUniforms("rcSkyAmbient", automatic ? 4 : 1),
                    ...(!automatic ? { rcSkyAmbientVolume: { xyz: 0, w: 1 } } : {}) },
                fragmentInputs: { vPositionW: position }, normalW: { x: Math.sqrt(Math.max(0, 1 - y * y)), y, z: 0 },
                vec3f: (v: number) => v, length: () => 1, all: (v: boolean) => v,
                abs: Math.abs, min: Math.min, max: Math.max,
                clamp: (v: number, low: number, high: number) => Math.min(high, Math.max(low, v)),
                rcSkyAmbientVisibilityValidated: () => { reads++; return visibility; },
                rcSkyAmbientScreenIrradiance: () => screen,
            }) as { factor: number; exposure: number };
            return { ...value, reads };
        };
        for (const y of [-1, -0.995, -0.98]) {
            expect(evaluate(y, -1)).toEqual({ factor: 1 - 0.965 * 0.95, exposure: 0, reads: 0 });
        }
        expect(evaluate(1, 1)).toEqual({ factor: 1, exposure: 1, reads: 1 });
        // A vertical face receives half the irradiance of an upward one even
        // when fully exposed. Only flat MMD fill discounts that orientation.
        for (const visibility of [1, 0.25]) {
            const exposure = 0.5 * visibility;
            const factor = expect.closeTo(1 - 0.965 * 0.95 * (1 - (flat ? visibility : exposure)), 12);
            expect(evaluate(0, visibility)).toEqual({ factor, exposure, reads: 1 });
            expect(evaluate(0, -1, 0.5, false, exposure)).toEqual({ factor, exposure, reads: 0 });
        }
        expect(evaluate(1, 0).factor).toBeCloseTo(0.08325, 12);
        expect(evaluate(1, -1)).toEqual({ factor: 1, exposure: -1, reads: 1 });
        expect(evaluate(-1, 0, 2)).toEqual({ factor: 1, exposure: -1, reads: 0 });
        // Far levels remain valid beyond the first volume. At the outer fade,
        // attenuation and added light approach neutral independently and once.
        expect(evaluate(1, 0.5, 1000, true).exposure).toBe(0.5);
        expect(evaluate(1, 0.5, 14336, true).exposure).toBe(0.25);
        expect(evaluate(1, 0.5, 14336, true).factor).toBeCloseTo((1 + (1 - 0.965 * 0.95 * 0.5)) / 2, 12);
        expect(evaluate(1, 0.5, 16384, true)).toEqual({ factor: 1, exposure: 0, reads: 1 });
        expect(evaluate(1, 0.5, 16385, true)).toEqual({ factor: 1, exposure: -1, reads: 0 });
        // Screen values already contain hemispherical exposure, but not the outer fade.
        // Reuse them for both contributions without querying or multiplying by openSky again.
        expect(evaluate(0, 0, 1000, true, 0.4).exposure).toBe(0.4);
        expect(evaluate(0, 0, 1000, true, 0.4).reads).toBe(0);
        expect(evaluate(0, 0, 14336, true, 0.4).exposure).toBe(0.2);
        expect(evaluate(-1, 1, 0.5, false, 1)).toEqual({ factor: 1 - 0.965 * 0.95, exposure: 0, reads: 0 });
    });

    it("keeps unsupported variants neutral without sampling the field", async () => {
        for (const disabled of ["PREPASS", "DIFFUSEFRESNEL", "LIGHTMAP"]) {
            const code = await preprocessed(MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL, ["RC_SKY_AMBIENT", disabled]);
            expect(code).toMatch(/rcSkyAmbientFactor\s*=\s*1\.0/);
            expect(code).not.toContain("rcSkyAmbientVisibilityValidated(");
            const fog = await preprocessed(MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL, ["RC_SKY_AMBIENT", disabled]);
            expect(fog.trim()).toBe("");
        }
    });

    it("adds optional sky light only through valid exposure and reuses the existing sample", async () => {
        const code = await preprocessed(MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL, ["RC_SKY_AMBIENT"]);
        const before = { rgb: 0.2, a: 0.75 };
        for (const brightness of [0, 1]) for (const irradiance of [-1, 0, 0.5]) for (const opacity of [0, 0.5, 1]) {
            const result = runInNewContext(scalarStatements(code) + "\ncolor;", {
                color: { ...before }, rcSkyAmbientIrradiance: irradiance,
                uniforms: { rcSkyAmbientControl: { x: 0.95, y: 0.035, z: brightness, w: opacity } },
                diffuseColor: 0.8, baseColor: { rgb: 0.6 },
                vec3f: (value: number) => value, vec4f: (rgb: number, a: number) => ({ rgb, a }),
                clamp: (value: number, low: number, high: number) => Math.min(high, Math.max(low, value)), max: Math.max,
                toLinearSpaceVec3: (value: number) => value ** 2.2,
                toGammaSpaceVec3: (value: number) => value ** (1 / 2.2),
                rcSkyAmbientVisibilityValidated: () => { throw new Error("A second field query is unnecessary"); },
            }) as { rgb: number; a: number };
            expect(result.a).toBe(before.a);
            if (brightness === 0 || irradiance <= 0 || opacity === 0) expect(result.rgb).toBe(before.rgb);
            else expect(result.rgb).toBeGreaterThan(before.rgb);
        }
    });
});

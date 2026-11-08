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

// The diffuse math is component-wise. Execute one channel of the actual shader,
// including its helper bodies, instead of restating the composition in JS.
// This is not a substitute for full WGSL compilation/material GPU checks.
function scalarStatements(source: string): string {
    return source.replace(/:\s*(?:vec[234]f|f32|bool)\b/g, "")
        .replace(/->\s*(?:vec[234]f|f32|bool)\b/g, "")
        .replace(/\bfn\b/g, "function").replace(/\bvar\b/g, "let");
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
    materialAmbient: number; base: number; factor: number; residual: number; oldFactor: number;
};
const defaults: Inputs = {
    diffuseBase: 1.1, diffuseColor: 0.8, emissiveColor: 0.2, albedo: 0.6,
    materialAmbient: 0.65, base: 0.6, factor: 0.2, residual: 0.4, oldFactor: 0.5,
};

function diffuseChannel(code: string, opacity: number, input: Partial<Inputs> = {}) {
    const values = { ...defaults, ...input };
    const helpers = shaderFunction(MMD_RADIANCE_SKY_QUERY_WGSL, "rcSkyApplyDiffuse") + "\n"
        + shaderFunction(MMD_RADIANCE_SKY_AMBIENT_QUERY_WGSL, "rcSkyAmbientDarkenDiffuse");
    return runInNewContext(helpers + "\n" + scalarStatements(code) + "\n({ value: finalDiffuse,"
        + " diffuseBase, diffuseColor, emissiveColor, albedo: baseColor.rgb });", {
        uniforms: { rcSkyAmbientControl: { x: 0.95, y: 0.035, z: 0, w: opacity }, vAmbientColor: values.materialAmbient },
        diffuseBase: values.diffuseBase, diffuseColor: values.diffuseColor,
        emissiveColor: values.emissiveColor, baseColor: { rgb: values.albedo },
        rcSkyAmbientBase: values.base, rcSkyAmbientFactor: values.factor,
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

describe("Sky Ambient replaces only the ambient-equivalent MMD contribution", () => {
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
        const input = { diffuseColor: 1, emissiveColor: 0, albedo: 1, base: 0.4, factor: 0.25 };
        const shadowed = diffuseChannel(code, 1, { ...input, diffuseBase: 0.5 }).value;
        const lit = diffuseChannel(code, 1, { ...input, diffuseBase: 0.8 }).value;
        expect(shadowed).toBeCloseTo(0.2, 12);
        expect(lit).toBeCloseTo(0.5, 12);
        expect(lit - shadowed).toBeCloseTo(0.3, 12);
    });

    it("uses the stronger occlusion once instead of subtracting both from the same base", async () => {
        for (const oldFirst of [true, false]) {
            const code = await composed(["RC_SKY_AMBIENT", "RC_SKY_OCCLUSION", "APPLY_AMBIENT_COLOR_TO_DIFFUSE"], oldFirst);
            const input = { diffuseBase: 0.8, diffuseColor: 1, emissiveColor: 0, albedo: 1,
                base: 0.4, factor: 0.5, residual: 0.3 };
            expect(diffuseChannel(code, 1, { ...input, oldFactor: 1 }).value).toBeCloseTo(0.6, 12);
            expect(diffuseChannel(code, 1, { ...input, oldFactor: 0.5 }).value).toBeCloseTo(0.6, 12);
            expect(diffuseChannel(code, 1, { ...input, oldFactor: 0 }).value).toBeCloseTo(0.5, 12);
        }
    });

    it("does not suppress emission when its light base is fully occluded", async () => {
        for (const linked of [false, true]) {
            const code = await composed(["RC_SKY_AMBIENT", "APPLY_AMBIENT_COLOR_TO_DIFFUSE", ...(linked ? ["LINKEMISSIVEWITHDIFFUSE"] : [])]);
            const input = { diffuseBase: 0.4, diffuseColor: 0.8, albedo: 0.6, base: 0.4, factor: 0 };
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

    it("captures the common Toon's complete base in both lit and shadowed regions", async () => {
        const manager = readFileSync(new URL("../mmd-manager.ts", import.meta.url), "utf8");
        const line = manager.match(/^let shadowTerm=info\.diffuse\*mix\(one,toonShadowBand,shadowMask\);\r?$/m)?.[0];
        if (!line) throw new Error("Common Toon light expression was not found");
        const source = await preprocessed(inject(line + "\ndiffuseBase+=shadowTerm;", [ambient]), ["RC_SKY_AMBIENT"]);
        for (const isHemi of [false, true]) for (const shadowMask of [0, 0.5, 1]) {
            const result = runInNewContext(scalarStatements(source) + "\n({ base: rcSkyAmbientBase, diffuse: diffuseBase, hemi: rcSkyAmbientIsHemi });", {
                rcSkyAmbientBase: 0, rcSkyAmbientIsHemi: isHemi, diffuseBase: 0,
                info: { diffuse: 1 }, one: 1, toonShadowBand: 0.4, shadowMask,
                mix: (a: number, b: number, amount: number) => a * (1 - amount) + b * amount,
                select: (a: number, b: number, condition: boolean) => condition ? b : a,
            }) as { base: number; diffuse: number; hemi: boolean };
            expect(result.diffuse).toBeCloseTo(1 - 0.6 * shadowMask, 12);
            expect(result.base).toBeCloseTo(isHemi ? result.diffuse : 0.4, 12);
            expect(result.hemi).toBe(false);
        }
    });

    it("captures each repeated light once, including a zero-energy light before the directional light", async () => {
        const manager = readFileSync(new URL("../mmd-manager.ts", import.meta.url), "utf8");
        const line = manager.match(/^let shadowTerm=info\.diffuse\*mix\(one,toonShadowBand,shadowMask\);\r?$/m)?.[0];
        if (!line) throw new Error("Common Toon expression missing");
        const source = [0, 0.8, 0.3].map(energy => `{ info.diffuse = ${energy};\n${line}\ndiffuseBase+=shadowTerm; }`).join("\n");
        const code = await preprocessed(inject(source, [ambient]), ["RC_SKY_AMBIENT"]);
        const result = runInNewContext(scalarStatements(code) + "\nrcSkyAmbientBase;", {
            rcSkyAmbientBase: 0, rcSkyAmbientIsHemi: false, diffuseBase: 0,
            info: { diffuse: 0 }, one: 1, toonShadowBand: 0.4, shadowMask: 0.5,
            mix: (a: number, b: number, amount: number) => a * (1 - amount) + b * amount,
            select: (a: number, b: number, condition: boolean) => condition ? b : a,
        }) as number;
        expect(result).toBeCloseTo((0.8 + 0.3) * 0.4, 12);
    });

    it("treats unsupported downward directions as dark while invalid probes and bounds stay neutral", async () => {
        const source = await preprocessed(MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL, ["RC_SKY_AMBIENT"]);
        // Unit normals are supplied directly; scalar coordinates stand in for
        // an interior/outside point. Execute the actual exposure/factor branches.
        const code = scalarStatements(source).replace("normalW / normalLength", "normalW");
        const evaluate = (y: number, visibility: number, position = 0.5) => {
            let reads = 0;
            const value = runInNewContext(code + "\n({ factor: rcSkyAmbientFactor, exposure: rcSkyAmbientIrradiance });", {
                uniforms: { rcSkyAmbientControl: { x: 0.95, y: 0.035, w: 1 }, rcSkyAmbientVolume: { xyz: 0, w: 1 } },
                fragmentInputs: { vPositionW: position }, normalW: { x: Math.sqrt(Math.max(0, 1 - y * y)), y, z: 0 },
                vec3f: (v: number) => v, length: () => 1, all: (v: boolean) => v,
                abs: Math.abs, min: Math.min, max: Math.max,
                clamp: (v: number, low: number, high: number) => Math.min(high, Math.max(low, v)),
                rcSkyAmbientVisibility: () => { reads++; return visibility; },
            }) as { factor: number; exposure: number };
            return { ...value, reads };
        };
        for (const y of [-1, -0.995, -0.98]) {
            expect(evaluate(y, -1)).toEqual({ factor: 1 - 0.965 * 0.95, exposure: 0, reads: 0 });
        }
        expect(evaluate(1, 1)).toEqual({ factor: 1, exposure: 1, reads: 1 });
        expect(evaluate(1, 0).factor).toBeCloseTo(0.08325, 12);
        expect(evaluate(1, -1)).toEqual({ factor: 1, exposure: -1, reads: 1 });
        expect(evaluate(-1, 0, 2)).toEqual({ factor: 1, exposure: -1, reads: 0 });
    });

    it("captures the actual hemispheric contribution without Toon and leaves direct light alone", async () => {
        const hemiLine = lightFragmentWGSL.shader.match(/info=computeHemisphericLighting\([^;]+;/)?.[0];
        const nativeNoToon = Object.values(mmd).find(code => code.includes("diffuseBase+=mix(info.diffuse*shadow"));
        if (!hemiLine || !nativeNoToon) throw new Error("Installed lighting expressions were not found");
        for (const ignoreDiffuse of [false, true]) for (const isHemi of [false, true]) {
            const source = (isHemi ? hemiLine.replaceAll("{X}", "0") + "\n" : "") + nativeNoToon;
            const code = await preprocessed(inject(source, [ambient]), ["RC_SKY_AMBIENT", ...(ignoreDiffuse ? ["IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED"] : [])]);
            const result = runInNewContext(scalarStatements(code) + "\n({ base: rcSkyAmbientBase, diffuse: diffuseBase, hemi: rcSkyAmbientIsHemi });", {
                rcSkyAmbientBase: 0, rcSkyAmbientIsHemi: false, diffuseBase: 0, info: { diffuse: 0.7 }, shadow: 0.5,
                viewDirectionW: 0, normalW: 0, glossiness: 0, diffuse0: { rgb: 0 },
                light0: { vLightData: 0, vLightSpecular: { rgb: 0 }, vLightGround: 0 },
                computeHemisphericLighting: () => ({ diffuse: 0.7 }),
            }) as { base: number; diffuse: number; hemi: boolean };
            expect(result.diffuse).toBeCloseTo(ignoreDiffuse ? 0.7 : 0.35, 12);
            expect(result.base).toBeCloseTo(isHemi ? result.diffuse : 0, 12);
            expect(result.hemi).toBe(false);
        }
    });

    it("keeps unsupported variants neutral without sampling the field", async () => {
        for (const disabled of ["PREPASS", "DIFFUSEFRESNEL", "LIGHTMAP"]) {
            const code = await preprocessed(MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL, ["RC_SKY_AMBIENT", disabled]);
            expect(code).toMatch(/rcSkyAmbientFactor\s*=\s*1\.0/);
            expect(code).not.toContain("rcSkyAmbientVisibility(");
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
                rcSkyAmbientVisibility: () => { throw new Error("A second field query is unnecessary"); },
            }) as { rgb: number; a: number };
            expect(result.a).toBe(before.a);
            if (brightness === 0 || irradiance <= 0 || opacity === 0) expect(result.rgb).toBe(before.rgb);
            else expect(result.rgb).toBeGreaterThan(before.rgb);
        }
    });
});

import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { MaterialPluginManager } from "@babylonjs/core/Materials/materialPluginManager";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Process } from "@babylonjs/core/Engines/Processors/shaderProcessor";
import { defaultPixelShaderWGSL } from "@babylonjs/core/ShadersWGSL/default.fragment";
import { MmdPluginMaterial } from "babylon-mmd/esm/Loader/ShadersWGSL/mmdStandard";
import { MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATTERN, MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATCH } from "./mmd-radiance-sky-query-wgsl";
import { MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATTERN, MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATCH,
    MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATTERN, MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATCH,
    MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL,
    MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL } from "./mmd-radiance-sky-ambient-query-wgsl";

type CustomCode = Record<string, string>;
type Injector = { _injectCustomCode(event: { indexParameters: Record<string, number> }): (stage: string, code: string) => string };

// Use the installed Babylon injector and preprocessor, including its $n handling,
// rather than reimplementing regex substitution or #ifdef evaluation in the test.
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
        defines: defines.map(define => `#define ${define}`), indexParameters: {}, isFragment: true,
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
const ambient = {
    [MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATTERN]: MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATCH,
    [MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATTERN]: MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATCH,
};

// These expressions are component-wise: execute one color channel from the
// actual injected source, removing only WGSL's type spelling. This catches
// opacity/clipping/order regressions without duplicating the blending formula.
// Shader compilation and complete material composition remain GPU E2E checks.
function diffuseChannel(code: string, opacity: number): number {
    const statements = code.replace(/: vec3f/g, "").replace(/\bvar\b/g, "let");
    return runInNewContext(`${statements}\nfinalDiffuse;`, {
        uniforms: { rcSkyAmbientControl: { w: opacity }, vAmbientColor: 0.65 },
        diffuseBase: 1.1, diffuseColor: 0.8, emissiveColor: 0.2, baseColor: { rgb: 0.6 },
        rcSkyAmbientBaseScale: 0.2, rcSkyResidual: 0.4, rcSkyFactor: 0.5,
        rcSkyApplyDiffuse: (diffuse: number, residual: number, factor: number) => diffuse - residual * (1 - factor),
        vec3f: (value: number) => value,
        clamp: (value: number, low: number, high: number) => Math.min(high, Math.max(low, value)),
        max: Math.max, mix: (a: number, b: number, amount: number) => a * (1 - amount) + b * amount,
        toLinearSpaceVec3: (value: number) => value ** 2.2,
        toGammaSpaceVec3: (value: number) => value ** (1 / 2.2),
    }) as number;
}

describe("Sky Ambient preserves MMD diffuse/emission composition", () => {
    for (const oldFirst of [true, false]) for (const foldedAmbient of [true, false]) {
        for (const emission of ["normal", "linked", "illumination"] as const) {
            it(`blends both light endpoints: oldFirst=${oldFirst}, folded=${foldedAmbient}, emission=${emission}`, async () => {
                const injected = inject(diffuseSection, [mmd, ...(oldFirst ? [oldSky, ambient] : [ambient, oldSky])]);
                const defines = ["RC_SKY_AMBIENT", "RC_SKY_OCCLUSION",
                    ...(foldedAmbient ? ["APPLY_AMBIENT_COLOR_TO_DIFFUSE"] : []),
                    ...(emission === "linked" ? ["LINKEMISSIVEWITHDIFFUSE"] : []),
                    ...(emission === "illumination" ? ["EMISSIVEASILLUMINATION"] : [])];
                const result = await preprocessed(injected, defines);
                // One outer original and one block-local sky endpoint.
                expect(result.match(/var finalDiffuse:/g)).toHaveLength(2);
                const scaled = "(rcSkyApplyDiffuse(diffuseBase, rcSkyResidual, rcSkyFactor) * rcSkyAmbientBaseScale)";
                // babylon-mmd wraps the first non-folded occurrence in an extra
                // pair of parentheses; retain its native expression exactly.
                const light = !foldedAmbient && emission === "illumination" ? `(${scaled})` : scaled;
                const lit = emission === "linked" ? `(${light}+emissiveColor)*diffuseColor`
                    : `${light}*diffuseColor${emission === "normal" ? "+emissiveColor" : ""}`;
                const expected = `var finalDiffuse: vec3f=clamp(${lit}${foldedAmbient ? "" : "+(uniforms.vAmbientColor * rcSkyAmbientBaseScale)"},vec3f(0.0),vec3f(1.0))*baseColor.rgb;`;
                expect(result).toContain(expected);
                const native = await preprocessed(inject(diffuseSection, [mmd, oldSky]), defines);
                const originalValue = diffuseChannel(native, 0), skyValue = diffuseChannel(expected, 1);
                expect(diffuseChannel(result, 0)).toBe(originalValue);
                expect(diffuseChannel(result, 1)).toBe(skyValue);
                expect(diffuseChannel(result, 0.5)).toBeCloseTo(((originalValue ** 2.2 + skyValue ** 2.2) / 2) ** (1 / 2.2), 12);
                // Never scale the material albedo itself: GI and sphere use it later.
                expect(result).not.toMatch(/diffuseColor\s*[*]=|diffuseBase\s*[*]=/);
            });
        }
    }

    it("leaves the original shader expression when the Sky Ambient define is absent", async () => {
        const native = await preprocessed(inject(diffuseSection, [mmd]), ["APPLY_AMBIENT_COLOR_TO_DIFFUSE"]);
        const patched = await preprocessed(inject(diffuseSection, [mmd, ambient]), ["APPLY_AMBIENT_COLOR_TO_DIFFUSE"]);
        expect(patched.trim()).toBe(native.trim());
    });

    it("leaves base light neutral for prepass and bypassed material variants", async () => {
        for (const disabled of ["PREPASS", "DIFFUSEFRESNEL", "LIGHTMAP"]) {
            const code = await preprocessed(MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL, ["RC_SKY_AMBIENT", disabled]);
            expect(code).toContain("var rcSkyAmbientBaseScale = 1.0;");
            expect(code).not.toContain("mix(");
        }
    });

    it("scales only the new sky contribution and skips all field reads at zero opacity", () => {
        expect(MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL)
            .toContain("if (uniforms.rcSkyAmbientControl.x > 0.0 && uniforms.rcSkyAmbientControl.w > 0.0)");
        expect(MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL)
            .toContain("skyAmbientReflectance * skyAmbientIllumination * uniforms.rcSkyAmbientControl.w");
        expect(MMD_RADIANCE_SKY_AMBIENT_BEFORE_FOG_WGSL).not.toMatch(/color\.rgb\s*\*|color\s*\*=/);
    });
});

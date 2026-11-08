import { describe, expect, it } from "vitest";
import { MaterialPluginManager } from "@babylonjs/core/Materials/materialPluginManager";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Process } from "@babylonjs/core/Engines/Processors/shaderProcessor";
import { defaultPixelShaderWGSL } from "@babylonjs/core/ShadersWGSL/default.fragment";
import { MmdPluginMaterial } from "babylon-mmd/esm/Loader/ShadersWGSL/mmdStandard";
import { MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATTERN, MMD_RADIANCE_SKY_FINAL_DIFFUSE_PATCH } from "./mmd-radiance-sky-query-wgsl";
import { MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATTERN, MMD_RADIANCE_SKY_AMBIENT_DIFFUSE_PATCH,
    MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATTERN, MMD_RADIANCE_SKY_AMBIENT_AMBIENT_PATCH,
    MMD_RADIANCE_SKY_AMBIENT_BEFORE_LIGHTS_WGSL } from "./mmd-radiance-sky-ambient-query-wgsl";

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

describe("Sky Ambient preserves MMD diffuse/emission composition", () => {
    for (const oldFirst of [true, false]) for (const foldedAmbient of [true, false]) {
        for (const emission of ["normal", "linked", "illumination"] as const) {
            it(`keeps one diffuse declaration: oldFirst=${oldFirst}, folded=${foldedAmbient}, emission=${emission}`, async () => {
                const injected = inject(diffuseSection, [mmd, ...(oldFirst ? [oldSky, ambient] : [ambient, oldSky])]);
                const defines = ["RC_SKY_AMBIENT", "RC_SKY_OCCLUSION",
                    ...(foldedAmbient ? ["APPLY_AMBIENT_COLOR_TO_DIFFUSE"] : []),
                    ...(emission === "linked" ? ["LINKEMISSIVEWITHDIFFUSE"] : []),
                    ...(emission === "illumination" ? ["EMISSIVEASILLUMINATION"] : [])];
                const result = await preprocessed(injected, defines);
                expect(result.match(/var finalDiffuse:/g)).toHaveLength(1);
                const scaled = "(rcSkyApplyDiffuse(diffuseBase, rcSkyResidual, rcSkyFactor) * rcSkyAmbientBaseScale)";
                // babylon-mmd wraps the first non-folded occurrence in an extra
                // pair of parentheses; retain its native expression exactly.
                const light = !foldedAmbient && emission === "illumination" ? `(${scaled})` : scaled;
                const lit = emission === "linked" ? `(${light}+emissiveColor)*diffuseColor`
                    : `${light}*diffuseColor${emission === "normal" ? "+emissiveColor" : ""}`;
                const expected = `var finalDiffuse: vec3f=clamp(${lit}${foldedAmbient ? "" : "+(uniforms.vAmbientColor * rcSkyAmbientBaseScale)"},vec3f(0.0),vec3f(1.0))*baseColor.rgb;`;
                expect(result).toContain(expected);
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
});

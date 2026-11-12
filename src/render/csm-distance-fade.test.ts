import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { Process } from "@babylonjs/core/Engines/Processors/shaderProcessor";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { lightFragment } from "@babylonjs/core/Shaders/ShadersInclude/lightFragment";
import { lightFragmentWGSL } from "@babylonjs/core/ShadersWGSL/ShadersInclude/lightFragment";
import { injectCsmDistanceFade, installCsmDistanceFade } from "./csm-distance-fade";

type LightInput = {
    kind: "csm" | "standard" | "unshadowed";
    depth: number;
    end?: number;
    configuredEnd?: number;
    lastLength?: number;
    raw?: number;
    rightHanded?: boolean;
    limited?: boolean;
};
type Sample = { shadow: number; raw: number; fade: number };

async function preprocess(source: string, language: ShaderLanguage, defines: string[]): Promise<string> {
    return new Promise(resolve => Process(source, {
        defines: defines.map(define => "#define " + define), indexParameters: {}, isFragment: true,
        shouldUseHighPrecisionShader: true, supportsUniformBuffers: true, shadersRepository: "", includesShadersStore: {},
        processor: { shaderLanguage: language, noPrecision: true }, version: "300", platformName: "WEBGPU", processingContext: null,
        isNDCHalfZRange: true, useReverseDepthBuffer: false,
    }, resolve));
}

// Execute the installed include's scalar control flow and injected fade. Only
// texture sampling is replaced with known shadow values; this is not a GPU compiler.
async function evaluate(source: string, language: ShaderLanguage, lights: LightInput[], fadeLightCount: number | null = 8): Promise<Sample[]> {
    const samples: Sample[] = [], uniforms: Record<string, unknown> = {}, inputs: Record<string, unknown> = {};
    const context: Record<string, unknown> = {
        samples, uniforms, fragmentInputs: inputs, shadow: .123,
        globalShadow: 0, shadowLightCount: 0, aggShadow: 0, numLights: 0,
        min: Math.min, max: Math.max, float: Number, int: Math.trunc,
        mix: (a: number, b: number, amount: number) => a * (1 - amount) + b * amount,
        smoothstep: (low: number, high: number, value: number) => {
            const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
            return t * t * (3 - 2 * t);
        },
        computeShadowCSM: (_layer: number, _position: unknown, _depth: number, texture: { raw: number }) => texture.raw,
        computeShadow: (_position: unknown, _depth: number, texture: { raw: number }) => texture.raw,
    };
    const defines = ["SHADOWONLY"], includes: string[] = [];
    if (fadeLightCount !== null) defines.push(`MMD_CSM_FADE_LIGHT_COUNT ${fadeLightCount}`);
    for (const [index, light] of lights.entries()) {
        const end = light.end ?? 1000;
        defines.push(`LIGHT${index}`);
        if (light.kind !== "unshadowed") defines.push(`SHADOW${index}`);
        if (light.kind === "csm") {
            defines.push(`SHADOWCSM${index}`, `SHADOWCSMNUM_CASCADES${index} 3`, `SHADOWCSMNOBLEND${index}`);
            if (light.limited !== false) defines.push(`SHADOWCSMUSESHADOWMAXZ${index}`);
            if (light.rightHanded) defines.push(`SHADOWCSM_RIGHTHANDED${index}`);
        }
        const cameraPosition = { z: light.rightHanded ? -light.depth : light.depth };
        const splitValues = [end * .25, end * .6, end], lengths = [end * .25, end * .35, light.lastLength ?? end * .4];
        Object.assign(uniforms, { [`viewFrustumZ${index}`]: splitValues, [`frustumLengths${index}`]: lengths,
            [`mmdCsmShadowMaxZ${index}`]: light.configuredEnd ?? 1000 });
        Object.assign(inputs, { [`vPositionFromCamera${index}`]: cameraPosition,
            [`vPositionFromLight${index}`]: 0, [`vDepthMetric${index}`]: 0 });
        for (let cascade = 0; cascade < 4; cascade++) {
            inputs[`vPositionFromLight${index}_${cascade}`] = 0;
            inputs[`vDepthMetric${index}_${cascade}`] = 0;
        }
        Object.assign(context, { [`SHADOWCSMNUM_CASCADES${index}`]: 3,
            // GLSL declares these in lightFragmentDeclaration, outside this include.
            [`index${index}`]: light.limited !== false ? -1 : 2, [`diff${index}`]: 0,
            [`viewFrustumZ${index}`]: splitValues, [`frustumLengths${index}`]: lengths,
            [`mmdCsmShadowMaxZ${index}`]: light.configuredEnd ?? 1000,
            [`vPositionFromCamera${index}`]: cameraPosition,
            [`vPositionFromLight${index}`]: [0, 0, 0, 0], [`vDepthMetric${index}`]: [0, 0, 0, 0],
            [`light${index}`]: { shadowsInfo: { x: 0, y: 0, z: 0, w: 0 } },
            [`shadowTexture${index}`]: { raw: light.raw ?? .2 }, [`shadowTexture${index}Sampler`]: 0 });
        includes.push(source.replaceAll("{X}", String(index)).replace("aggShadow+=shadow;numLights+=1.0;",
            "aggShadow+=shadow;numLights+=1.0;samples.push({shadow,raw:mmdCsmUnfadedShadow,fade:mmdCsmEndFade});"));
    }
    const processed = await preprocess(includes.join("\n"), language, defines);
    const scalar = processed.replace(/^\s*#(?:define|undef)\b.*$/gm, "")
        .replace(/:\s*(?:f32|i32)\b/g, "")
        .replace(/\b(?:float|int|var)\s+/g, "let ");
    runInNewContext(scalar, context);
    return samples;
}

for (const [name, language, original] of [
    ["GLSL", ShaderLanguage.GLSL, lightFragment.shader],
    ["WGSL", ShaderLanguage.WGSL, lightFragmentWGSL.shader],
] as const) describe(`CSM distance fade ${name}`, () => {
    const patched = injectCsmDistanceFade(original, language);

    it("patches the installed include once and rejects changed upstream anchors", () => {
        expect(patched).not.toBe(original);
        expect(injectCsmDistanceFade(patched, language)).toBe(patched);
        expect(patched.match(/MMD_CSM_DISTANCE_FADE/g)).toHaveLength(1);
        expect(patched.indexOf("mmdCsmUnfadedShadow=shadow;")).toBeLessThan(patched.indexOf("#ifdef SHADOWONLY\n#ifndef SHADOWINUSE"));
        expect(() => injectCsmDistanceFade(original.replace("#ifdef SHADOWCSM{X}\n", ""), language)).toThrow(/anchor/);
    });

    it("preprocesses absent lights away and leaves standard or unshadowed lights neutral", async () => {
        expect(await preprocess(patched.replaceAll("{X}", "0"), language, [])).not.toContain("mmdCsm");
        expect(await evaluate(patched, language, [
            { kind: "standard", depth: 5000, raw: .35 }, { kind: "unshadowed", depth: 5000 },
        ])).toEqual([{ shadow: .35, raw: .35, fade: 0 }, { shadow: 1, raw: 1, fade: 0 }]);
    });

    it("keeps the interior unchanged and fades continuously to the configured distance", async () => {
        const [near, start, middle, end, beyond] = await evaluate(patched, language,
            [500, 900, 950, 1000, 1010].map(depth => ({ kind: "csm", depth })));
        expect(near).toEqual({ shadow: .2, raw: .2, fade: 0 });
        expect(start).toEqual(near);
        expect(middle.fade).toBeCloseTo(.5);
        expect(middle.shadow).toBeCloseTo(.6);
        expect(middle.raw).toBe(.2);
        expect(end).toEqual({ shadow: 1, raw: .2, fade: 1 });
        expect(beyond).toEqual({ shadow: 1, raw: 1, fade: 1 });
    });

    it("preserves near shadows when automatic bounds end at the visible floor", async () => {
        const values = await evaluate(patched, language,
            [140, 225, 240, 250].map(depth => ({ kind: "csm", depth, end: 250, lastLength: 60 })));
        for (const value of values) expect(value).toEqual({ shadow: .2, raw: .2, fade: 0 });
    });

    it("does not move the fade start when automatic depth bounds change", async () => {
        const values = await evaluate(patched, language,
            [960, 980, 1000].map(end => ({ kind: "csm", depth: 950, end, lastLength: 400 })));
        for (const value of values) expect(value.fade).toBeCloseTo(.5);
    });

    it("caps the fade to half of a short final cascade at the configured boundary", async () => {
        const [start, middle, end] = await evaluate(patched, language,
            [580, 590, 600].map(depth => ({ kind: "csm", depth, end: 600, configuredEnd: 600, lastLength: 40 })));
        expect(start.fade).toBe(0);
        expect(middle.fade).toBeCloseTo(.5);
        expect(middle.shadow).toBeCloseTo(.6);
        expect(end.fade).toBe(1);
    });

    it("uses positive view depth in right-handed scenes and requires the max-distance define", async () => {
        const [rightHanded, unlimited] = await evaluate(patched, language, [
            { kind: "csm", depth: 950, rightHanded: true }, { kind: "csm", depth: 950, limited: false },
        ]);
        expect(rightHanded.fade).toBeCloseTo(.5);
        expect(rightHanded.shadow).toBeCloseTo(.6);
        expect(unlimited).toEqual({ shadow: .2, raw: .2, fade: 0 });
    });

    it("keeps unsupported material layouts and inactive distance uniforms neutral", async () => {
        const light: LightInput = { kind: "csm", depth: 950 };
        expect(await evaluate(patched, language, [light], null)).toEqual([{ shadow: .2, raw: .2, fade: 0 }]);
        expect((await evaluate(patched, language, [light, light], 1))[1]).toEqual({ shadow: .2, raw: .2, fade: 0 });
        expect(await evaluate(patched, language, [{ ...light, configuredEnd: 0 }])).toEqual([{ shadow: .2, raw: .2, fade: 0 }]);
    });

    it("isolates repeated local names and resets a beyond-range light before sampling", async () => {
        const result = await evaluate(patched, language, [
            { kind: "csm", depth: 950, raw: .2 },
            { kind: "csm", depth: 1100, raw: .4 },
            { kind: "standard", depth: 950, raw: .3 },
        ]);
        expect(result[0].shadow).toBeCloseTo(.6);
        expect(result[1]).toEqual({ shadow: 1, raw: 1, fade: 1 });
        expect(result[2]).toEqual({ shadow: .3, raw: .3, fade: 0 });
    });
});

it("installs both include languages idempotently", () => {
    const glsl = ShaderStore.IncludesShadersStore.lightFragment;
    const wgsl = ShaderStore.IncludesShadersStoreWGSL.lightFragment;
    try {
        installCsmDistanceFade();
        const once = [ShaderStore.IncludesShadersStore.lightFragment, ShaderStore.IncludesShadersStoreWGSL.lightFragment];
        expect(once).toEqual([injectCsmDistanceFade(glsl, ShaderLanguage.GLSL), injectCsmDistanceFade(wgsl, ShaderLanguage.WGSL)]);
        installCsmDistanceFade();
        expect([ShaderStore.IncludesShadersStore.lightFragment, ShaderStore.IncludesShadersStoreWGSL.lightFragment]).toEqual(once);
    } finally {
        ShaderStore.IncludesShadersStore.lightFragment = glsl;
        ShaderStore.IncludesShadersStoreWGSL.lightFragment = wgsl;
    }
});

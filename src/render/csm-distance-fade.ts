import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import "@babylonjs/core/Shaders/ShadersInclude/lightFragment";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/lightFragment";

const MARKER = "// MMD_CSM_DISTANCE_FADE";
const LIGHT_START = "#ifdef LIGHT{X}\n";
const SHADOW_START = "#ifdef SHADOW{X}\n";
const CSM_START = "#ifdef SHADOWCSM{X}\n";
const SHADOW_CONSUMERS = "#ifdef SHADOWONLY\n#ifndef SHADOWINUSE";

/**
 * Babylon 9.2 blends adjacent cascades, but cuts the final one off abruptly.
 * Apply a receiver-side fade before all shadow consumers, using the actual
 * final split (which can be shortened by auto depth bounds). No map, filter,
 * bias or configured shadow distance is changed.
 */
export function injectCsmDistanceFade(source: string, shaderLanguage: ShaderLanguage): string {
    if (source.includes(MARKER)) return source;
    const code = source.replace(/\r\n/g, "\n");
    for (const anchor of [LIGHT_START, SHADOW_START, CSM_START, SHADOW_CONSUMERS]) {
        if (code.split(anchor).length !== 2) {
            throw new Error("Babylon lightFragment changed: CSM distance fade anchor is not unique");
        }
    }
    if (!code.trimEnd().endsWith("#endif")) {
        throw new Error("Babylon lightFragment changed: missing LIGHT scope end");
    }
    const wgsl = shaderLanguage === ShaderLanguage.WGSL;
    const uniforms = wgsl ? "uniforms." : "";
    const inputs = wgsl ? "fragmentInputs." : "";
    const locals = wgsl
        ? "var mmdCsmEndFade: f32=0.0;\nvar mmdCsmUnfadedShadow: f32=1.0;\n"
        : "float mmdCsmEndFade=0.0;\nfloat mmdCsmUnfadedShadow=1.0;\n";
    const scalar = (name: string, expression: string) => wgsl
        ? `let ${name}=${expression};`
        : `float ${name}=${expression};`;
    const last = "SHADOWCSMNUM_CASCADES{X}-1";
    const fade = `mmdCsmUnfadedShadow=shadow;
#if defined(SHADOWCSM{X}) && defined(SHADOWCSMUSESHADOWMAXZ{X})
${scalar("mmdCsmEnd", `${uniforms}viewFrustumZ{X}[${last}]`)}
${scalar("mmdCsmFadeWidth", `max(min(mmdCsmEnd*0.1,${uniforms}frustumLengths{X}[${last}]*0.5),0.0001)`)}
#ifdef SHADOWCSM_RIGHTHANDED{X}
${scalar("mmdCsmDepth", `-${inputs}vPositionFromCamera{X}.z`)}
#else
${scalar("mmdCsmDepth", `${inputs}vPositionFromCamera{X}.z`)}
#endif
mmdCsmEndFade=smoothstep(mmdCsmEnd-mmdCsmFadeWidth,mmdCsmEnd,mmdCsmDepth);
shadow=mix(mmdCsmUnfadedShadow,1.0,mmdCsmEndFade);
#endif
`;
    // Each expanded light owns these locals. MMD's generic Toon replacement
    // can consume the raw shadow and fade without guessing a light index.
    return code
        .replace(LIGHT_START, `${LIGHT_START}{\n${MARKER}\n`)
        .replace(SHADOW_START, locals + SHADOW_START)
        // Beyond the last split Babylon skips sampling. Do not retain the
        // preceding light's shadow value in that branch.
        .replace(CSM_START, `${CSM_START}shadow=1.0;\n`)
        .replace(SHADOW_CONSUMERS, fade + SHADOW_CONSUMERS)
        .replace(/#endif\s*$/, "}\n#endif\n");
}

export function installCsmDistanceFade(): void {
    for (const [store, language] of [
        [ShaderStore.IncludesShadersStore, ShaderLanguage.GLSL],
        [ShaderStore.IncludesShadersStoreWGSL, ShaderLanguage.WGSL],
    ] as const) {
        store.lightFragment = injectCsmDistanceFade(store.lightFragment, language);
    }
}

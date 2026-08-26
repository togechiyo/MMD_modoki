import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/ShadersWGSL/default.fragment";

const GLSL_MARKER = "float writeGeometryInfo=color.a>0.4 ? 1.0 : 0.0;";
const GLSL_SENTINEL = `
#ifdef PREPASS_IRRADIANCE_LEGACY
gl_FragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4(0.0,0.0,0.0,1.0);
#endif`;

const WGSL_MARKER =
    "var writeGeometryInfo: f32=select(0.0,1.0,color.a>0.4);var fragData: array<vec4<f32>,SCENE_MRT_COUNT>;";
const WGSL_MAIN_MARKER = "fn main(input: FragmentInputs)->FragmentOutputs {";
const WGSL_MAIN_STATE = `
var mmdSkinSssEnabled: f32=0.0;
var mmdSkinSssProfileIndex: f32=255.0;
var mmdSkinSssIrradiance: vec3f=vec3f(0.0);`;
const WGSL_SENTINEL = `
var mmdSkinSssPreparedIrradiance: vec3f=vec3f(0.0);
#ifdef PREPASS_IRRADIANCE_LEGACY
if (mmdSkinSssEnabled>0.5) {
    let mmdSkinSssSqrtAlbedo=sqrt(max(baseColor.rgb,vec3f(0.0)));
    mmdSkinSssPreparedIrradiance=clamp(
        mmdSkinSssIrradiance*diffuseColor*baseAmbientColor*mmdSkinSssSqrtAlbedo,
        vec3f(0.0),
        vec3f(1.0)
    );
    fragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4f(
        mmdSkinSssPreparedIrradiance,
        writeGeometryInfo*mmdSkinSssProfileIndex/255.0
    );
} else {
    fragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4f(0.0,0.0,0.0,1.0);
}
#endif`;
const WGSL_PREPASS_COLOR = "fragData[PREPASS_COLOR_INDEX]=color; ";
const WGSL_PREPASS_COLOR_WITH_SSS = `if (mmdSkinSssEnabled>0.5) {
    let mmdSkinSssDiffuseColor=
        sqrt(max(baseColor.rgb,vec3f(0.0)))*mmdSkinSssPreparedIrradiance;
    fragData[PREPASS_COLOR_INDEX]=vec4f(
        max(color.rgb-mmdSkinSssDiffuseColor,vec3f(0.0)),
        color.a
    );
} else {
    fragData[PREPASS_COLOR_INDEX]=color;
}`;

export type StandardMaterialSssPrePassPatchDiagnostics = {
    glslSourcePresent: boolean;
    glslMarkerPresent: boolean;
    glslExclusionPresent: boolean;
    wgslSourcePresent: boolean;
    wgslMarkerPresent: boolean;
    wgslExclusionPresent: boolean;
    wgslProducerStatePresent: boolean;
    wgslColorSeparationPresent: boolean;
};

export function injectStandardMaterialSssExclusion(
    source: string,
    shaderLanguage: "glsl" | "wgsl",
): string {
    const sentinel = shaderLanguage === "wgsl" ? WGSL_SENTINEL : GLSL_SENTINEL;
    const marker = shaderLanguage === "wgsl" ? WGSL_MARKER : GLSL_MARKER;
    if (!source.includes(marker)) return source;
    let patched = source.includes(sentinel.trim())
        ? source
        : source.replace(marker, `${marker}${sentinel}`);
    if (shaderLanguage === "wgsl") {
        if (!patched.includes(WGSL_MAIN_STATE.trim()) && patched.includes(WGSL_MAIN_MARKER)) {
            patched = patched.replace(WGSL_MAIN_MARKER, `${WGSL_MAIN_MARKER}\n${WGSL_MAIN_STATE}`);
        }
        if (patched.includes(WGSL_PREPASS_COLOR)) {
            patched = patched.replace(WGSL_PREPASS_COLOR, WGSL_PREPASS_COLOR_WITH_SSS);
        }
    }
    return patched;
}

function inspectPatchState(
    source: unknown,
    shaderLanguage: "glsl" | "wgsl",
): {
    sourcePresent: boolean;
    markerPresent: boolean;
    exclusionPresent: boolean;
} {
    const marker = shaderLanguage === "wgsl" ? WGSL_MARKER : GLSL_MARKER;
    const sentinel = shaderLanguage === "wgsl" ? WGSL_SENTINEL : GLSL_SENTINEL;
    return {
        sourcePresent: typeof source === "string",
        markerPresent: typeof source === "string" && source.includes(marker),
        exclusionPresent:
            typeof source === "string" && source.includes(sentinel.trim()),
    };
}

export function getStandardMaterialSssPrePassPatchDiagnostics():
StandardMaterialSssPrePassPatchDiagnostics {
    const glsl = inspectPatchState(
        ShaderStore.ShadersStore.defaultPixelShader,
        "glsl",
    );
    const wgsl = inspectPatchState(
        ShaderStore.ShadersStoreWGSL.defaultPixelShader,
        "wgsl",
    );
    return {
        glslSourcePresent: glsl.sourcePresent,
        glslMarkerPresent: glsl.markerPresent,
        glslExclusionPresent: glsl.exclusionPresent,
        wgslSourcePresent: wgsl.sourcePresent,
        wgslMarkerPresent: wgsl.markerPresent,
        wgslExclusionPresent: wgsl.exclusionPresent,
        wgslProducerStatePresent:
            typeof ShaderStore.ShadersStoreWGSL.defaultPixelShader === "string"
            && ShaderStore.ShadersStoreWGSL.defaultPixelShader.includes(WGSL_MAIN_STATE.trim()),
        wgslColorSeparationPresent:
            typeof ShaderStore.ShadersStoreWGSL.defaultPixelShader === "string"
            && ShaderStore.ShadersStoreWGSL.defaultPixelShader.includes(
                WGSL_PREPASS_COLOR_WITH_SSS.trim(),
            ),
    };
}

function patchStandardMaterialSssPrePassShaders(): void {
    const glsl = ShaderStore.ShadersStore.defaultPixelShader;
    if (typeof glsl === "string") {
        ShaderStore.ShadersStore.defaultPixelShader =
            injectStandardMaterialSssExclusion(glsl, "glsl");
    }

    const wgsl = ShaderStore.ShadersStoreWGSL.defaultPixelShader;
    if (typeof wgsl === "string") {
        ShaderStore.ShadersStoreWGSL.defaultPixelShader =
            injectStandardMaterialSssExclusion(wgsl, "wgsl");
    }
}

patchStandardMaterialSssPrePassShaders();

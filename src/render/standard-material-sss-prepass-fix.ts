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
var mmdSkinSssIrradiance: vec3f=vec3f(0.0);
var mmdSkinSssVisibleDiffuse: vec3f=vec3f(0.0);
var mmdSkinSssSelfMultiplyMask: f32=0.0;`;
const WGSL_FINAL_SPECULAR_MARKER = "#ifdef SPECULARTERM\nvar finalSpecular: vec3f=specularBase*specularColor;";
const WGSL_VISIBLE_DIFFUSE = `
if (mmdSkinSssEnabled>0.5) {
    let mmdSkinSssDiffuseBaseWithoutSss=max(
        diffuseBase-mmdSkinSssIrradiance,
        vec3f(0.0)
    );
    var mmdSkinSssFinalDiffuseWithoutSss: vec3f=vec3f(0.0);
#ifdef EMISSIVEASILLUMINATION
#ifdef APPLY_AMBIENT_COLOR_TO_DIFFUSE
    mmdSkinSssFinalDiffuseWithoutSss=clamp(
        mmdSkinSssDiffuseBaseWithoutSss*diffuseColor,
        vec3f(0.0),
        vec3f(1.0)
    )*baseColor.rgb;
#else
    mmdSkinSssFinalDiffuseWithoutSss=clamp(
        mmdSkinSssDiffuseBaseWithoutSss*diffuseColor+uniforms.vAmbientColor,
        vec3f(0.0),
        vec3f(1.0)
    )*baseColor.rgb;
#endif
#else
#ifdef LINKEMISSIVEWITHDIFFUSE
#ifdef APPLY_AMBIENT_COLOR_TO_DIFFUSE
    mmdSkinSssFinalDiffuseWithoutSss=clamp(
        (mmdSkinSssDiffuseBaseWithoutSss+emissiveColor)*diffuseColor,
        vec3f(0.0),
        vec3f(1.0)
    )*baseColor.rgb;
#else
    mmdSkinSssFinalDiffuseWithoutSss=clamp(
        (mmdSkinSssDiffuseBaseWithoutSss+emissiveColor)*diffuseColor+uniforms.vAmbientColor,
        vec3f(0.0),
        vec3f(1.0)
    )*baseColor.rgb;
#endif
#else
#ifdef APPLY_AMBIENT_COLOR_TO_DIFFUSE
    mmdSkinSssFinalDiffuseWithoutSss=clamp(
        mmdSkinSssDiffuseBaseWithoutSss*diffuseColor+emissiveColor,
        vec3f(0.0),
        vec3f(1.0)
    )*baseColor.rgb;
#else
    mmdSkinSssFinalDiffuseWithoutSss=clamp(
        mmdSkinSssDiffuseBaseWithoutSss*diffuseColor+emissiveColor+uniforms.vAmbientColor,
        vec3f(0.0),
        vec3f(1.0)
    )*baseColor.rgb;
#endif
#endif
#endif
    mmdSkinSssVisibleDiffuse=max(
        (finalDiffuse-mmdSkinSssFinalDiffuseWithoutSss)*baseAmbientColor,
        vec3f(0.0)
    );
}`;
const WGSL_BEFORE_FOG_MARKER = "#define CUSTOM_FRAGMENT_BEFORE_FOG";
const WGSL_REMOVE_VISIBLE_DIFFUSE = `
if (mmdSkinSssEnabled>0.5) {
    color=vec4f(max(color.rgb-mmdSkinSssVisibleDiffuse,vec3f(0.0)),color.a);
}`;
const WGSL_SENTINEL = `
var mmdSkinSssPreparedIrradiance: vec3f=vec3f(0.0);
#ifdef PREPASS_IRRADIANCE_LEGACY
if (mmdSkinSssEnabled>0.5) {
    let mmdSkinSssSqrtAlbedo=sqrt(max(baseColor.rgb,vec3f(0.0)));
    mmdSkinSssPreparedIrradiance=clamp(
        mmdSkinSssVisibleDiffuse/max(mmdSkinSssSqrtAlbedo,vec3f(0.0001)),
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
const WGSL_PREPASS_ALBEDO_SQRT =
    "fragData[PREPASS_ALBEDO_SQRT_INDEX]=vec4f(sqrt(baseColor.rgb),writeGeometryInfo);";
const WGSL_PREPASS_ALBEDO_SQRT_WITH_SELF_MULTIPLY = `if (mmdSkinSssEnabled>0.5) {
    let mmdSkinSssSelfMultiplyAmount=clamp(mmdSkinSssSelfMultiplyMask*0.20,0.0,0.20);
    let mmdSkinSssSelfMultiplyFactor=mix(
        vec3f(1.0),
        clamp(baseColor.rgb,vec3f(0.0),vec3f(1.0)),
        mmdSkinSssSelfMultiplyAmount
    );
    fragData[PREPASS_ALBEDO_SQRT_INDEX]=vec4f(
        sqrt(max(baseColor.rgb,vec3f(0.0)))*mmdSkinSssSelfMultiplyFactor,
        writeGeometryInfo
    );
} else {
    fragData[PREPASS_ALBEDO_SQRT_INDEX]=vec4f(sqrt(baseColor.rgb),writeGeometryInfo);
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
        if (!patched.includes(WGSL_VISIBLE_DIFFUSE.trim()) && patched.includes(WGSL_FINAL_SPECULAR_MARKER)) {
            patched = patched.replace(
                WGSL_FINAL_SPECULAR_MARKER,
                `${WGSL_VISIBLE_DIFFUSE}\n${WGSL_FINAL_SPECULAR_MARKER}`,
            );
        }
        if (!patched.includes(WGSL_REMOVE_VISIBLE_DIFFUSE.trim()) && patched.includes(WGSL_BEFORE_FOG_MARKER)) {
            patched = patched.replace(
                WGSL_BEFORE_FOG_MARKER,
                `${WGSL_REMOVE_VISIBLE_DIFFUSE}\n${WGSL_BEFORE_FOG_MARKER}`,
            );
        }
        if (
            !patched.includes(WGSL_PREPASS_ALBEDO_SQRT_WITH_SELF_MULTIPLY.trim())
            && patched.includes(WGSL_PREPASS_ALBEDO_SQRT)
        ) {
            patched = patched.replace(
                WGSL_PREPASS_ALBEDO_SQRT,
                WGSL_PREPASS_ALBEDO_SQRT_WITH_SELF_MULTIPLY,
            );
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
                WGSL_REMOVE_VISIBLE_DIFFUSE.trim(),
            )
            && ShaderStore.ShadersStoreWGSL.defaultPixelShader.includes(
                WGSL_PREPASS_ALBEDO_SQRT_WITH_SELF_MULTIPLY.trim(),
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

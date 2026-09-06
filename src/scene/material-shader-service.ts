// eslint-disable-next-line import/no-unresolved
import debugWhiteWgslText from "../../wgsl/toon_debug_white_shadow.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import alphaTextureDebugWgslText from "../../wgsl/alpha_texture_debug.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import fullLightWgslText from "../../wgsl/full_light.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import fullLightAddWgslText from "../../wgsl/full_light_add.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import glossHighlightWgslText from "../../wgsl/gloss_highlight.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import fullShadowWgslText from "../../wgsl/full_shadow.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import selfShadowWgslText from "../../wgsl/self_shadow.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import sssSkinWgslText from "../../wgsl/sss_skin.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import sssStandardWgslText from "../../wgsl/sss_standard.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import matteHighlightWgslText from "../../wgsl/matte_highlight.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import semiMatteHighlightWgslText from "../../wgsl/semi_matte_highlight.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import toonHardShadowWgslText from "../../wgsl/toon_hard_shadow.wgsl?raw";
// eslint-disable-next-line import/no-unresolved
import fallbackAccessoryToonTextureUrl from "../assets/textures/toon/fallback_accessory_toon.bmp?url";
// eslint-disable-next-line import/no-unresolved
import fallbackShadowToonTextureUrl from "../assets/textures/toon/fallback_shadow_toon.bmp?url";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Material } from "@babylonjs/core/Materials/material";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { GetExponentOfTwo } from "@babylonjs/core/Misc/tools.functions";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { ProjectModelMaterialShaderState } from "../types";
import { setOwnedSssProfile } from "../render/owned-sss";
import { OWNED_SSS_LIGHTING } from "../render/owned-sss-shaders";
import {
    DEFAULT_MMD_MATERIAL_PIPELINE_PRESET,
    type MmdMaterialPipelinePreset,
    type PbrMaterialShaderPreset,
} from "../shared/mmd-material-pipeline";
import {
    applyPbrMaterialShaderPreset,
    getPbrMaterialShaderPreset,
} from "../render/pbr-mmd-like-toon-settings";

export type WgslMaterialShaderPresetId =
    | "wgsl-mmd-standard"
    | "wgsl-unlit"
    | "wgsl-soft-lit"
    | "wgsl-autoluminous"
    | "wgsl-debug-white"
    | "wgsl-full-light"
    | "wgsl-full-light-add"
    | "wgsl-full-alpha-test"
    | "wgsl-full-alpha-test-hard"
    | "wgsl-alpha-mask"
    | "wgsl-white-key-cutout"
    | "wgsl-black-key-cutout"
    | "wgsl-full-shadow"
    | "wgsl-self-shadow"
    | "wgsl-sss-standard"
    | "wgsl-sss-skin"
    | "wgsl-owned-sss-skin"
    | "wgsl-owned-sss-wax"
    | "wgsl-light-and-shadow"
    | "wgsl-gloss-highlight"
    | "wgsl-semi-matte-highlight"
    | "wgsl-matte-highlight"
    | "wgsl-specular"
    | "wgsl-ssr-reflective"
    | "wgsl-cel-sharp"
    | "wgsl-cel-shadow-sharp"
    | "wgsl-accessory-toon"
    | "wgsl-obj-untextured"
    | "wgsl-obj-mtl"
    | "wgsl-rim-lift"
    | "wgsl-mono-flat";

type MaterialShaderDefaults = {
    disableLighting: boolean | null;
    specularPower: number | null;
    specularColor: Color3 | null;
    emissiveColor: Color3 | null;
    ambientColor: Color3 | null;
    transparencyMode: number | null;
    alphaCutOff: number | null;
    forceDepthWrite: boolean | null;
    useAlphaFromDiffuseTexture: boolean | null;
    useAlphaFromAlbedoTexture: boolean | null;
    toonTexture: unknown;
    ignoreDiffuseWhenToonTextureIsNull: boolean | null;
};

type MaterialShaderMaterial = Record<string, unknown>;
type MaterialShaderModel = Record<string, unknown>;
type MaterialShaderMesh = Record<string, unknown>;

type MaterialShaderSceneModel = {
    info: { name: string; path: string };
    model: MaterialShaderModel;
    mesh: MaterialShaderMesh;
    materialPipeline?: MmdMaterialPipelinePreset;
    materials: Array<{
        key: string;
        name: string;
        material: MaterialShaderMaterial;
    }>;
};

export type FrameGraphLuminousMaskMaterialState = {
    color: Color3;
    alpha: number;
    texture: Texture | null;
};

type MaterialShaderHostStatics = {
    WGSL_MATERIAL_SHADER_PRESETS?: readonly { id: WgslMaterialShaderPresetId; label: string }[];
    DEFAULT_WGSL_MATERIAL_SHADER_PRESET?: WgslMaterialShaderPresetId;
    externalWgslToonFragmentByMaterial: WeakMap<object, string>;
    presetWgslToonFragmentByMaterial: WeakMap<object, string>;
    skinSssPrePassByMaterial: WeakMap<object, boolean>;
};

type MaterialShaderHost = Record<string, unknown> & {
    constructor: MaterialShaderHostStatics;
    sceneModels: MaterialShaderSceneModel[];
    currentModel: MaterialShaderModel | null;
    materialShaderDefaultsByMaterial: WeakMap<object, MaterialShaderDefaults>;
    materialShaderPresetByMaterial: WeakMap<object, WgslMaterialShaderPresetId>;
    externalWgslToonShaderPathByMaterial: WeakMap<object, string>;
    externalWgslToonShaderPathValue: string | null;
    luminousGlowMorphScaleByModel?: WeakMap<object, { timelineKey: number; revision: number; scale: number }>;
    luminousGlowModelByMesh?: WeakMap<object, object>;
    skinSssPrePassMaterials?: Set<object>;
    defaultRenderingPipeline?: { glowLayerEnabled: boolean; bloomEnabled: boolean; bloomWeight: number; bloomThreshold: number; bloomKernel: number } | null;
    postEffectGlowEnabledValue?: boolean;
    postEffectGlowIntensityValue?: number;
    postEffectGlowKernelValue?: number;
    postEffectBackend?: string;
    requestedPostEffectBackend?: string;
    postEffectBloomEnabledValue?: boolean;
    postEffectBloomWeightValue?: number;
    postEffectBloomThresholdValue?: number;
    postEffectBloomKernelValue?: number;
    depthRenderer?: { getDepthMap?: () => Texture | null } | null;
    scene?: {
        glowLayers?: GlowLayer[];
        getEngine?: () => unknown;
        materials?: MaterialShaderMaterial[];
        subSurfaceConfiguration?: SkinSssConfiguration | null;
        enableSubSurfaceForPrePass?: () => SkinSssConfiguration | null;
    };
    engine: { releaseEffects?: () => void };
    isWebGpuEngine?: () => boolean;
    isMaterialVisible?: (material: MaterialShaderMaterial) => boolean;
    onMaterialShaderStateChanged?: () => void;
    onSkinSssPrePassStateChanged?: () => void;
};

type SkinSssConfiguration = {
    enabled: boolean;
    metersPerUnit: number;
    needsImageProcessing: boolean;
    addDiffusionProfile: (color: Color3) => number;
};

type MaterialShaderEffectLike = {
    setTexture(name: string, texture: unknown): void;
    setFloat(name: string, value: number): void;
    setFloat2(name: string, x: number, y: number): void;
};

type LuminousGlowLayerInternal = LuminousGlowLayer & Record<string, unknown>;

type LuminousGlowLayerAlphaCutOverrideState = {
    hasTransparencyMode: boolean;
    transparencyMode: number | null | undefined;
    hasAlphaCutOff: boolean;
    alphaCutOff: number | null | undefined;
    hasUseAlphaFromDiffuseTexture: boolean;
    useAlphaFromDiffuseTexture: boolean | null | undefined;
    hasUseAlphaFromAlbedoTexture: boolean;
    useAlphaFromAlbedoTexture: boolean | null | undefined;
};

const DEFAULT_WGSL_MATERIAL_SHADER_PRESET = "wgsl-mmd-standard";
const SKIN_SSS_PROFILE_INDEX_TOKEN = "__MMD_SKIN_SSS_PROFILE_INDEX__";
export const WGSL_SKIN_SSS_METERS_PER_UNIT = 0.08;
export const WGSL_SKIN_SSS_DIFFUSION_PROFILE_RGB = [2.4, 0.9, 0.35] as const;
const SKIN_SSS_DIFFUSION_PROFILE = new Color3(...WGSL_SKIN_SSS_DIFFUSION_PROFILE_RGB);
const skinSssProfileByScene = new WeakMap<object, {
    configuration: SkinSssConfiguration;
    index: number;
}>();
const AUTO_LUMINOUS_BASE_LEVEL = 1.28;
const AUTO_LUMINOUS_BRIGHTNESS_BIAS = 0.14;
const AUTO_LUMINOUS_TINT_STRENGTH = 0.72;
const LUMINOUS_GLOW_MIN_SHININESS = 100;
const LUMINOUS_GLOW_AMBIENT_WEIGHT = 1;
const LUMINOUS_GLOW_MAX_COLOR = 2;
const LUMINOUS_GLOW_MAX_SPECULAR_LENGTH = 0.02;
const LUMINOUS_GLOW_OCCLUDER_ALPHA = 1;
const LUMINOUS_GLOW_MAIN_TEXTURE_RATIO = 0.5;
const LUMINOUS_GLOW_MAIN_TEXTURE_SAMPLES = 4;
const LUMINOUS_GLOW_DEPTH_BLUR_SIGMA = 320;
const LUMINOUS_GLOW_HALO_SATURATION = 1.35;
const LUMINOUS_GLOW_HALO_BRIGHTNESS = 1.02;
const LUMINOUS_GLOW_CORE_WHITE_MIX = 0.82;
const LUMINOUS_GLOW_CORE_INTENSITY_RATIO = 0.72;
const LUMINOUS_GLOW_HALO_INTENSITY_RATIO = 1.08;
const LUMINOUS_GLOW_CORE_KERNEL_RATIO = 0.25;
const LUMINOUS_GLOW_AL_MORPH_BLINK_FRAMES = 30;
const LUMINOUS_GLOW_AL_MORPH_MAX_MULTIPLIER = 32;
const LUMINOUS_GLOW_AL_SPECULAR_POWER_SCALE = 1 / 7;
const LUMINOUS_GLOW_AL_LIGHT_UP_E_BASE = 400;
const LUMINOUS_GLOW_HALO_DEPTH_EDGE_STRENGTH = 0.72;
const LUMINOUS_GLOW_CORE_DEPTH_EDGE_STRENGTH = 0.38;
const LUMINOUS_GLOW_DEPTH_EDGE_THRESHOLD_LOW = 0.0008;
const LUMINOUS_GLOW_DEPTH_EDGE_THRESHOLD_HIGH = 0.02;
const LUMINOUS_GLOW_LAYER_ALPHA_CUTOFF = 0.5;
const presetFallbackAccessoryToonTextureByScene = new WeakMap<object, Texture>();
const presetFallbackShadowToonTextureByScene = new WeakMap<object, Texture>();

function ensureLuminousGlowDepthBlurShader(): void {
    const shaderKey = "mmdLuminousGlowDepthBlurFragmentShader";
    if (!Effect.ShadersStore[shaderKey]) {
        Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform sampler2D depthSampler;
                uniform vec2 screenSize;
                uniform vec2 direction;
                uniform float blurWidth;
                uniform float depthSigma;

                float depthWeight(float centerDepth, float sampleDepth) {
                    return exp(-abs(sampleDepth - centerDepth) * depthSigma);
                }

                void main(void) {
                    vec2 texel = 1.0 / max(screenSize, vec2(1.0));
                    vec4 center = texture2D(textureSampler, vUV);
                    float centerDepth = clamp(abs(texture2D(depthSampler, clamp(vUV, vec2(0.001), vec2(0.999))).r), 0.0, 1.0);
                    vec4 accum = center * 0.26;
                    float weightSum = 0.26;

                    for (int i = 1; i <= 4; i++) {
                        float t = float(i) / 4.0;
                        float offsetScale = blurWidth * t;
                        float baseWeight = mix(0.22, 0.06, t);
                        vec2 delta = direction * texel * offsetScale;

                        vec2 uvA = clamp(vUV + delta, vec2(0.001), vec2(0.999));
                        vec2 uvB = clamp(vUV - delta, vec2(0.001), vec2(0.999));
                        float depthA = clamp(abs(texture2D(depthSampler, uvA).r), 0.0, 1.0);
                        float depthB = clamp(abs(texture2D(depthSampler, uvB).r), 0.0, 1.0);
                        float weightA = baseWeight * depthWeight(centerDepth, depthA);
                        float weightB = baseWeight * depthWeight(centerDepth, depthB);

                        accum += texture2D(textureSampler, uvA) * weightA;
                        accum += texture2D(textureSampler, uvB) * weightB;
                        weightSum += weightA + weightB;
                    }

                    gl_FragColor = accum / max(weightSum, 0.0001);
                }
            `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
                varying vUV: vec2f;
                var textureSamplerSampler: sampler;
                var textureSampler: texture_2d<f32>;
                var depthSamplerSampler: sampler;
                var depthSampler: texture_2d<f32>;
                uniform screenSize: vec2f;
                uniform direction: vec2f;
                uniform blurWidth: f32;
                uniform depthSigma: f32;

                fn depthWeight(centerDepth: f32, sampleDepth: f32) -> f32 {
                    return exp(-abs(sampleDepth - centerDepth) * uniforms.depthSigma);
                }

                @fragment
                fn main(input: FragmentInputs) -> FragmentOutputs {
                    let texel = 1.0 / max(uniforms.screenSize, vec2f(1.0));
                    let center = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                    let centerDepth = clamp(abs(textureSampleLevel(depthSampler, depthSamplerSampler, clamp(input.vUV, vec2f(0.001), vec2f(0.999)), 0.0).r), 0.0, 1.0);

                    var accum = center * 0.26;
                    var weightSum = 0.26;

                    for (var i: i32 = 1; i <= 4; i = i + 1) {
                        let t = f32(i) / 4.0;
                        let offsetScale = uniforms.blurWidth * t;
                        let baseWeight = mix(0.22, 0.06, t);
                        let delta = uniforms.direction * texel * offsetScale;

                        let uvA = clamp(input.vUV + delta, vec2f(0.001), vec2f(0.999));
                        let uvB = clamp(input.vUV - delta, vec2f(0.001), vec2f(0.999));
                        let depthA = clamp(abs(textureSampleLevel(depthSampler, depthSamplerSampler, uvA, 0.0).r), 0.0, 1.0);
                        let depthB = clamp(abs(textureSampleLevel(depthSampler, depthSamplerSampler, uvB, 0.0).r), 0.0, 1.0);
                        let weightA = baseWeight * depthWeight(centerDepth, depthA);
                        let weightB = baseWeight * depthWeight(centerDepth, depthB);

                        accum = accum + textureSample(textureSampler, textureSamplerSampler, uvA) * weightA;
                        accum = accum + textureSample(textureSampler, textureSamplerSampler, uvB) * weightB;
                        weightSum = weightSum + weightA + weightB;
                    }

                    fragmentOutputs.color = accum / max(weightSum, 0.0001);
                    return fragmentOutputs;
                }
            `;
    }
}

function ensureLuminousGlowDepthMergeShader(): void {
    const vertexShaderKey = "mmdLuminousGlowMergeVertexShader";
    const fragmentShaderKey = "mmdLuminousGlowMergePixelShader";
    if (!Effect.ShadersStore[vertexShaderKey]) {
        Effect.ShadersStore[vertexShaderKey] = `
                attribute vec2 position;
                varying vec2 vUV;
                const vec2 madd = vec2(0.5, 0.5);
                void main(void) {
                    vUV = position * madd + madd;
                    gl_Position = vec4(position, 0.0, 1.0);
                }
            `;
    }
    if (!ShaderStore.ShadersStoreWGSL[vertexShaderKey]) {
        ShaderStore.ShadersStoreWGSL[vertexShaderKey] = `
                attribute position: vec2f;
                varying vUV: vec2f;
                @vertex
                fn main(input: VertexInputs)->FragmentInputs {
                    let madd: vec2f = vec2f(0.5, 0.5);
                    vertexOutputs.vUV = input.position * madd + madd;
                    vertexOutputs.position = vec4f(input.position, 0.0, 1.0);
                }
            `;
    }
    if (!Effect.ShadersStore[fragmentShaderKey]) {
        Effect.ShadersStore[fragmentShaderKey] = `
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform sampler2D textureSampler2;
                uniform sampler2D depthSampler;
                uniform vec2 screenSize;
                uniform float offset;
                uniform float edgeStrength;
                uniform float edgeThresholdLow;
                uniform float edgeThresholdHigh;

                float readDepth(vec2 uv) {
                    return clamp(abs(texture2D(depthSampler, clamp(uv, vec2(0.001), vec2(0.999))).r), 0.0, 1.0);
                }

                void main(void) {
                    vec4 baseColor = (texture2D(textureSampler, vUV) + texture2D(textureSampler2, vUV)) * offset;
                    vec2 texel = 1.0 / max(screenSize, vec2(1.0));

                    float centerDepth = readDepth(vUV);
                    float edge = 0.0;
                    edge = max(edge, abs(readDepth(vUV + vec2(texel.x, 0.0)) - centerDepth));
                    edge = max(edge, abs(readDepth(vUV - vec2(texel.x, 0.0)) - centerDepth));
                    edge = max(edge, abs(readDepth(vUV + vec2(0.0, texel.y)) - centerDepth));
                    edge = max(edge, abs(readDepth(vUV - vec2(0.0, texel.y)) - centerDepth));

                    float edgeMask = smoothstep(edgeThresholdLow, edgeThresholdHigh, edge);
                    float nearMask = 1.0 - smoothstep(0.92, 1.0, centerDepth);
                    float attenuation = 1.0 - (edgeMask * nearMask * edgeStrength);
                    baseColor.rgb *= clamp(attenuation, 0.0, 1.0);
                    baseColor.a *= clamp(1.0 - edgeMask * edgeStrength * 0.35, 0.0, 1.0);

                    gl_FragColor = baseColor;
                }
            `;
    }
    if (!ShaderStore.ShadersStoreWGSL[fragmentShaderKey]) {
        ShaderStore.ShadersStoreWGSL[fragmentShaderKey] = `
                varying vUV: vec2f;
                var textureSamplerSampler: sampler;
                var textureSampler: texture_2d<f32>;
                var textureSampler2Sampler: sampler;
                var textureSampler2: texture_2d<f32>;
                var depthSamplerSampler: sampler;
                var depthSampler: texture_2d<f32>;
                uniform screenSize: vec2f;
                uniform offset: f32;
                uniform edgeStrength: f32;
                uniform edgeThresholdLow: f32;
                uniform edgeThresholdHigh: f32;

                fn readDepth(uv: vec2f) -> f32 {
                    return clamp(abs(textureSampleLevel(depthSampler, depthSamplerSampler, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0).r), 0.0, 1.0);
                }

                @fragment
                fn main(input: FragmentInputs)->FragmentOutputs {
                    var baseColor = (textureSample(textureSampler, textureSamplerSampler, input.vUV)
                        + textureSample(textureSampler2, textureSampler2Sampler, input.vUV)) * uniforms.offset;
                    let texel = 1.0 / max(uniforms.screenSize, vec2f(1.0));

                    let centerDepth = readDepth(input.vUV);
                    var edge = 0.0;
                    edge = max(edge, abs(readDepth(input.vUV + vec2f(texel.x, 0.0)) - centerDepth));
                    edge = max(edge, abs(readDepth(input.vUV - vec2f(texel.x, 0.0)) - centerDepth));
                    edge = max(edge, abs(readDepth(input.vUV + vec2f(0.0, texel.y)) - centerDepth));
                    edge = max(edge, abs(readDepth(input.vUV - vec2f(0.0, texel.y)) - centerDepth));

                    let edgeMask = smoothstep(uniforms.edgeThresholdLow, uniforms.edgeThresholdHigh, edge);
                    let nearMask = 1.0 - smoothstep(0.92, 1.0, centerDepth);
                    let attenuation = clamp(1.0 - (edgeMask * nearMask * uniforms.edgeStrength), 0.0, 1.0);
                    baseColor = vec4f(
                        baseColor.rgb * attenuation,
                        baseColor.a * clamp(1.0 - edgeMask * uniforms.edgeStrength * 0.35, 0.0, 1.0),
                    );

                    fragmentOutputs.color = baseColor;
                    return fragmentOutputs;
                }
            `;
    }
}

class LuminousGlowLayer extends GlowLayer {
    public readonly mmdLuminousGlowLayer = true;
    private readonly mmdGlowHost: MaterialShaderHost;
    private readonly mmdDepthEdgeStrength: number;
    private static constructingHost: MaterialShaderHost | null = null;
    private static constructingDepthEdgeStrength = 0;

    public constructor(
        host: MaterialShaderHost,
        name: string,
        scene: ConstructorParameters<typeof GlowLayer>[1],
        options?: ConstructorParameters<typeof GlowLayer>[2] & { mmdDepthEdgeStrength?: unknown },
    ) {
        LuminousGlowLayer.constructingHost = host;
        LuminousGlowLayer.constructingDepthEdgeStrength = Number(options?.mmdDepthEdgeStrength ?? 0);
        super(name, scene, options);
        this.mmdGlowHost = host;
        this.mmdDepthEdgeStrength = LuminousGlowLayer.constructingDepthEdgeStrength;
        LuminousGlowLayer.constructingHost = null;
        LuminousGlowLayer.constructingDepthEdgeStrength = 0;
    }

    protected override _createMergeEffect(): unknown {
        ensureLuminousGlowDepthMergeShader();
        const self = this as LuminousGlowLayerInternal;
        let defines = "#define EMISSIVE\n";
        if (self._options?.ldrMerge) {
            defines += "#define LDR\n";
        }
        return self._engine.createEffect(
            "mmdLuminousGlowMerge",
            [VertexBuffer.PositionKind],
            ["offset", "screenSize", "edgeStrength", "edgeThresholdLow", "edgeThresholdHigh"],
            ["textureSampler", "textureSampler2", "depthSampler"],
            defines,
            undefined,
            undefined,
            undefined,
            undefined,
            this.shaderLanguage,
        );
    }

    protected override _canRenderMesh(): boolean {
        // Let alpha-blended meshes participate so they can occlude hidden luminous parts.
        return true;
    }

    protected override _renderSubMesh(subMesh: SubMesh, enableAlphaMode = false): void {
        const material = subMesh.getMaterial();
        const restoreAlphaCutOverride = beginLuminousGlowLayerAlphaCutOverride(this.mmdGlowHost, material);
        try {
            super._renderSubMesh(subMesh, enableAlphaMode);
        } finally {
            restoreAlphaCutOverride?.();
        }
    }

    protected override _createTextureAndPostProcesses(): void {
        ensureLuminousGlowDepthBlurShader();
        ensureLuminousGlowDepthMergeShader();

        const self = this as LuminousGlowLayerInternal;
        const host = this.mmdGlowHost ?? LuminousGlowLayer.constructingHost;
        self._thinEffectLayer._renderPassId = self._mainTexture.renderPassId;

        let blurTextureWidth = self._mainTextureDesiredSize.width;
        let blurTextureHeight = self._mainTextureDesiredSize.height;
        blurTextureWidth = self._engine.needPOTTextures ? GetExponentOfTwo(blurTextureWidth, self._maxSize) : blurTextureWidth;
        blurTextureHeight = self._engine.needPOTTextures ? GetExponentOfTwo(blurTextureHeight, self._maxSize) : blurTextureHeight;

        const textureType = self._engine.getCaps().textureHalfFloatRender ? 2 : 0;
        self._blurTexture1 = new RenderTargetTexture("GlowLayerBlurRTT", {
            width: blurTextureWidth,
            height: blurTextureHeight,
        }, self._scene, false, true, textureType);
        self._blurTexture1.wrapU = Texture.CLAMP_ADDRESSMODE;
        self._blurTexture1.wrapV = Texture.CLAMP_ADDRESSMODE;
        self._blurTexture1.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
        self._blurTexture1.renderParticles = false;
        self._blurTexture1.ignoreCameraViewport = true;

        const blurTextureWidth2 = Math.max(1, Math.floor(blurTextureWidth / 2));
        const blurTextureHeight2 = Math.max(1, Math.floor(blurTextureHeight / 2));
        self._blurTexture2 = new RenderTargetTexture("GlowLayerBlurRTT2", {
            width: blurTextureWidth2,
            height: blurTextureHeight2,
        }, self._scene, false, true, textureType);
        self._blurTexture2.wrapU = Texture.CLAMP_ADDRESSMODE;
        self._blurTexture2.wrapV = Texture.CLAMP_ADDRESSMODE;
        self._blurTexture2.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
        self._blurTexture2.renderParticles = false;
        self._blurTexture2.ignoreCameraViewport = true;

        self._textures = [self._blurTexture1, self._blurTexture2];
        self._thinEffectLayer.bindTexturesForCompose = (effect: MaterialShaderEffectLike) => {
            const depthMap = host?.depthRenderer?.getDepthMap?.();
            effect.setTexture("textureSampler", self._blurTexture1);
            effect.setTexture("textureSampler2", self._blurTexture2);
            effect.setTexture("depthSampler", depthMap ?? self._mainTexture);
            effect.setFloat("offset", this.intensity);
            effect.setFloat2("screenSize", self._engine.getRenderWidth(), self._engine.getRenderHeight());
            effect.setFloat("edgeStrength", depthMap ? this.mmdDepthEdgeStrength : 0);
            effect.setFloat("edgeThresholdLow", LUMINOUS_GLOW_DEPTH_EDGE_THRESHOLD_LOW);
            effect.setFloat("edgeThresholdHigh", LUMINOUS_GLOW_DEPTH_EDGE_THRESHOLD_HIGH);
        };

        const createDepthAwareBlur = (name: string, width: number, height: number, directionX: number, directionY: number): PostProcess => {
            const postProcess = new PostProcess(
                name,
                "mmdLuminousGlowDepthBlur",
                {
                    uniforms: ["screenSize", "direction", "blurWidth", "depthSigma"],
                    samplers: ["depthSampler"],
                    width,
                    height,
                    samplingMode: Texture.BILINEAR_SAMPLINGMODE,
                    engine: self._scene.getEngine(),
                    reusable: false,
                    shaderLanguage: self.shaderLanguage,
                },
            );
            postProcess.autoClear = false;
            postProcess.onApplyObservable.add((effect: MaterialShaderEffectLike) => {
                const depthMap = host?.depthRenderer?.getDepthMap?.();
                effect.setTexture("depthSampler", depthMap ?? self._mainTexture);
                effect.setFloat2("screenSize", width, height);
                effect.setFloat2("direction", directionX, directionY);
                effect.setFloat("blurWidth", this.blurKernelSize * 0.5);
                effect.setFloat("depthSigma", LUMINOUS_GLOW_DEPTH_BLUR_SIGMA);
            });
            return postProcess;
        };

        self._horizontalBlurPostprocess1 = createDepthAwareBlur("GlowLayerDepthBlurH1", blurTextureWidth, blurTextureHeight, 1, 0);
        self._verticalBlurPostprocess1 = createDepthAwareBlur("GlowLayerDepthBlurV1", blurTextureWidth, blurTextureHeight, 0, 1);
        self._horizontalBlurPostprocess2 = createDepthAwareBlur("GlowLayerDepthBlurH2", blurTextureWidth2, blurTextureHeight2, 1, 0);
        self._verticalBlurPostprocess2 = createDepthAwareBlur("GlowLayerDepthBlurV2", blurTextureWidth2, blurTextureHeight2, 0, 1);
        self._horizontalBlurPostprocess1.externalTextureSamplerBinding = true;
        self._horizontalBlurPostprocess1.onApplyObservable.add((effect: MaterialShaderEffectLike) => {
            effect.setTexture("textureSampler", self._mainTexture);
        });
        self._horizontalBlurPostprocess2.externalTextureSamplerBinding = true;
        self._horizontalBlurPostprocess2.onApplyObservable.add((effect: MaterialShaderEffectLike) => {
            effect.setTexture("textureSampler", self._blurTexture1);
        });
        self._postProcesses = [
            self._horizontalBlurPostprocess1,
            self._verticalBlurPostprocess1,
            self._horizontalBlurPostprocess2,
            self._verticalBlurPostprocess2,
        ];
        self._postProcesses1 = [self._horizontalBlurPostprocess1, self._verticalBlurPostprocess1];
        self._postProcesses2 = [self._horizontalBlurPostprocess2, self._verticalBlurPostprocess2];
        self._mainTexture.samples = self._options.mainTextureSamples;
        self._mainTexture.onAfterUnbindObservable.add(() => {
            const depthMap = host?.depthRenderer?.getDepthMap?.();
            const internalTexture = self._blurTexture1.renderTarget;
            if (internalTexture) {
                if (!depthMap) {
                    return;
                }
                self._scene.postProcessManager.directRender(self._postProcesses1, internalTexture, true);
                const internalTexture2 = self._blurTexture2.renderTarget;
                if (internalTexture2) {
                    self._scene.postProcessManager.directRender(self._postProcesses2, internalTexture2, true);
                }
                self._engine.unBindFramebuffer(internalTexture2 ?? internalTexture, true);
            }
        });
        self._mainTextureCreatedSize.width = self._mainTextureDesiredSize.width;
        self._mainTextureCreatedSize.height = self._mainTextureDesiredSize.height;
    }
}

function getPresetCatalog(host: MaterialShaderHost): readonly { id: WgslMaterialShaderPresetId; label: string }[] {
    return host.constructor.WGSL_MATERIAL_SHADER_PRESETS ?? [];
}

function getDefaultPreset(host: MaterialShaderHost): WgslMaterialShaderPresetId {
    return host.constructor.DEFAULT_WGSL_MATERIAL_SHADER_PRESET ?? DEFAULT_WGSL_MATERIAL_SHADER_PRESET;
}

function getMaterialKey(material: MaterialShaderMaterial): object | null {
    return material && typeof material === "object" ? (material as object) : null;
}

function cloneColor3OrNull(value: unknown): Color3 | null {
    if (!value || typeof value !== "object") return null;
    const r = Number(value.r);
    const g = Number(value.g);
    const b = Number(value.b);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    return new Color3(r, g, b);
}

function readMaterialColor(material: MaterialShaderMaterial, propertyNames: readonly string[]): Color3 | null {
    if (!material || typeof material !== "object") return null;
    for (const propertyName of propertyNames) {
        const color = cloneColor3OrNull(material[propertyName]);
        if (color) {
            return color;
        }
    }
    return null;
}

function readMaterialTexture(material: MaterialShaderMaterial, propertyNames: readonly string[]): Texture | null {
    if (!material || typeof material !== "object") return null;
    for (const propertyName of propertyNames) {
        const texture = material[propertyName];
        if (texture && typeof texture === "object") {
            return texture as Texture;
        }
    }
    return null;
}

function computeColorLuminance(color: Color3 | null): number {
    if (!color) return 0;
    return Math.max(0, color.r * 0.299 + color.g * 0.587 + color.b * 0.114);
}

function computeColorLength(color: Color3 | null): number {
    if (!color) return 0;
    return Math.sqrt(color.r * color.r + color.g * color.g + color.b * color.b);
}

function scaleColor(color: Color3, factor: number): Color3 {
    return new Color3(
        Math.max(0, color.r * factor),
        Math.max(0, color.g * factor),
        Math.max(0, color.b * factor),
    );
}

function saturateColor(color: Color3, amount: number): Color3 {
    const luma = computeColorLuminance(color);
    return new Color3(
        Math.max(0, luma + (color.r - luma) * amount),
        Math.max(0, luma + (color.g - luma) * amount),
        Math.max(0, luma + (color.b - luma) * amount),
    );
}

function mixColorTowardValue(color: Color3, target: number, amount: number): Color3 {
    return new Color3(
        Math.max(0, color.r + (target - color.r) * amount),
        Math.max(0, color.g + (target - color.g) * amount),
        Math.max(0, color.b + (target - color.b) * amount),
    );
}

function clampUnit(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function lerpNumber(from: number, to: number, amount: number): number {
    return from + (to - from) * clampUnit(amount);
}

function createLuminousGlowOccluderState(texture: Texture | null): {
    coreColor: Color3;
    haloColor: Color3;
    alpha: number;
    texture: Texture | null;
    luminous: boolean;
} {
    return {
        coreColor: Color3.Black(),
        haloColor: Color3.Black(),
        alpha: LUMINOUS_GLOW_OCCLUDER_ALPHA,
        texture,
        luminous: false,
    };
}

function getLuminousGlowMorphWeight(model: MaterialShaderModel, morphName: string): number {
    const modelMorph = model?.morph;
    if (!modelMorph || typeof morphName !== "string" || morphName.length === 0) {
        return 0;
    }
    try {
        return clampUnit(Number(modelMorph.getMorphWeight(morphName)));
    } catch {
        return 0;
    }
}

function getLuminousGlowMorphTimelineKey(host: MaterialShaderHost): number {
    const runtimeFrame = Number(host?.mmdRuntime?.currentFrameTime);
    if (Number.isFinite(runtimeFrame)) {
        return runtimeFrame;
    }
    const currentFrame = Number(host?.currentFrame);
    if (Number.isFinite(currentFrame)) {
        return currentFrame;
    }
    return 0;
}

function getLuminousGlowMorphRevision(host: MaterialShaderHost): number {
    const revision = Number(host?.luminousGlowMorphRevision);
    if (!Number.isFinite(revision)) {
        return 0;
    }
    return revision;
}

function getLuminousGlowMorphScaleForModel(host: MaterialShaderHost, model: MaterialShaderModel): number {
    if (!model || typeof model !== "object") {
        return 1;
    }

    const cache = host.luminousGlowMorphScaleByModel as WeakMap<object, {
        timelineKey: number;
        revision: number;
        scale: number;
    }> | undefined;
    const resolvedCache = cache ?? new WeakMap<object, { timelineKey: number; revision: number; scale: number }>();
    if (!cache) {
        host.luminousGlowMorphScaleByModel = resolvedCache;
    }

    const timelineKey = getLuminousGlowMorphTimelineKey(host);
    const revision = getLuminousGlowMorphRevision(host);
    const modelKey = model as object;
    const cached = resolvedCache.get(modelKey);
    if (cached && cached.timelineKey === timelineKey && cached.revision === revision) {
        return cached.scale;
    }

    const lightOff = getLuminousGlowMorphWeight(model, "LightOff");
    const lightUp = getLuminousGlowMorphWeight(model, "LightUp");
    const lightUpE = getLuminousGlowMorphWeight(model, "LightUpE");
    const lightBlink = getLuminousGlowMorphWeight(model, "LightBlink");
    const lightBS = getLuminousGlowMorphWeight(model, "LightBS");
    const lightDuty = getLuminousGlowMorphWeight(model, "LightDuty");
    const lightMin = getLuminousGlowMorphWeight(model, "LightMin");
    const clockUp = getLuminousGlowMorphWeight(model, "LClockUp");
    const clockDown = getLuminousGlowMorphWeight(model, "LClockDown");

    let scale = 1;
    scale *= 1 + lightUp * 2;
    scale *= Math.pow(LUMINOUS_GLOW_AL_LIGHT_UP_E_BASE, lightUpE);
    scale *= 1 - lightOff;

    const clockShift = (1 + clockDown * 5) / (1 + clockUp * 5);
    const blinkPeriodFrames = Math.max(1, LUMINOUS_GLOW_AL_MORPH_BLINK_FRAMES * clockShift);
    const normalizedFrame = timelineKey / blinkPeriodFrames;
    const blinkPhase = normalizedFrame - Math.floor(normalizedFrame);
    const blinkFloor = clampUnit(lightMin);
    const duty = lightDuty <= 1e-6 ? 0.5 : Math.max(0.05, Math.min(0.95, lightDuty));
    const easedDutyPhase = Math.min(1, blinkPhase / Math.max(1e-4, duty * 2));
    const sineWave = blinkFloor + (1 - blinkFloor) * ((1 - Math.cos(easedDutyPhase * Math.PI * 2)) * 0.5);
    const squareWave = blinkFloor + (1 - blinkFloor) * (blinkPhase < duty ? 1 : 0);

    if (lightBlink > 1e-6) {
        scale *= lerpNumber(1, sineWave, lightBlink);
    }
    if (lightBS > 1e-6) {
        scale *= lerpNumber(1, squareWave, lightBS);
    }

    scale = Math.max(0, Math.min(LUMINOUS_GLOW_AL_MORPH_MAX_MULTIPLIER, scale));
    resolvedCache.set(modelKey, { timelineKey, revision, scale });
    return scale;
}

function getLuminousGlowMorphScaleForMesh(host: MaterialShaderHost, mesh: MaterialShaderMesh): number {
    if (!mesh || typeof mesh !== "object") {
        return 1;
    }

    const cachedModelByMesh = host.luminousGlowModelByMesh as WeakMap<object, object> | undefined;
    const resolvedModelByMesh = cachedModelByMesh ?? new WeakMap<object, object>();
    if (!cachedModelByMesh) {
        host.luminousGlowModelByMesh = resolvedModelByMesh;
    }

    const meshKey = mesh as object;
    const cachedModel = resolvedModelByMesh.get(meshKey);
    if (cachedModel) {
        return getLuminousGlowMorphScaleForModel(host, cachedModel);
    }

    let rootMesh = mesh;
    while (rootMesh?.parent) {
        rootMesh = rootMesh.parent;
    }

    for (const sceneModel of host.sceneModels ?? []) {
        if (sceneModel?.mesh === mesh || sceneModel?.mesh === rootMesh) {
            resolvedModelByMesh.set(meshKey, sceneModel.model as object);
            return getLuminousGlowMorphScaleForModel(host, sceneModel.model);
        }
    }

    return 1;
}

export function getFrameGraphLuminousMaskMaterialState(
    host: MaterialShaderHost,
    mesh: MaterialShaderMesh,
    material: MaterialShaderMaterial,
): FrameGraphLuminousMaskMaterialState | null {
    const glowState = getLuminousGlowMaterialState(host, material, { allowManualHeuristic: false });
    if (!glowState) {
        return null;
    }
    if (!glowState.luminous) {
        return {
            color: Color3.Black(),
            alpha: glowState.alpha,
            texture: null,
        };
    }

    const morphScale = getLuminousGlowMorphScaleForMesh(host, mesh);
    if (morphScale <= 1e-4) {
        return null;
    }

    const haloColor = scaleColor(glowState.haloColor, morphScale);
    const coreColor = scaleColor(glowState.coreColor, morphScale);
    const color = new Color3(
        Math.max(haloColor.r, coreColor.r * 0.78),
        Math.max(haloColor.g, coreColor.g * 0.78),
        Math.max(haloColor.b, coreColor.b * 0.78),
    );

    return {
        color: scaleColor(color, 1.6),
        alpha: glowState.alpha,
        texture: glowState.texture,
    };
}

function getMaterialDisplayNames(host: MaterialShaderHost, material: MaterialShaderMaterial): string[] {
    const names: string[] = [];
    if (typeof material.name === "string" && material.name.length > 0) {
        names.push(material.name);
    }
    if (typeof material.id === "string" && material.id.length > 0) {
        names.push(material.id);
    }

    for (const entry of host.sceneModels ?? []) {
        const materialEntry = entry.materials?.find((candidate) => candidate.material === material);
        if (!materialEntry) {
            continue;
        }
        if (typeof materialEntry.name === "string" && materialEntry.name.length > 0) {
            names.push(materialEntry.name);
        }
        if (typeof materialEntry.key === "string" && materialEntry.key.length > 0) {
            names.push(materialEntry.key);
        }
        break;
    }

    return [...new Set(names)];
}

function hasAutoLuminousMaterialName(host: MaterialShaderHost, material: MaterialShaderMaterial): boolean {
    for (const rawName of getMaterialDisplayNames(host, material)) {
        const name = rawName.trim();
        const lowerName = name.toLowerCase();
        if (lowerName.length === 0 || lowerName.includes("highlight")) {
            continue;
        }
        if (lowerName.includes("autoluminous") || lowerName.includes("auto_luminous") || lowerName.includes("auto-luminous")) {
            return true;
        }
        if (/(^|[^a-z0-9])al($|[^a-z0-9])/i.test(name)) {
            return true;
        }
        if (/(^|[^a-z0-9])(light|lamp|neon|glow|luminous|emissive|emit|led)($|[^a-z0-9])/i.test(name)) {
            return true;
        }
        if (name.includes("発光") || name.includes("ライト") || name.includes("ランプ") || name.includes("ネオン")) {
            return true;
        }
    }
    return false;
}

function isLuminousGlowPresetMaterial(host: MaterialShaderHost, material: MaterialShaderMaterial): boolean {
    if (!material || typeof material !== "object") {
        return false;
    }
    return getWgslMaterialShaderPresetForMaterial(host, material) === "wgsl-autoluminous"
        || hasAutoLuminousMaterialName(host, material);
}

function getLuminousGlowMaterialState(host: MaterialShaderHost, material: MaterialShaderMaterial, options?: {
    allowManualHeuristic?: boolean;
}): {
    coreColor: Color3;
    haloColor: Color3;
    alpha: number;
    texture: Texture | null;
    luminous: boolean;
} | null {
    if (!material || typeof material !== "object") return null;
    if (host.isMaterialVisible?.(material) === false) {
        return null;
    }

    const defaults = ensureMaterialShaderDefaults(host, material);
    const currentShininess = Number(material.specularPower);
    const defaultShininess = Number(defaults.specularPower);
    const shininess = Number.isFinite(currentShininess) && Number.isFinite(defaultShininess)
        ? Math.max(currentShininess, defaultShininess)
        : (Number.isFinite(currentShininess) ? currentShininess : defaultShininess);
    const texture = readMaterialTexture(material, ["diffuseTexture", "albedoTexture"]);
    const baseAlpha = Number.isFinite(Number(material.alpha))
        ? Math.max(0, Math.min(1, Number(material.alpha)))
        : 1;
    const manualGlow = Boolean(host.postEffectGlowEnabledValue) && Number(host.postEffectGlowIntensityValue) > 1e-6;
    const presetLuminous = isLuminousGlowPresetMaterial(host, material);
    const allowHeuristicGlow = options?.allowManualHeuristic ?? manualGlow;
    const specularColor = readMaterialColor(material, ["specularColor", "reflectivityColor"]);
    const specularLength = computeColorLength(specularColor);
    if (!presetLuminous && !allowHeuristicGlow) {
        return createLuminousGlowOccluderState(texture);
    }
    if (!presetLuminous && (!Number.isFinite(shininess) || shininess < LUMINOUS_GLOW_MIN_SHININESS)) {
        return createLuminousGlowOccluderState(texture);
    }
    if (!presetLuminous && specularLength > LUMINOUS_GLOW_MAX_SPECULAR_LENGTH) {
        return createLuminousGlowOccluderState(texture);
    }

    const preserveChroma = material.mmdLuminousPreserveChroma === true;
    const diffuseColor = readMaterialColor(material, ["diffuseColor", "albedoColor", "baseColor"]) ?? Color3.Black();
    const ambientColor = readMaterialColor(material, ["ambientColor"]) ?? Color3.Black();
    const emissiveColor = readMaterialColor(material, ["emissiveColor"]) ?? Color3.Black();
    const combined = new Color3(
        Math.min(LUMINOUS_GLOW_MAX_COLOR, Math.max(0, preserveChroma
            ? emissiveColor.r
            : diffuseColor.r + ambientColor.r * LUMINOUS_GLOW_AMBIENT_WEIGHT)),
        Math.min(LUMINOUS_GLOW_MAX_COLOR, Math.max(0, preserveChroma
            ? emissiveColor.g
            : diffuseColor.g + ambientColor.g * LUMINOUS_GLOW_AMBIENT_WEIGHT)),
        Math.min(LUMINOUS_GLOW_MAX_COLOR, Math.max(0, preserveChroma
            ? emissiveColor.b
            : diffuseColor.b + ambientColor.b * LUMINOUS_GLOW_AMBIENT_WEIGHT)),
    );
    const maxChannel = Math.max(combined.r, combined.g, combined.b);
    if (maxChannel <= 1e-4) {
        return createLuminousGlowOccluderState(texture);
    }

    const strength = presetLuminous
        ? 1.25
        : Math.min(16, Math.max(0.5, (shininess - LUMINOUS_GLOW_MIN_SHININESS) * LUMINOUS_GLOW_AL_SPECULAR_POWER_SCALE));
    const luminousColor = new Color3(
        combined.r * strength,
        combined.g * strength,
        combined.b * strength,
    );
    const luminousPeak = Math.max(luminousColor.r, luminousColor.g, luminousColor.b);
    const haloColor = saturateColor(
        scaleColor(luminousColor, LUMINOUS_GLOW_HALO_BRIGHTNESS),
        LUMINOUS_GLOW_HALO_SATURATION,
    );
    const coreColor = mixColorTowardValue(
        scaleColor(luminousColor, 1.08),
        luminousPeak * 1.1,
        preserveChroma ? 0 : LUMINOUS_GLOW_CORE_WHITE_MIX,
    );

    return {
        coreColor,
        haloColor,
        alpha: Math.max(0.05, baseAlpha),
        texture,
        luminous: true,
    };
}

function disposeManagedLuminousGlowLayer(host: MaterialShaderHost): void {
    if (host.luminousGlowLayer) {
        host.luminousGlowLayer.dispose();
        host.luminousGlowLayer = null;
    }
    if (host.luminousGlowCoreLayer) {
        host.luminousGlowCoreLayer.dispose();
        host.luminousGlowCoreLayer = null;
    }
}

function getManagedLuminousGlowKernel(baseKernel: number, kind: "core" | "halo"): number {
    if (kind === "core") {
        return Math.max(4, Math.round(baseKernel * LUMINOUS_GLOW_CORE_KERNEL_RATIO));
    }
    return baseKernel;
}

function getManagedLuminousGlowIntensity(baseIntensity: number, kind: "core" | "halo"): number {
    if (kind === "core") {
        return baseIntensity * LUMINOUS_GLOW_CORE_INTENSITY_RATIO;
    }
    return baseIntensity * LUMINOUS_GLOW_HALO_INTENSITY_RATIO;
}

function getManagedLuminousGlowDepthEdgeStrength(kind: "core" | "halo"): number {
    if (kind === "core") {
        return LUMINOUS_GLOW_CORE_DEPTH_EDGE_STRENGTH;
    }
    return LUMINOUS_GLOW_HALO_DEPTH_EDGE_STRENGTH;
}

function ensureManagedLuminousGlowLayer(host: MaterialShaderHost, kind: "core" | "halo"): GlowLayer | null {
    const propertyName = kind === "core" ? "luminousGlowCoreLayer" : "luminousGlowLayer";
    const layerName = kind === "core" ? "luminousGlowCore" : "luminousGlow";
    const existingLayer = host[propertyName];
    if (existingLayer) {
        if ((existingLayer as LuminousGlowLayer | GlowLayer).mmdLuminousGlowLayer === true) {
            return existingLayer as GlowLayer;
        }
        existingLayer.dispose();
        host[propertyName] = null;
    }
    if (!host.scene) {
        return null;
    }
    if (!host.depthRenderer) {
        host.configureDofDepthRenderer?.();
    }

    const glowLayer = new LuminousGlowLayer(host, layerName, host.scene, {
        mainTextureRatio: LUMINOUS_GLOW_MAIN_TEXTURE_RATIO,
        mainTextureSamples: LUMINOUS_GLOW_MAIN_TEXTURE_SAMPLES,
        blurKernelSize: getManagedLuminousGlowKernel(
            host.postEffectGlowKernelValue ?? GlowLayer.DefaultBlurKernelSize,
            kind,
        ),
        mmdDepthEdgeStrength: getManagedLuminousGlowDepthEdgeStrength(kind),
    });
    host[propertyName] = glowLayer;
    return glowLayer;
}

function setMaterialColorProperty(material: MaterialShaderMaterial, propertyName: string, color: Color3): void {
    if (!material || typeof material !== "object") return;

    const current = material[propertyName];
    if (current && typeof current.set === "function") {
        current.set(color.r, color.g, color.b);
        return;
    }

    material[propertyName] = new Color3(color.r, color.g, color.b);
}

function applyAlphaCutoutPreset(material: MaterialShaderMaterial, alphaCutOff: number): void {
    const hasAlphaTexture = hasActualAlphaTextureSource(material);
    if (!hasAlphaTexture) {
        return;
    }
    if ("alphaCutOff" in material) {
        material.alphaCutOff = alphaCutOff;
    }
    if ("forceDepthWrite" in material) {
        material.forceDepthWrite = false;
    }
    if ("transparencyMode" in material) {
        material.transparencyMode = Material.MATERIAL_ALPHATEST;
    }
}

function applyAlphaBlendCutoutPreset(material: MaterialShaderMaterial): void {
    const hasAlphaTexture = hasActualAlphaTextureSource(material);
    if (!hasAlphaTexture) {
        const materialName = typeof material?.name === "string" ? material.name : "material";
        console.warn(`[MaterialShader] Alpha Mask skipped for ${materialName}: source texture has no alpha channel.`);
        return;
    }
    if ("disableLighting" in material) {
        material.disableLighting = false;
    }
    if ("specularPower" in material) {
        material.specularPower = 0;
    }
    enableAlphaTextureFlags(material);
    if ("forceDepthWrite" in material) {
        material.forceDepthWrite = false;
    }
    if ("transparencyMode" in material) {
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    }
}

function enableAlphaTextureFlags(material: MaterialShaderMaterial): void {
    const diffuseTextureHasAlpha = Boolean(material.diffuseTexture?.hasAlpha);
    if ("useAlphaFromDiffuseTexture" in material && diffuseTextureHasAlpha) {
        material.useAlphaFromDiffuseTexture = true;
    }

    const albedoTextureHasAlpha = Boolean(material.albedoTexture?.hasAlpha);
    if ("useAlphaFromAlbedoTexture" in material && albedoTextureHasAlpha) {
        material.useAlphaFromAlbedoTexture = true;
    }
}

function hasActualAlphaTextureSource(material: MaterialShaderMaterial): boolean {
    return Boolean(material?.diffuseTexture?.hasAlpha)
        || Boolean(material?.albedoTexture?.hasAlpha)
        || Boolean(material?.opacityTexture);
}

function beginLuminousGlowLayerAlphaCutOverride(host: MaterialShaderHost, material: MaterialShaderMaterial): (() => void) | null {
    if (!material || typeof material !== "object") {
        return null;
    }
    if (!hasActualAlphaTextureSource(material)) {
        return null;
    }

    const glowState = getLuminousGlowMaterialState(host, material);
    if (!glowState || glowState.luminous) {
        return null;
    }

    const state: LuminousGlowLayerAlphaCutOverrideState = {
        hasTransparencyMode: "transparencyMode" in material,
        transparencyMode: "transparencyMode" in material && typeof material.transparencyMode === "number"
            ? material.transparencyMode
            : undefined,
        hasAlphaCutOff: "alphaCutOff" in material,
        alphaCutOff: "alphaCutOff" in material && Number.isFinite(Number(material.alphaCutOff))
            ? Number(material.alphaCutOff)
            : undefined,
        hasUseAlphaFromDiffuseTexture: "useAlphaFromDiffuseTexture" in material,
        useAlphaFromDiffuseTexture: "useAlphaFromDiffuseTexture" in material
            ? Boolean(material.useAlphaFromDiffuseTexture)
            : undefined,
        hasUseAlphaFromAlbedoTexture: "useAlphaFromAlbedoTexture" in material,
        useAlphaFromAlbedoTexture: "useAlphaFromAlbedoTexture" in material
            ? Boolean(material.useAlphaFromAlbedoTexture)
            : undefined,
    };

    if ("useAlphaFromDiffuseTexture" in material) {
        material.useAlphaFromDiffuseTexture = false;
    }
    if ("useAlphaFromAlbedoTexture" in material) {
        material.useAlphaFromAlbedoTexture = false;
    }
    if ("alphaCutOff" in material) {
        const currentAlphaCutOff = Number.isFinite(Number(material.alphaCutOff))
            ? Number(material.alphaCutOff)
            : 0;
        material.alphaCutOff = Math.max(currentAlphaCutOff, LUMINOUS_GLOW_LAYER_ALPHA_CUTOFF);
    }
    if ("transparencyMode" in material) {
        material.transparencyMode = Material.MATERIAL_ALPHATEST;
    }

    return () => {
        if (!material || typeof material !== "object") {
            return;
        }
        if (state.hasTransparencyMode && "transparencyMode" in material) {
            material.transparencyMode = state.transparencyMode;
        }
        if (state.hasAlphaCutOff && "alphaCutOff" in material) {
            material.alphaCutOff = state.alphaCutOff;
        }
        if (state.hasUseAlphaFromDiffuseTexture && "useAlphaFromDiffuseTexture" in material) {
            material.useAlphaFromDiffuseTexture = state.useAlphaFromDiffuseTexture;
        }
        if (state.hasUseAlphaFromAlbedoTexture && "useAlphaFromAlbedoTexture" in material) {
            material.useAlphaFromAlbedoTexture = state.useAlphaFromAlbedoTexture;
        }
    };
}

function markMaterialShaderDirty(material: MaterialShaderMaterial): void {
    if (!material || typeof material !== "object") return;

    if (typeof material.markAsDirty === "function") {
        try {
            material.markAsDirty(Material.AllDirtyFlag);
            return;
        } catch {
            try {
                material.markAsDirty();
                return;
            } catch {
                // ignore
            }
        }
    }

    if (typeof material._markAllSubMeshesAsTexturesDirty === "function") {
        material._markAllSubMeshesAsTexturesDirty();
    }
}

function setPresetWgslToonFragmentForMaterial(host: MaterialShaderHost, material: MaterialShaderMaterial, source: string | null): void {
    const key = getMaterialKey(material);
    if (!key) return;

    if (typeof source === "string" && source.length > 0) {
        host.constructor.presetWgslToonFragmentByMaterial.set(key, source);
        return;
    }

    host.constructor.presetWgslToonFragmentByMaterial.delete(key);
}

function isPbrScreenSpaceScatteringMaterial(material: MaterialShaderMaterial): boolean {
    const subSurface = material.subSurface;
    return Boolean(
        subSurface
        && typeof subSurface === "object"
        && (subSurface as { isScatteringEnabled?: boolean }).isScatteringEnabled === true,
    );
}

function hasSkinSssPreset(host: MaterialShaderHost): boolean {
    const sceneMaterials = host.scene?.materials;
    const trackedMaterials = host.sceneModels.flatMap(
        (entry) => entry.materials.map(({ material }) => material),
    );
    const materials = trackedMaterials.length > 0 ? trackedMaterials : sceneMaterials ?? [];
    return materials.some((material) => (
        host.materialShaderPresetByMaterial.get(material as object) === "wgsl-sss-skin"
        && host.isMaterialVisible?.(material) !== false
    ));
}

function syncSkinSssMaterialFlags(host: MaterialShaderHost): void {
    const sceneMaterials = host.scene?.materials;
    const trackedMaterials = host.sceneModels.flatMap(
        (entry) => entry.materials.map(({ material }) => material),
    );
    const materials = trackedMaterials.length > 0 ? trackedMaterials : sceneMaterials ?? [];
    const next = new Set<object>();
    for (const material of materials) {
        if (
            host.materialShaderPresetByMaterial.get(material as object) === "wgsl-sss-skin"
            && host.isMaterialVisible?.(material) !== false
        ) {
            next.add(material as object);
        }
    }
    for (const material of host.skinSssPrePassMaterials ?? []) {
        if (!next.has(material)) {
            host.constructor.skinSssPrePassByMaterial.delete(material);
        }
    }
    for (const material of next) {
        host.constructor.skinSssPrePassByMaterial.set(material, true);
    }
    host.skinSssPrePassMaterials = next;
}

function ensureSkinSssConfiguration(host: MaterialShaderHost): {
    configuration: SkinSssConfiguration;
    profileIndex: number;
} | null {
    const scene = host.scene;
    if (!scene || typeof scene !== "object") return null;

    const cached = skinSssProfileByScene.get(scene as object);
    const existingConfiguration = scene.subSurfaceConfiguration ?? null;
    if (cached && cached.configuration === existingConfiguration) {
        cached.configuration.metersPerUnit = WGSL_SKIN_SSS_METERS_PER_UNIT;
        cached.configuration.needsImageProcessing = false;
        return {
            configuration: cached.configuration,
            profileIndex: cached.index,
        };
    }

    const configuration = scene.enableSubSurfaceForPrePass?.() ?? null;
    if (!configuration) return null;

    configuration.metersPerUnit = WGSL_SKIN_SSS_METERS_PER_UNIT;
    // The selected Classic / Frame Graph output path owns final image processing.
    configuration.needsImageProcessing = false;
    const profileIndex = configuration.addDiffusionProfile(SKIN_SSS_DIFFUSION_PROFILE);
    skinSssProfileByScene.set(scene as object, {
        configuration,
        index: profileIndex,
    });
    return { configuration, profileIndex };
}

function createSkinSssWgslSource(host: MaterialShaderHost): string {
    const profileIndex = ensureSkinSssConfiguration(host)?.profileIndex ?? 255;
    return sssSkinWgslText.replace(
        SKIN_SSS_PROFILE_INDEX_TOKEN,
        Number(profileIndex).toFixed(1),
    );
}

export function syncSkinSssPrePass(host: MaterialShaderHost): void {
    const scene = host.scene;
    if (!scene || typeof scene !== "object") return;

    syncSkinSssMaterialFlags(host);
    const skinSssActive = hasSkinSssPreset(host);
    const configuration = skinSssActive
        ? ensureSkinSssConfiguration(host)?.configuration ?? null
        : scene.subSurfaceConfiguration ?? null;
    if (configuration) {
        const pbrSssActive = scene.materials?.some(isPbrScreenSpaceScatteringMaterial) === true;
        configuration.enabled = skinSssActive || pbrSssActive;
    }
    host.onSkinSssPrePassStateChanged?.();
}

function getPresetFallbackShadowToonTexture(host: MaterialShaderHost): Texture | null {
    const scene = host?.scene;
    if (!scene || typeof scene !== "object") return null;

    const cached = presetFallbackShadowToonTextureByScene.get(scene as object);
    if (cached) return cached;

    const texture = new Texture(fallbackShadowToonTextureUrl, scene, false, true, Texture.BILINEAR_SAMPLINGMODE);
    texture.name = "preset:fallback_shadow_toon";
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
    presetFallbackShadowToonTextureByScene.set(scene as object, texture);
    return texture;
}

function getPresetFallbackAccessoryToonTexture(host: MaterialShaderHost): Texture | null {
    const scene = host?.scene;
    if (!scene || typeof scene !== "object") return null;

    const cached = presetFallbackAccessoryToonTextureByScene.get(scene as object);
    if (cached) return cached;

    const texture = new Texture(fallbackAccessoryToonTextureUrl, scene, false, true, Texture.BILINEAR_SAMPLINGMODE);
    texture.name = "preset:fallback_accessory_toon";
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
    presetFallbackAccessoryToonTextureByScene.set(scene as object, texture);
    return texture;
}

function setPresetFallbackToonTexture(host: MaterialShaderHost, material: MaterialShaderMaterial, kind: "shadow" | "accessory"): void {
    if (!material || typeof material !== "object") return;
    if (!("toonTexture" in material)) return;

    const fallbackTexture = kind === "accessory"
        ? getPresetFallbackAccessoryToonTexture(host)
        : getPresetFallbackShadowToonTexture(host);
    if (!fallbackTexture) return;

    material.toonTexture = fallbackTexture;
    if ("ignoreDiffuseWhenToonTextureIsNull" in material) {
        material.ignoreDiffuseWhenToonTextureIsNull = true;
    }
}

function ensurePresetFallbackToonTexture(host: MaterialShaderHost, material: MaterialShaderMaterial, kind: "shadow" | "accessory" = "shadow"): void {
    if (!material || typeof material !== "object") return;
    if (!("toonTexture" in material)) return;
    if (material.toonTexture) return;

    setPresetFallbackToonTexture(host, material, kind);
}

function ensureAccessoryPresetToonTexture(host: MaterialShaderHost, material: MaterialShaderMaterial): void {
    if (!material || typeof material !== "object") return;
    if (!("toonTexture" in material)) return;

    const toonTextureName = typeof material.toonTexture?.name === "string"
        ? material.toonTexture.name
        : "";
    if (material.toonTexture && toonTextureName !== "xAccessoryDefaultToon") {
        return;
    }

    setPresetFallbackToonTexture(host, material, "accessory");
}

function applyAccessoryAmbientTuning(material: MaterialShaderMaterial, defaults: MaterialShaderDefaults): void {
    if (!material || typeof material !== "object") return;
    if (!("ambientColor" in material)) return;

    const baseAmbient = defaults.ambientColor;
    if (!baseAmbient) return;

    const looksLikeLegacyXAmbient = baseAmbient.r >= 0.99
        && baseAmbient.g >= 0.99
        && baseAmbient.b >= 0.99;
    if (!looksLikeLegacyXAmbient) return;

    setMaterialColorProperty(material, "ambientColor", new Color3(0.22, 0.22, 0.22));
}

function collectLuminousMaterials(host: MaterialShaderHost): Set<object> {
    const luminousMaterials = new Set<object>();
    for (const entry of host.sceneModels ?? []) {
        for (const materialEntry of entry.materials ?? []) {
            if (host.isMaterialVisible?.(materialEntry.material) === false) {
                continue;
            }
            if (!isLuminousGlowPresetMaterial(host, materialEntry.material)) {
                continue;
            }
            luminousMaterials.add(materialEntry.material as object);
        }
    }
    return luminousMaterials;
}

export function syncLuminousGlowLayer(host: MaterialShaderHost): void {
    const luminousMaterials = collectLuminousMaterials(host);
    const hasLuminousMaterials = luminousMaterials.size > 0;

    const pipeline = host.defaultRenderingPipeline;
    if (!pipeline) {
        return;
    }

    if (host.postEffectBackend === "frameGraph" || host.requestedPostEffectBackend === "frameGraph") {
        pipeline.glowLayerEnabled = false;
        pipeline.bloomEnabled = false;
        disposeManagedLuminousGlowLayer(host);
        return;
    }

    const manualGlow = Boolean(host.postEffectGlowEnabledValue) && Number(host.postEffectGlowIntensityValue) > 1e-6;
    const autoGlow = hasLuminousMaterials;
    const manualBloom = host.postEffectBackend !== "frameGraph" && Boolean(host.postEffectBloomEnabledValue);
    const glowBaseIntensity = manualGlow
        ? Number(host.postEffectGlowIntensityValue)
        : Math.max(0.000001, Number(host.postEffectGlowIntensityValue) || 0.5);
    const glowBaseKernel = Math.max(1, Math.round(Number(host.postEffectGlowKernelValue) || GlowLayer.DefaultBlurKernelSize));

    pipeline.glowLayerEnabled = false;
    const haloGlowLayer = (manualGlow || autoGlow) ? ensureManagedLuminousGlowLayer(host, "halo") : null;
    const coreGlowLayer = (manualGlow || autoGlow) ? ensureManagedLuminousGlowLayer(host, "core") : null;
    if (haloGlowLayer || coreGlowLayer) {
        const configureGlowLayer = (glowLayer: GlowLayer | null, kind: "core" | "halo"): void => {
            if (!glowLayer) return;
            glowLayer.customEmissiveColorSelector = null;
            glowLayer.customEmissiveTextureSelector = null;
            glowLayer.intensity = getManagedLuminousGlowIntensity(glowBaseIntensity, kind);
            glowLayer.blurKernelSize = getManagedLuminousGlowKernel(glowBaseKernel, kind);
            glowLayer.customEmissiveColorSelector = (
                mesh: MaterialShaderMesh,
                _subMesh: unknown,
                material: MaterialShaderMaterial,
                result: { set(r: number, g: number, b: number, a: number): void },
            ) => {
                const glowState = getLuminousGlowMaterialState(host, material);
                if (!glowState) {
                    result.set(0, 0, 0, 0);
                    return;
                }
                const morphScale = glowState.luminous ? getLuminousGlowMorphScaleForMesh(host, mesh) : 1;
                if (glowState.luminous && morphScale <= 1e-4) {
                    result.set(0, 0, 0, LUMINOUS_GLOW_OCCLUDER_ALPHA);
                    return;
                }
                const glowColor = kind === "core" ? glowState.coreColor : glowState.haloColor;
                const scaledGlowColor = glowState.luminous ? scaleColor(glowColor, morphScale) : glowColor;
                result.set(
                    scaledGlowColor.r,
                    scaledGlowColor.g,
                    scaledGlowColor.b,
                    glowState.alpha,
                );
            };
            glowLayer.customEmissiveTextureSelector = (
                _mesh: MaterialShaderMesh,
                _subMesh: unknown,
                material: MaterialShaderMaterial,
            ) => {
                return getLuminousGlowMaterialState(host, material)?.texture ?? null;
            };
        };
        configureGlowLayer(haloGlowLayer, "halo");
        configureGlowLayer(coreGlowLayer, "core");
    } else {
        disposeManagedLuminousGlowLayer(host);
    }

    pipeline.bloomEnabled = manualBloom;
    const requestedBloomWeight = host.postEffectBloomWeightValue ?? 0;
    const requestedBloomThreshold = host.postEffectBloomThresholdValue ?? 2;
    const requestedBloomKernel = host.postEffectBloomKernelValue ?? 0;

    if (manualBloom) {
        pipeline.bloomWeight = requestedBloomWeight;
        pipeline.bloomThreshold = requestedBloomThreshold;
        pipeline.bloomKernel = requestedBloomKernel;
    } else {
        pipeline.bloomWeight = requestedBloomWeight;
        pipeline.bloomThreshold = requestedBloomThreshold;
        pipeline.bloomKernel = requestedBloomKernel;
    }
}

export function ensureMaterialShaderDefaults(host: MaterialShaderHost, material: MaterialShaderMaterial): MaterialShaderDefaults {
    let defaults = host.materialShaderDefaultsByMaterial.get(material as object);
    if (!defaults) {
        defaults = {
            disableLighting: "disableLighting" in material ? Boolean(material.disableLighting) : null,
            specularPower: "specularPower" in material && Number.isFinite(Number(material.specularPower))
                ? Number(material.specularPower)
                : null,
            specularColor: cloneColor3OrNull(material.specularColor),
            emissiveColor: cloneColor3OrNull(material.emissiveColor),
            ambientColor: cloneColor3OrNull(material.ambientColor),
            transparencyMode: "transparencyMode" in material && typeof material.transparencyMode === "number"
                ? material.transparencyMode
                : null,
            alphaCutOff: "alphaCutOff" in material && Number.isFinite(Number(material.alphaCutOff))
                ? Number(material.alphaCutOff)
                : null,
            forceDepthWrite: "forceDepthWrite" in material ? Boolean(material.forceDepthWrite) : null,
            useAlphaFromDiffuseTexture: "useAlphaFromDiffuseTexture" in material
                ? Boolean(material.useAlphaFromDiffuseTexture)
                : null,
            useAlphaFromAlbedoTexture: "useAlphaFromAlbedoTexture" in material
                ? Boolean(material.useAlphaFromAlbedoTexture)
                : null,
            toonTexture: "toonTexture" in material ? (material.toonTexture ?? null) : undefined,
            ignoreDiffuseWhenToonTextureIsNull: "ignoreDiffuseWhenToonTextureIsNull" in material
                ? Boolean(material.ignoreDiffuseWhenToonTextureIsNull)
                : null,
        };
        host.materialShaderDefaultsByMaterial.set(material as object, defaults);
    }

    return defaults;
}

function restoreMaterialShaderDefaults(host: MaterialShaderHost, material: MaterialShaderMaterial, defaults: MaterialShaderDefaults): void {
    if (!material || typeof material !== "object") return;

    if (defaults.disableLighting !== null && "disableLighting" in material) {
        material.disableLighting = defaults.disableLighting;
    }

    if (defaults.specularPower !== null && "specularPower" in material) {
        material.specularPower = defaults.specularPower;
    }

    if (defaults.specularColor) {
        setMaterialColorProperty(material, "specularColor", defaults.specularColor);
    }

    if ("transparencyMode" in material) {
        material.transparencyMode = defaults.transparencyMode;
    }

    if (defaults.alphaCutOff !== null && "alphaCutOff" in material) {
        material.alphaCutOff = defaults.alphaCutOff;
    }

    if (defaults.forceDepthWrite !== null && "forceDepthWrite" in material) {
        material.forceDepthWrite = defaults.forceDepthWrite;
    }

    if (defaults.useAlphaFromDiffuseTexture !== null && "useAlphaFromDiffuseTexture" in material) {
        material.useAlphaFromDiffuseTexture = defaults.useAlphaFromDiffuseTexture;
    }

    if (defaults.useAlphaFromAlbedoTexture !== null && "useAlphaFromAlbedoTexture" in material) {
        material.useAlphaFromAlbedoTexture = defaults.useAlphaFromAlbedoTexture;
    }

    if (defaults.toonTexture !== undefined && "toonTexture" in material) {
        material.toonTexture = defaults.toonTexture;
    }

    if (defaults.ignoreDiffuseWhenToonTextureIsNull !== null && "ignoreDiffuseWhenToonTextureIsNull" in material) {
        material.ignoreDiffuseWhenToonTextureIsNull = defaults.ignoreDiffuseWhenToonTextureIsNull;
    }

    if (defaults.emissiveColor) {
        setMaterialColorProperty(material, "emissiveColor", defaults.emissiveColor);
    } else if ("emissiveColor" in material) {
        setMaterialColorProperty(material, "emissiveColor", new Color3(0, 0, 0));
    }

    if (defaults.ambientColor) {
        setMaterialColorProperty(material, "ambientColor", defaults.ambientColor);
    } else if ("ambientColor" in material) {
        setMaterialColorProperty(material, "ambientColor", new Color3(0, 0, 0));
    }
}

function applyWgslShaderPresetToMaterial(host: MaterialShaderHost, material: MaterialShaderMaterial, presetId: WgslMaterialShaderPresetId): void {
    if (!material || typeof material !== "object") return;

    const defaults = ensureMaterialShaderDefaults(host, material);
    restoreMaterialShaderDefaults(host, material, defaults);
    setPresetWgslToonFragmentForMaterial(host, material, null);

    setOwnedSssProfile(material, presetId === "wgsl-owned-sss-skin" ? "skin"
        : presetId === "wgsl-owned-sss-wax" ? "wax" : null);

    switch (presetId) {
        case "wgsl-unlit": {
            if ("disableLighting" in material) {
                material.disableLighting = true;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            const diffuse = cloneColor3OrNull(material.diffuseColor);
            if (diffuse) {
                setMaterialColorProperty(
                    material,
                    "emissiveColor",
                    new Color3(
                        Math.min(1, diffuse.r * 0.95),
                        Math.min(1, diffuse.g * 0.95),
                        Math.min(1, diffuse.b * 0.95),
                    ),
                );
            }
            break;
        }
        case "wgsl-soft-lit": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(8, base * 0.4);
            }
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + 0.04),
                    Math.min(1, baseEmissive.g + 0.04),
                    Math.min(1, baseEmissive.b + 0.04),
                ),
            );
            break;
        }
        case "wgsl-autoluminous": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(6, base * 0.3);
            }
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            const diffuse = cloneColor3OrNull(material.diffuseColor) ?? new Color3(0, 0, 0);
            const luminance = Math.max(0, diffuse.r * 0.299 + diffuse.g * 0.587 + diffuse.b * 0.114);
            const maxChannel = Math.max(0.0001, diffuse.r, diffuse.g, diffuse.b);
            const normalizedTint = new Color3(
                diffuse.r / maxChannel,
                diffuse.g / maxChannel,
                diffuse.b / maxChannel,
            );
            const balancedTint = new Color3(
                normalizedTint.r * AUTO_LUMINOUS_TINT_STRENGTH + diffuse.r * (1 - AUTO_LUMINOUS_TINT_STRENGTH),
                normalizedTint.g * AUTO_LUMINOUS_TINT_STRENGTH + diffuse.g * (1 - AUTO_LUMINOUS_TINT_STRENGTH),
                normalizedTint.b * AUTO_LUMINOUS_TINT_STRENGTH + diffuse.b * (1 - AUTO_LUMINOUS_TINT_STRENGTH),
            );
            const glowLevel = AUTO_LUMINOUS_BASE_LEVEL + luminance * AUTO_LUMINOUS_BRIGHTNESS_BIAS;
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    baseEmissive.r + balancedTint.r * glowLevel,
                    baseEmissive.g + balancedTint.g * glowLevel,
                    baseEmissive.b + balancedTint.b * glowLevel,
                ),
            );
            break;
        }
        case "wgsl-debug-white": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            setPresetWgslToonFragmentForMaterial(host, material, debugWhiteWgslText);
            break;
        }
        case "wgsl-full-light": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            const diffuseTextureHasAlpha = Boolean(material.diffuseTexture?.hasAlpha);
            const albedoTextureHasAlpha = Boolean(material.albedoTexture?.hasAlpha);
            const hasOpacityTexture = Boolean(material.opacityTexture);
            const usesTextureAlpha = Boolean(material.useAlphaFromDiffuseTexture || material.useAlphaFromAlbedoTexture);
            const isTransparencyModeEnabled = typeof material.transparencyMode === "number" && material.transparencyMode !== 0;
            const isTransparentLike = diffuseTextureHasAlpha || albedoTextureHasAlpha || hasOpacityTexture || usesTextureAlpha || isTransparencyModeEnabled || Number(material.alpha ?? 1) < 0.999;
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            const diffuse = cloneColor3OrNull(material.diffuseColor) ?? new Color3(0, 0, 0);
            const emissiveBoost = isTransparentLike ? 0.82 : 0.32;
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + diffuse.r * emissiveBoost),
                    Math.min(1, baseEmissive.g + diffuse.g * emissiveBoost),
                    Math.min(1, baseEmissive.b + diffuse.b * emissiveBoost),
                ),
            );
            ensurePresetFallbackToonTexture(host, material);
            setPresetWgslToonFragmentForMaterial(host, material, fullLightWgslText);
            break;
        }
        case "wgsl-full-light-add": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            const diffuseTextureHasAlpha = Boolean(material.diffuseTexture?.hasAlpha);
            const albedoTextureHasAlpha = Boolean(material.albedoTexture?.hasAlpha);
            const hasOpacityTexture = Boolean(material.opacityTexture);
            const usesTextureAlpha = Boolean(material.useAlphaFromDiffuseTexture || material.useAlphaFromAlbedoTexture);
            const isTransparencyModeEnabled = typeof material.transparencyMode === "number" && material.transparencyMode !== 0;
            const isTransparentLike = diffuseTextureHasAlpha || albedoTextureHasAlpha || hasOpacityTexture || usesTextureAlpha || isTransparencyModeEnabled || Number(material.alpha ?? 1) < 0.999;
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            const diffuse = cloneColor3OrNull(material.diffuseColor) ?? new Color3(0, 0, 0);
            const emissiveBoost = isTransparentLike ? 0.96 : 0.46;
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + diffuse.r * emissiveBoost),
                    Math.min(1, baseEmissive.g + diffuse.g * emissiveBoost),
                    Math.min(1, baseEmissive.b + diffuse.b * emissiveBoost),
                ),
            );
            setPresetWgslToonFragmentForMaterial(host, material, fullLightAddWgslText);
            break;
        }
        case "wgsl-full-alpha-test": {
            const preferredAlphaCutOff = defaults.alphaCutOff !== null
                ? Math.min(defaults.alphaCutOff, 0.28)
                : 0.28;
            enableAlphaTextureFlags(material);
            applyAlphaCutoutPreset(material, preferredAlphaCutOff);
            break;
        }
        case "wgsl-full-alpha-test-hard": {
            const preferredAlphaCutOff = defaults.alphaCutOff !== null
                ? Math.max(defaults.alphaCutOff, 0.56)
                : 0.56;
            enableAlphaTextureFlags(material);
            applyAlphaCutoutPreset(material, preferredAlphaCutOff);
            break;
        }
        case "wgsl-alpha-mask": {
            applyAlphaBlendCutoutPreset(material);
            break;
        }
        case "wgsl-white-key-cutout": {
            applyAlphaBlendCutoutPreset(material);
            break;
        }
        case "wgsl-black-key-cutout": {
            applyAlphaBlendCutoutPreset(material);
            break;
        }
        case "wgsl-full-shadow": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            ensurePresetFallbackToonTexture(host, material);
            setPresetWgslToonFragmentForMaterial(host, material, fullShadowWgslText);
            break;
        }
        case "wgsl-self-shadow": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            ensurePresetFallbackToonTexture(host, material);
            setPresetWgslToonFragmentForMaterial(host, material, selfShadowWgslText);
            break;
        }
        case "wgsl-owned-sss-skin":
        case "wgsl-owned-sss-wax": {
            material.disableLighting = false;
            ensurePresetFallbackToonTexture(host, material);
            setPresetWgslToonFragmentForMaterial(host, material, OWNED_SSS_LIGHTING);
            break;
        }
        case "wgsl-sss-standard": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            setPresetWgslToonFragmentForMaterial(host, material, sssStandardWgslText);
            break;
        }
        case "wgsl-sss-skin": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            setPresetWgslToonFragmentForMaterial(host, material, createSkinSssWgslSource(host));
            break;
        }
        case "wgsl-light-and-shadow": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            ensurePresetFallbackToonTexture(host, material);
            break;
        }
        case "wgsl-gloss-highlight": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.min(768, Math.max(96, base * 3.1));
            }
            setPresetWgslToonFragmentForMaterial(host, material, glossHighlightWgslText);
            break;
        }
        case "wgsl-semi-matte-highlight": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.min(256, Math.max(28, base * 1.2));
            }
            setPresetWgslToonFragmentForMaterial(host, material, semiMatteHighlightWgslText);
            break;
        }
        case "wgsl-matte-highlight": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(6, Math.min(48, base * 0.35));
            }
            setPresetWgslToonFragmentForMaterial(host, material, matteHighlightWgslText);
            break;
        }
        case "wgsl-specular": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.min(512, Math.max(32, base * 1.85));
            }
            break;
        }
        case "wgsl-ssr-reflective": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                material.specularPower = Math.min(768, Math.max(128, defaults.specularPower ?? 128));
            }
            if ("specularColor" in material) {
                setMaterialColorProperty(material, "specularColor", new Color3(1, 1, 1));
            }
            if ("roughness" in material) {
                material.roughness = 0.08;
            }
            break;
        }
        case "wgsl-cel-sharp": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(4, base * 0.18);
            }
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + 0.015),
                    Math.min(1, baseEmissive.g + 0.015),
                    Math.min(1, baseEmissive.b + 0.015),
                ),
            );
            break;
        }
        case "wgsl-cel-shadow-sharp": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(4, base * 0.14);
            }
            ensurePresetFallbackToonTexture(host, material);
            setPresetWgslToonFragmentForMaterial(host, material, toonHardShadowWgslText);
            break;
        }
        case "wgsl-accessory-toon": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            ensureAccessoryPresetToonTexture(host, material);
            applyAccessoryAmbientTuning(material, defaults);
            break;
        }
        case "wgsl-obj-untextured": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            ensureAccessoryPresetToonTexture(host, material);
            if ("ambientColor" in material) {
                setMaterialColorProperty(material, "ambientColor", new Color3(0.2, 0.2, 0.2));
            }
            if ("specularColor" in material) {
                setMaterialColorProperty(material, "specularColor", new Color3(0.1, 0.1, 0.1));
            }
            if ("specularPower" in material) {
                material.specularPower = 32;
            }
            break;
        }
        case "wgsl-obj-mtl": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            ensureAccessoryPresetToonTexture(host, material);
            break;
        }
        case "wgsl-rim-lift": {
            if ("disableLighting" in material) {
                material.disableLighting = false;
            }
            if ("specularPower" in material) {
                const base = defaults.specularPower ?? 32;
                material.specularPower = Math.max(24, base * 0.75);
            }
            const baseEmissive = defaults.emissiveColor ?? new Color3(0, 0, 0);
            const diffuse = cloneColor3OrNull(material.diffuseColor) ?? new Color3(0, 0, 0);
            setMaterialColorProperty(
                material,
                "emissiveColor",
                new Color3(
                    Math.min(1, baseEmissive.r + diffuse.r * 0.12),
                    Math.min(1, baseEmissive.g + diffuse.g * 0.12),
                    Math.min(1, baseEmissive.b + diffuse.b * 0.12),
                ),
            );
            break;
        }
        case "wgsl-mono-flat": {
            if ("disableLighting" in material) {
                material.disableLighting = true;
            }
            if ("specularPower" in material) {
                material.specularPower = 0;
            }
            const diffuse = cloneColor3OrNull(material.diffuseColor);
            if (diffuse) {
                const luma = Math.max(0, Math.min(1, diffuse.r * 0.299 + diffuse.g * 0.587 + diffuse.b * 0.114));
                const mono = luma * 0.92;
                setMaterialColorProperty(material, "emissiveColor", new Color3(mono, mono, mono));
            }
            break;
        }
        case "wgsl-mmd-standard":
        default:
            break;
    }

    host.materialShaderPresetByMaterial.set(material as object, presetId);
    markMaterialShaderDirty(material);
}

export function isWgslMaterialShaderAssignmentAvailable(host: MaterialShaderHost): boolean {
    return Boolean(host.isWebGpuEngine?.());
}

export function getWgslMaterialShaderPresets(host: MaterialShaderHost): readonly { id: WgslMaterialShaderPresetId; label: string }[] {
    return getPresetCatalog(host);
}

export function getExternalWgslToonShaderPath(host: MaterialShaderHost, modelIndex?: number, materialKey: string | null = null): string | null {
    if (typeof modelIndex !== "number" || !Number.isFinite(modelIndex)) {
        return host.externalWgslToonShaderPathValue;
    }

    const entry = host.sceneModels[modelIndex];
    if (!entry) return null;

    if (materialKey !== null) {
        const target = entry.materials.find((material: MaterialShaderMaterial) => material.key === materialKey);
        return target ? getExternalWgslToonShaderPathForMaterial(host, target.material) : null;
    }

    const paths = new Set<string>();
    for (const material of entry.materials) {
        const path = getExternalWgslToonShaderPathForMaterial(host, material.material);
        if (path) {
            paths.add(path);
        }
    }
    return paths.size === 1 ? Array.from(paths)[0] : null;
}

export function hasExternalWgslToonShader(host: MaterialShaderHost, modelIndex?: number, materialKey: string | null = null): boolean {
    return getExternalWgslToonShaderPath(host, modelIndex, materialKey) !== null;
}

export function getExternalWgslToonShaderPathForMaterial(host: MaterialShaderHost, material: MaterialShaderMaterial): string | null {
    const key = getMaterialKey(material);
    if (!key) return null;
    return host.externalWgslToonShaderPathByMaterial.get(key) ?? null;
}

export function setExternalWgslToonShaderForMaterial(
    host: MaterialShaderHost,
    material: MaterialShaderMaterial,
    path: string | null,
    source: string | null,
): void {
    const key = getMaterialKey(material);
    if (!key) return;
    if (path && source) {
        host.externalWgslToonShaderPathByMaterial.set(key, path);
        host.constructor.externalWgslToonFragmentByMaterial.set(key, source);
        return;
    }

    host.externalWgslToonShaderPathByMaterial.delete(key);
    host.constructor.externalWgslToonFragmentByMaterial.delete(key);
}

export function setExternalWgslToonShader(host: MaterialShaderHost, path: string | null, source: string | null): void {
    const normalizedPath = typeof path === "string" && path.trim().length > 0 ? path.trim() : null;
    const normalizedSource = typeof source === "string" && source.trim().length > 0 ? source : null;

    host.externalWgslToonShaderPathValue = normalizedPath;
    for (const entry of host.sceneModels) {
        for (const material of entry.materials) {
            setExternalWgslToonShaderForMaterial(host, material.material, normalizedPath, normalizedSource);
            markMaterialShaderDirty(material.material);
        }
    }

    host.engine.releaseEffects();
    host.onMaterialShaderStateChanged?.();
}

export function setExternalWgslToonShaderForModel(
    host: MaterialShaderHost,
    modelIndex: number,
    materialKey: string | null,
    path: string | null,
    source: string | null,
): boolean {
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return false;

    const entry = host.sceneModels[modelIndex];
    if (!entry || entry.materialPipeline === "pbr-standard") return false;

    const targets = materialKey === null
        ? entry.materials
        : entry.materials.filter((material: MaterialShaderMaterial) => material.key === materialKey);
    if (targets.length === 0) return false;

    const normalizedPath = typeof path === "string" && path.trim().length > 0 ? path.trim() : null;
    const normalizedSource = typeof source === "string" && source.trim().length > 0 ? source : null;

    for (const target of targets) {
        setExternalWgslToonShaderForMaterial(host, target.material, normalizedPath, normalizedSource);
        markMaterialShaderDirty(target.material);
    }
    host.externalWgslToonShaderPathValue = normalizedPath;

    host.engine.releaseEffects();
    host.onMaterialShaderStateChanged?.();
    return true;
}

export function getWgslMaterialShaderPresetForMaterial(host: MaterialShaderHost, material: MaterialShaderMaterial): WgslMaterialShaderPresetId {
    const key = getMaterialKey(material);
    if (!key) {
        return getDefaultPreset(host);
    }

    return host.materialShaderPresetByMaterial.get(key) ?? getDefaultPreset(host);
}

export function setWgslMaterialShaderPreset(
    host: MaterialShaderHost,
    modelIndex: number,
    materialKey: string | null,
    presetId: WgslMaterialShaderPresetId,
): boolean {
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return false;
    if (!getPresetCatalog(host).some((item) => item.id === presetId)) return false;

    const entry = host.sceneModels[modelIndex];
    if (!entry || entry.materialPipeline === "pbr-standard") return false;

    const targets = materialKey === null
        ? entry.materials
        : entry.materials.filter((material: MaterialShaderMaterial) => material.key === materialKey);
    if (targets.length === 0) return false;

    for (const target of targets) {
        setExternalWgslToonShaderForMaterial(host, target.material, null, null);
        applyWgslShaderPresetToMaterial(host, target.material, presetId);
    }

    syncLuminousGlowLayer(host);
    syncSkinSssPrePass(host);
    host.engine.releaseEffects?.();
    host.onMaterialShaderStateChanged?.();
    return true;
}

export function applyWgslShaderPresetToMaterials(
    host: MaterialShaderHost,
    materials: Iterable<MaterialShaderMaterial>,
    presetId: WgslMaterialShaderPresetId,
): boolean {
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return false;
    if (!getPresetCatalog(host).some((item) => item.id === presetId)) return false;

    const seen = new Set<object>();
    let applied = false;
    for (const material of materials) {
        const key = getMaterialKey(material);
        if (!key || seen.has(key)) continue;
        seen.add(key);

        setExternalWgslToonShaderForMaterial(host, material, null, null);
        applyWgslShaderPresetToMaterial(host, material, presetId);
        applied = true;
    }

    if (!applied) return false;

    syncLuminousGlowLayer(host);
    syncSkinSssPrePass(host);
    host.engine.releaseEffects?.();
    host.onMaterialShaderStateChanged?.();
    return true;
}

export function applyWgslAlphaTextureDebugToMaterials(
    host: MaterialShaderHost,
    materials: Iterable<MaterialShaderMaterial>,
): boolean {
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return false;

    const seen = new Set<object>();
    let applied = false;
    for (const material of materials) {
        const key = getMaterialKey(material);
        if (!key || seen.has(key)) continue;
        seen.add(key);

        setExternalWgslToonShaderForMaterial(host, material, null, null);
        setPresetWgslToonFragmentForMaterial(host, material, alphaTextureDebugWgslText);
        if ("alpha" in material) {
            material.alpha = 1;
        }
        if ("alphaCutOff" in material) {
            material.alphaCutOff = 0;
        }
        if ("transparencyMode" in material) {
            material.transparencyMode = Material.MATERIAL_OPAQUE;
        }
        markMaterialShaderDirty(material);
        applied = true;
    }

    if (!applied) return false;

    host.engine.releaseEffects?.();
    host.onMaterialShaderStateChanged?.();
    return true;
}

export function getWgslModelShaderStates(host: MaterialShaderHost): Array<{
    modelIndex: number;
    modelName: string;
    modelPath: string;
    active: boolean;
    materialPipeline: MmdMaterialPipelinePreset;
    materials: Array<{
        key: string;
        name: string;
        presetId: WgslMaterialShaderPresetId;
        pbrPresetId: PbrMaterialShaderPreset;
        externalWgslPath: string | null;
        visible: boolean;
    }>;
}> {
    return host.sceneModels.map((entry: MaterialShaderSceneModel, modelIndex: number) => ({
        modelIndex,
        modelName: entry.info.name,
        modelPath: entry.info.path,
        active: entry.model === host.currentModel,
        materialPipeline: entry.materialPipeline ?? DEFAULT_MMD_MATERIAL_PIPELINE_PRESET,
        materials: entry.materials.map((material) => ({
            key: material.key,
            name: material.name,
            presetId: getWgslMaterialShaderPresetForMaterial(host, material.material),
            pbrPresetId: getPbrMaterialShaderPreset(material.material),
            externalWgslPath: getExternalWgslToonShaderPathForMaterial(host, material.material),
            visible: host.isMaterialVisible?.(material.material) !== false,
        })),
    }));
}

export function getSerializedMaterialShaderStates(host: MaterialShaderHost, entry: MaterialShaderSceneModel): ProjectModelMaterialShaderState[] {
    if (entry.materialPipeline === "pbr-standard") {
        return entry.materials.flatMap((material) => {
            const presetId = getPbrMaterialShaderPreset(material.material);
            return presetId === "pbr-base"
                ? []
                : [{ materialKey: material.key, presetId }];
        });
    }
    const states: ProjectModelMaterialShaderState[] = [];
    for (const material of entry.materials) {
        const presetId = getWgslMaterialShaderPresetForMaterial(host, material.material);
        if (presetId === getDefaultPreset(host)) continue;
        states.push({
            materialKey: material.key,
            presetId,
        });
    }
    return states;
}

export function applyImportedMaterialShaderStates(
    host: MaterialShaderHost,
    modelIndex: number,
    states: ProjectModelMaterialShaderState[] | undefined,
    warnings: string[],
    modelPath: string,
): void {
    if (!Array.isArray(states) || states.length === 0) return;
    if (!isWgslMaterialShaderAssignmentAvailable(host)) return;

    const entry = host.sceneModels[modelIndex];
    if (!entry) return;

    if (entry.materialPipeline === "pbr-standard") {
        for (const state of states) {
            if (!state || typeof state.materialKey !== "string" || typeof state.presetId !== "string") {
                warnings.push("Invalid PBR material shader assignment: " + modelPath);
                continue;
            }
            if (
                state.presetId !== "pbr-mmd-like"
                && state.presetId !== "pbr-skin"
                && state.presetId !== "pbr-skin-sss"
                && state.presetId !== "pbr-skin-face"
                && state.presetId !== "pbr-no-shadow"
            ) {
                warnings.push("Unknown PBR shader preset '" + state.presetId + "' for " + modelPath);
                continue;
            }
            const target = entry.materials.find((material) => material.key === state.materialKey);
            if (!target || !applyPbrMaterialShaderPreset(
                target.material,
                state.presetId,
            )) {
                warnings.push("PBR material shader target not found: " + state.materialKey + " (" + modelPath + ")");
            }
        }
        host.onMaterialShaderStateChanged?.();
        return;
    }

    for (const state of states) {
        if (!state || typeof state.materialKey !== "string" || typeof state.presetId !== "string") {
            warnings.push("Invalid material shader assignment: " + modelPath);
            continue;
        }

        const exists = getPresetCatalog(host).some((preset) => preset.id === state.presetId);
        if (!exists) {
            warnings.push("Unknown shader preset '" + state.presetId + "' for " + modelPath);
            continue;
        }

        const ok = setWgslMaterialShaderPreset(
            host,
            modelIndex,
            state.materialKey,
            state.presetId as WgslMaterialShaderPresetId,
        );
        if (!ok) {
            warnings.push("Material shader target not found: " + state.materialKey + " (" + modelPath + ")");
        }
    }
}

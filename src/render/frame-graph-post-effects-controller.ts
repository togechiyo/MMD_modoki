import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphTask } from "@babylonjs/core/FrameGraph/frameGraphTask";
import { FrameGraphObjectList } from "@babylonjs/core/FrameGraph/frameGraphObjectList";
import { FrameGraphBloomTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/bloomTask";
import { FrameGraphChromaticAberrationTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/chromaticAberrationTask";
import { FrameGraphDepthOfFieldTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/depthOfFieldTask";
import { FrameGraphFXAATask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/fxaaTask";
import { FrameGraphGrainTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/grainTask";
import { FrameGraphImageProcessingTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/imageProcessingTask";
import { FrameGraphMotionBlurTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/motionBlurTask";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import { FrameGraphSharpenTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/sharpenTask";
import { FrameGraphSSAO2RenderingPipelineTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/ssao2RenderingPipelineTask";
import { FrameGraphSSRRenderingPipelineTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/ssrRenderingPipelineTask";
import { FrameGraphGeometryRendererTask } from "@babylonjs/core/FrameGraph/Tasks/Rendering/geometryRendererTask";
import { FrameGraphClearTextureTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/clearTextureTask";
import { FrameGraphCopyToBackbufferColorTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/copyToBackbufferColorTask";
import { FrameGraphCopyToTextureTask } from "@babylonjs/core/FrameGraph/Tasks/Texture/copyToTextureTask";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import type { FrameGraphRenderPass } from "@babylonjs/core/FrameGraph/Passes/renderPass";
import type { FrameGraphRenderContext } from "@babylonjs/core/FrameGraph/frameGraphRenderContext";
import { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { InternalTexture } from "@babylonjs/core/Materials/Textures/internalTexture";
import type { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { ThinChromaticAberrationPostProcess } from "@babylonjs/core/PostProcesses/thinChromaticAberrationPostProcess";
import { ThinDepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/thinDepthOfFieldEffect";
import { ThinFXAAPostProcess } from "@babylonjs/core/PostProcesses/thinFXAAPostProcess";
import { ThinGrainPostProcess } from "@babylonjs/core/PostProcesses/thinGrainPostProcess";
import { ThinImageProcessingPostProcess } from "@babylonjs/core/PostProcesses/thinImageProcessingPostProcess";
import { ThinSharpenPostProcess } from "@babylonjs/core/PostProcesses/thinSharpenPostProcess";
import { ThinBlurPostProcess } from "@babylonjs/core/PostProcesses/thinBlurPostProcess";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import type { SsgiBlendMode } from "../types";
import { createLutAtlasTextureFrom3dlText } from "./lut-atlas-texture";
import {
    FRAME_GRAPH_POST_EFFECT_IDS,
    isFrameGraphPostEffectActiveInSettings,
    normalizeFrameGraphPostEffectIds,
    type FrameGraphPostEffectId,
} from "../shared/frame-graph-post-effect-stack";
import {
    buildFrameGraphResourcePlan,
    type FrameGraphResourcePlan,
    type FrameGraphSharedResourceKey,
} from "./frame-graph-resource-plan";
import {
    FrameGraphPostEffectsSsgiCompositeTask,
    FrameGraphPostEffectsSsgiDenoiseTask,
    FrameGraphPostEffectsSsgiGatherTask,
} from "./frame-graph-ssgi-task";
import {
    ensureFrameGraphSsgiShaders,
    FRAME_GRAPH_SSGI_METHOD_NAME,
} from "./frame-graph-ssgi-shaders";
import {
    resolveLuminousBlurPassSettings,
    type LuminousBlurBand,
} from "./luminous-blur-settings";
import { ObjectMotionBlurBoneVelocityMode } from "./object-motion-blur-bone-velocity";
import { FrameGraphPostEffectsOceanTask } from "./frame-graph-ocean-task";
import {
    ensureFrameGraphOceanShaders,
    FRAME_GRAPH_OCEAN_METHOD_NAME,
} from "./frame-graph-ocean-shaders";

const SSGI_DENOISE_STEP_WIDTHS = [1, 2, 4] as const;

export type FrameGraphPostEffectsWarning = {
    message: string;
    reason: "not-connected" | "build-failed";
    stack?: string;
};

export type FrameGraphPostEffectsInfo = {
    message: string;
    event: "activated" | "ready" | "ssgi-ready";
    details?: Record<string, unknown>;
};

type FrameGraphPostEffectsOutputTask =
    | FrameGraphCopyToBackbufferColorTask
    | FrameGraphCopyToTextureTask;

type FrameGraphPostEffectsStackOutputTask = {
    sourceTexture?: FrameGraphTextureHandle;
};

type EffectWrapperReadyLike = {
    effect?: {
        isReady?: () => boolean;
    } | null;
    drawWrapper?: {
        effect?: {
            isReady?: () => boolean;
        } | null;
    } | null;
    _drawWrapper?: {
        effect?: {
            isReady?: () => boolean;
        } | null;
    } | null;
};

export type FrameGraphPostEffectsDiagnosticsSnapshot = {
    active: boolean;
    ready: boolean;
    executedFrameCount: number;
    resourcePlan: {
        effectOrder: FrameGraphPostEffectId[];
        activeEffects: FrameGraphPostEffectId[];
        requirementKeys: FrameGraphSharedResourceKey[];
        needsGeometryRenderer: boolean;
        needsDepthRenderer: boolean;
        needsLuminousMask: boolean;
    } | null;
    tasks: {
        imageProcessing: boolean;
        geometryRenderer: boolean;
        ssr: boolean;
        ssgiGather: boolean;
        ssgiDenoise: boolean;
        ssgiComposite: boolean;
        ssao: boolean;
        ssaoToonComposite: boolean;
        ocean: boolean;
        offsetShadow: boolean;
        offsetHighlight: boolean;
        motionBlur: boolean;
        dof: boolean;
        luminousExtract: boolean;
        luminousCoreBlur: boolean;
        luminousHaloBlur: boolean;
        luminousComposite: boolean;
        bloom: boolean;
        bloomTint: boolean;
        lut: boolean;
        colorCorrection: boolean;
        sharpen: boolean;
        grain: boolean;
        chromatic: boolean;
        vignetteEdgeBlur: boolean;
        lensDistortion: boolean;
        fxaa: boolean;
    };
    resources: {
        geometryRenderer: boolean;
        viewDepth: boolean;
        viewNormal: boolean;
        velocity: boolean;
        reflectivity: boolean;
        ssgiHalfResolution: boolean;
        ssgiDenoisedHalfResolution: boolean;
        depthOfField: boolean;
        luminousExtract: boolean;
        luminousCoreBlur: boolean;
        luminousHaloBlur: boolean;
    };
    luminousBlur: {
        coreKernel: number;
        haloKernel: number;
        coreDirectionScale: number;
        haloDirectionScale: number;
    };
    connectedOrder: FrameGraphPostEffectId[];
};

export type FrameGraphPostEffectsSettings = {
    contrast: number;
    gammaPower: number;
    imageProcessingEnabled: boolean;
    dofEnabled: boolean;
    dofBlurLevel: number;
    dofFocusDistanceMm: number;
    dofEffectiveFStop: number;
    dofLensSize: number;
    dofFocalLength: number;
    luminousEnabled: boolean;
    luminousIntensity: number;
    luminousThreshold: number;
    luminousRadius: number;
    luminousGlareCount: number;
    luminousGlareLength: number;
    luminousGlareAngle: number;
    luminousGlarePower: number;
    bloomEnabled: boolean;
    bloomWeight: number;
    bloomThreshold: number;
    bloomKernel: number;
    bloomColor: { r: number; g: number; b: number };
    vignetteEnabled: boolean;
    vignetteWeight: number;
    edgeBlurStrength: number;
    lensDistortionEnabled: boolean;
    lensDistortion: number;
    chromaticAberration: number;
    grainIntensity: number;
    sharpenEdge: number;
    ssaoEnabled: boolean;
    ssaoStrength: number;
    ssaoRadius: number;
    ssaoShadowColor: { r: number; g: number; b: number };
    ssaoToonInfluence: number;
    offsetShadowEnabled: boolean;
    offsetShadowStrength: number;
    offsetShadowOffsetX: number;
    offsetShadowOffsetY: number;
    offsetShadowDepthBias: number;
    offsetShadowMaxDepth: number;
    offsetShadowDepthScale: number;
    offsetShadowThickness: number;
    offsetShadowSoftness: number;
    offsetShadowNormalInfluence: number;
    offsetShadowColor: { r: number; g: number; b: number };
    offsetShadowDebugView: boolean;
    offsetHighlightEnabled: boolean;
    offsetHighlightStrength: number;
    offsetHighlightOffsetX: number;
    offsetHighlightOffsetY: number;
    offsetHighlightDepthThreshold: number;
    offsetHighlightNormalThreshold: number;
    offsetHighlightThickness: number;
    offsetHighlightSoftness: number;
    offsetHighlightDepthScale: number;
    offsetHighlightColor: { r: number; g: number; b: number };
    offsetHighlightDebugView: boolean;
    ssrEnabled: boolean;
    ssrStrength: number;
    ssrStep: number;
    ssgiEnabled: boolean;
    ssgiStrength: number;
    ssgiSampleRadius: number;
    ssgiBlendMode: SsgiBlendMode;
    oceanEnabled: boolean;
    oceanWaterHeight: number;
    oceanWaveStrength: number;
    oceanClarity: number;
    oceanCausticsStrength: number;
    oceanTimeSeconds: number;
    lutEnabled: boolean;
    lutIntensity: number;
    lutRuntimeText: string | null;
    lutTextureKey: string | null;
    motionBlurEnabled: boolean;
    motionBlurStrength: number;
    motionBlurSamples: number;
    antialiasEnabled: boolean;
};

function ensureLutShaders(): void {
    const shaderKey = "mmdFrameGraphLutPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform sampler2D lutSampler;
            uniform float lutSize;
            uniform float lutIntensity;

            vec3 sampleLutCell(float r, float g, float b) {
                float size = max(lutSize, 2.0);
                float atlasWidth = size * size;
                vec2 uv = vec2((r + b * size + 0.5) / atlasWidth, (g + 0.5) / size);
                return texture2D(lutSampler, uv).rgb;
            }

            vec3 sampleLut(vec3 color) {
                float size = max(lutSize, 2.0);
                vec3 scaled = clamp(color, vec3(0.0), vec3(1.0)) * (size - 1.0);
                vec3 lower = floor(scaled);
                vec3 upper = min(lower + vec3(1.0), vec3(size - 1.0));
                vec3 factor = scaled - lower;

                vec3 c000 = sampleLutCell(lower.r, lower.g, lower.b);
                vec3 c100 = sampleLutCell(upper.r, lower.g, lower.b);
                vec3 c010 = sampleLutCell(lower.r, upper.g, lower.b);
                vec3 c110 = sampleLutCell(upper.r, upper.g, lower.b);
                vec3 c001 = sampleLutCell(lower.r, lower.g, upper.b);
                vec3 c101 = sampleLutCell(upper.r, lower.g, upper.b);
                vec3 c011 = sampleLutCell(lower.r, upper.g, upper.b);
                vec3 c111 = sampleLutCell(upper.r, upper.g, upper.b);

                vec3 c00 = mix(c000, c100, factor.r);
                vec3 c10 = mix(c010, c110, factor.r);
                vec3 c01 = mix(c001, c101, factor.r);
                vec3 c11 = mix(c011, c111, factor.r);
                vec3 c0 = mix(c00, c10, factor.g);
                vec3 c1 = mix(c01, c11, factor.g);
                return mix(c0, c1, factor.b);
            }

            void main(void) {
                vec4 color = texture2D(textureSampler, vUV);
                vec3 graded = sampleLut(color.rgb);
                gl_FragColor = vec4(mix(color.rgb, graded, clamp(lutIntensity, 0.0, 1.0)), color.a);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            var lutSamplerSampler: sampler;
            var lutSampler: texture_2d<f32>;
            uniform lutSize: f32;
            uniform lutIntensity: f32;

            fn sampleLutCell(r: f32, g: f32, b: f32) -> vec3f {
                let size: f32 = max(uniforms.lutSize, 2.0);
                let atlasWidth: f32 = size * size;
                let uv: vec2f = vec2f((r + b * size + 0.5) / atlasWidth, (g + 0.5) / size);
                return textureSampleLevel(lutSampler, lutSamplerSampler, uv, 0.0).rgb;
            }

            fn sampleLut(color: vec3f) -> vec3f {
                let size: f32 = max(uniforms.lutSize, 2.0);
                let scaled: vec3f = clamp(color, vec3f(0.0), vec3f(1.0)) * (size - 1.0);
                let lower: vec3f = floor(scaled);
                let upper: vec3f = min(lower + vec3f(1.0), vec3f(size - 1.0));
                let factor: vec3f = scaled - lower;

                let c000: vec3f = sampleLutCell(lower.r, lower.g, lower.b);
                let c100: vec3f = sampleLutCell(upper.r, lower.g, lower.b);
                let c010: vec3f = sampleLutCell(lower.r, upper.g, lower.b);
                let c110: vec3f = sampleLutCell(upper.r, upper.g, lower.b);
                let c001: vec3f = sampleLutCell(lower.r, lower.g, upper.b);
                let c101: vec3f = sampleLutCell(upper.r, lower.g, upper.b);
                let c011: vec3f = sampleLutCell(lower.r, upper.g, upper.b);
                let c111: vec3f = sampleLutCell(upper.r, upper.g, upper.b);

                let c00: vec3f = mix(c000, c100, vec3f(factor.r));
                let c10: vec3f = mix(c010, c110, vec3f(factor.r));
                let c01: vec3f = mix(c001, c101, vec3f(factor.r));
                let c11: vec3f = mix(c011, c111, vec3f(factor.r));
                let c0: vec3f = mix(c00, c10, vec3f(factor.g));
                let c1: vec3f = mix(c01, c11, vec3f(factor.g));
                return mix(c0, c1, vec3f(factor.b));
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let color: vec4f = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                let graded: vec3f = sampleLut(color.rgb);
                let amount: f32 = clamp(uniforms.lutIntensity, 0.0, 1.0);
                fragmentOutputs.color = vec4f(mix(color.rgb, graded, vec3f(amount)), color.a);
                return fragmentOutputs;
            }
        `;
    }
}

function ensureColorCorrectionShaders(): void {
    const shaderKey = "mmdFrameGraphColorCorrectionPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float contrast;
            uniform float gammaPower;

            void main(void) {
                vec4 color = texture2D(textureSampler, vUV);
                vec3 contrasted = ((color.rgb - vec3(0.5)) * contrast) + vec3(0.5);
                vec3 corrected = pow(max(contrasted, vec3(0.0)), vec3(max(gammaPower, 0.0001)));
                gl_FragColor = vec4(corrected, color.a);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            uniform contrast: f32;
            uniform gammaPower: f32;

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let color: vec4f = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                let contrasted: vec3f = ((color.rgb - vec3f(0.5)) * uniforms.contrast) + vec3f(0.5);
                let safeGamma: f32 = max(uniforms.gammaPower, 0.0001);
                let corrected: vec3f = pow(max(contrasted, vec3f(0.0)), vec3f(safeGamma));
                fragmentOutputs.color = vec4f(corrected, color.a);
            }
        `;
    }
}

function ensureLuminousShaders(): void {
    const shaderKey = "mmdFrameGraphLuminousPixelShader";
    const blurShaderKey = "mmdFrameGraphLuminousBlurPixelShader";
    const extractShaderKey = "mmdFrameGraphLuminousExtractPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform sampler2D glowSampler;
            uniform sampler2D haloSampler;
            uniform float intensity;
            uniform float glareCount;
            uniform float glareLength;
            uniform float glareAngle;
            uniform float glarePower;
            uniform vec2 texelSize;

            vec3 tonemapSoft(vec3 color) {
                return color / (vec3(1.0) + color);
            }

            vec3 sampleGlareRay(float rayIndex) {
                float count = max(1.0, glareCount);
                float angle = glareAngle + rayIndex * 3.14159265 / count;
                vec2 direction = vec2(cos(angle), sin(angle));
                vec2 perpendicular = vec2(-direction.y, direction.x);
                vec3 color = texture2D(glowSampler, vUV).rgb * 0.04;
                for (int i = 0; i < 12; i++) {
                    float t = (float(i) + 0.35) / 12.0;
                    vec2 delta = direction * texelSize * glareLength * t;
                    vec2 width = perpendicular * texelSize * (1.25 + glareLength * t * 0.018);
                    float weight = exp(-t * 3.4) * 0.035;
                    color += texture2D(glowSampler, clamp(vUV + delta + width, vec2(0.0), vec2(1.0))).rgb * weight;
                    color += texture2D(glowSampler, clamp(vUV + delta - width, vec2(0.0), vec2(1.0))).rgb * weight;
                    color += texture2D(glowSampler, clamp(vUV - delta + width, vec2(0.0), vec2(1.0))).rgb * weight;
                    color += texture2D(glowSampler, clamp(vUV - delta - width, vec2(0.0), vec2(1.0))).rgb * weight;
                }
                return color;
            }

            void main(void) {
                vec4 base = texture2D(textureSampler, vUV);
                vec3 coreSource = texture2D(glowSampler, vUV).rgb;
                vec3 haloSource = texture2D(haloSampler, vUV).rgb;
                vec3 glare = vec3(0.0);
                if (glareCount > 0.5 && glarePower > 0.0001 && glareLength > 0.5) {
                    for (int i = 0; i < 12; i++) {
                        if (float(i) >= glareCount) {
                            break;
                        }
                        glare += sampleGlareRay(float(i));
                    }
                    glare /= sqrt(max(1.0, glareCount));
                }
                vec3 glowSource = coreSource * 3.6 + haloSource * 2.2;
                vec3 glow = tonemapSoft((glowSource + glare * glarePower * 1.45) * intensity);
                vec3 screen = vec3(1.0) - (vec3(1.0) - clamp(base.rgb, vec3(0.0), vec3(1.0))) * (vec3(1.0) - glow);
                vec3 softAdd = min(base.rgb + glow * 0.78, vec3(1.45));
                vec3 result = mix(screen, softAdd, 0.48);
                gl_FragColor = vec4(result, base.a);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            var glowSamplerSampler: sampler;
            var glowSampler: texture_2d<f32>;
            var haloSamplerSampler: sampler;
            var haloSampler: texture_2d<f32>;
            uniform intensity: f32;
            uniform glareCount: f32;
            uniform glareLength: f32;
            uniform glareAngle: f32;
            uniform glarePower: f32;
            uniform texelSize: vec2f;

            fn tonemapSoft(color: vec3f) -> vec3f {
                return color / (vec3f(1.0) + color);
            }

            fn sampleGlareRay(uv: vec2f, rayIndex: f32) -> vec3f {
                let count = max(1.0, uniforms.glareCount);
                let angle = uniforms.glareAngle + rayIndex * 3.14159265 / count;
                let direction = vec2f(cos(angle), sin(angle));
                let perpendicular = vec2f(-direction.y, direction.x);
                var color = textureSample(glowSampler, glowSamplerSampler, uv).rgb * 0.04;
                for (var i: i32 = 0; i < 12; i = i + 1) {
                    let t = (f32(i) + 0.35) / 12.0;
                    let delta = direction * uniforms.texelSize * uniforms.glareLength * t;
                    let width = perpendicular * uniforms.texelSize * (1.25 + uniforms.glareLength * t * 0.018);
                    let weight = exp(-t * 3.4) * 0.035;
                    color += textureSample(glowSampler, glowSamplerSampler, clamp(uv + delta + width, vec2f(0.0), vec2f(1.0))).rgb * weight;
                    color += textureSample(glowSampler, glowSamplerSampler, clamp(uv + delta - width, vec2f(0.0), vec2f(1.0))).rgb * weight;
                    color += textureSample(glowSampler, glowSamplerSampler, clamp(uv - delta + width, vec2f(0.0), vec2f(1.0))).rgb * weight;
                    color += textureSample(glowSampler, glowSamplerSampler, clamp(uv - delta - width, vec2f(0.0), vec2f(1.0))).rgb * weight;
                }
                return color;
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let base = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                let coreSource = textureSample(glowSampler, glowSamplerSampler, input.vUV).rgb;
                let haloSource = textureSample(haloSampler, haloSamplerSampler, input.vUV).rgb;
                var glare = vec3f(0.0);
                if (uniforms.glareCount > 0.5 && uniforms.glarePower > 0.0001 && uniforms.glareLength > 0.5) {
                    for (var i: i32 = 0; i < 12; i = i + 1) {
                        if (f32(i) >= uniforms.glareCount) {
                            break;
                        }
                        glare += sampleGlareRay(input.vUV, f32(i));
                    }
                    glare /= sqrt(max(1.0, uniforms.glareCount));
                }
                let glowSource = coreSource * 3.6 + haloSource * 2.2;
                let glow = tonemapSoft((glowSource + glare * uniforms.glarePower * 1.45) * uniforms.intensity);
                let screen = vec3f(1.0) - (vec3f(1.0) - clamp(base.rgb, vec3f(0.0), vec3f(1.0))) * (vec3f(1.0) - glow);
                let softAdd = min(base.rgb + glow * 0.78, vec3f(1.45));
                let result = mix(screen, softAdd, vec3f(0.48));
                fragmentOutputs.color = vec4f(result, base.a);
                return fragmentOutputs;
            }
        `;
    }
    if (!ShaderStore.ShadersStore[extractShaderKey]) {
        ShaderStore.ShadersStore[extractShaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float threshold;

            float luminance(vec3 color) {
                return dot(color, vec3(0.299, 0.587, 0.114));
            }

            void main(void) {
                vec3 color = texture2D(textureSampler, vUV).rgb;
                float peak = max(max(color.r, color.g), color.b);
                float signal = max(luminance(color), peak);
                float knee = 0.24;
                float effectiveThreshold = threshold * 0.35;
                float mask = smoothstep(max(0.0, effectiveThreshold - knee), min(1.5, effectiveThreshold + knee), signal);
                vec3 saturated = mix(color, color * color * 1.35 + color * 0.35, 0.38);
                gl_FragColor = vec4(saturated * mask, 1.0);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[extractShaderKey]) {
        ShaderStore.ShadersStoreWGSL[extractShaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            uniform threshold: f32;

            fn luminance(color: vec3f) -> f32 {
                return dot(color, vec3f(0.299, 0.587, 0.114));
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let color = textureSample(textureSampler, textureSamplerSampler, input.vUV).rgb;
                let peak = max(max(color.r, color.g), color.b);
                let signal = max(luminance(color), peak);
                let knee = 0.24;
                let effectiveThreshold = uniforms.threshold * 0.35;
                let mask = smoothstep(max(0.0, effectiveThreshold - knee), min(1.5, effectiveThreshold + knee), signal);
                let saturated = mix(color, color * color * 1.35 + color * 0.35, vec3f(0.38));
                fragmentOutputs.color = vec4f(saturated * mask, 1.0);
                return fragmentOutputs;
            }
        `;
    }
    if (!ShaderStore.ShadersStore[blurShaderKey]) {
        ShaderStore.ShadersStore[blurShaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform vec2 texelStep;
            uniform float threshold;
            uniform float extractSource;

            float luminance(vec3 color) {
                return dot(color, vec3(0.299, 0.587, 0.114));
            }

            vec3 sampleGlow(vec2 uv) {
                vec3 color = texture2D(textureSampler, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
                if (extractSource < 0.5) {
                    return color;
                }
                float peak = max(max(color.r, color.g), color.b);
                float signal = max(luminance(color), peak);
                float knee = 0.24;
                float effectiveThreshold = threshold * 0.35;
                float mask = smoothstep(max(0.0, effectiveThreshold - knee), min(1.5, effectiveThreshold + knee), signal);
                vec3 saturated = mix(color, color * color * 1.35 + color * 0.35, 0.38);
                return saturated * mask;
            }

            vec3 gaussianBlur(vec2 stepRadius) {
                vec3 glow = sampleGlow(vUV) * 0.0920246;
                glow += sampleGlow(vUV + stepRadius * 1.0) * 0.0902024;
                glow += sampleGlow(vUV - stepRadius * 1.0) * 0.0902024;
                glow += sampleGlow(vUV + stepRadius * 2.0) * 0.0849494;
                glow += sampleGlow(vUV - stepRadius * 2.0) * 0.0849494;
                glow += sampleGlow(vUV + stepRadius * 3.0) * 0.0768654;
                glow += sampleGlow(vUV - stepRadius * 3.0) * 0.0768654;
                glow += sampleGlow(vUV + stepRadius * 4.0) * 0.0668236;
                glow += sampleGlow(vUV - stepRadius * 4.0) * 0.0668236;
                glow += sampleGlow(vUV + stepRadius * 5.0) * 0.0558158;
                glow += sampleGlow(vUV - stepRadius * 5.0) * 0.0558158;
                glow += sampleGlow(vUV + stepRadius * 6.0) * 0.0447932;
                glow += sampleGlow(vUV - stepRadius * 6.0) * 0.0447932;
                glow += sampleGlow(vUV + stepRadius * 7.0) * 0.0345379;
                glow += sampleGlow(vUV - stepRadius * 7.0) * 0.0345379;
                return glow;
            }

            void main(void) {
                vec3 core = gaussianBlur(texelStep * 0.24) * 0.82;
                vec3 halo = gaussianBlur(texelStep) * 0.28;
                gl_FragColor = vec4(core + halo, 1.0);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[blurShaderKey]) {
        ShaderStore.ShadersStoreWGSL[blurShaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            uniform texelStep: vec2f;
            uniform threshold: f32;
            uniform extractSource: f32;

            fn luminance(color: vec3f) -> f32 {
                return dot(color, vec3f(0.299, 0.587, 0.114));
            }

            fn sampleGlow(uv: vec2f) -> vec3f {
                let safeUv = clamp(uv, vec2f(0.0), vec2f(1.0));
                let color = textureSample(textureSampler, textureSamplerSampler, safeUv).rgb;
                if (uniforms.extractSource < 0.5) {
                    return color;
                }
                let peak = max(max(color.r, color.g), color.b);
                let signal = max(luminance(color), peak);
                let knee = 0.24;
                let effectiveThreshold = uniforms.threshold * 0.35;
                let mask = smoothstep(max(0.0, effectiveThreshold - knee), min(1.5, effectiveThreshold + knee), signal);
                let saturated = mix(color, color * color * 1.35 + color * 0.35, vec3f(0.38));
                return saturated * mask;
            }

            fn gaussianBlur(uv: vec2f, stepRadius: vec2f) -> vec3f {
                var glow = sampleGlow(uv) * 0.0920246;
                glow += sampleGlow(uv + stepRadius * 1.0) * 0.0902024;
                glow += sampleGlow(uv - stepRadius * 1.0) * 0.0902024;
                glow += sampleGlow(uv + stepRadius * 2.0) * 0.0849494;
                glow += sampleGlow(uv - stepRadius * 2.0) * 0.0849494;
                glow += sampleGlow(uv + stepRadius * 3.0) * 0.0768654;
                glow += sampleGlow(uv - stepRadius * 3.0) * 0.0768654;
                glow += sampleGlow(uv + stepRadius * 4.0) * 0.0668236;
                glow += sampleGlow(uv - stepRadius * 4.0) * 0.0668236;
                glow += sampleGlow(uv + stepRadius * 5.0) * 0.0558158;
                glow += sampleGlow(uv - stepRadius * 5.0) * 0.0558158;
                glow += sampleGlow(uv + stepRadius * 6.0) * 0.0447932;
                glow += sampleGlow(uv - stepRadius * 6.0) * 0.0447932;
                glow += sampleGlow(uv + stepRadius * 7.0) * 0.0345379;
                glow += sampleGlow(uv - stepRadius * 7.0) * 0.0345379;
                return glow;
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let core = gaussianBlur(input.vUV, uniforms.texelStep * 0.24) * 0.82;
                let halo = gaussianBlur(input.vUV, uniforms.texelStep) * 0.28;
                fragmentOutputs.color = vec4f(core + halo, 1.0);
                return fragmentOutputs;
            }
        `;
    }
}

function ensureBloomTintShaders(): void {
    const shaderKey = "mmdFrameGraphBloomTintPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform sampler2D originalSampler;
            uniform vec3 bloomColor;

            void main(void) {
                vec4 bloomed = texture2D(textureSampler, vUV);
                vec4 original = texture2D(originalSampler, vUV);
                vec3 bloomDelta = max(bloomed.rgb - original.rgb, vec3(0.0));
                gl_FragColor = vec4(original.rgb + bloomDelta * bloomColor, bloomed.a);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            var originalSamplerSampler: sampler;
            var originalSampler: texture_2d<f32>;
            uniform bloomColor: vec3f;

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let bloomed = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                let original = textureSample(originalSampler, originalSamplerSampler, input.vUV);
                let bloomDelta = max(bloomed.rgb - original.rgb, vec3f(0.0));
                fragmentOutputs.color = vec4f(original.rgb + bloomDelta * uniforms.bloomColor, bloomed.a);
                return fragmentOutputs;
            }
        `;
    }
}

function ensureOffsetShadowShaders(): void {
    const shaderKey = "mmdFrameGraphOffsetShadowPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform sampler2D depthSampler;
            uniform vec2 texelSize;
            uniform vec2 offsetPixels;
            uniform float strength;
            uniform float depthBias;
            uniform float maxDepth;
            uniform float depthScale;
            uniform float thickness;
            uniform float softness;
            uniform vec3 shadowColor;
            uniform float debugView;

            float sampleDepth(vec2 uv) {
                return texture2D(depthSampler, clamp(uv, vec2(0.0), vec2(1.0))).r;
            }

            float resolveOffsetScale(float currentDepth) {
                float distanceScale = clamp(10.0 / max(0.000001, currentDepth), 0.1, 1.0);
                return mix(1.0, distanceScale, clamp(depthScale, 0.0, 1.0));
            }

            float closerMaskAt(vec2 uv, float receiverDepth) {
                float depth = sampleDepth(uv);
                if (receiverDepth <= 0.000001 || depth <= 0.000001) {
                    return 0.0;
                }
                float depthDelta = receiverDepth - depth;
                float minMask = step(depthBias, depthDelta);
                float resolvedMaxDepth = max(depthBias + 0.0001, maxDepth);
                float maxMask = 1.0 - step(resolvedMaxDepth, depthDelta);
                return minMask * maxMask;
            }

            float depthEdgeMaskAt(vec2 uv, float receiverDepth) {
                float centerDepth = sampleDepth(uv);
                if (closerMaskAt(uv, receiverDepth) <= 0.0) {
                    return 0.0;
                }
                float rightDepth = sampleDepth(uv + vec2(texelSize.x, 0.0));
                float leftDepth = sampleDepth(uv - vec2(texelSize.x, 0.0));
                float upDepth = sampleDepth(uv + vec2(0.0, texelSize.y));
                float downDepth = sampleDepth(uv - vec2(0.0, texelSize.y));
                float edgeThreshold = max(0.0001, depthBias);
                float edge = 0.0;
                edge = max(edge, step(edgeThreshold, abs(centerDepth - rightDepth)));
                edge = max(edge, step(edgeThreshold, abs(centerDepth - leftDepth)));
                edge = max(edge, step(edgeThreshold, abs(centerDepth - upDepth)));
                edge = max(edge, step(edgeThreshold, abs(centerDepth - downDepth)));
                return edge;
            }

            float sampleShadowMask(vec2 uv, vec2 offsetVector) {
                float currentDepth = sampleDepth(uv);
                if (currentDepth <= 0.000001) {
                    return 0.0;
                }
                float maxReceiverDepth = max(10.0, maxDepth * 20.0);
                if (currentDepth > maxReceiverDepth) {
                    return 0.0;
                }
                if (closerMaskAt(uv - offsetVector, currentDepth) <= 0.0) {
                    return 0.0;
                }
                vec2 pixelOffset = offsetVector / max(texelSize, vec2(0.000001));
                float pixelLength = length(pixelOffset);
                vec2 perpendicular = pixelLength > 0.0001
                    ? vec2(-pixelOffset.y, pixelOffset.x) / pixelLength * texelSize
                    : vec2(0.0);
                float mask = 0.0;
                for (int i = 0; i < 64; i++) {
                    float t = (float(i) + 0.5) / 64.0;
                    vec2 sampleUv = uv - offsetVector * t;
                    float edge = depthEdgeMaskAt(sampleUv, currentDepth);
                    edge = max(edge, depthEdgeMaskAt(sampleUv + perpendicular, currentDepth));
                    edge = max(edge, depthEdgeMaskAt(sampleUv - perpendicular, currentDepth));
                    mask = max(mask, edge);
                }
                return mask;
            }

            void main(void) {
                vec4 source = texture2D(textureSampler, vUV);
                float currentDepth = sampleDepth(vUV);
                float offsetScale = resolveOffsetScale(currentDepth);
                vec2 offsetVector = offsetPixels * texelSize * offsetScale;
                float radius = max(0.0, softness) * offsetScale;
                float mask = sampleShadowMask(vUV, offsetVector) * 0.42;
                mask += sampleShadowMask(vUV, offsetVector - vec2(texelSize.x * radius, 0.0)) * 0.145;
                mask += sampleShadowMask(vUV, offsetVector + vec2(texelSize.x * radius, 0.0)) * 0.145;
                mask += sampleShadowMask(vUV, offsetVector - vec2(0.0, texelSize.y * radius)) * 0.135;
                mask += sampleShadowMask(vUV, offsetVector + vec2(0.0, texelSize.y * radius)) * 0.135;
                mask = clamp(mask * strength, 0.0, 1.0);
                if (debugView > 0.5) {
                    gl_FragColor = vec4(vec3(mask), source.a);
                    return;
                }
                vec3 shaded = mix(source.rgb, source.rgb * shadowColor, mask);
                gl_FragColor = vec4(shaded, source.a);
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
            uniform texelSize: vec2f;
            uniform offsetPixels: vec2f;
            uniform strength: f32;
            uniform depthBias: f32;
            uniform maxDepth: f32;
            uniform depthScale: f32;
            uniform thickness: f32;
            uniform softness: f32;
            uniform shadowColor: vec3f;
            uniform debugView: f32;

            fn sampleDepth(uv: vec2f) -> f32 {
                return textureSampleLevel(depthSampler, depthSamplerSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r;
            }

            fn resolveOffsetScale(currentDepth: f32) -> f32 {
                let distanceScale = clamp(10.0 / max(0.000001, currentDepth), 0.1, 1.0);
                return mix(1.0, distanceScale, clamp(uniforms.depthScale, 0.0, 1.0));
            }

            fn closerMaskAt(uv: vec2f, receiverDepth: f32) -> f32 {
                let depth = sampleDepth(uv);
                if (receiverDepth <= 0.000001 || depth <= 0.000001) {
                    return 0.0;
                }
                let depthDelta = receiverDepth - depth;
                let minMask = step(uniforms.depthBias, depthDelta);
                let resolvedMaxDepth = max(uniforms.depthBias + 0.0001, uniforms.maxDepth);
                let maxMask = 1.0 - step(resolvedMaxDepth, depthDelta);
                return minMask * maxMask;
            }

            fn depthEdgeMaskAt(uv: vec2f, receiverDepth: f32) -> f32 {
                let centerDepth = sampleDepth(uv);
                if (closerMaskAt(uv, receiverDepth) <= 0.0) {
                    return 0.0;
                }
                let rightDepth = sampleDepth(uv + vec2f(uniforms.texelSize.x, 0.0));
                let leftDepth = sampleDepth(uv - vec2f(uniforms.texelSize.x, 0.0));
                let upDepth = sampleDepth(uv + vec2f(0.0, uniforms.texelSize.y));
                let downDepth = sampleDepth(uv - vec2f(0.0, uniforms.texelSize.y));
                let edgeThreshold = max(0.0001, uniforms.depthBias);
                var edge = 0.0;
                edge = max(edge, step(edgeThreshold, abs(centerDepth - rightDepth)));
                edge = max(edge, step(edgeThreshold, abs(centerDepth - leftDepth)));
                edge = max(edge, step(edgeThreshold, abs(centerDepth - upDepth)));
                edge = max(edge, step(edgeThreshold, abs(centerDepth - downDepth)));
                return edge;
            }

            fn sampleShadowMask(uv: vec2f, offsetVector: vec2f) -> f32 {
                let currentDepth = sampleDepth(uv);
                if (currentDepth <= 0.000001) {
                    return 0.0;
                }
                let maxReceiverDepth = max(10.0, uniforms.maxDepth * 20.0);
                if (currentDepth > maxReceiverDepth) {
                    return 0.0;
                }
                if (closerMaskAt(uv - offsetVector, currentDepth) <= 0.0) {
                    return 0.0;
                }
                let pixelOffset = offsetVector / max(uniforms.texelSize, vec2f(0.000001));
                let pixelLength = length(pixelOffset);
                let perpendicular = select(
                    vec2f(0.0),
                    vec2f(-pixelOffset.y, pixelOffset.x) / pixelLength * uniforms.texelSize,
                    pixelLength > 0.0001,
                );
                var mask = 0.0;
                for (var i = 0; i < 64; i = i + 1) {
                    let t = (f32(i) + 0.5) / 64.0;
                    let sampleUv = uv - offsetVector * t;
                    var edge = depthEdgeMaskAt(sampleUv, currentDepth);
                    edge = max(edge, depthEdgeMaskAt(sampleUv + perpendicular, currentDepth));
                    edge = max(edge, depthEdgeMaskAt(sampleUv - perpendicular, currentDepth));
                    mask = max(mask, edge);
                }
                return mask;
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let source = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV, 0.0);
                let currentDepth = sampleDepth(input.vUV);
                let offsetScale = resolveOffsetScale(currentDepth);
                let offsetVector = uniforms.offsetPixels * uniforms.texelSize * offsetScale;
                let radius = max(0.0, uniforms.softness) * offsetScale;
                var mask = sampleShadowMask(input.vUV, offsetVector) * 0.42;
                mask += sampleShadowMask(input.vUV, offsetVector - vec2f(uniforms.texelSize.x * radius, 0.0)) * 0.145;
                mask += sampleShadowMask(input.vUV, offsetVector + vec2f(uniforms.texelSize.x * radius, 0.0)) * 0.145;
                mask += sampleShadowMask(input.vUV, offsetVector - vec2f(0.0, uniforms.texelSize.y * radius)) * 0.135;
                mask += sampleShadowMask(input.vUV, offsetVector + vec2f(0.0, uniforms.texelSize.y * radius)) * 0.135;
                mask = clamp(mask * uniforms.strength, 0.0, 1.0);
                if (uniforms.debugView > 0.5) {
                    fragmentOutputs.color = vec4f(vec3f(mask), source.a);
                    return fragmentOutputs;
                }
                let shaded = mix(source.rgb, source.rgb * uniforms.shadowColor, vec3f(mask));
                fragmentOutputs.color = vec4f(shaded, source.a);
                return fragmentOutputs;
            }
        `;
    }
}

function ensureOffsetHighlightShaders(): void {
    const shaderKey = "mmdFrameGraphOffsetHighlightPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform sampler2D depthSampler;
            uniform vec2 texelSize;
            uniform vec2 offsetPixels;
            uniform float strength;
            uniform float depthScale;
            uniform vec3 highlightColor;
            uniform float debugView;

            float sampleDepth(vec2 uv) {
                return texture2D(depthSampler, clamp(uv, vec2(0.0), vec2(1.0))).r;
            }

            float resolveOffsetScale(float currentDepth) {
                float distanceScale = clamp(10.0 / max(0.000001, currentDepth), 0.1, 1.0);
                return mix(1.0, distanceScale, clamp(depthScale, 0.0, 1.0));
            }

            float resolveForegroundMask(float currentDepth) {
                float farMask = 1.0 - smoothstep(25.0, 80.0, currentDepth);
                return farMask;
            }

            float foregroundMaskAt(vec2 uv) {
                float depth = sampleDepth(uv);
                if (depth <= 0.000001) {
                    return 0.0;
                }
                return resolveForegroundMask(depth);
            }

            float sampleOffsetFillMask(vec2 uv, vec2 direction, float sampleRadius) {
                float originalMask = foregroundMaskAt(uv);
                float offsetMask = foregroundMaskAt(uv - direction * texelSize * sampleRadius);
                return max(0.0, originalMask - offsetMask);
            }

            void main(void) {
                vec4 source = texture2D(textureSampler, vUV);
                float currentDepth = sampleDepth(vUV);
                float offsetLength = length(offsetPixels);
                vec2 direction = offsetLength > 0.001 ? offsetPixels / offsetLength : vec2(0.0, -1.0);
                float offsetScale = currentDepth > 0.000001 ? resolveOffsetScale(currentDepth) : 1.0;
                float sampleRadius = max(1.0, min(24.0, offsetLength * 0.125)) * offsetScale;
                float mask = sampleOffsetFillMask(vUV, direction, sampleRadius);
                mask = clamp(mask * strength, 0.0, 1.0);
                if (debugView > 0.5) {
                    gl_FragColor = vec4(vec3(mask), source.a);
                    return;
                }
                vec3 highlighted = source.rgb + highlightColor * mask;
                gl_FragColor = vec4(clamp(highlighted, vec3(0.0), vec3(1.0)), source.a);
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
            uniform texelSize: vec2f;
            uniform offsetPixels: vec2f;
            uniform strength: f32;
            uniform depthScale: f32;
            uniform highlightColor: vec3f;
            uniform debugView: f32;

            fn sampleDepth(uv: vec2f) -> f32 {
                return textureSampleLevel(depthSampler, depthSamplerSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r;
            }

            fn resolveOffsetScale(currentDepth: f32) -> f32 {
                let distanceScale = clamp(10.0 / max(0.000001, currentDepth), 0.1, 1.0);
                return mix(1.0, distanceScale, clamp(uniforms.depthScale, 0.0, 1.0));
            }

            fn resolveForegroundMask(currentDepth: f32) -> f32 {
                let farMask = 1.0 - smoothstep(25.0, 80.0, currentDepth);
                return farMask;
            }

            fn foregroundMaskAt(uv: vec2f) -> f32 {
                let depth = sampleDepth(uv);
                if (depth <= 0.000001) {
                    return 0.0;
                }
                return resolveForegroundMask(depth);
            }

            fn sampleOffsetFillMask(uv: vec2f, direction: vec2f, sampleRadius: f32) -> f32 {
                let originalMask = foregroundMaskAt(uv);
                let offsetMask = foregroundMaskAt(uv - direction * uniforms.texelSize * sampleRadius);
                return max(0.0, originalMask - offsetMask);
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let source = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV, 0.0);
                let currentDepth = sampleDepth(input.vUV);
                let offsetLength = length(uniforms.offsetPixels);
                var direction = vec2f(0.0, -1.0);
                if (offsetLength > 0.001) {
                    direction = uniforms.offsetPixels / offsetLength;
                }
                var offsetScale = 1.0;
                if (currentDepth > 0.000001) {
                    offsetScale = resolveOffsetScale(currentDepth);
                }
                let sampleRadius = max(1.0, min(24.0, offsetLength * 0.125)) * offsetScale;
                var mask = sampleOffsetFillMask(input.vUV, direction, sampleRadius);
                mask = clamp(mask * uniforms.strength, 0.0, 1.0);
                if (uniforms.debugView > 0.5) {
                    fragmentOutputs.color = vec4f(vec3f(mask), source.a);
                    return fragmentOutputs;
                }
                let highlighted = source.rgb + uniforms.highlightColor * vec3f(mask);
                fragmentOutputs.color = vec4f(clamp(highlighted, vec3f(0.0), vec3f(1.0)), source.a);
                return fragmentOutputs;
            }
        `;
    }
}

function ensureSsaoToonCompositeShaders(): void {
    const shaderKey = "mmdFrameGraphSsaoToonCompositePixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform sampler2D originalColor;
            uniform vec3 shadowColor;
            uniform float toonInfluence;
            uniform float enabled;

            vec3 safeHue(vec3 color) {
                float maxChannel = max(max(color.r, color.g), color.b);
                return color / max(maxChannel, 0.0001);
            }

            void main(void) {
                vec4 ssaoColor = texture2D(textureSampler, vUV);
                vec4 original = texture2D(originalColor, vUV);
                if (enabled < 0.5) {
                    gl_FragColor = ssaoColor;
                    return;
                }

                vec3 ratio = ssaoColor.rgb / max(original.rgb, vec3(0.035));
                float aoMask = clamp(dot(clamp(ratio, vec3(0.0), vec3(1.0)), vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
                float ao = clamp(1.0 - aoMask, 0.0, 1.0);
                if (ao <= 0.0001) {
                    gl_FragColor = ssaoColor;
                    return;
                }

                vec3 baseColor = clamp(original.rgb, vec3(0.0), vec3(1.0));
                float baseMax = max(max(baseColor.r, baseColor.g), baseColor.b);
                float baseMin = min(min(baseColor.r, baseColor.g), baseColor.b);
                float baseChroma = baseMax - baseMin;
                float brightNeutralProtect = smoothstep(0.70, 0.92, baseMax) * (1.0 - smoothstep(0.035, 0.16, baseChroma));
                ao *= mix(1.0, 0.24, brightNeutralProtect);
                if (ao <= 0.0001) {
                    gl_FragColor = mix(ssaoColor, original, brightNeutralProtect);
                    return;
                }
                float colorValidity = smoothstep(0.12, 0.45, baseMax) * smoothstep(0.04, 0.22, baseChroma);
                vec3 materialToonBand = mix(vec3(0.70), safeHue(baseColor) * 0.66, colorValidity);

                vec3 shadowHue = safeHue(clamp(shadowColor, vec3(0.0), vec3(1.0)));
                vec3 shadowBand = mix(vec3(0.68), shadowHue * 0.66, 0.72);
                vec3 toonBand = mix(shadowBand, materialToonBand, clamp(toonInfluence, 0.0, 1.0) * 0.55);

                float deepAo = smoothstep(0.12, 0.46, ao) * (1.0 - brightNeutralProtect * 0.75);
                vec3 tinted = original.rgb * mix(vec3(1.0), toonBand, vec3(clamp(ao * 1.12, 0.0, 1.0)));
                vec3 result = mix(ssaoColor.rgb, tinted, clamp(0.82 + ao * 0.12 + brightNeutralProtect * 0.10, 0.0, 0.97));
                vec3 selfMultiplied = tinted * mix(vec3(1.0), toonBand, vec3(clamp(deepAo * 0.95, 0.0, 1.0)));
                result = mix(result, min(result, selfMultiplied), clamp(deepAo * 0.72, 0.0, 0.86));
                gl_FragColor = vec4(result, ssaoColor.a);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            var originalColorSampler: sampler;
            var originalColor: texture_2d<f32>;
            uniform shadowColor: vec3f;
            uniform toonInfluence: f32;
            uniform enabled: f32;

            fn safeHue(color: vec3f) -> vec3f {
                let maxChannel = max(max(color.r, color.g), color.b);
                return color / max(maxChannel, 0.0001);
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let ssaoColor = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                let original = textureSample(originalColor, originalColorSampler, input.vUV);
                if (uniforms.enabled < 0.5) {
                    fragmentOutputs.color = ssaoColor;
                    return fragmentOutputs;
                }

                let ratio = ssaoColor.rgb / max(original.rgb, vec3f(0.035));
                let aoMask = clamp(dot(clamp(ratio, vec3f(0.0), vec3f(1.0)), vec3f(0.299, 0.587, 0.114)), 0.0, 1.0);
                let ao = clamp(1.0 - aoMask, 0.0, 1.0);
                if (ao <= 0.0001) {
                    fragmentOutputs.color = ssaoColor;
                    return fragmentOutputs;
                }

                let baseColor = clamp(original.rgb, vec3f(0.0), vec3f(1.0));
                let baseMax = max(max(baseColor.r, baseColor.g), baseColor.b);
                let baseMin = min(min(baseColor.r, baseColor.g), baseColor.b);
                let baseChroma = baseMax - baseMin;
                let brightNeutralProtect = smoothstep(0.70, 0.92, baseMax) * (1.0 - smoothstep(0.035, 0.16, baseChroma));
                let protectedAo = ao * mix(1.0, 0.24, brightNeutralProtect);
                if (protectedAo <= 0.0001) {
                    fragmentOutputs.color = mix(ssaoColor, original, brightNeutralProtect);
                    return fragmentOutputs;
                }
                let colorValidity = smoothstep(0.12, 0.45, baseMax) * smoothstep(0.04, 0.22, baseChroma);
                let materialToonBand = mix(vec3f(0.70), safeHue(baseColor) * 0.66, vec3f(colorValidity));

                let shadowHue = safeHue(clamp(uniforms.shadowColor, vec3f(0.0), vec3f(1.0)));
                let shadowBand = mix(vec3f(0.68), shadowHue * 0.66, vec3f(0.72));
                var toonBand = mix(shadowBand, materialToonBand, vec3f(clamp(uniforms.toonInfluence, 0.0, 1.0) * 0.55));

                let deepAo = smoothstep(0.12, 0.46, protectedAo) * (1.0 - brightNeutralProtect * 0.75);
                let tinted = original.rgb * mix(vec3f(1.0), toonBand, vec3f(clamp(protectedAo * 1.12, 0.0, 1.0)));
                let result = mix(ssaoColor.rgb, tinted, vec3f(clamp(0.82 + protectedAo * 0.12 + brightNeutralProtect * 0.10, 0.0, 0.97)));
                let selfMultiplied = tinted * mix(vec3f(1.0), toonBand, vec3f(clamp(deepAo * 0.95, 0.0, 1.0)));
                let deepResult = mix(result, min(result, selfMultiplied), vec3f(clamp(deepAo * 0.72, 0.0, 0.86)));
                fragmentOutputs.color = vec4f(deepResult, ssaoColor.a);
                return fragmentOutputs;
            }
        `;
    }
}

function ensureVignetteEdgeBlurShaders(): void {
    const shaderKey = "mmdFrameGraphVignetteEdgeBlurPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform vec2 texelSize;
            uniform float edgeBlurStrength;
            uniform float vignetteWeight;
            uniform float aspectRatio;

            float computeEdgeMask(vec2 uv) {
                vec2 centered = (uv - vec2(0.5)) * vec2(aspectRatio, 1.0);
                float radius = length(centered);
                float mask = smoothstep(0.50, 0.96, radius);
                return mask * mask * (3.0 - 2.0 * mask);
            }

            float computeVignetteMask(vec2 uv) {
                vec2 centered = (uv - vec2(0.5)) * vec2(aspectRatio, 1.0);
                float radius = length(centered);
                float mask = smoothstep(0.42, 0.92, radius);
                return mask * mask * (3.0 - 2.0 * mask);
            }

            float computeEdgeStrengthCurve(float strength) {
                float lifted = strength + 0.75 * strength * strength;
                return min(1.75, lifted);
            }

            vec4 sampleBlur(vec2 uv, vec2 stepRadius) {
                vec4 color = texture2D(textureSampler, uv) * 0.20;
                color += texture2D(textureSampler, clamp(uv + vec2(stepRadius.x, 0.0), vec2(0.001), vec2(0.999))) * 0.12;
                color += texture2D(textureSampler, clamp(uv - vec2(stepRadius.x, 0.0), vec2(0.001), vec2(0.999))) * 0.12;
                color += texture2D(textureSampler, clamp(uv + vec2(0.0, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.12;
                color += texture2D(textureSampler, clamp(uv - vec2(0.0, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.12;
                color += texture2D(textureSampler, clamp(uv + vec2(stepRadius.x, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.08;
                color += texture2D(textureSampler, clamp(uv + vec2(-stepRadius.x, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.08;
                color += texture2D(textureSampler, clamp(uv + vec2(stepRadius.x, -stepRadius.y), vec2(0.001), vec2(0.999))) * 0.08;
                color += texture2D(textureSampler, clamp(uv - vec2(stepRadius.x, stepRadius.y), vec2(0.001), vec2(0.999))) * 0.08;
                return color;
            }

            void main(void) {
                vec4 baseColor = texture2D(textureSampler, vUV);
                vec4 finalColor = baseColor;

                if (edgeBlurStrength > 0.0001) {
                    float edgeMask = computeEdgeMask(vUV);
                    if (edgeMask > 0.0001) {
                        float curvedStrength = computeEdgeStrengthCurve(edgeBlurStrength);
                        float blurPixels = (0.7 + 9.8 * curvedStrength) * (0.24 + 0.76 * edgeMask);
                        vec2 stepRadius = texelSize * blurPixels;
                        vec4 blurColor = sampleBlur(vUV, stepRadius);
                        float blurMix = edgeMask * (0.28 + 0.72 * min(1.0, curvedStrength));
                        finalColor = mix(finalColor, blurColor, clamp(blurMix, 0.0, 1.0));
                    }
                }

                if (vignetteWeight > 0.0001) {
                    float vignetteMask = computeVignetteMask(vUV);
                    float vignetteAmount = clamp(vignetteWeight * 0.35, 0.0, 1.0);
                    finalColor.rgb *= 1.0 - vignetteMask * vignetteAmount;
                }

                gl_FragColor = finalColor;
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            uniform texelSize: vec2f;
            uniform edgeBlurStrength: f32;
            uniform vignetteWeight: f32;
            uniform aspectRatio: f32;

            fn computeEdgeMask(uv: vec2f) -> f32 {
                let centered: vec2f = (uv - vec2f(0.5, 0.5)) * vec2f(uniforms.aspectRatio, 1.0);
                let radius: f32 = length(centered);
                let mask: f32 = smoothstep(0.50, 0.96, radius);
                return mask * mask * (3.0 - 2.0 * mask);
            }

            fn computeVignetteMask(uv: vec2f) -> f32 {
                let centered: vec2f = (uv - vec2f(0.5, 0.5)) * vec2f(uniforms.aspectRatio, 1.0);
                let radius: f32 = length(centered);
                let mask: f32 = smoothstep(0.42, 0.92, radius);
                return mask * mask * (3.0 - 2.0 * mask);
            }

            fn computeEdgeStrengthCurve(strength: f32) -> f32 {
                let lifted: f32 = strength + 0.75 * strength * strength;
                return min(1.75, lifted);
            }

            fn sampleColor(uv: vec2f) -> vec4f {
                return textureSampleLevel(textureSampler, textureSamplerSampler, clamp(uv, vec2f(0.001, 0.001), vec2f(0.999, 0.999)), 0.0);
            }

            fn sampleBlur(uv: vec2f, stepRadius: vec2f) -> vec4f {
                var color: vec4f = sampleColor(uv) * 0.20;
                color += sampleColor(uv + vec2f(stepRadius.x, 0.0)) * 0.12;
                color += sampleColor(uv - vec2f(stepRadius.x, 0.0)) * 0.12;
                color += sampleColor(uv + vec2f(0.0, stepRadius.y)) * 0.12;
                color += sampleColor(uv - vec2f(0.0, stepRadius.y)) * 0.12;
                color += sampleColor(uv + vec2f(stepRadius.x, stepRadius.y)) * 0.08;
                color += sampleColor(uv + vec2f(-stepRadius.x, stepRadius.y)) * 0.08;
                color += sampleColor(uv + vec2f(stepRadius.x, -stepRadius.y)) * 0.08;
                color += sampleColor(uv - vec2f(stepRadius.x, stepRadius.y)) * 0.08;
                return color;
            }

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let baseColor: vec4f = sampleColor(input.vUV);
                var finalColor: vec4f = baseColor;

                if (uniforms.edgeBlurStrength > 0.0001) {
                    let edgeMask: f32 = computeEdgeMask(input.vUV);
                    if (edgeMask > 0.0001) {
                        let curvedStrength: f32 = computeEdgeStrengthCurve(uniforms.edgeBlurStrength);
                        let blurPixels: f32 = (0.7 + 9.8 * curvedStrength) * (0.24 + 0.76 * edgeMask);
                        let stepRadius: vec2f = uniforms.texelSize * blurPixels;
                        let blurColor: vec4f = sampleBlur(input.vUV, stepRadius);
                        let blurMix: f32 = clamp(edgeMask * (0.28 + 0.72 * min(1.0, curvedStrength)), 0.0, 1.0);
                        finalColor = mix(finalColor, blurColor, vec4f(blurMix));
                    }
                }

                if (uniforms.vignetteWeight > 0.0001) {
                    let vignetteMask: f32 = computeVignetteMask(input.vUV);
                    let vignetteAmount: f32 = clamp(uniforms.vignetteWeight * 0.35, 0.0, 1.0);
                    finalColor = vec4f(finalColor.rgb * (1.0 - vignetteMask * vignetteAmount), finalColor.a);
                }

                fragmentOutputs.color = finalColor;
                return fragmentOutputs;
            }
        `;
    }
}

function ensureLensDistortionShaders(): void {
    const shaderKey = "mmdFrameGraphLensDistortionPixelShader";
    if (!ShaderStore.ShadersStore[shaderKey]) {
        ShaderStore.ShadersStore[shaderKey] = `
            precision highp float;
            varying vec2 vUV;
            uniform sampler2D textureSampler;
            uniform float distortion;

            void main(void) {
                vec2 finalUv = vUV;
                vec2 centered = vUV - vec2(0.5);
                float radius2 = dot(centered, centered);

                if (abs(distortion) >= 0.0001 && radius2 >= 1e-8) {
                    vec2 direction = normalize(centered);
                    float amount = clamp(abs(distortion) * 0.23, 0.0, 1.0);

                    vec2 barrelUv = vec2(0.5) + direction * radius2;
                    barrelUv = mix(vUV, barrelUv, amount);

                    vec2 pincushionUv = vec2(0.5) - direction * radius2;
                    pincushionUv = mix(vUV, pincushionUv, amount);

                    finalUv = distortion >= 0.0 ? barrelUv : pincushionUv;
                    finalUv = clamp(finalUv, vec2(0.0), vec2(1.0));
                }

                gl_FragColor = texture2D(textureSampler, finalUv);
            }
        `;
    }
    if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
        ShaderStore.ShadersStoreWGSL[shaderKey] = `
            varying vUV: vec2f;
            var textureSamplerSampler: sampler;
            var textureSampler: texture_2d<f32>;
            uniform distortion: f32;

            #define CUSTOM_FRAGMENT_DEFINITIONS
            @fragment
            fn main(input: FragmentInputs)->FragmentOutputs {
                let centered: vec2f = input.vUV - vec2f(0.5);
                let radius2: f32 = dot(centered, centered);

                var finalUv: vec2f = input.vUV;
                if (abs(uniforms.distortion) >= 0.0001 && radius2 >= 1e-8) {
                    let direction: vec2f = normalize(centered);
                    let amount: f32 = clamp(abs(uniforms.distortion) * 0.23, 0.0, 1.0);

                    var barrelUv: vec2f = vec2f(0.5) + direction * radius2;
                    barrelUv = mix(input.vUV, barrelUv, amount);

                    var pincushionUv: vec2f = vec2f(0.5) - direction * radius2;
                    pincushionUv = mix(input.vUV, pincushionUv, amount);

                    finalUv = pincushionUv;
                    if (uniforms.distortion >= 0.0) {
                        finalUv = barrelUv;
                    }
                    finalUv = clamp(finalUv, vec2f(0.0), vec2f(1.0));
                }

                fragmentOutputs.color = textureSampleLevel(textureSampler, textureSamplerSampler, finalUv, 0.0);
                return fragmentOutputs;
            }
        `;
    }
}

class FrameGraphPostEffectsLutTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
        private readonly getLutTexture: () => RawTexture | null,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsLutTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const texture = this.getLutTexture();
                const effect = this.postProcess.effect;
                effect.setFloat("lutSize", texture?.getSize().height ?? 2);
                effect.setFloat("lutIntensity", settings.lutEnabled ? Math.max(0, Math.min(1, settings.lutIntensity)) : 0);
                if (texture) {
                    effect.setTexture("lutSampler", texture);
                }
                additionalBindings?.(context);
            },
        );
    }
}

class FrameGraphPostEffectsColorCorrectionTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly onExecute: () => void,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsColorCorrectionTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            (context) => {
                this.onExecute();
                additionalExecute?.(context);
            },
            (context) => {
                const settings = this.getSettings();
                this.postProcess.effect.setFloat("contrast", settings.contrast);
                this.postProcess.effect.setFloat("gammaPower", settings.gammaPower);
                additionalBindings?.(context);
            },
        );
    }
}

class FrameGraphPostEffectsLuminousTask extends FrameGraphPostProcessTask {
    glowTexture?: FrameGraphTextureHandle;
    haloTexture?: FrameGraphTextureHandle;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsLuminousTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        const pass = super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                const engine = this.postProcess.options.engine;
                const width = Math.max(1, engine.getRenderWidth());
                const height = Math.max(1, engine.getRenderHeight());
                effect.setFloat("intensity", settings.luminousEnabled ? Math.max(0, settings.luminousIntensity) : 0);
                // The in-composite glare prototype aliases badly on dense stage lines, especially in 4K output.
                // Keep persisted values wired for future multi-pass glare, but disable this lightweight path.
                effect.setFloat("glareCount", 0);
                effect.setFloat("glareLength", Math.max(0, Math.min(256, settings.luminousGlareLength)));
                effect.setFloat("glareAngle", Math.max(-180, Math.min(180, settings.luminousGlareAngle)) * Math.PI / 180);
                effect.setFloat("glarePower", Math.max(0, Math.min(4, settings.luminousGlarePower)));
                effect.setFloat2("texelSize", 1 / width, 1 / height);
                if (this.glowTexture !== undefined) {
                    context.bindTextureHandle(effect, "glowSampler", this.glowTexture);
                }
                if (this.haloTexture !== undefined) {
                    context.bindTextureHandle(effect, "haloSampler", this.haloTexture);
                }
                additionalBindings?.(context);
            },
        );
        if (this.glowTexture !== undefined) {
            pass.addDependencies(this.glowTexture);
        }
        if (this.haloTexture !== undefined) {
            pass.addDependencies(this.haloTexture);
        }
        return pass;
    }
}

class FrameGraphPostEffectsLuminousExtractTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsLuminousExtractTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                effect.setFloat("threshold", Math.max(0, Math.min(1.5, settings.luminousThreshold)));
                additionalBindings?.(context);
            },
        );
    }
}

class FrameGraphPostEffectsLuminousThinBlurTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: ThinBlurPostProcess,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
        private readonly direction: "horizontal" | "vertical",
        private readonly band: LuminousBlurBand,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsLuminousThinBlurTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const blur = this.postProcess as ThinBlurPostProcess;
                const engine = this.postProcess.options.engine;
                const width = Math.max(1, engine.getRenderWidth());
                const height = Math.max(1, engine.getRenderHeight());
                const blurSettings = resolveLuminousBlurPassSettings(settings.luminousRadius, this.band);
                blur.textureWidth = width;
                blur.textureHeight = height;
                blur.direction = this.direction === "horizontal"
                    ? new Vector2(blurSettings.directionScale, 0)
                    : new Vector2(0, blurSettings.directionScale);
                additionalBindings?.(context);
            },
        );
    }
}

class FrameGraphPostEffectsBloomTintTask extends FrameGraphPostProcessTask {
    originalTexture?: FrameGraphTextureHandle;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsBloomTintTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        const pass = super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                effect.setFloat3(
                    "bloomColor",
                    Math.max(0, Math.min(1, settings.bloomColor.r)),
                    Math.max(0, Math.min(1, settings.bloomColor.g)),
                    Math.max(0, Math.min(1, settings.bloomColor.b)),
                );
                if (this.originalTexture !== undefined) {
                    context.bindTextureHandle(effect, "originalSampler", this.originalTexture);
                }
                additionalBindings?.(context);
            },
        );
        if (this.originalTexture !== undefined) {
            pass.addDependencies(this.originalTexture);
        }
        return pass;
    }
}

class FrameGraphPostEffectsSsaoToonCompositeTask extends FrameGraphPostProcessTask {
    originalTexture?: FrameGraphTextureHandle;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsSsaoToonCompositeTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        const pass = super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                const shadowColor = settings.ssaoShadowColor;
                effect.setFloat3("shadowColor", shadowColor.r, shadowColor.g, shadowColor.b);
                effect.setFloat("toonInfluence", settings.ssaoToonInfluence);
                effect.setFloat("enabled", isFrameGraphPostEffectActiveInSettings(settings, "ssao") ? 1 : 0);
                if (this.originalTexture !== undefined) {
                    context.bindTextureHandle(effect, "originalColor", this.originalTexture);
                }
                additionalBindings?.(context);
            },
        );
        if (this.originalTexture !== undefined) {
            pass.addDependencies(this.originalTexture);
        }
        return pass;
    }
}

class FrameGraphPostEffectsOffsetShadowTask extends FrameGraphPostProcessTask {
    depthTexture?: FrameGraphTextureHandle;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsOffsetShadowTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        const pass = super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                const engine = this.postProcess.options.engine;
                const shadowColor = settings.offsetShadowColor;
                effect.setFloat2(
                    "texelSize",
                    1 / Math.max(1, engine.getRenderWidth()),
                    1 / Math.max(1, engine.getRenderHeight()),
                );
                effect.setFloat2("offsetPixels", settings.offsetShadowOffsetX, settings.offsetShadowOffsetY);
                effect.setFloat("strength", Math.max(0, Math.min(2, settings.offsetShadowStrength)));
                effect.setFloat("depthBias", Math.max(0, Math.min(1, settings.offsetShadowDepthBias)));
                effect.setFloat("maxDepth", Math.max(0.001, Math.min(4, settings.offsetShadowMaxDepth)));
                effect.setFloat("depthScale", Math.max(0, Math.min(1, settings.offsetShadowDepthScale)));
                effect.setFloat("thickness", Math.max(0.0001, Math.min(1, settings.offsetShadowThickness)));
                effect.setFloat("softness", Math.max(0, Math.min(12, settings.offsetShadowSoftness)));
                effect.setFloat3(
                    "shadowColor",
                    Math.max(0, Math.min(1, shadowColor.r)),
                    Math.max(0, Math.min(1, shadowColor.g)),
                    Math.max(0, Math.min(1, shadowColor.b)),
                );
                effect.setFloat("debugView", settings.offsetShadowDebugView ? 1 : 0);
                if (this.depthTexture !== undefined) {
                    context.bindTextureHandle(effect, "depthSampler", this.depthTexture);
                }
                additionalBindings?.(context);
            },
        );
        if (this.depthTexture !== undefined) {
            pass.addDependencies(this.depthTexture);
        }
        return pass;
    }
}

class FrameGraphPostEffectsOffsetHighlightTask extends FrameGraphPostProcessTask {
    depthTexture?: FrameGraphTextureHandle;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsOffsetHighlightTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        const pass = super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                const engine = this.postProcess.options.engine;
                const highlightColor = settings.offsetHighlightColor;
                effect.setFloat2(
                    "texelSize",
                    1 / Math.max(1, engine.getRenderWidth()),
                    1 / Math.max(1, engine.getRenderHeight()),
                );
                effect.setFloat2("offsetPixels", settings.offsetHighlightOffsetX, settings.offsetHighlightOffsetY);
                effect.setFloat("strength", Math.max(0, Math.min(1, settings.offsetHighlightStrength)));
                effect.setFloat("depthScale", Math.max(0, Math.min(1, settings.offsetHighlightDepthScale)));
                effect.setFloat3(
                    "highlightColor",
                    Math.max(0, Math.min(1, highlightColor.r)),
                    Math.max(0, Math.min(1, highlightColor.g)),
                    Math.max(0, Math.min(1, highlightColor.b)),
                );
                effect.setFloat("debugView", settings.offsetHighlightDebugView ? 1 : 0);
                if (this.depthTexture !== undefined) {
                    context.bindTextureHandle(effect, "depthSampler", this.depthTexture);
                }
                additionalBindings?.(context);
            },
        );
        if (this.depthTexture !== undefined) {
            pass.addDependencies(this.depthTexture);
        }
        return pass;
    }
}

class FrameGraphPostEffectsVignetteEdgeBlurTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsVignetteEdgeBlurTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                const engine = this.postProcess.options.engine;
                const width = Math.max(1, engine.getRenderWidth());
                const height = Math.max(1, engine.getRenderHeight());
                effect.setFloat2("texelSize", 1 / width, 1 / height);
                effect.setFloat("aspectRatio", width / height);
                effect.setFloat("vignetteWeight", settings.vignetteEnabled ? Math.max(0, settings.vignetteWeight) : 0);
                effect.setFloat("edgeBlurStrength", Math.max(0, Math.min(1, settings.edgeBlurStrength / 3)));
                additionalBindings?.(context);
            },
        );
    }
}

class FrameGraphPostEffectsLensDistortionTask extends FrameGraphPostProcessTask {
    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly getSettings: () => FrameGraphPostEffectsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsLensDistortionTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        return super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                this.postProcess.effect.setFloat("distortion", this.getSettings().lensDistortion);
                additionalBindings?.(context);
            },
        );
    }
}

export class FrameGraphPostEffectsController {
    private activationWarningEmitted = false;
    private colorCorrectionEffect: EffectWrapper | null = null;
    private lutEffect: EffectWrapper | null = null;
    private lutTask: FrameGraphPostEffectsLutTask | null = null;
    private lutTexture: RawTexture | null = null;
    private lutTextureKey: string | null = null;
    private imageProcessingEffect: ThinImageProcessingPostProcess | null = null;
    private imageProcessingTask: FrameGraphImageProcessingTask | null = null;
    private geometryRendererTask: FrameGraphGeometryRendererTask | null = null;
    private resourcePlan: FrameGraphResourcePlan | null = null;
    private ssgiGatherTask: FrameGraphPostEffectsSsgiGatherTask | null = null;
    private readonly ssgiDenoiseTasks: FrameGraphPostEffectsSsgiDenoiseTask[] = [];
    private ssgiCompositeEffect: EffectWrapper | null = null;
    private ssgiCompositeTask: FrameGraphPostEffectsSsgiCompositeTask | null = null;
    private ssaoTask: FrameGraphSSAO2RenderingPipelineTask | null = null;
    private ssaoToonCompositeEffect: EffectWrapper | null = null;
    private ssaoToonCompositeTask: FrameGraphPostEffectsSsaoToonCompositeTask | null = null;
    private oceanEffect: EffectWrapper | null = null;
    private oceanTask: FrameGraphPostEffectsOceanTask | null = null;
    private offsetShadowEffect: EffectWrapper | null = null;
    private offsetShadowTask: FrameGraphPostEffectsOffsetShadowTask | null = null;
    private offsetHighlightEffect: EffectWrapper | null = null;
    private offsetHighlightTask: FrameGraphPostEffectsOffsetHighlightTask | null = null;
    private ssrTask: FrameGraphSSRRenderingPipelineTask | null = null;
    private depthOfFieldTask: FrameGraphDepthOfFieldTask | null = null;
    private luminousExtractEffect: EffectWrapper | null = null;
    private luminousExtractTask: FrameGraphPostEffectsLuminousExtractTask | null = null;
    private luminousCoreBlurHorizontalEffect: ThinBlurPostProcess | null = null;
    private luminousCoreBlurVerticalEffect: ThinBlurPostProcess | null = null;
    private luminousCoreBlurHorizontalTask: FrameGraphPostEffectsLuminousThinBlurTask | null = null;
    private luminousCoreBlurVerticalTask: FrameGraphPostEffectsLuminousThinBlurTask | null = null;
    private luminousHaloBlurHorizontalEffect: ThinBlurPostProcess | null = null;
    private luminousHaloBlurVerticalEffect: ThinBlurPostProcess | null = null;
    private luminousHaloBlurHorizontalTask: FrameGraphPostEffectsLuminousThinBlurTask | null = null;
    private luminousHaloBlurVerticalTask: FrameGraphPostEffectsLuminousThinBlurTask | null = null;
    private luminousEffect: EffectWrapper | null = null;
    private luminousTask: FrameGraphPostEffectsLuminousTask | null = null;
    private bloomTask: FrameGraphBloomTask | null = null;
    private bloomTintEffect: EffectWrapper | null = null;
    private bloomTintTask: FrameGraphPostEffectsBloomTintTask | null = null;
    private chromaticAberrationEffect: ThinChromaticAberrationPostProcess | null = null;
    private chromaticAberrationTask: FrameGraphChromaticAberrationTask | null = null;
    private vignetteEdgeBlurEffect: EffectWrapper | null = null;
    private vignetteEdgeBlurTask: FrameGraphPostEffectsVignetteEdgeBlurTask | null = null;
    private lensDistortionEffect: EffectWrapper | null = null;
    private lensDistortionTask: FrameGraphPostEffectsLensDistortionTask | null = null;
    private motionBlurTask: FrameGraphMotionBlurTask | null = null;
    private readonly motionBlurBoneVelocityMode = new ObjectMotionBlurBoneVelocityMode();
    private grainEffect: ThinGrainPostProcess | null = null;
    private grainTask: FrameGraphGrainTask | null = null;
    private sharpenEffect: ThinSharpenPostProcess | null = null;
    private sharpenTask: FrameGraphSharpenTask | null = null;
    private fxaaEffect: ThinFXAAPostProcess | null = null;
    private fxaaTask: FrameGraphFXAATask | null = null;
    private outputTask: FrameGraphPostEffectsOutputTask | null = null;
    private frameGraph: FrameGraph | null = null;
    private activeScene: Scene | null = null;
    private ready = false;
    private active = false;
    private executedFrameCount = 0;
    private lastImageProcessingEnabled: boolean | null = null;
    private connectedOrder: FrameGraphPostEffectId[] = [];

    constructor(
        private readonly onWarning: (warning: FrameGraphPostEffectsWarning) => void,
        private readonly onInfo?: (info: FrameGraphPostEffectsInfo) => void,
        private readonly getSettings: () => FrameGraphPostEffectsSettings = () => ({
            contrast: 1,
            gammaPower: 1,
            imageProcessingEnabled: false,
            dofEnabled: false,
            dofBlurLevel: ThinDepthOfFieldEffectBlurLevel.Medium,
            dofFocusDistanceMm: 55000,
            dofEffectiveFStop: 2.0,
            dofLensSize: 1000,
            dofFocalLength: 50,
            luminousEnabled: false,
            luminousIntensity: 0.5,
            luminousThreshold: 0.5,
            luminousRadius: 20,
            luminousGlareCount: 0,
            luminousGlareLength: 48,
            luminousGlareAngle: 0,
            luminousGlarePower: 0.4,
            bloomEnabled: false,
            bloomWeight: 1,
            bloomThreshold: 1,
            bloomKernel: 100,
            bloomColor: { r: 1, g: 0.48, b: 0.16 },
            vignetteEnabled: false,
            vignetteWeight: 0.3,
            edgeBlurStrength: 0,
            lensDistortionEnabled: false,
            lensDistortion: 0,
            chromaticAberration: 0,
            grainIntensity: 0,
            sharpenEdge: 0,
            ssaoEnabled: false,
            ssaoStrength: 0.5,
            ssaoRadius: 3,
            ssaoShadowColor: { r: 0.5, g: 0.5, b: 0.5 },
            ssaoToonInfluence: 1,
            offsetShadowEnabled: false,
            offsetShadowStrength: 0.35,
            offsetShadowOffsetX: 0,
            offsetShadowOffsetY: -30,
            offsetShadowDepthBias: 0.2,
            offsetShadowMaxDepth: 2,
            offsetShadowDepthScale: 1,
            offsetShadowThickness: 1,
            offsetShadowSoftness: 0,
            offsetShadowNormalInfluence: 0,
            offsetShadowColor: { r: 0.29, g: 0.21, b: 0.16 },
            offsetShadowDebugView: false,
            offsetHighlightEnabled: false,
            offsetHighlightStrength: 1,
            offsetHighlightOffsetX: 0,
            offsetHighlightOffsetY: -100,
            offsetHighlightDepthThreshold: 0.1,
            offsetHighlightNormalThreshold: 0,
            offsetHighlightThickness: 1,
            offsetHighlightSoftness: 0,
            offsetHighlightDepthScale: 1,
            offsetHighlightColor: { r: 1, g: 1, b: 1 },
            offsetHighlightDebugView: false,
            ssrEnabled: false,
            ssrStrength: 0.3,
            ssrStep: 4,
            ssgiEnabled: false,
            ssgiStrength: 0.3,
            ssgiSampleRadius: 64,
            ssgiBlendMode: "softLight",
            oceanEnabled: false,
            oceanWaterHeight: 8,
            oceanWaveStrength: 0.7,
            oceanClarity: 0.85,
            oceanCausticsStrength: 1.1,
            oceanTimeSeconds: 0,
            lutEnabled: false,
            lutIntensity: 1,
            lutRuntimeText: null,
            lutTextureKey: null,
            motionBlurEnabled: false,
            motionBlurStrength: 10,
            motionBlurSamples: 32,
            antialiasEnabled: true,
        }),
    ) {}

    isActive(): boolean {
        return this.active;
    }

    isReady(): boolean {
        return this.ready;
    }

    private isEffectWrapperReady(effectWrapper: EffectWrapper | ThinBlurPostProcess | null): boolean {
        if (!effectWrapper) return true;
        const readyLike = effectWrapper as EffectWrapperReadyLike;
        const effect = readyLike.effect ?? readyLike.drawWrapper?.effect ?? readyLike._drawWrapper?.effect ?? null;
        return effect !== null && (typeof effect.isReady !== "function" || effect.isReady());
    }

    private areLuminousEffectsReady(): boolean {
        return this.isEffectWrapperReady(this.luminousExtractEffect)
            && this.isEffectWrapperReady(this.luminousCoreBlurHorizontalEffect)
            && this.isEffectWrapperReady(this.luminousCoreBlurVerticalEffect)
            && this.isEffectWrapperReady(this.luminousHaloBlurHorizontalEffect)
            && this.isEffectWrapperReady(this.luminousHaloBlurVerticalEffect)
            && this.isEffectWrapperReady(this.luminousEffect);
    }

    getDiagnosticsSnapshot(): FrameGraphPostEffectsDiagnosticsSnapshot {
        const settings = this.getSettings();
        const resourcePlan = this.resourcePlan;
        const luminousCoreBlur = resolveLuminousBlurPassSettings(settings.luminousRadius, "core");
        const luminousHaloBlur = resolveLuminousBlurPassSettings(settings.luminousRadius, "halo");
        return {
            active: this.active,
            ready: this.ready,
            executedFrameCount: this.executedFrameCount,
            resourcePlan: resourcePlan
                ? {
                    effectOrder: [...resourcePlan.effectOrder],
                    activeEffects: [...resourcePlan.activeEffects],
                    requirementKeys: [...resourcePlan.requirementKeys],
                    needsGeometryRenderer: resourcePlan.needsGeometryRenderer,
                    needsDepthRenderer: resourcePlan.needsDepthRenderer,
                    needsLuminousMask: resourcePlan.needsLuminousMask,
                }
                : null,
            tasks: {
                imageProcessing: this.imageProcessingTask !== null,
                geometryRenderer: this.geometryRendererTask !== null,
                ssr: this.ssrTask !== null,
                ssgiGather: this.ssgiGatherTask !== null,
                ssgiDenoise: this.ssgiDenoiseTasks.length === SSGI_DENOISE_STEP_WIDTHS.length,
                ssgiComposite: this.ssgiCompositeTask !== null,
                ssao: this.ssaoTask !== null,
                ssaoToonComposite: this.ssaoToonCompositeTask !== null,
                ocean: this.oceanTask !== null,
                offsetShadow: this.offsetShadowTask !== null,
                offsetHighlight: this.offsetHighlightTask !== null,
                motionBlur: this.motionBlurTask !== null,
                dof: this.depthOfFieldTask !== null,
                luminousExtract: this.luminousExtractTask !== null,
                luminousCoreBlur: this.luminousCoreBlurHorizontalTask !== null
                    && this.luminousCoreBlurVerticalTask !== null,
                luminousHaloBlur: this.luminousHaloBlurHorizontalTask !== null
                    && this.luminousHaloBlurVerticalTask !== null,
                luminousComposite: this.luminousTask !== null,
                bloom: this.bloomTask !== null,
                bloomTint: this.bloomTintTask !== null,
                lut: this.lutTask !== null,
                colorCorrection: this.colorCorrectionEffect !== null,
                sharpen: this.sharpenTask !== null,
                grain: this.grainTask !== null,
                chromatic: this.chromaticAberrationTask !== null,
                vignetteEdgeBlur: this.vignetteEdgeBlurTask !== null,
                lensDistortion: this.lensDistortionTask !== null,
                fxaa: this.fxaaTask !== null,
            },
            resources: {
                geometryRenderer: this.geometryRendererTask !== null,
                viewDepth: this.geometryRendererTask !== null,
                viewNormal: this.geometryRendererTask !== null,
                velocity: resourcePlan?.requirementKeys.includes("velocity") ?? false,
                reflectivity: this.geometryRendererTask !== null && this.ssrTask !== null,
                ssgiHalfResolution: this.ssgiGatherTask !== null,
                ssgiDenoisedHalfResolution:
                    this.ssgiDenoiseTasks.length === SSGI_DENOISE_STEP_WIDTHS.length,
                depthOfField: this.depthOfFieldTask !== null,
                luminousExtract: this.luminousExtractTask !== null,
                luminousCoreBlur: this.luminousCoreBlurVerticalTask !== null,
                luminousHaloBlur: this.luminousHaloBlurVerticalTask !== null,
            },
            luminousBlur: {
                coreKernel: luminousCoreBlur.kernel,
                haloKernel: luminousHaloBlur.kernel,
                coreDirectionScale: luminousCoreBlur.directionScale,
                haloDirectionScale: luminousHaloBlur.directionScale,
            },
            connectedOrder: [...this.connectedOrder],
        };
    }

    activate(
        scene?: Scene,
        sourceTexture?: InternalTexture | null,
        depthTexture?: InternalTexture | null,
        camera?: Camera | null,
        effectOrder: readonly FrameGraphPostEffectId[] = FRAME_GRAPH_POST_EFFECT_IDS,
        luminousTexture?: InternalTexture | null,
        outputTexture?: InternalTexture | null,
    ): boolean {
        if (this.active) {
            return true;
        }
        if (!scene || !sourceTexture) {
            this.emitWarningOnce({
                message: "Frame Graph post effects are not connected to a source texture. Using classic post effects.",
                reason: "not-connected",
            });
            return false;
        }

        ensureColorCorrectionShaders();
        ensureLuminousShaders();
        ensureBloomTintShaders();
        ensureOffsetShadowShaders();
        ensureOffsetHighlightShaders();
        ensureLutShaders();
        ensureSsaoToonCompositeShaders();
        ensureVignetteEdgeBlurShaders();
        ensureLensDistortionShaders();
        ensureFrameGraphSsgiShaders();
        ensureFrameGraphOceanShaders();

        const frameGraph = new FrameGraph(scene, false);
        frameGraph.name = "MMD modoki post effects";
        const normalizedEffectOrder = normalizeFrameGraphPostEffectIds(effectOrder);
        const physicalEffectOrder = normalizeFrameGraphPostEffectIds(
            normalizedEffectOrder,
            FRAME_GRAPH_POST_EFFECT_IDS,
        );
        const preludeTasks: FrameGraphTask[] = [];
        const effectTasks = new Map<FrameGraphPostEffectId, FrameGraphTask[]>();
        const postludeTasks: FrameGraphTask[] = [];
        const deferEffectTask = (id: FrameGraphPostEffectId, task: FrameGraphTask): void => {
            const tasks = effectTasks.get(id) ?? [];
            tasks.push(task);
            effectTasks.set(id, tasks);
        };
        this.colorCorrectionEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphColorCorrection",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["contrast", "gammaPower"],
            name: "mmdFrameGraphColorCorrection",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });

        const sourceTextureHandle = frameGraph.textureManager.importTexture(
            "frameGraphPostEffectsSceneColor",
            sourceTexture,
        );
        const luminousTextureHandle = luminousTexture
            ? frameGraph.textureManager.importTexture("frameGraphPostEffectsLuminousMask", luminousTexture)
            : undefined;
        const depthTextureHandle = depthTexture
            ? frameGraph.textureManager.importTexture("frameGraphPostEffectsDepth", depthTexture)
            : undefined;

        this.imageProcessingEffect = new ThinImageProcessingPostProcess(
            "frameGraphPostEffectsImageProcessing",
            frameGraph.engine,
            {
                scene,
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        // The imported scene-color RT comes from the existing editor render path.
        // Treat it as display/gamma-space input so ImageProcessingTask does not
        // apply an extra final gamma lift when LUT is enabled.
        this.imageProcessingEffect.fromLinearSpace = false;
        const imageProcessingTask = new FrameGraphImageProcessingTask(
            "frameGraphPostEffectsImageProcessing",
            frameGraph,
            this.imageProcessingEffect,
        );
        const initialSettings = this.getSettings();
        const resourcePlan = buildFrameGraphResourcePlan(initialSettings, effectOrder);
        this.resourcePlan = resourcePlan;
        this.updateLutTexture(scene, initialSettings);
        imageProcessingTask.sourceTexture = sourceTextureHandle;
        imageProcessingTask.disabled = !initialSettings.imageProcessingEnabled;
        this.lastImageProcessingEnabled = initialSettings.imageProcessingEnabled;
        preludeTasks.push(imageProcessingTask);
        this.imageProcessingTask = imageProcessingTask;

        let dofSourceTexture = imageProcessingTask.outputTexture;
        const geometryRendererNeeded = camera !== null && resourcePlan.needsGeometryRenderer;
        if (camera && geometryRendererNeeded) {
            const sourceTextureSize = this.getSourceTextureSize(scene, sourceTexture);
            const geometryDepthTexture = frameGraph.textureManager.createRenderTargetTexture(
                "frameGraphPostEffectsGeometryDepth",
                {
                    size: sourceTextureSize,
                    sizeIsPercentage: false,
                    options: {
                        createMipMaps: false,
                        types: [Constants.TEXTURETYPE_UNSIGNED_BYTE],
                        formats: [Constants.TEXTUREFORMAT_DEPTH32_FLOAT],
                        samples: 1,
                        useSRGBBuffers: [false],
                        labels: ["geometryDepth"],
                    },
                },
            );
            const clearGeometryDepthTask = new FrameGraphClearTextureTask(
                "frameGraphPostEffectsGeometryDepthClear",
                frameGraph,
            );
            clearGeometryDepthTask.clearColor = false;
            clearGeometryDepthTask.clearDepth = true;
            clearGeometryDepthTask.depthTexture = geometryDepthTexture;
            preludeTasks.push(clearGeometryDepthTask);

            const geometryRendererTask = new FrameGraphGeometryRendererTask(
                "frameGraphPostEffectsGeometry",
                frameGraph,
                scene,
                { doNotChangeAspectRatio: true },
            );
            const objectList = new FrameGraphObjectList();
            objectList.meshes = null;
            objectList.particleSystems = null;
            geometryRendererTask.objectList = objectList;
            geometryRendererTask.camera = camera;
            geometryRendererTask.depthTexture = clearGeometryDepthTask.depthTexture;
            geometryRendererTask.size = sourceTextureSize;
            geometryRendererTask.sizeIsPercentage = false;
            geometryRendererTask.samples = 1;
            geometryRendererTask.textureDescriptions = [];
            if (resourcePlan.requirementKeys.includes("viewDepth")) {
                geometryRendererTask.textureDescriptions.push({
                    type: Constants.PREPASS_DEPTH_TEXTURE_TYPE,
                    textureType: Constants.TEXTURETYPE_HALF_FLOAT,
                    textureFormat: Constants.TEXTUREFORMAT_RED,
                });
            }
            if (resourcePlan.requirementKeys.includes("viewNormal")) {
                geometryRendererTask.textureDescriptions.push({
                    type: Constants.PREPASS_NORMAL_TEXTURE_TYPE,
                    textureType: Constants.TEXTURETYPE_HALF_FLOAT,
                    textureFormat: Constants.TEXTUREFORMAT_RGBA,
                });
            }
            if (resourcePlan.requirementKeys.includes("velocity")) {
                geometryRendererTask.textureDescriptions.push({
                    type: Constants.PREPASS_VELOCITY_TEXTURE_TYPE,
                    textureType: Constants.TEXTURETYPE_HALF_FLOAT,
                    textureFormat: Constants.TEXTUREFORMAT_RGBA,
                });
            }
            if (resourcePlan.requirementKeys.includes("reflectivity")) {
                geometryRendererTask.textureDescriptions.push({
                    type: Constants.PREPASS_REFLECTIVITY_TEXTURE_TYPE,
                    textureType: Constants.TEXTURETYPE_HALF_FLOAT,
                    textureFormat: Constants.TEXTUREFORMAT_RGBA,
                });
            }
            geometryRendererTask.disabled = false;
            preludeTasks.push(geometryRendererTask);
            this.geometryRendererTask = geometryRendererTask;

            if (this.isPostEffectActive(initialSettings, "ocean")) {
                this.oceanEffect = new EffectWrapper({
                    engine: frameGraph.engine,
                    fragmentShader: "mmdFrameGraphOcean",
                    useShaderStore: true,
                    useAsPostProcess: true,
                    uniforms: [
                        "inverseProjection",
                        "inverseView",
                        "cameraPosition",
                        "waterHeight",
                        "timeSeconds",
                        "waveStrength",
                        "clarity",
                        "causticsStrength",
                    ],
                    samplers: ["viewDepthTexture", "viewNormalTexture"],
                    name: "mmdFrameGraphOcean",
                    shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
                });
                const oceanTask = new FrameGraphPostEffectsOceanTask(
                    "frameGraphPostEffectsOcean",
                    frameGraph,
                    this.oceanEffect,
                    camera,
                    () => {
                        const settings = this.getSettings();
                        return {
                            waterHeight: settings.oceanWaterHeight,
                            waveStrength: settings.oceanWaveStrength,
                            clarity: settings.oceanClarity,
                            causticsStrength: settings.oceanCausticsStrength,
                            timeSeconds: settings.oceanTimeSeconds,
                        };
                    },
                );
                oceanTask.sourceTexture = imageProcessingTask.outputTexture;
                oceanTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
                oceanTask.normalTexture = geometryRendererTask.geometryViewNormalTexture;
                oceanTask.disabled = false;
                deferEffectTask("ocean", oceanTask);
                this.oceanTask = oceanTask;
                dofSourceTexture = oceanTask.outputTexture;
            }

            let ssaoSourceTexture = imageProcessingTask.outputTexture;
            if (this.isPostEffectActive(initialSettings, "ssr")) {
                const ssrTask = new FrameGraphSSRRenderingPipelineTask(
                    "frameGraphPostEffectsSSR",
                    frameGraph,
                    Constants.TEXTURETYPE_HALF_FLOAT,
                );
                ssrTask.sourceTexture = imageProcessingTask.outputTexture;
                ssrTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
                ssrTask.normalTexture = geometryRendererTask.geometryViewNormalTexture;
                ssrTask.reflectivityTexture = geometryRendererTask.geometryReflectivityTexture;
                ssrTask.camera = camera;
                ssrTask.disabled = false;
                this.applySsrSettings(ssrTask, initialSettings);
                deferEffectTask("ssr", ssrTask);
                this.ssrTask = ssrTask;
                ssaoSourceTexture = ssrTask.outputTexture;
                dofSourceTexture = ssrTask.outputTexture;
            }

            const ssgiSupported = frameGraph.engine.isWebGPU
                && frameGraph.engine.getCaps().supportComputeShaders;
            if (this.isPostEffectActive(initialSettings, "ssgi") && ssgiSupported) {
                const getSsgiSettings = () => {
                    const settings = this.getSettings();
                    return {
                        strength: settings.ssgiStrength,
                        sampleRadius: settings.ssgiSampleRadius,
                        blendMode: settings.ssgiBlendMode,
                    };
                };
                const ssgiGatherTask = new FrameGraphPostEffectsSsgiGatherTask(
                    "frameGraphPostEffectsSsgiGather",
                    frameGraph,
                    sourceTextureSize.width,
                    sourceTextureSize.height,
                    camera,
                    getSsgiSettings,
                );
                ssgiGatherTask.sourceTexture = ssaoSourceTexture;
                ssgiGatherTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
                ssgiGatherTask.normalTexture = geometryRendererTask.geometryViewNormalTexture;
                ssgiGatherTask.disabled = false;
                deferEffectTask("ssgi", ssgiGatherTask);
                this.ssgiGatherTask = ssgiGatherTask;

                let denoisedSsgiTexture = ssgiGatherTask.outputTexture;
                for (const [passIndex, stepWidth] of SSGI_DENOISE_STEP_WIDTHS.entries()) {
                    const denoiseTask = new FrameGraphPostEffectsSsgiDenoiseTask(
                        `frameGraphPostEffectsSsgiDenoise${passIndex + 1}`,
                        frameGraph,
                        sourceTextureSize.width,
                        sourceTextureSize.height,
                        ssgiGatherTask.outputWidth,
                        ssgiGatherTask.outputHeight,
                        stepWidth,
                    );
                    denoiseTask.sourceTexture = denoisedSsgiTexture;
                    denoiseTask.sceneColorTexture = ssaoSourceTexture;
                    denoiseTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
                    denoiseTask.normalTexture = geometryRendererTask.geometryViewNormalTexture;
                    denoiseTask.disabled = false;
                    deferEffectTask("ssgi", denoiseTask);
                    this.ssgiDenoiseTasks.push(denoiseTask);
                    denoisedSsgiTexture = denoiseTask.outputTexture;
                }

                this.ssgiCompositeEffect = new EffectWrapper({
                    engine: frameGraph.engine,
                    fragmentShader: "mmdFrameGraphSsgiComposite",
                    useShaderStore: true,
                    useAsPostProcess: true,
                    uniforms: ["strength", "blendMode"],
                    samplers: ["ssgiTexture", "viewDepthTexture", "viewNormalTexture"],
                    name: "mmdFrameGraphSsgiComposite",
                    shaderLanguage: ShaderLanguage.WGSL,
                });
                const ssgiCompositeTask = new FrameGraphPostEffectsSsgiCompositeTask(
                    "frameGraphPostEffectsSsgiComposite",
                    frameGraph,
                    this.ssgiCompositeEffect,
                    getSsgiSettings,
                );
                ssgiCompositeTask.sourceTexture = ssaoSourceTexture;
                ssgiCompositeTask.ssgiTexture = denoisedSsgiTexture;
                ssgiCompositeTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
                ssgiCompositeTask.normalTexture = geometryRendererTask.geometryViewNormalTexture;
                ssgiCompositeTask.disabled = false;
                deferEffectTask("ssgi", ssgiCompositeTask);
                this.ssgiCompositeTask = ssgiCompositeTask;
                ssaoSourceTexture = ssgiCompositeTask.outputTexture;
                dofSourceTexture = ssgiCompositeTask.outputTexture;
            }

            if (this.isPostEffectActive(initialSettings, "ssao")) {
                const ssaoTask = new FrameGraphSSAO2RenderingPipelineTask(
                    "frameGraphPostEffectsSSAO2",
                    frameGraph,
                    0.5,
                    0.5,
                );
                ssaoTask.sourceTexture = ssaoSourceTexture;
                ssaoTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
                ssaoTask.normalTexture = geometryRendererTask.geometryViewNormalTexture;
                ssaoTask.camera = camera;
                ssaoTask.disabled = false;
                this.applySsaoSettings(ssaoTask, initialSettings, camera);
                deferEffectTask("ssao", ssaoTask);
                this.ssaoTask = ssaoTask;

                this.ssaoToonCompositeEffect = new EffectWrapper({
                    engine: frameGraph.engine,
                    fragmentShader: "mmdFrameGraphSsaoToonComposite",
                    useShaderStore: true,
                    useAsPostProcess: true,
                    uniforms: ["shadowColor", "toonInfluence", "enabled"],
                    samplers: ["originalColor"],
                    name: "mmdFrameGraphSsaoToonComposite",
                    shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
                });
                const ssaoToonCompositeTask = new FrameGraphPostEffectsSsaoToonCompositeTask(
                    "frameGraphPostEffectsSSAOToonComposite",
                    frameGraph,
                    this.ssaoToonCompositeEffect,
                    this.getSettings,
                );
                ssaoToonCompositeTask.sourceTexture = ssaoTask.outputTexture;
                ssaoToonCompositeTask.originalTexture = imageProcessingTask.outputTexture;
                ssaoToonCompositeTask.disabled = false;
                deferEffectTask("ssao", ssaoToonCompositeTask);
                this.ssaoToonCompositeTask = ssaoToonCompositeTask;
                dofSourceTexture = ssaoToonCompositeTask.outputTexture;
            }

            if (this.isPostEffectActive(initialSettings, "offsetShadow")) {
                this.offsetShadowEffect = new EffectWrapper({
                    engine: frameGraph.engine,
                    fragmentShader: "mmdFrameGraphOffsetShadow",
                    useShaderStore: true,
                    useAsPostProcess: true,
                    uniforms: [
                        "texelSize",
                        "offsetPixels",
                        "strength",
                        "depthBias",
                        "maxDepth",
                        "depthScale",
                        "thickness",
                        "softness",
                        "shadowColor",
                        "debugView",
                    ],
                    samplers: ["depthSampler"],
                    name: "mmdFrameGraphOffsetShadow",
                    shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
                });
                const offsetShadowTask = new FrameGraphPostEffectsOffsetShadowTask(
                    "frameGraphPostEffectsOffsetShadow",
                    frameGraph,
                    this.offsetShadowEffect,
                    this.getSettings,
                );
                offsetShadowTask.sourceTexture = dofSourceTexture;
                offsetShadowTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
                offsetShadowTask.disabled = false;
                deferEffectTask("offsetShadow", offsetShadowTask);
                this.offsetShadowTask = offsetShadowTask;
                dofSourceTexture = offsetShadowTask.outputTexture;
            }

            if (this.isPostEffectActive(initialSettings, "offsetHighlight")) {
                this.offsetHighlightEffect = new EffectWrapper({
                    engine: frameGraph.engine,
                    fragmentShader: "mmdFrameGraphOffsetHighlight",
                    useShaderStore: true,
                    useAsPostProcess: true,
                    uniforms: [
                        "texelSize",
                        "offsetPixels",
                        "strength",
                        "depthScale",
                        "highlightColor",
                        "debugView",
                    ],
                    samplers: ["depthSampler"],
                    name: "mmdFrameGraphOffsetHighlight",
                    shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
                });
                const offsetHighlightTask = new FrameGraphPostEffectsOffsetHighlightTask(
                    "frameGraphPostEffectsOffsetHighlight",
                    frameGraph,
                    this.offsetHighlightEffect,
                    this.getSettings,
                );
                offsetHighlightTask.sourceTexture = dofSourceTexture;
                offsetHighlightTask.depthTexture = geometryRendererTask.geometryViewDepthTexture;
                offsetHighlightTask.disabled = false;
                deferEffectTask("offsetHighlight", offsetHighlightTask);
                this.offsetHighlightTask = offsetHighlightTask;
                dofSourceTexture = offsetHighlightTask.outputTexture;
            }

            if (this.isPostEffectActive(initialSettings, "motionBlur")) {
                const motionBlurTask = new FrameGraphMotionBlurTask(
                    "frameGraphPostEffectsMotionBlur",
                    frameGraph,
                );
                motionBlurTask.sourceTexture = dofSourceTexture;
                motionBlurTask.velocityTexture = geometryRendererTask.geometryVelocityTexture;
                motionBlurTask.postProcess.isObjectBased = true;
                motionBlurTask.disabled = initialSettings.motionBlurStrength <= 0.0001;
                this.applyMotionBlurSettings(motionBlurTask, initialSettings);
                deferEffectTask("motionBlur", motionBlurTask);
                this.motionBlurTask = motionBlurTask;
                dofSourceTexture = motionBlurTask.outputTexture;
            }
        }

        let bloomSourceTexture = dofSourceTexture;
        if (depthTextureHandle !== undefined && camera && initialSettings.dofEnabled) {
            const blurLevel = initialSettings.dofBlurLevel <= ThinDepthOfFieldEffectBlurLevel.Low
                ? ThinDepthOfFieldEffectBlurLevel.Low
                : initialSettings.dofBlurLevel === ThinDepthOfFieldEffectBlurLevel.Medium
                    ? ThinDepthOfFieldEffectBlurLevel.Medium
                    : ThinDepthOfFieldEffectBlurLevel.High;
            const depthOfFieldTask = new FrameGraphDepthOfFieldTask(
                "frameGraphPostEffectsDepthOfField",
                frameGraph,
                blurLevel,
                false,
            );
            depthOfFieldTask.sourceTexture = dofSourceTexture;
            depthOfFieldTask.depthTexture = depthTextureHandle;
            depthOfFieldTask.camera = camera;
            depthOfFieldTask.disabled = false;
            this.applyDepthOfFieldSettings(depthOfFieldTask, initialSettings);
            deferEffectTask("dof", depthOfFieldTask);
            this.depthOfFieldTask = depthOfFieldTask;
            bloomSourceTexture = depthOfFieldTask.outputTexture;
        }

        let luminousOutputTexture = bloomSourceTexture;
        if (resourcePlan.needsLuminousMask && luminousTextureHandle !== undefined) {
            const luminousDisabled = false;

        this.luminousExtractEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphLuminousExtract",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["threshold"],
            name: "mmdFrameGraphLuminousExtract",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const luminousExtractTask = new FrameGraphPostEffectsLuminousExtractTask(
            "frameGraphPostEffectsLuminousExtract",
            frameGraph,
            this.luminousExtractEffect,
            this.getSettings,
        );
        luminousExtractTask.sourceTexture = luminousTextureHandle ?? bloomSourceTexture;
        luminousExtractTask.disabled = luminousDisabled;
        deferEffectTask("luminous", luminousExtractTask);
        this.luminousExtractTask = luminousExtractTask;

        const blurShaderOptions = {
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        };
        this.luminousCoreBlurHorizontalEffect = new ThinBlurPostProcess(
            "mmdFrameGraphLuminousCoreBlurHorizontal",
            frameGraph.engine,
            new Vector2(1, 0),
            resolveLuminousBlurPassSettings(initialSettings.luminousRadius, "core").kernel,
            blurShaderOptions,
        );
        const luminousCoreBlurHorizontalTask = new FrameGraphPostEffectsLuminousThinBlurTask(
            "frameGraphPostEffectsLuminousCoreBlurHorizontal",
            frameGraph,
            this.luminousCoreBlurHorizontalEffect,
            this.getSettings,
            "horizontal",
            "core",
        );
        luminousCoreBlurHorizontalTask.sourceTexture = luminousExtractTask.outputTexture;
        luminousCoreBlurHorizontalTask.disabled = luminousDisabled;
        deferEffectTask("luminous", luminousCoreBlurHorizontalTask);
        this.luminousCoreBlurHorizontalTask = luminousCoreBlurHorizontalTask;

        this.luminousCoreBlurVerticalEffect = new ThinBlurPostProcess(
            "mmdFrameGraphLuminousCoreBlurVertical",
            frameGraph.engine,
            new Vector2(0, 1),
            resolveLuminousBlurPassSettings(initialSettings.luminousRadius, "core").kernel,
            blurShaderOptions,
        );
        const luminousCoreBlurVerticalTask = new FrameGraphPostEffectsLuminousThinBlurTask(
            "frameGraphPostEffectsLuminousCoreBlurVertical",
            frameGraph,
            this.luminousCoreBlurVerticalEffect,
            this.getSettings,
            "vertical",
            "core",
        );
        luminousCoreBlurVerticalTask.sourceTexture = luminousCoreBlurHorizontalTask.outputTexture;
        luminousCoreBlurVerticalTask.disabled = luminousDisabled;
        deferEffectTask("luminous", luminousCoreBlurVerticalTask);
        this.luminousCoreBlurVerticalTask = luminousCoreBlurVerticalTask;

        this.luminousHaloBlurHorizontalEffect = new ThinBlurPostProcess(
            "mmdFrameGraphLuminousHaloBlurHorizontal",
            frameGraph.engine,
            new Vector2(1, 0),
            resolveLuminousBlurPassSettings(initialSettings.luminousRadius, "halo").kernel,
            blurShaderOptions,
        );
        const luminousHaloBlurHorizontalTask = new FrameGraphPostEffectsLuminousThinBlurTask(
            "frameGraphPostEffectsLuminousHaloBlurHorizontal",
            frameGraph,
            this.luminousHaloBlurHorizontalEffect,
            this.getSettings,
            "horizontal",
            "halo",
        );
        luminousHaloBlurHorizontalTask.sourceTexture = luminousExtractTask.outputTexture;
        luminousHaloBlurHorizontalTask.disabled = luminousDisabled;
        deferEffectTask("luminous", luminousHaloBlurHorizontalTask);
        this.luminousHaloBlurHorizontalTask = luminousHaloBlurHorizontalTask;

        this.luminousHaloBlurVerticalEffect = new ThinBlurPostProcess(
            "mmdFrameGraphLuminousHaloBlurVertical",
            frameGraph.engine,
            new Vector2(0, 1),
            resolveLuminousBlurPassSettings(initialSettings.luminousRadius, "halo").kernel,
            blurShaderOptions,
        );
        const luminousHaloBlurVerticalTask = new FrameGraphPostEffectsLuminousThinBlurTask(
            "frameGraphPostEffectsLuminousHaloBlurVertical",
            frameGraph,
            this.luminousHaloBlurVerticalEffect,
            this.getSettings,
            "vertical",
            "halo",
        );
        luminousHaloBlurVerticalTask.sourceTexture = luminousHaloBlurHorizontalTask.outputTexture;
        luminousHaloBlurVerticalTask.disabled = luminousDisabled;
        deferEffectTask("luminous", luminousHaloBlurVerticalTask);
        this.luminousHaloBlurVerticalTask = luminousHaloBlurVerticalTask;

        this.luminousEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphLuminous",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["intensity", "glareCount", "glareLength", "glareAngle", "glarePower", "texelSize"],
            samplers: ["glowSampler", "haloSampler"],
            name: "mmdFrameGraphLuminous",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const luminousTask = new FrameGraphPostEffectsLuminousTask(
            "frameGraphPostEffectsLuminous",
            frameGraph,
            this.luminousEffect,
            this.getSettings,
        );
        luminousTask.sourceTexture = bloomSourceTexture;
        luminousTask.glowTexture = luminousCoreBlurVerticalTask.outputTexture;
        luminousTask.haloTexture = luminousHaloBlurVerticalTask.outputTexture;
        luminousTask.disabled = luminousDisabled;
        deferEffectTask("luminous", luminousTask);
        this.luminousTask = luminousTask;
        luminousOutputTexture = luminousTask.outputTexture;
        }

        const bloomTask = new FrameGraphBloomTask(
            "frameGraphPostEffectsBloom",
            frameGraph,
            Math.max(0, initialSettings.bloomWeight),
            Math.max(1, initialSettings.bloomKernel),
            Math.max(0, initialSettings.bloomThreshold),
            false,
        );
        bloomTask.sourceTexture = luminousOutputTexture;
        bloomTask.disabled = !initialSettings.bloomEnabled;
        deferEffectTask("bloom", bloomTask);
        this.bloomTask = bloomTask;

        this.bloomTintEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphBloomTint",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["bloomColor"],
            samplers: ["originalSampler"],
            name: "mmdFrameGraphBloomTint",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const bloomTintTask = new FrameGraphPostEffectsBloomTintTask(
            "frameGraphPostEffectsBloomTint",
            frameGraph,
            this.bloomTintEffect,
            this.getSettings,
        );
        bloomTintTask.sourceTexture = bloomTask.outputTexture;
        bloomTintTask.originalTexture = luminousOutputTexture;
        bloomTintTask.disabled = !initialSettings.bloomEnabled;
        deferEffectTask("bloom", bloomTintTask);
        this.bloomTintTask = bloomTintTask;

        this.lutEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphLut",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["lutSize", "lutIntensity"],
            samplers: ["lutSampler"],
            name: "mmdFrameGraphLut",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const lutTask = new FrameGraphPostEffectsLutTask(
            "frameGraphPostEffectsLut",
            frameGraph,
            this.lutEffect,
            this.getSettings,
            () => this.lutTexture,
        );
        lutTask.sourceTexture = bloomTintTask.outputTexture;
        lutTask.disabled = !this.isLutEnabled(initialSettings);
        deferEffectTask("lut", lutTask);
        this.lutTask = lutTask;

        const colorCorrectionTask = new FrameGraphPostEffectsColorCorrectionTask(
            "frameGraphPostEffectsColorCorrection",
            frameGraph,
            this.colorCorrectionEffect,
            () => {
                this.executedFrameCount += 1;
            },
            this.getSettings,
        );
        colorCorrectionTask.sourceTexture = lutTask.outputTexture;
        postludeTasks.push(colorCorrectionTask);

        this.sharpenEffect = new ThinSharpenPostProcess(
            "frameGraphPostEffectsSharpen",
            frameGraph.engine,
            {
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        const sharpenTask = new FrameGraphSharpenTask(
            "frameGraphPostEffectsSharpen",
            frameGraph,
            this.sharpenEffect,
        );
        sharpenTask.sourceTexture = colorCorrectionTask.outputTexture;
        sharpenTask.disabled = initialSettings.sharpenEdge <= 0.0001;
        this.applySharpenSettings(sharpenTask, initialSettings);
        deferEffectTask("sharpen", sharpenTask);
        this.sharpenTask = sharpenTask;

        this.grainEffect = new ThinGrainPostProcess(
            "frameGraphPostEffectsGrain",
            frameGraph.engine,
            {
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        const grainTask = new FrameGraphGrainTask(
            "frameGraphPostEffectsGrain",
            frameGraph,
            this.grainEffect,
        );
        grainTask.sourceTexture = sharpenTask.outputTexture;
        grainTask.disabled = initialSettings.grainIntensity <= 0.0001;
        this.applyGrainSettings(grainTask, initialSettings);
        deferEffectTask("grain", grainTask);
        this.grainTask = grainTask;

        this.chromaticAberrationEffect = new ThinChromaticAberrationPostProcess(
            "frameGraphPostEffectsChromaticAberration",
            frameGraph.engine,
            {
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        const chromaticAberrationTask = new FrameGraphChromaticAberrationTask(
            "frameGraphPostEffectsChromaticAberration",
            frameGraph,
            this.chromaticAberrationEffect,
        );
        chromaticAberrationTask.sourceTexture = grainTask.outputTexture;
        chromaticAberrationTask.disabled = initialSettings.chromaticAberration <= 0.0001;
        this.applyChromaticAberrationSettings(chromaticAberrationTask, initialSettings);
        deferEffectTask("chromatic", chromaticAberrationTask);
        this.chromaticAberrationTask = chromaticAberrationTask;

        this.vignetteEdgeBlurEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphVignetteEdgeBlur",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["texelSize", "edgeBlurStrength", "vignetteWeight", "aspectRatio"],
            name: "mmdFrameGraphVignetteEdgeBlur",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const vignetteEdgeBlurTask = new FrameGraphPostEffectsVignetteEdgeBlurTask(
            "frameGraphPostEffectsVignetteEdgeBlur",
            frameGraph,
            this.vignetteEdgeBlurEffect,
            this.getSettings,
        );
        vignetteEdgeBlurTask.sourceTexture = chromaticAberrationTask.outputTexture;
        vignetteEdgeBlurTask.disabled = !this.isVignetteEdgeBlurEnabled(initialSettings);
        const vignetteEdgeBlurOrderId = physicalEffectOrder.find((id) => (
            id === "vignette" || id === "edgeBlur"
        ));
        if (vignetteEdgeBlurOrderId) {
            deferEffectTask(vignetteEdgeBlurOrderId, vignetteEdgeBlurTask);
        }
        this.vignetteEdgeBlurTask = vignetteEdgeBlurTask;

        this.lensDistortionEffect = new EffectWrapper({
            engine: frameGraph.engine,
            fragmentShader: "mmdFrameGraphLensDistortion",
            useShaderStore: true,
            useAsPostProcess: true,
            uniforms: ["distortion"],
            name: "mmdFrameGraphLensDistortion",
            shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
        });
        const lensDistortionTask = new FrameGraphPostEffectsLensDistortionTask(
            "frameGraphPostEffectsLensDistortion",
            frameGraph,
            this.lensDistortionEffect,
            this.getSettings,
        );
        lensDistortionTask.sourceTexture = vignetteEdgeBlurTask.outputTexture;
        lensDistortionTask.disabled = !isFrameGraphPostEffectActiveInSettings(initialSettings, "distortion");
        deferEffectTask("distortion", lensDistortionTask);
        this.lensDistortionTask = lensDistortionTask;

        this.fxaaEffect = new ThinFXAAPostProcess(
            "frameGraphPostEffectsFXAA",
            frameGraph.engine,
            {
                shaderLanguage: frameGraph.engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL,
            },
        );
        const fxaaTask = new FrameGraphFXAATask(
            "frameGraphPostEffectsFXAA",
            frameGraph,
            this.fxaaEffect,
        );
        fxaaTask.sourceTexture = lensDistortionTask.outputTexture;
        fxaaTask.disabled = !initialSettings.antialiasEnabled;
        postludeTasks.push(fxaaTask);
        this.fxaaTask = fxaaTask;

        const outputTask: FrameGraphPostEffectsOutputTask = outputTexture
            ? new FrameGraphCopyToTextureTask("frameGraphPostEffectsExportOutput", frameGraph)
            : new FrameGraphCopyToBackbufferColorTask("frameGraphPostEffectsOutput", frameGraph);
        if (outputTask instanceof FrameGraphCopyToTextureTask && outputTexture) {
            outputTask.targetTexture = frameGraph.textureManager.importTexture(
                "mmdModokiExportRenderSurface",
                outputTexture,
            );
        }
        postludeTasks.push(outputTask);
        this.outputTask = outputTask;
        this.connectPostEffectOrder(imageProcessingTask.outputTexture, colorCorrectionTask, physicalEffectOrder);
        fxaaTask.sourceTexture = colorCorrectionTask.outputTexture;
        outputTask.sourceTexture = fxaaTask.outputTexture;

        for (const task of preludeTasks) {
            frameGraph.addTask(task);
        }
        for (const id of physicalEffectOrder) {
            for (const task of effectTasks.get(id) ?? []) {
                frameGraph.addTask(task);
            }
        }
        for (const task of postludeTasks) {
            frameGraph.addTask(task);
        }

        if (resourcePlan.activeEffects.includes("motionBlur")) {
            this.motionBlurBoneVelocityMode.synchronize(scene.meshes);
        }

        this.frameGraph = frameGraph;
        this.activeScene = scene;
        this.active = true;
        this.onInfo?.({
            message: initialSettings.oceanEnabled
                ? `Frame Graph post effects backend active (${FRAME_GRAPH_OCEAN_METHOD_NAME} + standard post stack).`
                : "Frame Graph post effects backend active.",
            event: "activated",
        });
        void this.frameGraph.buildAsync().then(() => {
            this.ready = true;
            if (this.ssgiGatherTask) {
                const report = this.ssgiGatherTask.getResolutionReport();
                this.onInfo?.({
                    message: "Frame Graph SSGI task ready.",
                    event: "ssgi-ready",
                    details: {
                        method: FRAME_GRAPH_SSGI_METHOD_NAME,
                        blendMode: this.getSettings().ssgiBlendMode,
                        resolution: report.output,
                        inputs: report.inputs,
                        inputsResolved: report.resolved,
                        denoiser: {
                            method: "spatial-a-trous",
                            passes: this.ssgiDenoiseTasks.length,
                            stepWidths: [...SSGI_DENOISE_STEP_WIDTHS],
                            guides: ["sceneColor", "viewDepth", "viewNormal"],
                            history: false,
                        },
                    },
                });
            }
            this.onInfo?.({
                message: "Frame Graph post effects backend ready.",
                event: "ready",
            });
        }).catch((err: unknown) => {
            this.ready = false;
            this.active = false;
            this.motionBlurBoneVelocityMode.restore();
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            this.emitWarningOnce({
                message: `Frame Graph post effects failed to build. Using classic post effects. Reason: ${message}`,
                reason: "build-failed",
                stack,
            });
        });
        return true;
    }

    execute(): void {
        if (!this.active || !this.ready || !this.frameGraph?.isReady()) {
            return;
        }
        const settings = this.getSettings();
        const resourcePlan = buildFrameGraphResourcePlan(
            settings,
            this.resourcePlan?.effectOrder ?? FRAME_GRAPH_POST_EFFECT_IDS,
        );
        this.resourcePlan = resourcePlan;
        if (this.activeScene) {
            this.updateLutTexture(this.activeScene, settings);
        }
        if (this.imageProcessingTask) {
            this.imageProcessingTask.disabled = !settings.imageProcessingEnabled;
        }
        if (this.imageProcessingEffect) {
            const hadImageProcessingVignette = this.imageProcessingEffect.vignetteEnabled;
            this.imageProcessingEffect.vignetteEnabled = false;
            this.imageProcessingEffect.vignetteWeight = 0;
            if (hadImageProcessingVignette || this.lastImageProcessingEnabled !== settings.imageProcessingEnabled) {
                this.imageProcessingEffect._updateParameters();
                this.lastImageProcessingEnabled = settings.imageProcessingEnabled;
            }
        }
        if (this.depthOfFieldTask) {
            this.depthOfFieldTask.disabled = !settings.dofEnabled;
            this.applyDepthOfFieldSettings(this.depthOfFieldTask, settings);
        }
        const luminousDisabled = !settings.luminousEnabled
            || settings.luminousIntensity <= 0.0001
            || this.luminousExtractTask?.sourceTexture === undefined
            || !this.areLuminousEffectsReady();
        if (this.luminousExtractTask) {
            this.luminousExtractTask.disabled = luminousDisabled;
        }
        if (this.luminousCoreBlurHorizontalTask) {
            this.luminousCoreBlurHorizontalTask.disabled = luminousDisabled;
        }
        if (this.luminousCoreBlurVerticalTask) {
            this.luminousCoreBlurVerticalTask.disabled = luminousDisabled;
        }
        if (this.luminousHaloBlurHorizontalTask) {
            this.luminousHaloBlurHorizontalTask.disabled = luminousDisabled;
        }
        if (this.luminousHaloBlurVerticalTask) {
            this.luminousHaloBlurVerticalTask.disabled = luminousDisabled;
        }
        if (this.luminousTask) {
            this.luminousTask.disabled = luminousDisabled
                || this.luminousTask.glowTexture === undefined
                || this.luminousTask.haloTexture === undefined;
        }
        if (this.geometryRendererTask) {
            this.geometryRendererTask.disabled = !resourcePlan.needsGeometryRenderer;
        }
        if (this.ssrTask) {
            this.ssrTask.disabled = !this.isPostEffectActive(settings, "ssr");
            this.applySsrSettings(this.ssrTask, settings);
        }
        const ssgiDisabled = !this.isPostEffectActive(settings, "ssgi");
        if (this.ssgiGatherTask) {
            this.ssgiGatherTask.disabled = ssgiDisabled;
        }
        for (const denoiseTask of this.ssgiDenoiseTasks) {
            denoiseTask.disabled = ssgiDisabled;
        }
        if (this.ssgiCompositeTask) {
            this.ssgiCompositeTask.disabled = ssgiDisabled;
        }
        if (this.ssaoTask) {
            this.ssaoTask.disabled = !this.isPostEffectActive(settings, "ssao");
            this.applySsaoSettings(this.ssaoTask, settings, this.ssaoTask.camera);
        }
        if (this.ssaoToonCompositeTask) {
            this.ssaoToonCompositeTask.disabled = !this.isPostEffectActive(settings, "ssao");
        }
        if (this.oceanTask) {
            this.oceanTask.disabled = !this.isPostEffectActive(settings, "ocean");
        }
        if (this.offsetShadowTask) {
            this.offsetShadowTask.disabled = !this.isPostEffectActive(settings, "offsetShadow")
                || this.offsetShadowTask.depthTexture === undefined;
        }
        if (this.offsetHighlightTask) {
            this.offsetHighlightTask.disabled = !this.isPostEffectActive(settings, "offsetHighlight")
                || this.offsetHighlightTask.depthTexture === undefined;
        }
        if (this.motionBlurTask) {
            if (this.activeScene) {
                this.motionBlurBoneVelocityMode.synchronize(this.activeScene.meshes);
            }
            this.motionBlurTask.disabled = !this.isPostEffectActive(settings, "motionBlur")
                || settings.motionBlurStrength <= 0.0001
                || this.motionBlurTask.velocityTexture === undefined;
            this.applyMotionBlurSettings(this.motionBlurTask, settings);
        }
        if (this.bloomTask) {
            this.bloomTask.disabled = !settings.bloomEnabled;
            this.applyBloomSettings(this.bloomTask, settings);
        }
        if (this.bloomTintTask) {
            this.bloomTintTask.disabled = !settings.bloomEnabled;
        }
        if (this.lutTask) {
            this.lutTask.disabled = !this.isLutEnabled(settings);
        }
        if (this.sharpenTask) {
            this.sharpenTask.disabled = settings.sharpenEdge <= 0.0001;
            this.applySharpenSettings(this.sharpenTask, settings);
        }
        if (this.grainTask) {
            this.grainTask.disabled = settings.grainIntensity <= 0.0001;
            this.applyGrainSettings(this.grainTask, settings);
        }
        if (this.chromaticAberrationTask) {
            this.chromaticAberrationTask.disabled = settings.chromaticAberration <= 0.0001;
            this.applyChromaticAberrationSettings(this.chromaticAberrationTask, settings);
        }
        if (this.vignetteEdgeBlurTask) {
            this.vignetteEdgeBlurTask.disabled = !this.isVignetteEdgeBlurEnabled(settings);
        }
        if (this.lensDistortionTask) {
            this.lensDistortionTask.disabled = !this.isPostEffectActive(settings, "distortion");
        }
        if (this.fxaaTask) {
            this.fxaaTask.disabled = !settings.antialiasEnabled;
        }
        try {
            this.frameGraph.execute();
        } catch (err: unknown) {
            this.ready = false;
            this.active = false;
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            this.emitWarningOnce({
                message: `Frame Graph post effects failed during execute. Disabled Frame Graph post effects. Reason: ${message}`,
                reason: "build-failed",
                stack,
            });
        }
    }

    getExecutedFrameCount(): number {
        return this.executedFrameCount;
    }

    private connectPostEffectOrder(
        baseTexture: FrameGraphTextureHandle,
        stackOutputTask: FrameGraphPostEffectsStackOutputTask,
        effectOrder: readonly FrameGraphPostEffectId[],
    ): void {
        let currentTexture = baseTexture;
        let vignetteEdgeBlurConnected = false;
        this.connectedOrder = [];
        const normalizedOrder = normalizeFrameGraphPostEffectIds(effectOrder);

        const connectVignetteEdgeBlur = (): void => {
            if (vignetteEdgeBlurConnected || !this.vignetteEdgeBlurTask) {
                return;
            }
            this.vignetteEdgeBlurTask.sourceTexture = currentTexture;
            currentTexture = this.vignetteEdgeBlurTask.outputTexture;
            vignetteEdgeBlurConnected = true;
            this.connectedOrder.push("vignette");
        };

        for (const id of normalizedOrder) {
            switch (id) {
                case "ssr":
                    if (this.ssrTask) {
                        this.ssrTask.sourceTexture = currentTexture;
                        currentTexture = this.ssrTask.outputTexture;
                        this.connectedOrder.push("ssr");
                    }
                    break;
                case "ssgi":
                    if (
                        this.ssgiGatherTask
                        && this.ssgiDenoiseTasks.length === SSGI_DENOISE_STEP_WIDTHS.length
                        && this.ssgiCompositeTask
                    ) {
                        this.ssgiGatherTask.sourceTexture = currentTexture;
                        this.ssgiCompositeTask.sourceTexture = currentTexture;
                        let denoisedSsgiTexture = this.ssgiGatherTask.outputTexture;
                        for (const denoiseTask of this.ssgiDenoiseTasks) {
                            denoiseTask.sourceTexture = denoisedSsgiTexture;
                            denoiseTask.sceneColorTexture = currentTexture;
                            denoisedSsgiTexture = denoiseTask.outputTexture;
                        }
                        this.ssgiCompositeTask.ssgiTexture = denoisedSsgiTexture;
                        currentTexture = this.ssgiCompositeTask.outputTexture;
                        this.connectedOrder.push("ssgi");
                    }
                    break;
                case "ssao":
                    if (this.ssaoTask && this.ssaoToonCompositeTask) {
                        this.ssaoTask.sourceTexture = currentTexture;
                        this.ssaoToonCompositeTask.sourceTexture = this.ssaoTask.outputTexture;
                        this.ssaoToonCompositeTask.originalTexture = currentTexture;
                        currentTexture = this.ssaoToonCompositeTask.outputTexture;
                        this.connectedOrder.push("ssao");
                    }
                    break;
                case "offsetShadow":
                    if (this.offsetShadowTask) {
                        this.offsetShadowTask.sourceTexture = currentTexture;
                        currentTexture = this.offsetShadowTask.outputTexture;
                        this.connectedOrder.push("offsetShadow");
                    }
                    break;
                case "offsetHighlight":
                    if (this.offsetHighlightTask) {
                        this.offsetHighlightTask.sourceTexture = currentTexture;
                        currentTexture = this.offsetHighlightTask.outputTexture;
                        this.connectedOrder.push("offsetHighlight");
                    }
                    break;
                case "dof":
                    if (this.depthOfFieldTask) {
                        this.depthOfFieldTask.sourceTexture = currentTexture;
                        currentTexture = this.depthOfFieldTask.outputTexture;
                        this.connectedOrder.push("dof");
                    }
                    break;
                case "luminous":
                    if (this.luminousTask) {
                        this.luminousTask.sourceTexture = currentTexture;
                        currentTexture = this.luminousTask.outputTexture;
                        this.connectedOrder.push("luminous");
                    }
                    break;
                case "bloom":
                    if (this.bloomTask && this.bloomTintTask) {
                        this.bloomTask.sourceTexture = currentTexture;
                        this.bloomTintTask.sourceTexture = this.bloomTask.outputTexture;
                        this.bloomTintTask.originalTexture = currentTexture;
                        currentTexture = this.bloomTintTask.outputTexture;
                        this.connectedOrder.push("bloom");
                    }
                    break;
                case "lut":
                    if (this.lutTask) {
                        this.lutTask.sourceTexture = currentTexture;
                        currentTexture = this.lutTask.outputTexture;
                        this.connectedOrder.push("lut");
                    }
                    break;
                case "ocean":
                    if (this.oceanTask) {
                        this.oceanTask.sourceTexture = currentTexture;
                        currentTexture = this.oceanTask.outputTexture;
                        this.connectedOrder.push("ocean");
                    }
                    break;
                case "motionBlur":
                    if (this.motionBlurTask) {
                        this.motionBlurTask.sourceTexture = currentTexture;
                        currentTexture = this.motionBlurTask.outputTexture;
                        this.connectedOrder.push("motionBlur");
                    }
                    break;
                case "sharpen":
                    if (this.sharpenTask) {
                        this.sharpenTask.sourceTexture = currentTexture;
                        currentTexture = this.sharpenTask.outputTexture;
                        this.connectedOrder.push("sharpen");
                    }
                    break;
                case "grain":
                    if (this.grainTask) {
                        this.grainTask.sourceTexture = currentTexture;
                        currentTexture = this.grainTask.outputTexture;
                        this.connectedOrder.push("grain");
                    }
                    break;
                case "chromatic":
                    if (this.chromaticAberrationTask) {
                        this.chromaticAberrationTask.sourceTexture = currentTexture;
                        currentTexture = this.chromaticAberrationTask.outputTexture;
                        this.connectedOrder.push("chromatic");
                    }
                    break;
                case "vignette":
                case "edgeBlur":
                    connectVignetteEdgeBlur();
                    break;
                case "distortion":
                    if (this.lensDistortionTask) {
                        this.lensDistortionTask.sourceTexture = currentTexture;
                        currentTexture = this.lensDistortionTask.outputTexture;
                        this.connectedOrder.push("distortion");
                    }
                    break;
            }
        }

        stackOutputTask.sourceTexture = currentTexture;
    }

    private emitWarningOnce(warning: FrameGraphPostEffectsWarning): void {
        if (!this.activationWarningEmitted) {
            this.activationWarningEmitted = true;
            this.onWarning(warning);
        }
    }

    dispose(): void {
        this.colorCorrectionEffect?.dispose();
        this.colorCorrectionEffect = null;
        this.lutEffect?.dispose();
        this.lutEffect = null;
        this.lutTask = null;
        this.disposeLutTexture();
        this.imageProcessingEffect?.dispose();
        this.imageProcessingEffect = null;
        this.imageProcessingTask = null;
        this.geometryRendererTask = null;
        this.resourcePlan = null;
        this.ssgiGatherTask?.dispose();
        this.ssgiGatherTask = null;
        for (const denoiseTask of this.ssgiDenoiseTasks) {
            denoiseTask.dispose();
        }
        this.ssgiDenoiseTasks.length = 0;
        this.ssgiCompositeEffect?.dispose();
        this.ssgiCompositeEffect = null;
        this.ssgiCompositeTask = null;
        this.ssrTask?.dispose();
        this.ssrTask = null;
        this.ssaoTask?.dispose();
        this.ssaoTask = null;
        this.ssaoToonCompositeEffect?.dispose();
        this.ssaoToonCompositeEffect = null;
        this.ssaoToonCompositeTask = null;
        this.oceanEffect?.dispose();
        this.oceanEffect = null;
        this.oceanTask = null;
        this.offsetShadowEffect?.dispose();
        this.offsetShadowEffect = null;
        this.offsetShadowTask = null;
        this.offsetHighlightEffect?.dispose();
        this.offsetHighlightEffect = null;
        this.offsetHighlightTask = null;
        this.depthOfFieldTask = null;
        this.luminousExtractEffect?.dispose();
        this.luminousExtractEffect = null;
        this.luminousExtractTask = null;
        this.luminousCoreBlurHorizontalEffect?.dispose();
        this.luminousCoreBlurHorizontalEffect = null;
        this.luminousCoreBlurVerticalEffect?.dispose();
        this.luminousCoreBlurVerticalEffect = null;
        this.luminousCoreBlurHorizontalTask = null;
        this.luminousCoreBlurVerticalTask = null;
        this.luminousHaloBlurHorizontalEffect?.dispose();
        this.luminousHaloBlurHorizontalEffect = null;
        this.luminousHaloBlurVerticalEffect?.dispose();
        this.luminousHaloBlurVerticalEffect = null;
        this.luminousHaloBlurHorizontalTask = null;
        this.luminousHaloBlurVerticalTask = null;
        this.luminousEffect?.dispose();
        this.luminousEffect = null;
        this.luminousTask = null;
        this.bloomTask = null;
        this.bloomTintEffect?.dispose();
        this.bloomTintEffect = null;
        this.bloomTintTask = null;
        this.chromaticAberrationEffect?.dispose();
        this.chromaticAberrationEffect = null;
        this.chromaticAberrationTask = null;
        this.vignetteEdgeBlurEffect?.dispose();
        this.vignetteEdgeBlurEffect = null;
        this.vignetteEdgeBlurTask = null;
        this.lensDistortionEffect?.dispose();
        this.lensDistortionEffect = null;
        this.lensDistortionTask = null;
        this.motionBlurTask?.dispose();
        this.motionBlurTask = null;
        this.motionBlurBoneVelocityMode.restore();
        this.grainEffect?.dispose();
        this.grainEffect = null;
        this.grainTask = null;
        this.sharpenEffect?.dispose();
        this.sharpenEffect = null;
        this.sharpenTask = null;
        this.fxaaEffect?.dispose();
        this.fxaaEffect = null;
        this.fxaaTask = null;
        this.outputTask = null;
        this.connectedOrder = [];
        this.frameGraph?.dispose();
        this.frameGraph = null;
        this.activeScene = null;
        this.ready = false;
        this.active = false;
        this.executedFrameCount = 0;
        this.lastImageProcessingEnabled = null;
        this.activationWarningEmitted = false;
    }

    private applyDepthOfFieldSettings(
        depthOfFieldTask: FrameGraphDepthOfFieldTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        depthOfFieldTask.depthOfField.focusDistance = Math.max(1, settings.dofFocusDistanceMm);
        depthOfFieldTask.depthOfField.fStop = Math.max(0.01, settings.dofEffectiveFStop);
        depthOfFieldTask.depthOfField.lensSize = Math.max(0.001, settings.dofLensSize);
        depthOfFieldTask.depthOfField.focalLength = Math.max(1, settings.dofFocalLength);
    }

    private applyBloomSettings(
        bloomTask: FrameGraphBloomTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        bloomTask.bloom.weight = Math.max(0, settings.bloomWeight);
        bloomTask.bloom.threshold = Math.max(0, settings.bloomThreshold);
        bloomTask.bloom.kernel = Math.max(1, settings.bloomKernel);
    }

    private isLutEnabled(settings: FrameGraphPostEffectsSettings): boolean {
        return settings.lutEnabled
            && settings.lutIntensity > 0.00001
            && !!settings.lutRuntimeText
            && !!this.lutTexture
            && this.lutTexture.isReady();
    }

    private updateLutTexture(scene: Scene, settings: FrameGraphPostEffectsSettings): void {
        const textureKey = settings.lutTextureKey;
        if (!settings.lutEnabled || !settings.lutRuntimeText || !textureKey) {
            this.disposeLutTexture();
            return;
        }
        if (this.lutTexture && this.lutTextureKey === textureKey) {
            return;
        }

        this.disposeLutTexture();
        try {
            this.lutTexture = createLutAtlasTextureFrom3dlText(
                scene,
                `frameGraphLut:${textureKey}`,
                settings.lutRuntimeText,
            );
            this.lutTextureKey = textureKey;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Failed to create Frame Graph LUT '${textureKey}': ${message}`);
            this.lutTexture = null;
            this.lutTextureKey = null;
        }
    }

    private disposeLutTexture(): void {
        if (this.lutTexture) {
            this.lutTexture.dispose();
            this.lutTexture = null;
        }
        this.lutTextureKey = null;
    }

    private applySsaoSettings(
        ssaoTask: FrameGraphSSAO2RenderingPipelineTask,
        settings: FrameGraphPostEffectsSettings,
        camera: Camera,
    ): void {
        ssaoTask.ssao.samples = 16;
        ssaoTask.ssao.expensiveBlur = true;
        ssaoTask.ssao.bilateralSamples = 8;
        ssaoTask.ssao.bilateralSoften = 0.25;
        ssaoTask.ssao.bilateralTolerance = 0.15;
        ssaoTask.ssao.base = 0;
        ssaoTask.ssao.totalStrength = Math.pow(Math.max(0, settings.ssaoStrength), 1.35) * 2.2;
        ssaoTask.ssao.radius = Math.max(0.01, settings.ssaoRadius);
        ssaoTask.ssao.maxZ = Math.max(50, Math.min(2000, camera.maxZ));
        ssaoTask.ssao.minZAspect = 0.2;
        ssaoTask.ssao.epsilon = 0.02;
    }

    private applySsrSettings(
        ssrTask: FrameGraphSSRRenderingPipelineTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        ssrTask.ssr.strength = Math.max(0, settings.ssrStrength);
        ssrTask.ssr.step = 4;
        ssrTask.ssr.maxDistance = 1000;
        ssrTask.ssr.maxSteps = 192;
        ssrTask.ssr.thickness = 0.22;
        ssrTask.ssr.reflectivityThreshold = 0.85;
        ssrTask.ssr.roughnessFactor = 0.28;
        // Babylon's FrameGraph SSR pipeline currently expects an explicit targetTexture
        // on the blur-combiner path. Keep the initial MMD_modoki path unblurred so
        // enabling SSR does not break the whole FrameGraph post stack.
        ssrTask.ssr.blurDispersionStrength = 0;
        ssrTask.ssr.ssrDownsample = 0;
        ssrTask.ssr.blurDownsample = 0;
        ssrTask.ssr.enableSmoothReflections = true;
        ssrTask.ssr.inputTextureColorIsInGammaSpace = true;
        ssrTask.ssr.generateOutputInGammaSpace = true;
        ssrTask.ssr.normalsAreInWorldSpace = false;
        ssrTask.ssr.useScreenspaceDepth = false;
        ssrTask.ssr.debug = false;
    }

    private isPostEffectActive(
        settings: FrameGraphPostEffectsSettings,
        id: FrameGraphPostEffectId,
    ): boolean {
        return isFrameGraphPostEffectActiveInSettings(settings, id);
    }

    private applyChromaticAberrationSettings(
        chromaticAberrationTask: FrameGraphChromaticAberrationTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        chromaticAberrationTask.postProcess.aberrationAmount = Math.max(0, settings.chromaticAberration);
        chromaticAberrationTask.postProcess.radialIntensity = 2.2;
        chromaticAberrationTask.postProcess.direction = Vector2.Zero();
        chromaticAberrationTask.postProcess.centerPosition = new Vector2(0.5, 0.5);
    }

    private applyGrainSettings(
        grainTask: FrameGraphGrainTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        grainTask.postProcess.intensity = Math.max(0, settings.grainIntensity);
        grainTask.postProcess.animated = false;
    }

    private applySharpenSettings(
        sharpenTask: FrameGraphSharpenTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        sharpenTask.postProcess.edgeAmount = Math.max(0, settings.sharpenEdge);
        sharpenTask.postProcess.colorAmount = 1;
    }

    private applyMotionBlurSettings(
        motionBlurTask: FrameGraphMotionBlurTask,
        settings: FrameGraphPostEffectsSettings,
    ): void {
        motionBlurTask.postProcess.isObjectBased = true;
        motionBlurTask.postProcess.motionStrength = Math.max(0, Math.min(10, settings.motionBlurStrength));
        motionBlurTask.postProcess.motionBlurSamples = Math.max(8, Math.min(64, Math.round(settings.motionBlurSamples)));
    }

    private isVignetteEdgeBlurEnabled(settings: FrameGraphPostEffectsSettings): boolean {
        return this.isPostEffectActive(settings, "vignette")
            || this.isPostEffectActive(settings, "edgeBlur");
    }

    private getSourceTextureSize(scene: Scene, sourceTexture: InternalTexture): { width: number; height: number } {
        const textureWithSize = sourceTexture as InternalTexture & {
            baseWidth?: number;
            baseHeight?: number;
        };
        return {
            width: Math.max(1, textureWithSize.width || textureWithSize.baseWidth || scene.getEngine().getRenderWidth()),
            height: Math.max(1, textureWithSize.height || textureWithSize.baseHeight || scene.getEngine().getRenderHeight()),
        };
    }
}

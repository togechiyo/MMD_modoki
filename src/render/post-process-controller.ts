import { Effect } from "@babylonjs/core/Materials/effect";
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves";
import { ColorGradingTexture } from "@babylonjs/core/Materials/Textures/colorGradingTexture";
import { BloomEffect } from "@babylonjs/core/PostProcesses/bloomEffect";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { SSRRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline";
import { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";

const STANDALONE_BLOOM_SCALE = 0.5;

type PostProcessBackend = "classic" | "frameGraph" | "experimental";

type PostProcessEffectLike = {
    setTexture(name: string, texture: unknown): void;
    setFloat(name: string, value: number): void;
    setFloat2(name: string, x: number, y: number): void;
    setColor3(name: string, value: unknown): void;
    setVector3(name: string, value: Vector3): void;
    setMatrix(name: string, value: unknown): void;
};

type DepthRendererLike = {
    useOnlyInActiveCamera: boolean;
    forceDepthWriteTransparentMeshes: boolean;
    getDepthMap(): Texture;
};

type PostProcessCameraLike = Camera & {
    _postProcesses: Array<PostProcess | null>;
    globalPosition: Vector3;
    position: Vector3;
    fov: number;
    minZ: number;
    maxZ: number;
    detachPostProcess(postProcess: PostProcess): void;
    attachPostProcess(postProcess: PostProcess): void;
    getViewMatrix(): unknown;
    getTransformationMatrix(): { clone(): { invert(): void } };
};

type PostProcessSceneLike = Scene & {
    imageProcessingConfiguration: {
        exposure: number;
        toneMappingEnabled: boolean;
        toneMappingType: number;
        ditheringEnabled: boolean;
        ditheringIntensity: number;
        vignetteEnabled: boolean;
        vignetteWeight: number;
        vignetteColor: { set(r: number, g: number, b: number, a: number): void };
        colorCurves: ColorCurves | null;
        colorCurvesEnabled: boolean;
        colorGradingEnabled: boolean;
        colorGradingTexture: ColorGradingTexture | null;
        isEnabled: boolean;
    };
    fogMode: number;
    fogColor: { set(r: number, g: number, b: number): void };
    enableDepthRenderer(
        camera: Camera,
        storeNonLinearDepth?: boolean,
        force32bitsFloat?: boolean,
        samplingMode?: number,
        storeCameraSpaceZ?: boolean,
    ): DepthRendererLike;
};

type PostProcessHostStatics = {
    POST_EFFECT_LUT_PRESETS: ReadonlyArray<{ id: string; label: string }>;
    POST_EFFECT_LUT_TEXT_BY_ID: Record<string, string | undefined>;
};

type PostProcessHost = {
    constructor: unknown;
    scene: PostProcessSceneLike;
    camera: PostProcessCameraLike;
    engine: {
        getRenderWidth(): number;
        getRenderHeight(): number;
    };
    dirLight: { position: Vector3 } | null;
    postEffectBackend: PostProcessBackend;
    defaultRenderingPipeline: DefaultRenderingPipeline | null;
    lensRenderingPipeline: { dispose(doNotRebuild?: boolean): void } | null;
    ssrRenderingPipeline: SSRRenderingPipeline | null;
    standaloneBloomEffect: (BloomEffect & { _effects?: PostProcess[] }) | null;
    standaloneLensBlurPostProcess: PostProcess | null;
    standaloneEdgeBlurPostProcess: PostProcess | null;
    volumetricLightPostProcess: VolumetricLightScatteringPostProcess | null;
    originFogPostProcess: PostProcess | null;
    motionBlurPostProcess: PostProcess | null;
    finalLensDistortionPostProcess: PostProcess | null;
    finalAntialiasPostProcess: PostProcess | null;
    dofPostProcess: PostProcess | null;
    depthRenderer: DepthRendererLike | null;
    motionBlurPreviousCameraPosition: Vector3 | null;
    motionBlurScreenDirection: Vector2;
    motionBlurScreenAmount: number;
    postEffectBloomEnabledValue: boolean;
    postEffectBloomWeightValue: number;
    postEffectBloomThresholdValue: number;
    postEffectBloomKernelValue: number;
    postEffectMotionBlurEnabledValue: boolean;
    postEffectMotionBlurStrengthValue: number;
    postEffectMotionBlurSamplesValue: number;
    postEffectVlsEnabledValue: boolean;
    postEffectVlsExposureValue: number;
    postEffectVlsDecayValue: number;
    postEffectVlsWeightValue: number;
    postEffectVlsDensityValue: number;
    postEffectFogEnabledValue: boolean;
    postEffectFogModeValue: number;
    postEffectFogStartValue: number;
    postEffectFogEndValue: number;
    postEffectFogDensityValue: number;
    postEffectFogOpacityValue: number;
    postEffectFogColorValue: { r: number; g: number; b: number };
    dofLensDistortionValue: number;
    antialiasEnabledValue: boolean;
    farDofEnabled: boolean;
    postEffectFarDofStrengthValue: number;
    postEffectToneMappingEnabledValue: boolean;
    postEffectDitheringEnabledValue: boolean;
    postEffectVignetteEnabledValue: boolean;
    postEffectColorCurvesEnabledValue: boolean;
    postEffectLutEnabledValue: boolean;
    postEffectExposureValue: number;
    postEffectToneMappingTypeValue: number;
    postEffectDitheringIntensityValue: number;
    postEffectVignetteWeightValue: number;
    postEffectColorCurvesHueValue: number;
    postEffectColorCurvesDensityValue: number;
    postEffectColorCurvesSaturationValue: number;
    postEffectColorCurvesExposureValue: number;
    postEffectLutSourceModeValue: "builtin" | "external-absolute" | "project-relative";
    postEffectLutPresetValue: string;
    postEffectLutExternalTextValue: string | null;
    postEffectLutExternalPathValue: string | null;
    postEffectLutExternalSourceFormatValue: "3dl" | "cube" | null;
    postEffectLutExternalRevision: number;
    postEffectLutTexture: ColorGradingTexture | null;
    postEffectLutTextureKey: string | null;
    postEffectLutPresetBlobUrlById: Map<string, string>;
    postEffectLutExternalBlobUrl: string | null;
    postEffectChromaticAberrationValue: number;
    postEffectGrainIntensityValue: number;
    postEffectSharpenEdgeValue: number;
    postEffectSsrEnabledValue: boolean;
    postEffectSsrStrengthValue: number;
    postEffectSsrStepValue: number;
    dofEnabledValue: boolean;
    dofBlurLevelValue: number;
    dofLensBlurEnabledValue: boolean;
    dofLensBlurStrengthValue: number;
    dofFocusDistanceMmValue: number;
    dofFocalLengthValue: number;
    dofLensSizeValue: number;
    dofEffectiveFStopValue: number;
    dofLensHighlightsBaseGain: number;
    dofLensHighlightsGainRange: number;
    dofLensHighlightsBaseThreshold: number;
    dofLensHighlightsThresholdRange: number;
    dofFocalLengthFollowsCameraFov: boolean;
    dofLensDistortionFollowsCameraFov: boolean;
    dofAutoFocusToCameraTarget: boolean;
    dofAutoFocusNearOffsetMmValue: number;
    dofFStopValue: number;
    dofLensDistortionMinTeleFovDeg: number;
    dofLensDistortionNeutralFovDeg: number;
    dofLensDistortionMaxWideFovDeg: number;
    dofLensDistortionInfluenceValue: number;
    dofFovLinkSensorWidthMm: number;
    dofFocalLengthDistanceInvertedValue: boolean;
    dofAutoFocusInFocusRadiusMm: number;
    dofNearSuppressionScaleValue: number;
    dofAutoFocusLensCompensationExponent: number;
    dofAutoFocusCocAtRangeEdge: number;
    dofLensEdgeBlurValue: number;
    farDofFocusSharpRadiusMm: number;
    setupEditorDofPipeline(): void;
    setupFarDofPostProcess(): void;
    disablePrePassRendererIfSupported(): void;
    applyImageProcessingSettings(): void;
    applyDefaultPipelinePostProcessSettings(): void;
    applySsrSettings(): void;
    applyFogSettings(): void;
    configureDofDepthRenderer(): void;
    updateDofLensDistortionFromCameraFov(): void;
    setupLensHighlightsPipeline(): void;
    applyEditorDofSettings(): void;
    setupFinalLensDistortionPostProcess(): void;
    applyAntialiasSettings(): void;
    applyVolumetricLightSettings(): void;
    applyMotionBlurSettings(): void;
    enforceFinalPostProcessOrder(): void;
    ensureSimpleMotionBlurShader(): void;
    getPostProcessShaderLanguage(): unknown;
    getEngineType(): string;
    addRuntimeDiagnostic(message: string): void;
    setupOriginFogPostProcess(): void;
    hasPrePassRendererSupport(): boolean;
    syncLuminousGlowLayer?: () => void;
    getDofAutoFocusDistanceMm(): number;
};

function getPostProcessHostStatics(host: PostProcessHost): PostProcessHostStatics {
    return host.constructor as PostProcessHostStatics;
}

function disposeStandaloneBloomEffect(host: PostProcessHost): void {
    if (!host.standaloneBloomEffect) {
        return;
    }

    host.standaloneBloomEffect.disposeEffects(host.camera);
    host.standaloneBloomEffect = null;
}

function getStandaloneBloomPostProcesses(host: PostProcessHost): PostProcess[] {
    return host.standaloneBloomEffect?._effects ?? [];
}

function disposeStandaloneLensBlurPostProcess(host: PostProcessHost): void {
    if (!host.standaloneLensBlurPostProcess) {
        return;
    }

    host.standaloneLensBlurPostProcess.dispose(host.camera);
    host.standaloneLensBlurPostProcess = null;
}

function getStandaloneLensBlurPostProcesses(host: PostProcessHost): PostProcess[] {
    return host.standaloneLensBlurPostProcess ? [host.standaloneLensBlurPostProcess] : [];
}

function disposeStandaloneEdgeBlurPostProcess(host: PostProcessHost): void {
    if (!host.standaloneEdgeBlurPostProcess) {
        return;
    }

    host.standaloneEdgeBlurPostProcess.dispose(host.camera);
    host.standaloneEdgeBlurPostProcess = null;
}

function getStandaloneEdgeBlurPostProcesses(host: PostProcessHost): PostProcess[] {
    return host.standaloneEdgeBlurPostProcess ? [host.standaloneEdgeBlurPostProcess] : [];
}

function ensureStandaloneEdgeBlurShader(): void {
    const shaderKey = "mmdStandaloneEdgeBlurFragmentShader";
    if (!Effect.ShadersStore[shaderKey]) {
        Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform vec2 texelSize;
                uniform float edgeBlurStrength;
                uniform float aspectRatio;

                float computeEdgeMask(vec2 uv) {
                    vec2 centered = (uv - vec2(0.5)) * vec2(aspectRatio, 1.0);
                    float radius = length(centered);
                    float mask = smoothstep(0.50, 0.96, radius);
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
                    if (edgeBlurStrength <= 0.0001) {
                        gl_FragColor = baseColor;
                        return;
                    }

                    float edgeMask = computeEdgeMask(vUV);
                    if (edgeMask <= 0.0001) {
                        gl_FragColor = baseColor;
                        return;
                    }

                    float curvedStrength = computeEdgeStrengthCurve(edgeBlurStrength);
                    float blurPixels = (0.7 + 9.8 * curvedStrength) * (0.24 + 0.76 * edgeMask);
                    vec2 stepRadius = texelSize * blurPixels;
                    vec4 blurColor = sampleBlur(vUV, stepRadius);
                    float blurMix = edgeMask * (0.28 + 0.72 * min(1.0, curvedStrength));
                    gl_FragColor = mix(baseColor, blurColor, clamp(blurMix, 0.0, 1.0));
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
                uniform aspectRatio: f32;

                fn computeEdgeMask(uv: vec2f) -> f32 {
                    let centered: vec2f = (uv - vec2f(0.5, 0.5)) * vec2f(uniforms.aspectRatio, 1.0);
                    let radius: f32 = length(centered);
                    let mask: f32 = smoothstep(0.50, 0.96, radius);
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
                            finalColor = mix(baseColor, blurColor, blurMix);
                        }
                    }

                    var fragmentOutputs: FragmentOutputs;
                    fragmentOutputs.color = finalColor;
                    return fragmentOutputs;
                }
            `;
    }
}

function ensureStandaloneLensBlurShader(): void {
    const shaderKey = "mmdStandaloneLensBlurFragmentShader";
    if (!Effect.ShadersStore[shaderKey]) {
        Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform sampler2D depthSampler;
                uniform vec2 texelSize;
                uniform vec2 cameraNearFar;
                uniform float dofEnabled;
                uniform float blurStrength;
                uniform float focusDistance;
                uniform float cocPrecalculation;
                uniform float highlightGain;
                uniform float highlightThreshold;

                float computePixelDistance(float depthMetric) {
                    return mix(cameraNearFar.x, cameraNearFar.y, clamp(depthMetric, 0.0, 1.0)) * 1000.0;
                }

                float computeCoC(float depthMetric) {
                    float pixelDistance = max(1.0, computePixelDistance(depthMetric));
                    float coc = abs(cocPrecalculation * ((focusDistance - pixelDistance) / pixelDistance));
                    return clamp(coc, 0.0, 1.0);
                }

                float computeCocMask(float coc) {
                    float mask = smoothstep(0.04, 0.96, coc);
                    return mask * mask * (3.0 - 2.0 * mask);
                }

                float computeHighlightMask(vec3 color) {
                    float luminance = dot(color, vec3(0.2125, 0.7154, 0.0721));
                    float luminanceThreshold = highlightThreshold > 1.0
                        ? 0.92 + 0.015 * (highlightThreshold - 1.0)
                        : 0.42 + 0.38 * highlightThreshold;
                    float knee = max(0.05, (1.0 - clamp(luminanceThreshold, 0.0, 0.995)) * 0.9);
                    float softMask = smoothstep(
                        max(0.0, luminanceThreshold - knee),
                        min(1.0, luminanceThreshold + knee * 3.6),
                        luminance
                    );
                    return softMask * (0.18 + 0.82 * softMask);
                }

                float computeSilhouetteSuppression(vec2 uv, float currentDistance) {
                    float nearestDistance = currentDistance;
                    vec2 offsetX = vec2(texelSize.x * 1.5, 0.0);
                    vec2 offsetY = vec2(0.0, texelSize.y * 1.5);

                    nearestDistance = min(nearestDistance, computePixelDistance(texture2D(depthSampler, clamp(uv + offsetX, vec2(0.001), vec2(0.999))).r));
                    nearestDistance = min(nearestDistance, computePixelDistance(texture2D(depthSampler, clamp(uv - offsetX, vec2(0.001), vec2(0.999))).r));
                    nearestDistance = min(nearestDistance, computePixelDistance(texture2D(depthSampler, clamp(uv + offsetY, vec2(0.001), vec2(0.999))).r));
                    nearestDistance = min(nearestDistance, computePixelDistance(texture2D(depthSampler, clamp(uv - offsetY, vec2(0.001), vec2(0.999))).r));

                    float foregroundDelta = max(0.0, currentDistance - nearestDistance);
                    return 1.0 - smoothstep(120.0, 1200.0, foregroundDelta);
                }

                float hash12(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                vec2 rotateDirection(vec2 dir, float angle) {
                    float s = sin(angle);
                    float c = cos(angle);
                    return vec2(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
                }

                float computeBackgroundBleedSuppression(float currentDistance, float sampleDistance) {
                    float backgroundDelta = max(0.0, sampleDistance - currentDistance);
                    float keep = 1.0 - smoothstep(40.0, 360.0, backgroundDelta);
                    return 0.18 + 0.82 * keep;
                }

                float computeEdgeBlendBackAmount(float silhouetteSuppression) {
                    float edgePresence = 1.0 - silhouetteSuppression;
                    float edgeBlend = smoothstep(0.08, 0.55, edgePresence);
                    return edgeBlend * (0.55 + 0.2 * blurStrength);
                }

                vec3 samplePrefilteredColor(vec2 uv) {
                    vec2 prefilterStep = texelSize * (0.7 + 0.9 * blurStrength);
                    vec3 color = texture2D(textureSampler, uv).rgb * 0.28;
                    color += texture2D(textureSampler, clamp(uv + vec2(prefilterStep.x, 0.0), vec2(0.001), vec2(0.999))).rgb * 0.18;
                    color += texture2D(textureSampler, clamp(uv - vec2(prefilterStep.x, 0.0), vec2(0.001), vec2(0.999))).rgb * 0.18;
                    color += texture2D(textureSampler, clamp(uv + vec2(0.0, prefilterStep.y), vec2(0.001), vec2(0.999))).rgb * 0.18;
                    color += texture2D(textureSampler, clamp(uv - vec2(0.0, prefilterStep.y), vec2(0.001), vec2(0.999))).rgb * 0.18;
                    return color;
                }

                vec3 accumulateBokeh(vec2 uv, float currentDistance, float currentCoc, float currentMask) {
                    const int DIR_COUNT = 16;
                    vec2 dirs[DIR_COUNT];
                    dirs[0] = vec2(1.0, 0.0);
                    dirs[1] = vec2(0.9239, 0.3827);
                    dirs[2] = vec2(0.7071, 0.7071);
                    dirs[3] = vec2(0.3827, 0.9239);
                    dirs[4] = vec2(0.0, 1.0);
                    dirs[5] = vec2(-0.3827, 0.9239);
                    dirs[6] = vec2(-0.7071, 0.7071);
                    dirs[7] = vec2(-0.9239, 0.3827);
                    dirs[8] = vec2(-1.0, 0.0);
                    dirs[9] = vec2(-0.9239, -0.3827);
                    dirs[10] = vec2(-0.7071, -0.7071);
                    dirs[11] = vec2(-0.3827, -0.9239);
                    dirs[12] = vec2(0.0, -1.0);
                    dirs[13] = vec2(0.3827, -0.9239);
                    dirs[14] = vec2(0.7071, -0.7071);
                    dirs[15] = vec2(0.9239, -0.3827);

                    float ringScale[3];
                    ringScale[0] = 0.65;
                    ringScale[1] = 1.25;
                    ringScale[2] = 1.95;

                    float ringWeight[3];
                    ringWeight[0] = 0.055;
                    ringWeight[1] = 0.040;
                    ringWeight[2] = 0.030;

                    float radiusPixels = (1.2 + 10.5 * blurStrength) * currentCoc;
                    vec2 baseRadius = texelSize * radiusPixels;
                    vec3 accumulated = vec3(0.0);
                    float totalWeight = 0.0001;

                    for (int ring = 0; ring < 3; ++ring) {
                        float ringAngle = hash12(uv * vec2(173.0, 241.0) + vec2(float(ring) * 13.1, currentCoc * 29.7)) * 6.2831853;
                        float radiusJitter = 0.9 + 0.2 * hash12(uv * vec2(311.0, 157.0) + vec2(float(ring) * 17.3, currentCoc * 11.9));
                        vec2 radius = baseRadius * ringScale[ring] * radiusJitter;
                        float baseWeight = ringWeight[ring];

                        for (int i = 0; i < DIR_COUNT; ++i) {
                            float sampleAngleJitter = (hash12(uv * vec2(421.0, 197.0) + vec2(float(ring) * 19.1, float(i) * 7.7 + currentCoc * 23.0)) - 0.5) * 0.22;
                            float sampleRadiusJitter = 0.92 + 0.16 * hash12(uv * vec2(263.0, 379.0) + vec2(float(ring) * 11.3, float(i) * 5.9 + currentCoc * 17.0));
                            vec2 rotatedDir = rotateDirection(dirs[i], ringAngle + sampleAngleJitter);
                            vec2 tangentDir = vec2(-rotatedDir.y, rotatedDir.x);
                            vec2 sampleOffset = rotatedDir * radius * sampleRadiusJitter;
                            sampleOffset += tangentDir * texelSize * (0.18 + 0.35 * blurStrength) * (sampleRadiusJitter - 1.0);
                            vec2 sampleUv = clamp(uv + sampleOffset, vec2(0.001), vec2(0.999));
                            float sampleDepth = texture2D(depthSampler, sampleUv).r;
                            float sampleDistance = computePixelDistance(sampleDepth);
                            float sampleCoc = computeCoC(sampleDepth);
                            float sampleMask = computeCocMask(sampleCoc);
                            vec3 sampleColor = samplePrefilteredColor(sampleUv);
                            float sampleHighlight = computeHighlightMask(sampleColor);
                            float depthSuppression = computeBackgroundBleedSuppression(currentDistance, sampleDistance);
                            float sampleWeight = baseWeight * sampleHighlight * sampleCoc * sampleMask * currentMask * depthSuppression;
                            accumulated += sampleColor * sampleWeight;
                            totalWeight += sampleWeight;
                        }
                    }

                    return accumulated / totalWeight;
                }

                vec3 smoothBokeh(vec2 uv, float currentDistance, float currentCoc, float currentMask, vec3 centerBokeh) {
                    vec2 softRadius = texelSize * (1.15 + 5.0 * blurStrength) * max(0.62, currentCoc);
                    vec2 diagRadius = softRadius * 0.78;
                    vec3 smoothed = centerBokeh * 0.16;
                    smoothed += accumulateBokeh(clamp(uv + vec2(softRadius.x, 0.0), vec2(0.001), vec2(0.999)), currentDistance, currentCoc, currentMask) * 0.14;
                    smoothed += accumulateBokeh(clamp(uv - vec2(softRadius.x, 0.0), vec2(0.001), vec2(0.999)), currentDistance, currentCoc, currentMask) * 0.14;
                    smoothed += accumulateBokeh(clamp(uv + vec2(0.0, softRadius.y), vec2(0.001), vec2(0.999)), currentDistance, currentCoc, currentMask) * 0.14;
                    smoothed += accumulateBokeh(clamp(uv - vec2(0.0, softRadius.y), vec2(0.001), vec2(0.999)), currentDistance, currentCoc, currentMask) * 0.14;
                    smoothed += accumulateBokeh(clamp(uv + vec2(diagRadius.x, diagRadius.y), vec2(0.001), vec2(0.999)), currentDistance, currentCoc, currentMask) * 0.07;
                    smoothed += accumulateBokeh(clamp(uv + vec2(-diagRadius.x, diagRadius.y), vec2(0.001), vec2(0.999)), currentDistance, currentCoc, currentMask) * 0.07;
                    smoothed += accumulateBokeh(clamp(uv + vec2(diagRadius.x, -diagRadius.y), vec2(0.001), vec2(0.999)), currentDistance, currentCoc, currentMask) * 0.07;
                    smoothed += accumulateBokeh(clamp(uv - vec2(diagRadius.x, diagRadius.y), vec2(0.001), vec2(0.999)), currentDistance, currentCoc, currentMask) * 0.07;
                    return smoothed;
                }

                void main(void) {
                    vec4 baseColor = texture2D(textureSampler, vUV);
                    if (dofEnabled <= 0.5 || blurStrength <= 0.0001) {
                        gl_FragColor = baseColor;
                        return;
                    }

                    float depthMetric = clamp(texture2D(depthSampler, clamp(vUV, vec2(0.001), vec2(0.999))).r, 0.0, 1.0);
                    float currentDistance = computePixelDistance(depthMetric);
                    float coc = computeCoC(depthMetric);
                    float cocMask = computeCocMask(coc);
                    float silhouetteSuppression = computeSilhouetteSuppression(vUV, currentDistance);
                    cocMask *= silhouetteSuppression;
                    if (cocMask <= 0.0001) {
                        gl_FragColor = baseColor;
                        return;
                    }

                    vec3 bokeh = smoothBokeh(vUV, currentDistance, coc, cocMask, accumulateBokeh(vUV, currentDistance, coc, cocMask));
                    float addScale = highlightGain * (0.008 + 0.014 * blurStrength) * cocMask;
                    vec3 finalRgb = baseColor.rgb + bokeh * addScale;
                    float edgeBlendBack = computeEdgeBlendBackAmount(silhouetteSuppression);
                    finalRgb = mix(finalRgb, baseColor.rgb, clamp(edgeBlendBack, 0.0, 0.9));
                    gl_FragColor = vec4(finalRgb, baseColor.a);
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
                uniform cameraNearFar: vec2f;
                uniform dofEnabled: f32;
                uniform blurStrength: f32;
                uniform focusDistance: f32;
                uniform cocPrecalculation: f32;
                uniform highlightGain: f32;
                uniform highlightThreshold: f32;

                fn computePixelDistance(depthMetric: f32) -> f32 {
                    return mix(uniforms.cameraNearFar.x, uniforms.cameraNearFar.y, clamp(depthMetric, 0.0, 1.0)) * 1000.0;
                }

                fn computeCoC(depthMetric: f32) -> f32 {
                    let pixelDistance = max(1.0, computePixelDistance(depthMetric));
                    let coc = abs(uniforms.cocPrecalculation * ((uniforms.focusDistance - pixelDistance) / pixelDistance));
                    return clamp(coc, 0.0, 1.0);
                }

                fn computeCocMask(coc: f32) -> f32 {
                    let mask = smoothstep(0.04, 0.96, coc);
                    return mask * mask * (3.0 - 2.0 * mask);
                }

                fn computeHighlightMask(color: vec3f) -> f32 {
                    let luminance = dot(color, vec3f(0.2125, 0.7154, 0.0721));
                    var luminanceThreshold = 0.42 + 0.38 * uniforms.highlightThreshold;
                    if (uniforms.highlightThreshold > 1.0) {
                        luminanceThreshold = 0.92 + 0.015 * (uniforms.highlightThreshold - 1.0);
                    }
                    let knee = max(0.05, (1.0 - clamp(luminanceThreshold, 0.0, 0.995)) * 0.9);
                    let softMask = smoothstep(
                        max(0.0, luminanceThreshold - knee),
                        min(1.0, luminanceThreshold + knee * 3.6),
                        luminance,
                    );
                    return softMask * (0.18 + 0.82 * softMask);
                }

                fn computeSilhouetteSuppression(uv: vec2f, currentDistance: f32) -> f32 {
                    var nearestDistance = currentDistance;
                    let offsetX = vec2f(uniforms.texelSize.x * 1.5, 0.0);
                    let offsetY = vec2f(0.0, uniforms.texelSize.y * 1.5);

                    nearestDistance = min(nearestDistance, computePixelDistance(textureSampleLevel(depthSampler, depthSamplerSampler, clamp(uv + offsetX, vec2f(0.001), vec2f(0.999)), 0.0).r));
                    nearestDistance = min(nearestDistance, computePixelDistance(textureSampleLevel(depthSampler, depthSamplerSampler, clamp(uv - offsetX, vec2f(0.001), vec2f(0.999)), 0.0).r));
                    nearestDistance = min(nearestDistance, computePixelDistance(textureSampleLevel(depthSampler, depthSamplerSampler, clamp(uv + offsetY, vec2f(0.001), vec2f(0.999)), 0.0).r));
                    nearestDistance = min(nearestDistance, computePixelDistance(textureSampleLevel(depthSampler, depthSamplerSampler, clamp(uv - offsetY, vec2f(0.001), vec2f(0.999)), 0.0).r));

                    let foregroundDelta = max(0.0, currentDistance - nearestDistance);
                    return 1.0 - smoothstep(120.0, 1200.0, foregroundDelta);
                }

                fn hash12(p: vec2f) -> f32 {
                    return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
                }

                fn rotateDirection(dir: vec2f, angle: f32) -> vec2f {
                    let s = sin(angle);
                    let c = cos(angle);
                    return vec2f(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
                }

                fn computeBackgroundBleedSuppression(currentDistance: f32, sampleDistance: f32) -> f32 {
                    let backgroundDelta = max(0.0, sampleDistance - currentDistance);
                    let keep = 1.0 - smoothstep(40.0, 360.0, backgroundDelta);
                    return 0.18 + 0.82 * keep;
                }

                fn computeEdgeBlendBackAmount(silhouetteSuppression: f32) -> f32 {
                    let edgePresence = 1.0 - silhouetteSuppression;
                    let edgeBlend = smoothstep(0.08, 0.55, edgePresence);
                    return edgeBlend * (0.55 + 0.2 * uniforms.blurStrength);
                }

                fn samplePrefilteredColor(uv: vec2f) -> vec3f {
                    let prefilterStep = uniforms.texelSize * (0.7 + 0.9 * uniforms.blurStrength);
                    var color = textureSampleLevel(textureSampler, textureSamplerSampler, uv, 0.0).rgb * 0.28;
                    color = color + textureSampleLevel(textureSampler, textureSamplerSampler, clamp(uv + vec2f(prefilterStep.x, 0.0), vec2f(0.001), vec2f(0.999)), 0.0).rgb * 0.18;
                    color = color + textureSampleLevel(textureSampler, textureSamplerSampler, clamp(uv - vec2f(prefilterStep.x, 0.0), vec2f(0.001), vec2f(0.999)), 0.0).rgb * 0.18;
                    color = color + textureSampleLevel(textureSampler, textureSamplerSampler, clamp(uv + vec2f(0.0, prefilterStep.y), vec2f(0.001), vec2f(0.999)), 0.0).rgb * 0.18;
                    color = color + textureSampleLevel(textureSampler, textureSamplerSampler, clamp(uv - vec2f(0.0, prefilterStep.y), vec2f(0.001), vec2f(0.999)), 0.0).rgb * 0.18;
                    return color;
                }

                fn directionForIndex(index: i32) -> vec2f {
                    switch index {
                        case 0: { return vec2f(1.0, 0.0); }
                        case 1: { return vec2f(0.9239, 0.3827); }
                        case 2: { return vec2f(0.7071, 0.7071); }
                        case 3: { return vec2f(0.3827, 0.9239); }
                        case 4: { return vec2f(0.0, 1.0); }
                        case 5: { return vec2f(-0.3827, 0.9239); }
                        case 6: { return vec2f(-0.7071, 0.7071); }
                        case 7: { return vec2f(-0.9239, 0.3827); }
                        case 8: { return vec2f(-1.0, 0.0); }
                        case 9: { return vec2f(-0.9239, -0.3827); }
                        case 10: { return vec2f(-0.7071, -0.7071); }
                        case 11: { return vec2f(-0.3827, -0.9239); }
                        case 12: { return vec2f(0.0, -1.0); }
                        case 13: { return vec2f(0.3827, -0.9239); }
                        case 14: { return vec2f(0.7071, -0.7071); }
                        default: { return vec2f(0.9239, -0.3827); }
                    }
                }

                fn ringScaleForIndex(index: i32) -> f32 {
                    switch index {
                        case 0: { return 0.65; }
                        case 1: { return 1.25; }
                        default: { return 1.95; }
                    }
                }

                fn ringWeightForIndex(index: i32) -> f32 {
                    switch index {
                        case 0: { return 0.055; }
                        case 1: { return 0.040; }
                        default: { return 0.030; }
                    }
                }

                fn accumulateBokeh(uv: vec2f, currentDistance: f32, currentCoc: f32, currentMask: f32) -> vec3f {
                    let radiusPixels = (1.2 + 10.5 * uniforms.blurStrength) * currentCoc;
                    let baseRadius = uniforms.texelSize * radiusPixels;
                    var accumulated = vec3f(0.0);
                    var totalWeight = 0.0001;

                    for (var ring: i32 = 0; ring < 3; ring = ring + 1) {
                        let ringAngle = hash12(uv * vec2f(173.0, 241.0) + vec2f(f32(ring) * 13.1, currentCoc * 29.7)) * 6.2831853;
                        let radiusJitter = 0.9 + 0.2 * hash12(uv * vec2f(311.0, 157.0) + vec2f(f32(ring) * 17.3, currentCoc * 11.9));
                        let radius = baseRadius * ringScaleForIndex(ring) * radiusJitter;
                        let baseWeight = ringWeightForIndex(ring);

                        for (var i: i32 = 0; i < 16; i = i + 1) {
                            let sampleAngleJitter = (hash12(uv * vec2f(421.0, 197.0) + vec2f(f32(ring) * 19.1, f32(i) * 7.7 + currentCoc * 23.0)) - 0.5) * 0.22;
                            let sampleRadiusJitter = 0.92 + 0.16 * hash12(uv * vec2f(263.0, 379.0) + vec2f(f32(ring) * 11.3, f32(i) * 5.9 + currentCoc * 17.0));
                            let dir = rotateDirection(directionForIndex(i), ringAngle + sampleAngleJitter);
                            let tangentDir = vec2f(-dir.y, dir.x);
                            var sampleOffset = dir * radius * sampleRadiusJitter;
                            sampleOffset = sampleOffset + tangentDir * uniforms.texelSize * (0.18 + 0.35 * uniforms.blurStrength) * (sampleRadiusJitter - 1.0);
                            let sampleUv = clamp(uv + sampleOffset, vec2f(0.001), vec2f(0.999));
                            let sampleDepth = textureSampleLevel(depthSampler, depthSamplerSampler, sampleUv, 0.0).r;
                            let sampleDistance = computePixelDistance(sampleDepth);
                            let sampleCoc = computeCoC(sampleDepth);
                            let sampleMask = computeCocMask(sampleCoc);
                            let sampleColor = samplePrefilteredColor(sampleUv);
                            let sampleHighlight = computeHighlightMask(sampleColor);
                            let depthSuppression = computeBackgroundBleedSuppression(currentDistance, sampleDistance);
                            let sampleWeight = baseWeight * sampleHighlight * sampleCoc * sampleMask * currentMask * depthSuppression;
                            accumulated = accumulated + sampleColor * sampleWeight;
                            totalWeight = totalWeight + sampleWeight;
                        }
                    }

                    return accumulated / totalWeight;
                }

                fn smoothBokeh(uv: vec2f, currentDistance: f32, currentCoc: f32, currentMask: f32, centerBokeh: vec3f) -> vec3f {
                    let softRadius = uniforms.texelSize * (1.15 + 5.0 * uniforms.blurStrength) * max(0.62, currentCoc);
                    let diagRadius = softRadius * 0.78;
                    var smoothed = centerBokeh * 0.16;
                    smoothed = smoothed + accumulateBokeh(clamp(uv + vec2f(softRadius.x, 0.0), vec2f(0.001), vec2f(0.999)), currentDistance, currentCoc, currentMask) * 0.14;
                    smoothed = smoothed + accumulateBokeh(clamp(uv - vec2f(softRadius.x, 0.0), vec2f(0.001), vec2f(0.999)), currentDistance, currentCoc, currentMask) * 0.14;
                    smoothed = smoothed + accumulateBokeh(clamp(uv + vec2f(0.0, softRadius.y), vec2f(0.001), vec2f(0.999)), currentDistance, currentCoc, currentMask) * 0.14;
                    smoothed = smoothed + accumulateBokeh(clamp(uv - vec2f(0.0, softRadius.y), vec2f(0.001), vec2f(0.999)), currentDistance, currentCoc, currentMask) * 0.14;
                    smoothed = smoothed + accumulateBokeh(clamp(uv + vec2f(diagRadius.x, diagRadius.y), vec2f(0.001), vec2f(0.999)), currentDistance, currentCoc, currentMask) * 0.07;
                    smoothed = smoothed + accumulateBokeh(clamp(uv + vec2f(-diagRadius.x, diagRadius.y), vec2f(0.001), vec2f(0.999)), currentDistance, currentCoc, currentMask) * 0.07;
                    smoothed = smoothed + accumulateBokeh(clamp(uv + vec2f(diagRadius.x, -diagRadius.y), vec2f(0.001), vec2f(0.999)), currentDistance, currentCoc, currentMask) * 0.07;
                    smoothed = smoothed + accumulateBokeh(clamp(uv - vec2f(diagRadius.x, diagRadius.y), vec2f(0.001), vec2f(0.999)), currentDistance, currentCoc, currentMask) * 0.07;
                    return smoothed;
                }

                #define CUSTOM_FRAGMENT_DEFINITIONS
                @fragment
                fn main(input: FragmentInputs)->FragmentOutputs {
                    let baseColor = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                    var finalColor = baseColor;

                    if (uniforms.dofEnabled > 0.5 && uniforms.blurStrength > 0.0001) {
                        let depthMetric = clamp(
                            textureSampleLevel(depthSampler, depthSamplerSampler, clamp(input.vUV, vec2f(0.001), vec2f(0.999)), 0.0).r,
                            0.0,
                            1.0,
                        );
                        let currentDistance = computePixelDistance(depthMetric);
                        let coc = computeCoC(depthMetric);
                        var cocMask = computeCocMask(coc);
                        let silhouetteSuppression = computeSilhouetteSuppression(input.vUV, currentDistance);
                        cocMask = cocMask * silhouetteSuppression;

                        if (cocMask > 0.0001) {
                            let bokeh = smoothBokeh(input.vUV, currentDistance, coc, cocMask, accumulateBokeh(input.vUV, currentDistance, coc, cocMask));
                            let addScale = uniforms.highlightGain * (0.008 + 0.014 * uniforms.blurStrength) * cocMask;
                            var finalRgb = baseColor.rgb + bokeh * addScale;
                            let edgeBlendBack = computeEdgeBlendBackAmount(silhouetteSuppression);
                            finalRgb = mix(finalRgb, baseColor.rgb, clamp(edgeBlendBack, 0.0, 0.9));
                            finalColor = vec4f(finalRgb, baseColor.a);
                        }
                    }

                    fragmentOutputs.color = finalColor;
                }
            `;
    }
}

function applyStandaloneBloomSettings(host: PostProcessHost): void {
    const pipeline = host.defaultRenderingPipeline as DefaultRenderingPipeline | null;
    if (pipeline) {
        pipeline.bloomEnabled = false;
    }

    if (host.postEffectBackend === "frameGraph" || !host.postEffectBloomEnabledValue || !pipeline) {
        disposeStandaloneBloomEffect(host);
        host.enforceFinalPostProcessOrder();
        return;
    }

    if (!host.standaloneBloomEffect) {
        host.standaloneBloomEffect = new BloomEffect(
            host.scene,
            STANDALONE_BLOOM_SCALE,
            host.postEffectBloomWeightValue,
            host.postEffectBloomKernelValue,
        );
    }

    host.standaloneBloomEffect.weight = host.postEffectBloomWeightValue;
    host.standaloneBloomEffect.threshold = host.postEffectBloomThresholdValue;
    host.standaloneBloomEffect.kernel = host.postEffectBloomKernelValue;
    host.enforceFinalPostProcessOrder();
}

export function updateSimpleMotionBlurState(host: PostProcessHost, deltaMs: number): void {
    if (!host.motionBlurPostProcess || !host.postEffectMotionBlurEnabledValue) {
        return;
    }

    const cameraPosition = host.camera.globalPosition ?? host.camera.position;
    if (!host.motionBlurPreviousCameraPosition) {
        host.motionBlurPreviousCameraPosition = cameraPosition.clone();
        host.motionBlurScreenDirection.set(0, 0);
        host.motionBlurScreenAmount = 0;
        return;
    }

    const deltaWorld = cameraPosition.subtract(host.motionBlurPreviousCameraPosition);
    host.motionBlurPreviousCameraPosition.copyFrom(cameraPosition);

    const deltaView = Vector3.TransformNormal(deltaWorld, host.camera.getViewMatrix());
    const rawX = -deltaView.x;
    const rawY = deltaView.y;
    const rawLen = Math.hypot(rawX, rawY);
    if (rawLen < 0.000001) {
        host.motionBlurScreenDirection.scaleInPlace(0.8);
        host.motionBlurScreenAmount *= 0.8;
        return;
    }

    const dirX = rawX / rawLen;
    const dirY = rawY / rawLen;
    const speedPerMs = rawLen / Math.max(1, deltaMs);
    const targetAmount = Math.min(0.04, speedPerMs * 2.4);
    const smooth = 0.35;

    host.motionBlurScreenDirection.x = host.motionBlurScreenDirection.x * (1 - smooth) + dirX * smooth;
    host.motionBlurScreenDirection.y = host.motionBlurScreenDirection.y * (1 - smooth) + dirY * smooth;

    const dirLen = Math.hypot(host.motionBlurScreenDirection.x, host.motionBlurScreenDirection.y);
    if (dirLen > 0.000001) {
        host.motionBlurScreenDirection.x /= dirLen;
        host.motionBlurScreenDirection.y /= dirLen;
    }

    host.motionBlurScreenAmount = host.motionBlurScreenAmount * (1 - smooth) + targetAmount * smooth;
}

export function applyMotionBlurSettings(host: PostProcessHost): void {
    if (host.postEffectBackend === "frameGraph") {
        if (host.motionBlurPostProcess) {
            host.motionBlurPostProcess.dispose(host.camera);
            host.motionBlurPostProcess = null;
        }
        host.motionBlurPreviousCameraPosition = null;
        host.motionBlurScreenDirection.set(0, 0);
        host.motionBlurScreenAmount = 0;
        host.enforceFinalPostProcessOrder();
        return;
    }

    const postProcesses = [...host.camera._postProcesses];
    for (const postProcess of postProcesses) {
        if (postProcess && postProcess !== host.motionBlurPostProcess && postProcess.name === "motionBlur") {
            host.camera.detachPostProcess(postProcess);
            postProcess.dispose(host.camera);
        }
    }

    if (!host.postEffectMotionBlurEnabledValue) {
        if (host.motionBlurPostProcess) {
            host.motionBlurPostProcess.dispose(host.camera);
            host.motionBlurPostProcess = null;
        }
        host.motionBlurPreviousCameraPosition = null;
        host.motionBlurScreenDirection.set(0, 0);
        host.motionBlurScreenAmount = 0;
        host.enforceFinalPostProcessOrder();
        return;
    }

    if (!host.motionBlurPostProcess) {
        host.ensureSimpleMotionBlurShader();
        host.motionBlurPostProcess = new PostProcess(
            "motionBlur",
            "mmdSimpleMotionBlur",
            {
                uniforms: ["blurDirection", "blurAmount"],
                size: 1.0,
                camera: host.camera,
                samplingMode: Texture.BILINEAR_SAMPLINGMODE,
                engine: host.engine,
                reusable: false,
                shaderLanguage: host.getPostProcessShaderLanguage(),
            },
        );
        host.motionBlurPostProcess.onApplyObservable.add((effect: PostProcessEffectLike) => {
            const sampleScale = Math.max(0.25, Math.min(2, host.postEffectMotionBlurSamplesValue / 32));
            const blurAmount = host.motionBlurScreenAmount * host.postEffectMotionBlurStrengthValue * sampleScale;
            effect.setFloat2("blurDirection", host.motionBlurScreenDirection.x, host.motionBlurScreenDirection.y);
            effect.setFloat("blurAmount", blurAmount);
        });
        host.motionBlurPreviousCameraPosition = null;
        host.motionBlurScreenDirection.set(0, 0);
        host.motionBlurScreenAmount = 0;
    }

    host.enforceFinalPostProcessOrder();
}

function updateVolumetricLightPosition(host: PostProcessHost): void {
    if (!host.volumetricLightPostProcess || !host.dirLight) {
        return;
    }
    const position = host.dirLight.position;
    host.volumetricLightPostProcess.useCustomMeshPosition = true;
    host.volumetricLightPostProcess.setCustomMeshPosition(position.clone());
    if (host.volumetricLightPostProcess.mesh) {
        host.volumetricLightPostProcess.mesh.position.copyFrom(position);
    }
}

export function applyVolumetricLightSettings(host: PostProcessHost): void {
    if (!host.postEffectVlsEnabledValue || !host.dirLight) {
        if (host.volumetricLightPostProcess) {
            host.volumetricLightPostProcess.dispose(host.camera);
            host.volumetricLightPostProcess = null;
        }
        host.enforceFinalPostProcessOrder();
        return;
    }

    if (!host.volumetricLightPostProcess) {
        try {
            host.volumetricLightPostProcess = new VolumetricLightScatteringPostProcess(
                "volumetricLight",
                1.0,
                host.camera,
                undefined,
                100,
                Texture.BILINEAR_SAMPLINGMODE,
                host.engine,
                false,
                host.scene,
            );
            host.volumetricLightPostProcess.autoClear = false;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`Volumetric light initialization failed on ${host.getEngineType()}. Volumetric light was disabled. Reason: ${message}`);
            host.addRuntimeDiagnostic(`Volumetric light disabled on ${host.getEngineType()}.`);
            host.postEffectVlsEnabledValue = false;
            host.volumetricLightPostProcess = null;
            host.enforceFinalPostProcessOrder();
            return;
        }
    }

    host.volumetricLightPostProcess.exposure = host.postEffectVlsExposureValue;
    host.volumetricLightPostProcess.decay = host.postEffectVlsDecayValue;
    host.volumetricLightPostProcess.weight = host.postEffectVlsWeightValue;
    host.volumetricLightPostProcess.density = host.postEffectVlsDensityValue;
    updateVolumetricLightPosition(host);
    host.enforceFinalPostProcessOrder();
}

export function applyFogSettings(host: PostProcessHost): void {
    host.scene.fogMode = Scene.FOGMODE_NONE;
    host.scene.fogColor.set(
        host.postEffectFogColorValue.r,
        host.postEffectFogColorValue.g,
        host.postEffectFogColorValue.b,
    );
    if (!host.originFogPostProcess && host.depthRenderer) {
        host.setupOriginFogPostProcess();
    }
}

export function setupOriginFogPostProcess(host: PostProcessHost): void {
    if (host.originFogPostProcess || !host.depthRenderer) {
        return;
    }

    const shaderKey = "mmdOriginFogFragmentShader";
    if (!Effect.ShadersStore[shaderKey]) {
        Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform sampler2D depthSampler;
                uniform float fogEnabled;
                uniform float fogMode;
                uniform float fogStart;
                uniform float fogEnd;
                uniform float fogDensity;
                uniform float fogOpacity;
                uniform vec3 fogColor;
                uniform vec2 cameraNearFar;
                uniform vec3 cameraPosition;
                uniform mat4 inverseViewProjection;

                float computeFogAmount(float originDistance) {
                    if (fogEnabled <= 0.5) {
                        return 0.0;
                    }
                    if (fogMode < 0.5) {
                        float fogSpan = max(fogEnd - fogStart, 0.0001);
                        return clamp((originDistance - fogStart) / fogSpan, 0.0, 1.0);
                    }
                    if (fogMode < 1.5) {
                        float density = max(fogDensity, 0.0);
                        return clamp(1.0 - exp(-density * originDistance), 0.0, 1.0);
                    }
                    float density = max(fogDensity, 0.0);
                    float squared = density * originDistance;
                    return clamp(1.0 - exp(-(squared * squared)), 0.0, 1.0);
                }

                vec3 reconstructWorldPosition(vec2 uv, float depthMetric) {
                    float cameraDistance = mix(cameraNearFar.x, cameraNearFar.y, clamp(depthMetric, 0.0, 1.0));
                    vec4 clipFar = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
                    vec4 worldFarH = inverseViewProjection * clipFar;
                    vec3 worldFar = worldFarH.xyz / max(worldFarH.w, 0.0001);
                    vec3 rayDirection = normalize(worldFar - cameraPosition);
                    return cameraPosition + rayDirection * cameraDistance;
                }

                void main(void) {
                    vec4 color = texture2D(textureSampler, vUV);
                    if (fogEnabled <= 0.5) {
                        gl_FragColor = color;
                        return;
                    }

                    float depthMetric = clamp(abs(texture2D(depthSampler, clamp(vUV, vec2(0.001), vec2(0.999))).r), 0.0, 1.0);
                    if (depthMetric <= 0.00001) {
                        gl_FragColor = color;
                        return;
                    }

                    vec3 worldPosition = reconstructWorldPosition(vUV, depthMetric);
                    float fogAmount = computeFogAmount(length(worldPosition));
                    float fogBlend = clamp(fogAmount * fogOpacity, 0.0, 1.0);
                    gl_FragColor = vec4(mix(color.rgb, fogColor, fogBlend), color.a);
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
                uniform fogEnabled: f32;
                uniform fogMode: f32;
                uniform fogStart: f32;
                uniform fogEnd: f32;
                uniform fogDensity: f32;
                uniform fogOpacity: f32;
                uniform fogColor: vec3f;
                uniform cameraNearFar: vec2f;
                uniform cameraPosition: vec3f;
                uniform inverseViewProjection: mat4x4f;

                fn computeFogAmount(originDistance: f32) -> f32 {
                    if (uniforms.fogEnabled <= 0.5) {
                        return 0.0;
                    }
                    if (uniforms.fogMode < 0.5) {
                        let fogSpan = max(uniforms.fogEnd - uniforms.fogStart, 0.0001);
                        return clamp((originDistance - uniforms.fogStart) / fogSpan, 0.0, 1.0);
                    }
                    if (uniforms.fogMode < 1.5) {
                        let density = max(uniforms.fogDensity, 0.0);
                        return clamp(1.0 - exp(-density * originDistance), 0.0, 1.0);
                    }
                    let density = max(uniforms.fogDensity, 0.0);
                    let squared = density * originDistance;
                    return clamp(1.0 - exp(-(squared * squared)), 0.0, 1.0);
                }

                fn reconstructWorldPosition(uv: vec2f, depthMetric: f32) -> vec3f {
                    let cameraDistance = mix(uniforms.cameraNearFar.x, uniforms.cameraNearFar.y, clamp(depthMetric, 0.0, 1.0));
                    let clipFar = vec4f(uv * 2.0 - 1.0, 1.0, 1.0);
                    let worldFarH = uniforms.inverseViewProjection * clipFar;
                    let worldFar = worldFarH.xyz / max(worldFarH.w, 0.0001);
                    let rayDirection = normalize(worldFar - uniforms.cameraPosition);
                    return uniforms.cameraPosition + rayDirection * cameraDistance;
                }

                @fragment
                fn main(input: FragmentInputs) -> FragmentOutputs {
                    let color = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                    if (uniforms.fogEnabled <= 0.5) {
                        fragmentOutputs.color = color;
                        return fragmentOutputs;
                    }

                    let depthMetric = clamp(abs(textureSampleLevel(depthSampler, depthSamplerSampler, clamp(input.vUV, vec2f(0.001), vec2f(0.999)), 0.0).r), 0.0, 1.0);
                    if (depthMetric <= 0.00001) {
                        fragmentOutputs.color = color;
                        return fragmentOutputs;
                    }

                    let worldPosition = reconstructWorldPosition(input.vUV, depthMetric);
                    let fogAmount = computeFogAmount(length(worldPosition));
                    let fogBlend = clamp(fogAmount * uniforms.fogOpacity, 0.0, 1.0);
                    fragmentOutputs.color = vec4f(mix(color.rgb, uniforms.fogColor, fogBlend), color.a);
                    return fragmentOutputs;
                }
            `;
    }

    host.originFogPostProcess = new PostProcess(
        "originFog",
        "mmdOriginFog",
        {
            uniforms: ["fogEnabled", "fogMode", "fogStart", "fogEnd", "fogDensity", "fogOpacity", "fogColor", "cameraNearFar", "cameraPosition", "inverseViewProjection"],
            samplers: ["depthSampler"],
            size: 1.0,
            camera: host.camera,
            samplingMode: Texture.BILINEAR_SAMPLINGMODE,
            engine: host.engine,
            reusable: false,
            shaderLanguage: host.getPostProcessShaderLanguage(),
        },
    );
    host.originFogPostProcess.onApplyObservable.add((effect: PostProcessEffectLike) => {
        const depthMap = host.depthRenderer?.getDepthMap();
        if (!depthMap) {
            return;
        }

        effect.setTexture("depthSampler", depthMap);
        effect.setFloat("fogEnabled", host.postEffectFogEnabledValue ? 1 : 0);
        effect.setFloat("fogMode", host.postEffectFogModeValue);
        effect.setFloat("fogStart", host.postEffectFogStartValue);
        effect.setFloat("fogEnd", Math.max(host.postEffectFogStartValue + 0.01, host.postEffectFogEndValue));
        effect.setFloat("fogDensity", host.postEffectFogDensityValue);
        effect.setFloat("fogOpacity", host.postEffectFogOpacityValue);
        effect.setColor3("fogColor", host.postEffectFogColorValue);
        effect.setFloat2("cameraNearFar", host.camera.minZ, host.camera.maxZ);
        effect.setVector3("cameraPosition", host.camera.globalPosition);
        const inverseViewProjection = host.camera.getTransformationMatrix().clone();
        inverseViewProjection.invert();
        effect.setMatrix("inverseViewProjection", inverseViewProjection);
    });
    host.enforceFinalPostProcessOrder();
}

export function setupFinalLensDistortionPostProcess(host: PostProcessHost): void {
    if (host.postEffectBackend === "frameGraph") {
        if (host.finalLensDistortionPostProcess) {
            host.finalLensDistortionPostProcess.dispose(host.camera);
            host.finalLensDistortionPostProcess = null;
        }
        host.enforceFinalPostProcessOrder();
        return;
    }

    const shaderKey = "mmdFinalLensDistortionFragmentShader";
    if (!Effect.ShadersStore[shaderKey]) {
        Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform float distortion;

                void main(void) {
                    if (abs(distortion) < 0.0001) {
                        gl_FragColor = texture2D(textureSampler, vUV);
                        return;
                    }

                    vec2 centered = vUV - vec2(0.5);
                    float radius2 = dot(centered, centered);
                    if (radius2 < 1e-8) {
                        gl_FragColor = texture2D(textureSampler, vUV);
                        return;
                    }

                    vec2 direction = normalize(centered);
                    float amount = clamp(abs(distortion) * 0.23, 0.0, 1.0);

                    vec2 barrelUv = vec2(0.5) + direction * radius2;
                    barrelUv = mix(vUV, barrelUv, amount);

                    vec2 pincushionUv = vec2(0.5) - direction * radius2;
                    pincushionUv = mix(vUV, pincushionUv, amount);

                    vec2 finalUv = distortion >= 0.0 ? barrelUv : pincushionUv;
                    finalUv = clamp(finalUv, vec2(0.0), vec2(1.0));
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

                    fragmentOutputs.color = textureSample(textureSampler, textureSamplerSampler, finalUv);
                }
            `;
    }

    if (host.finalLensDistortionPostProcess) {
        host.finalLensDistortionPostProcess.dispose(host.camera);
        host.finalLensDistortionPostProcess = null;
    }

    host.finalLensDistortionPostProcess = new PostProcess(
        "finalLensDistortion",
        "mmdFinalLensDistortion",
        {
            uniforms: ["distortion"],
            size: 1.0,
            camera: host.camera,
            samplingMode: Texture.BILINEAR_SAMPLINGMODE,
            engine: host.engine,
            reusable: false,
            shaderLanguage: host.getPostProcessShaderLanguage(),
        },
    );
    host.finalLensDistortionPostProcess.onApplyObservable.add((effect: PostProcessEffectLike) => {
        effect.setFloat("distortion", host.dofLensDistortionValue);
    });
    host.enforceFinalPostProcessOrder();
}

export function applyAntialiasSettings(host: PostProcessHost): void {
    if (host.finalAntialiasPostProcess) {
        host.finalAntialiasPostProcess.dispose(host.camera);
        host.finalAntialiasPostProcess = null;
    }
    if (host.postEffectBackend === "frameGraph") {
        host.enforceFinalPostProcessOrder();
        return;
    }
    if (!host.antialiasEnabledValue) {
        host.enforceFinalPostProcessOrder();
        return;
    }
    host.finalAntialiasPostProcess = new FxaaPostProcess(
        "finalFxaa",
        1.0,
        host.camera,
        Texture.BILINEAR_SAMPLINGMODE,
        host.engine,
        false
    );
    host.enforceFinalPostProcessOrder();
}

export function enforceFinalPostProcessOrder(host: PostProcessHost): void {
    const tail: PostProcess[] = [];
    if (host.originFogPostProcess) tail.push(host.originFogPostProcess);
    // Keep fog before the additive light tail so distant haze is established
    // before bloom / light scattering are layered on top of the image.
    tail.push(...getStandaloneBloomPostProcesses(host));
    tail.push(...getStandaloneLensBlurPostProcesses(host));
    if (host.volumetricLightPostProcess) tail.push(host.volumetricLightPostProcess);
    if (host.motionBlurPostProcess) tail.push(host.motionBlurPostProcess);
    tail.push(...getStandaloneEdgeBlurPostProcesses(host));
    if (host.finalLensDistortionPostProcess) tail.push(host.finalLensDistortionPostProcess);
    if (host.finalAntialiasPostProcess) tail.push(host.finalAntialiasPostProcess);

    if (tail.length === 0) return;

    for (const postProcess of tail) host.camera.detachPostProcess(postProcess);
    for (const postProcess of tail) host.camera.attachPostProcess(postProcess);
}

export function initializePostProcessRenderSystem(host: PostProcessHost): void {
    host.setupEditorDofPipeline();
    if (host.farDofEnabled) {
        host.setupFarDofPostProcess();
    } else {
        host.postEffectFarDofStrengthValue = 0;
    }
}

export function setupEditorDofPipeline(host: PostProcessHost): void {
    if (host.defaultRenderingPipeline) {
        host.defaultRenderingPipeline.dispose();
        host.defaultRenderingPipeline = null;
    }
    if (host.lensRenderingPipeline) {
        host.lensRenderingPipeline.dispose(false);
        host.lensRenderingPipeline = null;
    }
    if (host.ssrRenderingPipeline) {
        host.ssrRenderingPipeline.dispose(false);
        host.ssrRenderingPipeline = null;
    }
    host.disablePrePassRendererIfSupported?.();
    if (host.motionBlurPostProcess) {
        host.motionBlurPostProcess.dispose(host.camera);
        host.motionBlurPostProcess = null;
    }
    disposeStandaloneBloomEffect(host);
    disposeStandaloneLensBlurPostProcess(host);
    disposeStandaloneEdgeBlurPostProcess(host);
    if (host.volumetricLightPostProcess) {
        host.volumetricLightPostProcess.dispose(host.camera);
        host.volumetricLightPostProcess = null;
    }
    if (host.originFogPostProcess) {
        host.originFogPostProcess.dispose(host.camera);
        host.originFogPostProcess = null;
    }

    host.defaultRenderingPipeline = new DefaultRenderingPipeline(
        "DefaultRenderingPipeline",
        false,
        host.scene,
        [host.camera]
    );

    host.defaultRenderingPipeline.samples = 4;
    host.defaultRenderingPipeline.fxaaEnabled = false;
    host.defaultRenderingPipeline.glowLayerEnabled = false;
    host.applyImageProcessingSettings();
    host.applyDefaultPipelinePostProcessSettings();
    host.applySsrSettings();
    host.applyFogSettings();
    if (host.postEffectBackend === "classic") {
        host.configureDofDepthRenderer();
    }
    host.setupOriginFogPostProcess();
    if (host.dofLensDistortionFollowsCameraFov) {
        host.updateDofLensDistortionFromCameraFov();
    }
    host.setupLensHighlightsPipeline();
    host.defaultRenderingPipeline.depthOfFieldBlurLevel = host.dofBlurLevelValue;
    host.applyEditorDofSettings();
    host.setupFinalLensDistortionPostProcess();
    host.applyAntialiasSettings();
    host.applyVolumetricLightSettings();
    host.applyMotionBlurSettings();
    host.enforceFinalPostProcessOrder();
}

export function isImageProcessingEffectsEnabled(host: PostProcessHost): boolean {
    const epsilon = 1e-4;
    const useSceneVignette = host.postEffectBackend !== "frameGraph" && host.postEffectVignetteEnabledValue;
    return host.postEffectToneMappingEnabledValue
        || host.postEffectDitheringEnabledValue
        || useSceneVignette
        || host.postEffectColorCurvesEnabledValue
        || (host.postEffectBackend !== "frameGraph" && host.postEffectLutEnabledValue && isLutSourceReady(host))
        || Math.abs(host.postEffectExposureValue - 1) > epsilon;
}

export function applyImageProcessingSettings(host: PostProcessHost): void {
    const imageProcessing = host.scene.imageProcessingConfiguration;
    imageProcessing.exposure = host.postEffectExposureValue;
    imageProcessing.toneMappingEnabled = host.postEffectToneMappingEnabledValue;
    imageProcessing.toneMappingType = host.postEffectToneMappingTypeValue;
    imageProcessing.ditheringEnabled = host.postEffectDitheringEnabledValue;
    imageProcessing.ditheringIntensity = host.postEffectDitheringIntensityValue;
    const useSceneVignette = host.postEffectBackend !== "frameGraph" && host.postEffectVignetteEnabledValue;
    imageProcessing.vignetteEnabled = useSceneVignette;
    imageProcessing.vignetteWeight = useSceneVignette ? host.postEffectVignetteWeightValue : 0;
    imageProcessing.vignetteColor.set(0, 0, 0, 1);

    if (host.postEffectColorCurvesEnabledValue) {
        if (!imageProcessing.colorCurves) {
            imageProcessing.colorCurves = new ColorCurves();
        }
        imageProcessing.colorCurves.globalHue = host.postEffectColorCurvesHueValue;
        imageProcessing.colorCurves.globalDensity = host.postEffectColorCurvesDensityValue;
        imageProcessing.colorCurves.globalSaturation = host.postEffectColorCurvesSaturationValue;
        imageProcessing.colorCurves.globalExposure = host.postEffectColorCurvesExposureValue;
    }
    imageProcessing.colorCurvesEnabled = host.postEffectColorCurvesEnabledValue;
    applyLutSettings(host);

    const shouldEnable = isImageProcessingEffectsEnabled(host);
    const pipeline = host.defaultRenderingPipeline;
    if (host.postEffectBackend === "frameGraph") {
        imageProcessing.isEnabled = shouldEnable;
        imageProcessing.applyByPostProcess = shouldEnable;
        if (pipeline) {
            pipeline.imageProcessingEnabled = false;
        }
        return;
    }
    if (pipeline) {
        pipeline.imageProcessingEnabled = shouldEnable;
    } else {
        host.scene.imageProcessingConfiguration.isEnabled = shouldEnable;
    }
}

export function isLutSourceReady(host: PostProcessHost): boolean {
    if (host.postEffectLutSourceModeValue === "builtin") {
        return getPostProcessHostStatics(host).POST_EFFECT_LUT_PRESETS.some((preset) => preset.id === host.postEffectLutPresetValue);
    }
    return host.postEffectLutExternalTextValue !== null;
}

export function applyLutSettings(host: PostProcessHost): void {
    const imageProcessing = host.scene.imageProcessingConfiguration;
    if (host.postEffectBackend === "frameGraph") {
        imageProcessing.colorGradingEnabled = false;
        imageProcessing.colorGradingTexture = null;
        if (host.postEffectLutTexture) {
            host.postEffectLutTexture.dispose();
            host.postEffectLutTexture = null;
        }
        host.postEffectLutTextureKey = null;
        return;
    }

    const mode = host.postEffectLutSourceModeValue;
    const enabled = host.postEffectLutEnabledValue && isLutSourceReady(host);
    if (!enabled) {
        imageProcessing.colorGradingEnabled = false;
        imageProcessing.colorGradingTexture = null;
        if (host.postEffectLutTexture) {
            host.postEffectLutTexture.dispose();
            host.postEffectLutTexture = null;
        }
        host.postEffectLutTextureKey = null;
        return;
    }

    const key = mode === "builtin"
        ? `builtin:${host.postEffectLutPresetValue}`
        : `external:${mode}:${host.postEffectLutExternalPathValue ?? ""}:${host.postEffectLutExternalSourceFormatValue ?? ""}:${host.postEffectLutExternalRevision}`;

    if (!host.postEffectLutTexture || host.postEffectLutTextureKey !== key) {
        if (host.postEffectLutTexture) {
            host.postEffectLutTexture.dispose();
            host.postEffectLutTexture = null;
        }
        try {
            const lutUrl = mode === "builtin"
                ? getOrCreateLutPresetBlobUrl(host, host.postEffectLutPresetValue)
                : getOrCreateExternalLutBlobUrl(host);
            host.postEffectLutTexture = new ColorGradingTexture(lutUrl, host.scene);
            host.postEffectLutTextureKey = key;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            const sourceLabel = mode === "builtin"
                ? host.postEffectLutPresetValue
                : (host.postEffectLutExternalPathValue ?? "external");
            console.warn(`Failed to create LUT '${sourceLabel}': ${message}`);
            imageProcessing.colorGradingEnabled = false;
            imageProcessing.colorGradingTexture = null;
            host.postEffectLutTexture = null;
            host.postEffectLutTextureKey = null;
            return;
        }
    }

    if (!host.postEffectLutTexture) {
        imageProcessing.colorGradingEnabled = false;
        imageProcessing.colorGradingTexture = null;
        return;
    }

    host.postEffectLutTexture.level = Math.max(0, Math.min(1, host.postEffectLutIntensityValue));
    imageProcessing.colorGradingTexture = host.postEffectLutTexture;
    imageProcessing.colorGradingEnabled = true;
}

export function getOrCreateLutPresetBlobUrl(host: PostProcessHost, presetId: string): string {
    const existing = host.postEffectLutPresetBlobUrlById.get(presetId);
    if (existing) {
        return existing;
    }

    const lutText = getPostProcessHostStatics(host).POST_EFFECT_LUT_TEXT_BY_ID[presetId];
    if (!lutText) {
        throw new Error(`Unknown built-in LUT preset: ${presetId}`);
    }
    const blob = new Blob([lutText], { type: "text/plain" });
    const blobUrl = URL.createObjectURL(blob);
    host.postEffectLutPresetBlobUrlById.set(presetId, blobUrl);
    return blobUrl;
}

export function getOrCreateExternalLutBlobUrl(host: PostProcessHost): string {
    if (!host.postEffectLutExternalTextValue) {
        throw new Error("External LUT text is empty");
    }
    if (host.postEffectLutExternalBlobUrl) {
        return host.postEffectLutExternalBlobUrl;
    }

    const blob = new Blob([host.postEffectLutExternalTextValue], { type: "text/plain" });
    const blobUrl = URL.createObjectURL(blob);
    host.postEffectLutExternalBlobUrl = blobUrl;
    return blobUrl;
}

export function applyDefaultPipelinePostProcessSettings(host: PostProcessHost): void {
    const pipeline = host.defaultRenderingPipeline;
    if (!pipeline) {
        disposeStandaloneBloomEffect(host);
        return;
    }

    applyStandaloneBloomSettings(host);

    pipeline.glowLayerEnabled = false;

    const useClassicDefaultPipelineEffects = host.postEffectBackend === "classic";

    pipeline.chromaticAberrationEnabled = useClassicDefaultPipelineEffects && host.postEffectChromaticAberrationValue > 1e-4;
    if (pipeline.chromaticAberration) {
        pipeline.chromaticAberration.aberrationAmount = host.postEffectChromaticAberrationValue;
        pipeline.chromaticAberration.radialIntensity = 2.2;
        pipeline.chromaticAberration.direction = new Vector2(0, 0);
        pipeline.chromaticAberration.centerPosition = new Vector2(0.5, 0.5);
        pipeline.chromaticAberration.screenWidth = host.engine.getRenderWidth();
        pipeline.chromaticAberration.screenHeight = host.engine.getRenderHeight();
    }

    pipeline.grainEnabled = useClassicDefaultPipelineEffects && host.postEffectGrainIntensityValue > 1e-4;
    if (pipeline.grain) {
        pipeline.grain.intensity = host.postEffectGrainIntensityValue;
        pipeline.grain.animated = false;
    }

    pipeline.sharpenEnabled = useClassicDefaultPipelineEffects && host.postEffectSharpenEdgeValue > 1e-4;
    if (pipeline.sharpen) {
        pipeline.sharpen.edgeAmount = host.postEffectSharpenEdgeValue;
        pipeline.sharpen.colorAmount = 1;
    }

    if (host.postEffectBackend === "classic" && host.dofEnabledValue) {
        configureDofDepthRenderer(host);
        applyEditorDofSettings(host);
    }

    host.syncLuminousGlowLayer?.();
}

export function applySsrSettings(host: PostProcessHost): void {
    if (host.postEffectBackend === "frameGraph") {
        if (host.ssrRenderingPipeline) {
            host.ssrRenderingPipeline.dispose(false);
            host.ssrRenderingPipeline = null;
        }
        return;
    }

    if (!host.postEffectSsrEnabledValue) {
        if (host.ssrRenderingPipeline) {
            host.ssrRenderingPipeline.dispose(false);
            host.ssrRenderingPipeline = null;
        }
        host.disablePrePassRendererIfSupported();
        host.enforceFinalPostProcessOrder();
        return;
    }

    if (!host.hasPrePassRendererSupport()) {
        if (host.ssrRenderingPipeline) {
            host.ssrRenderingPipeline.dispose(false);
            host.ssrRenderingPipeline = null;
        }
        host.disablePrePassRendererIfSupported();
        host.postEffectSsrEnabledValue = false;
        host.enforceFinalPostProcessOrder();
        return;
    }

    if (!host.ssrRenderingPipeline) {
        try {
            host.ssrRenderingPipeline = new SSRRenderingPipeline(
                "SsrRenderingPipeline",
                host.scene,
                [host.camera],
                false,
            );
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`SSR pipeline initialization failed on ${host.getEngineType()}. SSR was disabled. Reason: ${message}`);
            host.addRuntimeDiagnostic(`SSR disabled on ${host.getEngineType()}.`);
            host.postEffectSsrEnabledValue = false;
            host.ssrRenderingPipeline = null;
            host.enforceFinalPostProcessOrder();
            return;
        }
    }

    if (!host.ssrRenderingPipeline || !host.ssrRenderingPipeline.isSupported) {
        if (host.ssrRenderingPipeline) {
            host.ssrRenderingPipeline.dispose(false);
            host.ssrRenderingPipeline = null;
        }
        host.disablePrePassRendererIfSupported();
        host.postEffectSsrEnabledValue = false;
        host.enforceFinalPostProcessOrder();
        return;
    }

    host.ssrRenderingPipeline.isEnabled = true;
    host.ssrRenderingPipeline.samples = 1;
    host.ssrRenderingPipeline.strength = host.postEffectSsrStrengthValue;
    host.ssrRenderingPipeline.step = host.postEffectSsrStepValue;
    host.ssrRenderingPipeline.maxDistance = 1000;
    host.ssrRenderingPipeline.maxSteps = 64;
    host.ssrRenderingPipeline.thickness = 0.2;
    host.ssrRenderingPipeline.roughnessFactor = 0;
    host.ssrRenderingPipeline.blurDispersionStrength = 0;
    host.ssrRenderingPipeline.enableSmoothReflections = host.postEffectSsrStepValue > 1;
    host.enforceFinalPostProcessOrder();
}

export function applyEditorDofSettings(host: PostProcessHost): void {
    if (!host.defaultRenderingPipeline) return;
    const dof = host.defaultRenderingPipeline.depthOfField;
    if (host.depthRenderer) {
        dof.depthTexture = host.depthRenderer.getDepthMap();
    }
    dof.lensSize = host.dofLensSizeValue;
    dof.focalLength = host.dofFocalLengthValue;
    updateEditorDofFocusAndFStop(host);
    host.defaultRenderingPipeline.depthOfFieldEnabled = host.postEffectBackend === "classic" && host.dofEnabledValue;
    applyDofLensBlurSettings(host);
}

export function applyDofLensBlurSettings(host: PostProcessHost): void {
    const isEnabled = Boolean(
        host.defaultRenderingPipeline
        && host.depthRenderer
        && host.postEffectBackend === "classic"
        && host.dofEnabledValue
        && host.dofLensBlurEnabledValue
        && host.dofLensBlurStrengthValue > 0.0001,
    );

    if (!isEnabled) {
        disposeStandaloneLensBlurPostProcess(host);
        if (host.lensRenderingPipeline) {
            host.lensRenderingPipeline.dispose(false);
            host.lensRenderingPipeline = null;
        }
        host.enforceFinalPostProcessOrder();
        return;
    }

    ensureStandaloneLensBlurShader();

    if (!host.standaloneLensBlurPostProcess) {
        host.standaloneLensBlurPostProcess = new PostProcess(
            "standaloneLensBlur",
            "mmdStandaloneLensBlur",
            {
                uniforms: [
                    "texelSize",
                    "cameraNearFar",
                    "dofEnabled",
                    "blurStrength",
                    "focusDistance",
                    "cocPrecalculation",
                    "highlightGain",
                    "highlightThreshold",
                ],
                samplers: ["depthSampler"],
                size: 1.0,
                camera: host.camera,
                samplingMode: Texture.BILINEAR_SAMPLINGMODE,
                engine: host.engine,
                reusable: false,
                shaderLanguage: host.getPostProcessShaderLanguage(),
            },
        );
        host.standaloneLensBlurPostProcess.onApplyObservable.add((effect: PostProcessEffectLike) => {
            const depthMap = host.depthRenderer?.getDepthMap();
            if (!depthMap) {
                return;
            }

            const focusDistance = Math.max(1, host.dofFocusDistanceMmValue);
            const focalLength = Math.max(1, host.dofFocalLengthValue);
            const aperture = Math.max(0.001, host.dofLensSizeValue) / Math.max(0.01, host.dofEffectiveFStopValue);
            const cocPrecalculation = (aperture * focalLength) / Math.max(1.0, focusDistance - focalLength);
            const rawStrength = Math.max(0, Math.min(1, host.dofLensBlurStrengthValue));
            const strength = Math.pow(rawStrength, 0.72);
            const highlightGain = host.dofLensHighlightsBaseGain + strength * host.dofLensHighlightsGainRange;
            const highlightThreshold = host.dofLensHighlightsBaseThreshold + (1 - strength) * host.dofLensHighlightsThresholdRange;

            effect.setTexture("depthSampler", depthMap);
            effect.setFloat2(
                "texelSize",
                1 / Math.max(1, host.standaloneLensBlurPostProcess?.width ?? host.engine.getRenderWidth()),
                1 / Math.max(1, host.standaloneLensBlurPostProcess?.height ?? host.engine.getRenderHeight()),
            );
            effect.setFloat2("cameraNearFar", host.camera.minZ, host.camera.maxZ);
            effect.setFloat("dofEnabled", host.dofEnabledValue ? 1 : 0);
            effect.setFloat("blurStrength", strength);
            effect.setFloat("focusDistance", focusDistance);
            effect.setFloat("cocPrecalculation", cocPrecalculation);
            effect.setFloat("highlightGain", highlightGain);
            effect.setFloat("highlightThreshold", highlightThreshold);
        });
    }

    if (host.lensRenderingPipeline) {
        host.lensRenderingPipeline.dispose(false);
        host.lensRenderingPipeline = null;
    }
    host.enforceFinalPostProcessOrder();
}

export function updateEditorDofFocusAndFStop(host: PostProcessHost): void {
    if (host.dofFocalLengthFollowsCameraFov) {
        updateDofFocalLengthFromCameraFov(host);
    }
    if (host.dofLensDistortionFollowsCameraFov) {
        updateDofLensDistortionFromCameraFov(host);
    }
    if (host.dofAutoFocusToCameraTarget) {
        const targetFocusMm = host.getDofAutoFocusDistanceMm();
        const minFocusMm = host.camera.minZ * 1000;
        host.dofFocusDistanceMmValue = Math.max(minFocusMm, targetFocusMm - host.dofAutoFocusNearOffsetMmValue);
    }
    const autoMinFStopRaw = host.dofAutoFocusToCameraTarget
        ? computeAutoFocusMinFStop(host, host.dofFocusDistanceMmValue)
        : 0;
    const autoMinFStop = host.dofAutoFocusToCameraTarget
        ? computeAdjustedAutoMinFStop(host, host.dofFStopValue, autoMinFStopRaw, host.dofFocusDistanceMmValue)
        : 0;
    host.dofEffectiveFStopValue = Math.max(
        0.01,
        Math.min(32, Math.max(host.dofFStopValue, autoMinFStop))
    );
    if (!host.defaultRenderingPipeline) return;
    const dof = host.defaultRenderingPipeline.depthOfField;
    dof.focusDistance = host.dofFocusDistanceMmValue;
    dof.fStop = host.dofEffectiveFStopValue;
    applyDofLensBlurSettings(host);
}

export function updateDofLensDistortionFromCameraFov(host: PostProcessHost): void {
    const fovDeg = (host.camera.fov * 180) / Math.PI;
    const minTele = host.dofLensDistortionMinTeleFovDeg;
    const neutral = host.dofLensDistortionNeutralFovDeg;
    const maxWide = host.dofLensDistortionMaxWideFovDeg;
    const clampedFovDeg = Math.max(minTele, Math.min(maxWide, fovDeg));

    let distortion = 0;
    if (clampedFovDeg >= neutral) {
        const wideSpan = Math.max(0.0001, maxWide - neutral);
        distortion = (clampedFovDeg - neutral) / wideSpan;
    } else {
        const teleSpan = Math.max(0.0001, neutral - minTele);
        distortion = -((neutral - clampedFovDeg) / teleSpan);
    }

    const influencedDistortion = distortion * host.dofLensDistortionInfluenceValue;
    host.dofLensDistortionValue = Math.max(-1, Math.min(1, influencedDistortion));
    applyDofLensOpticsSettings(host);
}

export function updateDofFocalLengthFromCameraFov(host: PostProcessHost): void {
    const fovRad = Math.max(0.01, host.camera.fov);
    const baseFocalLengthMm = (0.5 * host.dofFovLinkSensorWidthMm) / Math.tan(fovRad * 0.5);
    let focalLengthMm = baseFocalLengthMm;

    if (host.dofFocalLengthDistanceInvertedValue) {
        const minFovRad = (10 * Math.PI) / 180;
        const maxFovRad = (120 * Math.PI) / 180;
        const focalAtTeleMm = (0.5 * host.dofFovLinkSensorWidthMm) / Math.tan(minFovRad * 0.5);
        const focalAtWideMm = (0.5 * host.dofFovLinkSensorWidthMm) / Math.tan(maxFovRad * 0.5);
        focalLengthMm = focalAtWideMm + focalAtTeleMm - baseFocalLengthMm;
    }

    host.dofFocalLengthValue = Math.max(1, Math.min(1000, focalLengthMm));
    if (host.defaultRenderingPipeline) {
        host.defaultRenderingPipeline.depthOfField.focalLength = host.dofFocalLengthValue;
    }
}

export function computeAdjustedAutoMinFStop(host: PostProcessHost, baseFStop: number, autoMinFStop: number, focusDistanceMm: number): number {
    if (autoMinFStop <= baseFStop) {
        return autoMinFStop;
    }

    const focusBandRadiusMm = Math.max(1, host.dofAutoFocusInFocusRadiusMm);
    const compensationStartMm = focusBandRadiusMm * 1.5;
    const compensationFullMm = focusBandRadiusMm * 6.0;
    const blendDenominator = Math.max(1, compensationFullMm - compensationStartMm);
    const t = Math.max(0, Math.min(1, (focusDistanceMm - compensationStartMm) / blendDenominator));
    const distanceWeight = t * t * (3 - 2 * t);

    const softenedAutoMinFStop = baseFStop + (autoMinFStop - baseFStop) * distanceWeight;
    const maxCompensationBoost = 2.0;
    return Math.min(baseFStop + maxCompensationBoost, softenedAutoMinFStop);
}

export function computeAutoFocusMinFStop(host: PostProcessHost, focusDistanceMm: number): number {
    const focalLengthMm = Math.max(1, host.dofFocalLengthValue);
    const lensSizeMm = Math.max(0.001, host.dofLensSizeValue);
    const safeFocusDistanceMm = Math.max(focalLengthMm + 1, focusDistanceMm);
    const focusBandRadiusMm = Math.max(1, host.dofAutoFocusInFocusRadiusMm);
    const nearFocusBandRadiusMm = focusBandRadiusMm * host.dofNearSuppressionScaleValue;
    const nearBandDistanceMm = Math.max(focalLengthMm + 1, safeFocusDistanceMm - nearFocusBandRadiusMm);
    const compensatedLensSizeMm = Math.pow(lensSizeMm, host.dofAutoFocusLensCompensationExponent);
    const numerator = compensatedLensSizeMm * focalLengthMm * focusBandRadiusMm;
    const denominator = host.dofAutoFocusCocAtRangeEdge * nearBandDistanceMm * (safeFocusDistanceMm - focalLengthMm);
    if (denominator <= 1e-6) {
        return 32;
    }
    return Math.max(0.01, Math.min(32, numerator / denominator));
}

export function configureDofDepthRenderer(host: PostProcessHost): void {
    if (host.depthRenderer && host.postEffectBackend !== "frameGraph") {
        return;
    }
    const depthRenderer = host.scene.enableDepthRenderer(
        host.camera,
        false,
        false,
        Texture.NEAREST_SAMPLINGMODE,
        host.postEffectBackend === "frameGraph",
    );
    depthRenderer.useOnlyInActiveCamera = true;
    depthRenderer.forceDepthWriteTransparentMeshes = true;
    host.depthRenderer = depthRenderer;
}

export function setupFarDofPostProcess(host: PostProcessHost): void {
    if (!host.farDofEnabled) {
        host.postEffectFarDofStrengthValue = 0;
        return;
    }
    host.depthRenderer = host.scene.enableDepthRenderer(host.camera, false, true);
    host.depthRenderer.useOnlyInActiveCamera = true;
    host.depthRenderer.forceDepthWriteTransparentMeshes = true;

    const shaderKey = "mmdFarDofFragmentShader";
    if (!Effect.ShadersStore[shaderKey]) {
        Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform sampler2D depthSampler;
                uniform vec2 cameraNearFar;
                uniform vec2 texelSize;
                uniform float focusDistance;
                uniform float focusSharpRadius;
                uniform float farDofStrength;

                void main(void) {
                    vec4 sharp = texture2D(textureSampler, vUV);
                    if (farDofStrength <= 0.0001) {
                        gl_FragColor = sharp;
                        return;
                    }

                    float depthMetric = clamp(texture2D(depthSampler, vUV).r, 0.0, 1.0);
                    float pixelDistance = mix(cameraNearFar.x, cameraNearFar.y, depthMetric) * 1000.0;

                    // Keep about 1m around focus pin-sharp, then blur increases linearly with distance.
                    float farStart = focusDistance + focusSharpRadius;
                    float farSpan = max(cameraNearFar.y * 1000.0 - farStart, 1.0);
                    float blurFactor = clamp((pixelDistance - farStart) / farSpan, 0.0, 1.0) * farDofStrength;

                    if (blurFactor <= 0.0001) {
                        gl_FragColor = sharp;
                        return;
                    }

                    // Ease-in to avoid hard transition while preserving distance proportionality.
                    blurFactor = blurFactor * blurFactor * (3.0 - 2.0 * blurFactor);

                    vec2 baseRadius = texelSize * (1.8 + 42.0 * blurFactor);

                    const int DIR_COUNT = 16;
                    vec2 dirs[DIR_COUNT];
                    dirs[0] = vec2(1.0, 0.0);
                    dirs[1] = vec2(0.9239, 0.3827);
                    dirs[2] = vec2(0.7071, 0.7071);
                    dirs[3] = vec2(0.3827, 0.9239);
                    dirs[4] = vec2(0.0, 1.0);
                    dirs[5] = vec2(-0.3827, 0.9239);
                    dirs[6] = vec2(-0.7071, 0.7071);
                    dirs[7] = vec2(-0.9239, 0.3827);
                    dirs[8] = vec2(-1.0, 0.0);
                    dirs[9] = vec2(-0.9239, -0.3827);
                    dirs[10] = vec2(-0.7071, -0.7071);
                    dirs[11] = vec2(-0.3827, -0.9239);
                    dirs[12] = vec2(0.0, -1.0);
                    dirs[13] = vec2(0.3827, -0.9239);
                    dirs[14] = vec2(0.7071, -0.7071);
                    dirs[15] = vec2(0.9239, -0.3827);

                    float ringScale[4];
                    ringScale[0] = 0.55;
                    ringScale[1] = 1.1;
                    ringScale[2] = 1.85;
                    ringScale[3] = 2.75;

                    float ringWeight[4];
                    ringWeight[0] = 0.020;
                    ringWeight[1] = 0.017;
                    ringWeight[2] = 0.014;
                    ringWeight[3] = 0.011;

                    float depthWeightScale = mix(240.0, 90.0, blurFactor);

                    vec4 blur = sharp * 0.18;
                    float blurWeight = 0.18;

                    for (int ring = 0; ring < 4; ++ring) {
                        vec2 radius = baseRadius * ringScale[ring];
                        float baseWeight = ringWeight[ring];

                        for (int i = 0; i < DIR_COUNT; ++i) {
                            vec2 sampleUv = clamp(vUV + dirs[i] * radius, vec2(0.001), vec2(0.999));
                            float sampleDepthMetric = texture2D(depthSampler, sampleUv).r;
                            float depthWeight = exp(-abs(sampleDepthMetric - depthMetric) * depthWeightScale);
                            float sampleWeight = baseWeight * depthWeight;
                            blur += texture2D(textureSampler, sampleUv) * sampleWeight;
                            blurWeight += sampleWeight;
                        }
                    }

                    vec4 blurColor = blur / max(blurWeight, 0.0001);
                    gl_FragColor = mix(sharp, blurColor, blurFactor);
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
                uniform cameraNearFar: vec2f;
                uniform texelSize: vec2f;
                uniform focusDistance: f32;
                uniform focusSharpRadius: f32;
                uniform farDofStrength: f32;

                fn directionForIndex(index: i32) -> vec2f {
                    switch index {
                        case 0: { return vec2f(1.0, 0.0); }
                        case 1: { return vec2f(0.9239, 0.3827); }
                        case 2: { return vec2f(0.7071, 0.7071); }
                        case 3: { return vec2f(0.3827, 0.9239); }
                        case 4: { return vec2f(0.0, 1.0); }
                        case 5: { return vec2f(-0.3827, 0.9239); }
                        case 6: { return vec2f(-0.7071, 0.7071); }
                        case 7: { return vec2f(-0.9239, 0.3827); }
                        case 8: { return vec2f(-1.0, 0.0); }
                        case 9: { return vec2f(-0.9239, -0.3827); }
                        case 10: { return vec2f(-0.7071, -0.7071); }
                        case 11: { return vec2f(-0.3827, -0.9239); }
                        case 12: { return vec2f(0.0, -1.0); }
                        case 13: { return vec2f(0.3827, -0.9239); }
                        case 14: { return vec2f(0.7071, -0.7071); }
                        default: { return vec2f(0.9239, -0.3827); }
                    }
                }

                fn ringScaleForIndex(index: i32) -> f32 {
                    switch index {
                        case 0: { return 0.55; }
                        case 1: { return 1.1; }
                        case 2: { return 1.85; }
                        default: { return 2.75; }
                    }
                }

                fn ringWeightForIndex(index: i32) -> f32 {
                    switch index {
                        case 0: { return 0.020; }
                        case 1: { return 0.017; }
                        case 2: { return 0.014; }
                        default: { return 0.011; }
                    }
                }

                #define CUSTOM_FRAGMENT_DEFINITIONS
                @fragment
                fn main(input: FragmentInputs)->FragmentOutputs {
                    let sharp: vec4f = textureSampleLevel(textureSampler, textureSamplerSampler, input.vUV, 0.0);
                    var finalColor: vec4f = sharp;

                    if (uniforms.farDofStrength > 0.0001) {
                        let depthMetric: f32 = clamp(textureSampleLevel(depthSampler, depthSamplerSampler, input.vUV, 0.0).r, 0.0, 1.0);
                        let pixelDistance: f32 = mix(uniforms.cameraNearFar.x, uniforms.cameraNearFar.y, depthMetric) * 1000.0;

                        let farStart: f32 = uniforms.focusDistance + uniforms.focusSharpRadius;
                        let farSpan: f32 = max(uniforms.cameraNearFar.y * 1000.0 - farStart, 1.0);
                        var blurFactor: f32 = clamp((pixelDistance - farStart) / farSpan, 0.0, 1.0) * uniforms.farDofStrength;

                        if (blurFactor > 0.0001) {
                            blurFactor = blurFactor * blurFactor * (3.0 - 2.0 * blurFactor);
                            let baseRadius: vec2f = uniforms.texelSize * (1.8 + 42.0 * blurFactor);
                            let depthWeightScale: f32 = mix(240.0, 90.0, blurFactor);

                            var blur: vec4f = sharp * 0.18;
                            var blurWeight: f32 = 0.18;

                            for (var ring: i32 = 0; ring < 4; ring = ring + 1) {
                                let radius: vec2f = baseRadius * ringScaleForIndex(ring);
                                let baseWeight: f32 = ringWeightForIndex(ring);

                                for (var i: i32 = 0; i < 16; i = i + 1) {
                                    let dir: vec2f = directionForIndex(i);
                                    let sampleUv: vec2f = clamp(input.vUV + dir * radius, vec2f(0.001), vec2f(0.999));
                                    let sampleDepthMetric: f32 = textureSampleLevel(depthSampler, depthSamplerSampler, sampleUv, 0.0).r;
                                    let depthWeight: f32 = exp(-abs(sampleDepthMetric - depthMetric) * depthWeightScale);
                                    let sampleWeight: f32 = baseWeight * depthWeight;
                                    blur = blur + textureSampleLevel(textureSampler, textureSamplerSampler, sampleUv, 0.0) * sampleWeight;
                                    blurWeight = blurWeight + sampleWeight;
                                }
                            }

                            let blurColor: vec4f = blur / max(blurWeight, 0.0001);
                            finalColor = mix(sharp, blurColor, blurFactor);
                        }
                    }

                    fragmentOutputs.color = finalColor;
                }
            `;
    }

    host.dofPostProcess = new PostProcess(
        "farDepthOfField",
        "mmdFarDof",
        {
            uniforms: ["cameraNearFar", "texelSize", "focusDistance", "focusSharpRadius", "farDofStrength"],
            samplers: ["depthSampler"],
            size: 1.6,
            camera: host.camera,
            samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
            engine: host.engine,
            reusable: false,
            shaderLanguage: host.getPostProcessShaderLanguage(),
        },
    );

    host.dofPostProcess.onApplyObservable.add((effect: PostProcessEffectLike) => {
        const depthMap = host.depthRenderer?.getDepthMap();
        if (!depthMap) return;

        effect.setTexture("depthSampler", depthMap);
        effect.setFloat2("cameraNearFar", host.camera.minZ, host.camera.maxZ);
        effect.setFloat2(
            "texelSize",
            1 / Math.max(1, host.dofPostProcess?.width ?? host.engine.getRenderWidth()),
            1 / Math.max(1, host.dofPostProcess?.height ?? host.engine.getRenderHeight())
        );
        effect.setFloat("focusDistance", host.getDofAutoFocusDistanceMm());
        effect.setFloat("focusSharpRadius", host.farDofFocusSharpRadiusMm);
        effect.setFloat("farDofStrength", host.postEffectFarDofStrengthValue);
    });
}

export function applyDofLensOpticsSettings(host: PostProcessHost): void {
    const normalizedStrength = Math.max(0, Math.min(1, host.dofLensEdgeBlurValue / 3));
    if (normalizedStrength <= 0.0001) {
        disposeStandaloneEdgeBlurPostProcess(host);
        if (host.lensRenderingPipeline) {
            host.lensRenderingPipeline.dispose(false);
            host.lensRenderingPipeline = null;
        }
        host.enforceFinalPostProcessOrder();
        return;
    }

    ensureStandaloneEdgeBlurShader();

    if (!host.standaloneEdgeBlurPostProcess) {
        host.standaloneEdgeBlurPostProcess = new PostProcess(
            "standaloneEdgeBlur",
            "mmdStandaloneEdgeBlur",
            {
                uniforms: [
                    "texelSize",
                    "edgeBlurStrength",
                    "aspectRatio",
                ],
                size: 1.0,
                camera: host.camera,
                samplingMode: Texture.BILINEAR_SAMPLINGMODE,
                engine: host.engine,
                reusable: false,
                shaderLanguage: host.getPostProcessShaderLanguage(),
            },
        );
        host.standaloneEdgeBlurPostProcess.onApplyObservable.add((effect: PostProcessEffectLike) => {
            const width = Math.max(1, host.standaloneEdgeBlurPostProcess?.width ?? host.engine.getRenderWidth());
            const height = Math.max(1, host.standaloneEdgeBlurPostProcess?.height ?? host.engine.getRenderHeight());
            effect.setFloat2("texelSize", 1 / width, 1 / height);
            effect.setFloat("edgeBlurStrength", Math.max(0, Math.min(1, host.dofLensEdgeBlurValue / 3)));
            effect.setFloat("aspectRatio", width / height);
        });
    }

    if (host.lensRenderingPipeline) {
        host.lensRenderingPipeline.dispose(false);
        host.lensRenderingPipeline = null;
    }
    host.enforceFinalPostProcessOrder();
}

export function setupLensHighlightsPipeline(host: PostProcessHost): void {
    if (host.lensRenderingPipeline) {
        host.lensRenderingPipeline.dispose(false);
        host.lensRenderingPipeline = null;
    }
    applyDofLensBlurSettings(host);
}


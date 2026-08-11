import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";

type EffectsPipelineColorValue = {
    r: number;
    g: number;
    b: number;
    set(r: number, g: number, b: number): void;
};

type EffectsPipelineHost = {
    constructor: unknown;
    postEffectLutExternalPathValue: string | null;
    postEffectLutExternalTextValue: string | null;
    postEffectLutExternalSourceFormatValue: "3dl" | "cube" | null;
    postEffectLutExternalRevision: number;
    postEffectLutExternalBlobUrl: string | null;
    postEffectFogColorValue: EffectsPipelineColorValue;
    postEffectMotionBlurEnabledValue: boolean;
    postEffectMotionBlurStrengthValue: number;
    postEffectMotionBlurSamplesValue: number;
    postEffectSsrEnabledValue: boolean;
    postEffectSsrStrengthValue: number;
    postEffectSsrStepValue: number;
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
    antialiasEnabledValue: boolean;
    dofEnabledValue: boolean;
    postEffectBackend: "classic" | "frameGraph" | "experimental";
    defaultRenderingPipeline: {
        depthOfFieldEnabled: boolean;
        depthOfFieldBlurLevel: DepthOfFieldEffectBlurLevel;
        depthOfField: {
            depthTexture?: unknown;
            lensSize: number;
            focalLength: number;
        };
    } | null;
    depthRenderer: { getDepthMap(): unknown } | null;
    dofBlurLevelValue: number;
    dofFocusDistanceMmValue: number;
    dofAutoFocusToCameraTarget: boolean;
    dofAutoFocusInFocusRadiusMm: number;
    dofAutoFocusNearOffsetMmValue: number;
    dofNearSuppressionScaleValue: number;
    dofEffectiveFStopValue: number;
    dofFStopValue: number;
    dofLensBlurEnabledValue: boolean;
    dofLensBlurStrengthValue: number;
    dofLensEdgeBlurValue: number;
    dofLensDistortionValue: number;
    dofLensDistortionFollowsCameraFov: boolean;
    dofLensDistortionInfluenceValue: number;
    dofLensSizeValue: number;
    dofFocalLengthValue: number;
    dofFocalLengthFollowsCameraFov: boolean;
    dofFocalLengthDistanceInvertedValue: boolean;
    dofFocalLengthLinkedToCameraFov: boolean;
    postEffectFarDofStrengthValue: number;
    farDofEnabled: boolean;
    applyImageProcessingSettings(): void;
    applyFogSettings(): void;
    applyMotionBlurSettings(): void;
    applySsrSettings(): void;
    applyVolumetricLightSettings(): void;
    applyAntialiasSettings(): void;
    updateEditorDofFocusAndFStop(): void;
    applyDofLensBlurSettings(): void;
    refreshFrameGraphPostEffectsBackendForResourcePlanChange(): boolean;
    initializeDofPipeline(): void;
    configureDofDepthRenderer(): void;
    applyEditorDofSettings(): void;
    applyDofLensOpticsSettings(): void;
    updateDofLensDistortionFromCameraFov(): void;
    updateDofFocalLengthFromCameraFov(): void;
};

function getEffectsPipelineHostStatics(host: EffectsPipelineHost): {
    POST_EFFECT_LUT_PRESETS?: ReadonlyArray<{ id: string; label: string }>;
} {
    return host.constructor as { POST_EFFECT_LUT_PRESETS?: ReadonlyArray<{ id: string; label: string }> };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function getPostEffectLutPresetOptions(host: EffectsPipelineHost): ReadonlyArray<{ id: string; label: string }> {
    return getEffectsPipelineHostStatics(host).POST_EFFECT_LUT_PRESETS ?? [];
}

export function setPostEffectExternalLut(
    host: EffectsPipelineHost,
    path: string | null,
    text: string | null,
    sourceFormat: "3dl" | "cube" | null = null,
): void {
    const normalizedPath = typeof path === "string" && path.trim().length > 0 ? path.trim() : null;
    const normalizedText = typeof text === "string" && text.length > 0 ? text : null;
    const normalizedSourceFormat = sourceFormat === "cube" ? "cube" : null;
    const hasChanged =
        host.postEffectLutExternalPathValue !== normalizedPath
        || host.postEffectLutExternalTextValue !== normalizedText
        || host.postEffectLutExternalSourceFormatValue !== normalizedSourceFormat;

    if (!hasChanged) {
        return;
    }

    host.postEffectLutExternalPathValue = normalizedPath;
    host.postEffectLutExternalTextValue = normalizedText;
    host.postEffectLutExternalSourceFormatValue = normalizedSourceFormat;
    host.postEffectLutExternalRevision += 1;
    if (host.postEffectLutExternalBlobUrl) {
        URL.revokeObjectURL(host.postEffectLutExternalBlobUrl);
        host.postEffectLutExternalBlobUrl = null;
    }
    host.applyImageProcessingSettings();
}

export function getPostEffectFogColor(host: EffectsPipelineHost): { r: number; g: number; b: number } {
    return {
        r: host.postEffectFogColorValue.r,
        g: host.postEffectFogColorValue.g,
        b: host.postEffectFogColorValue.b,
    };
}

export function setPostEffectFogColor(host: EffectsPipelineHost, r: number, g: number, b: number): void {
    host.postEffectFogColorValue.set(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1));
    host.applyFogSettings();
}

export function getPostEffectMotionBlurEnabled(host: EffectsPipelineHost): boolean {
    return host.postEffectMotionBlurEnabledValue;
}
export function setPostEffectMotionBlurEnabled(host: EffectsPipelineHost, v: boolean): void {
    host.postEffectMotionBlurEnabledValue = Boolean(v);
    host.applyMotionBlurSettings();
}
export function getPostEffectMotionBlurStrength(host: EffectsPipelineHost): number {
    return host.postEffectMotionBlurStrengthValue;
}
export function setPostEffectMotionBlurStrength(host: EffectsPipelineHost, v: number): void {
    host.postEffectMotionBlurStrengthValue = clamp(v, 0, 10);
    host.applyMotionBlurSettings();
}
export function getPostEffectMotionBlurSamples(host: EffectsPipelineHost): number {
    return host.postEffectMotionBlurSamplesValue;
}
export function setPostEffectMotionBlurSamples(host: EffectsPipelineHost, v: number): void {
    host.postEffectMotionBlurSamplesValue = clamp(Math.round(v), 8, 64);
    host.applyMotionBlurSettings();
}

export function getPostEffectSsrEnabled(host: EffectsPipelineHost): boolean {
    return host.postEffectSsrEnabledValue;
}
export function setPostEffectSsrEnabled(host: EffectsPipelineHost, v: boolean): void {
    host.postEffectSsrEnabledValue = Boolean(v);
    host.applySsrSettings();
}
export function getPostEffectSsrStrength(host: EffectsPipelineHost): number {
    return host.postEffectSsrStrengthValue;
}
export function setPostEffectSsrStrength(host: EffectsPipelineHost, v: number): void {
    host.postEffectSsrStrengthValue = clamp(v, 0, 2);
    host.applySsrSettings();
}
export function getPostEffectSsrStep(host: EffectsPipelineHost): number {
    return host.postEffectSsrStepValue;
}
export function setPostEffectSsrStep(host: EffectsPipelineHost, v: number): void {
    host.postEffectSsrStepValue = clamp(Math.round(v), 1, 8);
    host.applySsrSettings();
}

export function getPostEffectVlsEnabled(host: EffectsPipelineHost): boolean {
    return host.postEffectVlsEnabledValue;
}
export function setPostEffectVlsEnabled(host: EffectsPipelineHost, v: boolean): void {
    host.postEffectVlsEnabledValue = Boolean(v);
    host.applyVolumetricLightSettings();
}
export function getPostEffectVlsExposure(host: EffectsPipelineHost): number {
    return host.postEffectVlsExposureValue;
}
export function setPostEffectVlsExposure(host: EffectsPipelineHost, v: number): void {
    host.postEffectVlsExposureValue = clamp(v, 0, 2);
    host.applyVolumetricLightSettings();
}
export function getPostEffectVlsDecay(host: EffectsPipelineHost): number {
    return host.postEffectVlsDecayValue;
}
export function setPostEffectVlsDecay(host: EffectsPipelineHost, v: number): void {
    host.postEffectVlsDecayValue = clamp(v, 0, 1);
    host.applyVolumetricLightSettings();
}
export function getPostEffectVlsWeight(host: EffectsPipelineHost): number {
    return host.postEffectVlsWeightValue;
}
export function setPostEffectVlsWeight(host: EffectsPipelineHost, v: number): void {
    host.postEffectVlsWeightValue = clamp(v, 0, 1);
    host.applyVolumetricLightSettings();
}
export function getPostEffectVlsDensity(host: EffectsPipelineHost): number {
    return host.postEffectVlsDensityValue;
}
export function setPostEffectVlsDensity(host: EffectsPipelineHost, v: number): void {
    host.postEffectVlsDensityValue = clamp(v, 0, 2);
    host.applyVolumetricLightSettings();
}

export function getPostEffectFogEnabled(host: EffectsPipelineHost): boolean {
    return host.postEffectFogEnabledValue;
}
export function setPostEffectFogEnabled(host: EffectsPipelineHost, v: boolean): void {
    host.postEffectFogEnabledValue = Boolean(v);
    host.applyFogSettings();
}
export function getPostEffectFogMode(host: EffectsPipelineHost): number {
    return host.postEffectFogModeValue;
}
export function setPostEffectFogMode(host: EffectsPipelineHost, v: number): void {
    void v;
    host.postEffectFogModeValue = 2;
    host.applyFogSettings();
}
export function getPostEffectFogStart(host: EffectsPipelineHost): number {
    return host.postEffectFogStartValue;
}
export function setPostEffectFogStart(host: EffectsPipelineHost, v: number): void {
    host.postEffectFogStartValue = clamp(v, 0, 100000);
    if (host.postEffectFogEndValue < host.postEffectFogStartValue + 0.01) {
        host.postEffectFogEndValue = host.postEffectFogStartValue + 0.01;
    }
    host.applyFogSettings();
}
export function getPostEffectFogEnd(host: EffectsPipelineHost): number {
    return host.postEffectFogEndValue;
}
export function setPostEffectFogEnd(host: EffectsPipelineHost, v: number): void {
    host.postEffectFogEndValue = Math.max(host.postEffectFogStartValue + 0.01, Math.min(100000, v));
    host.applyFogSettings();
}
export function getPostEffectFogDensity(host: EffectsPipelineHost): number {
    return host.postEffectFogDensityValue;
}
export function setPostEffectFogDensity(host: EffectsPipelineHost, v: number): void {
    host.postEffectFogDensityValue = clamp(v, 0, 0.01);
    host.applyFogSettings();
}
export function getPostEffectFogOpacity(host: EffectsPipelineHost): number {
    return host.postEffectFogOpacityValue;
}
export function setPostEffectFogOpacity(host: EffectsPipelineHost, v: number): void {
    host.postEffectFogOpacityValue = clamp(v, 0, 1);
    host.applyFogSettings();
}

export function getAntialiasEnabled(host: EffectsPipelineHost): boolean {
    return host.antialiasEnabledValue;
}
export function setAntialiasEnabled(host: EffectsPipelineHost, v: boolean): void {
    host.antialiasEnabledValue = Boolean(v);
    host.applyAntialiasSettings();
}

export function getDofEnabled(host: EffectsPipelineHost): boolean {
    return host.dofEnabledValue;
}
export function setDofEnabled(host: EffectsPipelineHost, v: boolean): void {
    if (host.postEffectBackend === "frameGraph") {
        const next = Boolean(v);
        const changed = host.dofEnabledValue !== next;
        host.dofEnabledValue = next;
        if (host.dofEnabledValue) {
            host.updateEditorDofFocusAndFStop();
        }
        if (host.defaultRenderingPipeline) {
            host.defaultRenderingPipeline.depthOfFieldEnabled = false;
        }
        if (changed && host.refreshFrameGraphPostEffectsBackendForResourcePlanChange()) {
            return;
        }
        host.applyDofLensBlurSettings();
        host.applyAntialiasSettings();
        return;
    }

    if (v && !host.defaultRenderingPipeline) {
        host.initializeDofPipeline();
    }
    if (v && !host.defaultRenderingPipeline) {
        host.dofEnabledValue = false;
        return;
    }

    host.dofEnabledValue = v;
    if (host.dofEnabledValue) {
        host.configureDofDepthRenderer();
        host.updateEditorDofFocusAndFStop();
    }
    if (host.defaultRenderingPipeline) {
        if (host.depthRenderer) {
            host.defaultRenderingPipeline.depthOfField.depthTexture = host.depthRenderer.getDepthMap();
        }
        host.defaultRenderingPipeline.depthOfFieldEnabled = host.postEffectBackend === "classic" && host.dofEnabledValue;
    }
    host.applyDofLensBlurSettings();
    host.applyAntialiasSettings();
}

export function getDofBlurLevel(host: EffectsPipelineHost): number {
    return host.dofBlurLevelValue;
}
export function setDofBlurLevel(host: EffectsPipelineHost, v: number): void {
    const level = v <= 0 ? DepthOfFieldEffectBlurLevel.Low : v === 1 ? DepthOfFieldEffectBlurLevel.Medium : DepthOfFieldEffectBlurLevel.High;
    host.dofBlurLevelValue = level;
    if (host.defaultRenderingPipeline) {
        host.defaultRenderingPipeline.depthOfFieldBlurLevel = level;
        host.applyEditorDofSettings();
    }
    host.applyAntialiasSettings();
}

export function getDofFocusDistanceMm(host: EffectsPipelineHost): number {
    return host.dofFocusDistanceMmValue;
}
export function setDofFocusDistanceMm(host: EffectsPipelineHost, v: number): void {
    host.dofFocusDistanceMmValue = clamp(v, 0, 1000000000);
    host.updateEditorDofFocusAndFStop();
}
export function getDofAutoFocusEnabled(host: EffectsPipelineHost): boolean {
    return host.dofAutoFocusToCameraTarget;
}
export function getDofAutoFocusRangeMeters(host: EffectsPipelineHost): number {
    return host.dofAutoFocusInFocusRadiusMm / 1000;
}
export function getDofAutoFocusNearOffsetMm(host: EffectsPipelineHost): number {
    return host.dofAutoFocusNearOffsetMmValue;
}
export function setDofAutoFocusNearOffsetMm(host: EffectsPipelineHost, v: number): void {
    host.dofAutoFocusNearOffsetMmValue = clamp(v, -1000000000, 1000000000);
    host.updateEditorDofFocusAndFStop();
}
export function getDofNearSuppressionScale(host: EffectsPipelineHost): number {
    return host.dofNearSuppressionScaleValue;
}
export function setDofNearSuppressionScale(host: EffectsPipelineHost, v: number): void {
    host.dofNearSuppressionScaleValue = clamp(v, 0, 10);
    host.updateEditorDofFocusAndFStop();
}
export function getDofEffectiveFStop(host: EffectsPipelineHost): number {
    return host.dofEffectiveFStopValue;
}
export function getDofFStop(host: EffectsPipelineHost): number {
    return host.dofFStopValue;
}
export function setDofFStop(host: EffectsPipelineHost, v: number): void {
    host.dofFStopValue = clamp(v, 0.01, 32);
    host.updateEditorDofFocusAndFStop();
}
export function getDofLensBlurEnabled(host: EffectsPipelineHost): boolean {
    return host.dofLensBlurEnabledValue;
}
export function setDofLensBlurEnabled(host: EffectsPipelineHost, v: boolean): void {
    host.dofLensBlurEnabledValue = Boolean(v);
    host.applyDofLensBlurSettings();
}
export function getDofLensBlurStrength(host: EffectsPipelineHost): number {
    return host.dofLensBlurStrengthValue;
}
export function setDofLensBlurStrength(host: EffectsPipelineHost, v: number): void {
    host.dofLensBlurStrengthValue = clamp(v, 0, 1);
    host.applyDofLensBlurSettings();
}
export function getDofLensEdgeBlur(host: EffectsPipelineHost): number {
    return host.dofLensEdgeBlurValue;
}
export function setDofLensEdgeBlur(host: EffectsPipelineHost, v: number): void {
    host.dofLensEdgeBlurValue = clamp(v, 0, 3);
    host.applyDofLensOpticsSettings();
}
export function getDofLensDistortion(host: EffectsPipelineHost): number {
    return host.dofLensDistortionValue;
}
export function setDofLensDistortion(host: EffectsPipelineHost, v: number): void {
    if (host.dofLensDistortionFollowsCameraFov) {
        host.updateDofLensDistortionFromCameraFov();
        return;
    }
    host.dofLensDistortionValue = clamp(v, -1, 1);
    host.applyDofLensOpticsSettings();
}
export function getDofLensDistortionLinkedToCameraFov(host: EffectsPipelineHost): boolean {
    return host.dofLensDistortionFollowsCameraFov;
}
export function getDofLensDistortionInfluence(host: EffectsPipelineHost): number {
    return host.dofLensDistortionInfluenceValue;
}
export function setDofLensDistortionInfluence(host: EffectsPipelineHost, v: number): void {
    host.dofLensDistortionInfluenceValue = clamp(v, 0, 1);
    if (host.dofLensDistortionFollowsCameraFov) {
        host.updateDofLensDistortionFromCameraFov();
        return;
    }
    host.applyDofLensOpticsSettings();
}
export function getDofLensSize(host: EffectsPipelineHost): number {
    return host.dofLensSizeValue;
}
export function setDofLensSize(host: EffectsPipelineHost, v: number): void {
    host.dofLensSizeValue = clamp(v, 0, 8192);
    if (host.defaultRenderingPipeline) {
        host.defaultRenderingPipeline.depthOfField.lensSize = host.dofLensSizeValue;
    }
    host.updateEditorDofFocusAndFStop();
}
export function getDofFocalLength(host: EffectsPipelineHost): number {
    return host.dofFocalLengthValue;
}
export function setDofFocalLength(host: EffectsPipelineHost, v: number): void {
    if (host.dofFocalLengthFollowsCameraFov) {
        host.updateDofFocalLengthFromCameraFov();
        host.updateEditorDofFocusAndFStop();
        return;
    }
    host.dofFocalLengthValue = clamp(v, 1, 1000);
    if (host.defaultRenderingPipeline) {
        host.defaultRenderingPipeline.depthOfField.focalLength = host.dofFocalLengthValue;
    }
    host.updateEditorDofFocusAndFStop();
}
export function getDofFocalLengthDistanceInverted(host: EffectsPipelineHost): boolean {
    return host.dofFocalLengthDistanceInvertedValue;
}
export function setDofFocalLengthDistanceInverted(host: EffectsPipelineHost, v: boolean): void {
    host.dofFocalLengthDistanceInvertedValue = Boolean(v);
    if (host.dofFocalLengthFollowsCameraFov) {
        host.updateDofFocalLengthFromCameraFov();
        host.updateEditorDofFocusAndFStop();
    }
}
export function getDofFocalLengthLinkedToCameraDistance(host: EffectsPipelineHost): boolean {
    return host.dofFocalLengthLinkedToCameraFov;
}
export function getDofFocalLengthLinkedToCameraFov(host: EffectsPipelineHost): boolean {
    return host.dofFocalLengthFollowsCameraFov;
}
export function getPostEffectFarDofStrength(host: EffectsPipelineHost): number {
    return host.postEffectFarDofStrengthValue;
}
export function setPostEffectFarDofStrength(host: EffectsPipelineHost, v: number): void {
    if (!host.farDofEnabled) {
        host.postEffectFarDofStrengthValue = 0;
        return;
    }
    host.postEffectFarDofStrengthValue = clamp(v, 0, 1);
    host.applyDofLensOpticsSettings();
}

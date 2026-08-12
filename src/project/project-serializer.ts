import type {
    MmdModokiProjectFileV1,
    ProjectAccessoryState,
    ProjectKeyframeBundle,
    ProjectModelMaterialShaderState,
    ProjectMotionImport,
    ProjectSerializedCameraExternalParentTrack,
    ProjectSerializedModelExternalParentTrack,
    ProjectSerializedAccessoryTransformTrack,
    SsgiBlendMode,
} from "../types";
import type { FrameGraphPostEffectStackEntry } from "../shared/frame-graph-post-effect-stack";
import type { MmdMaterialPipelinePreset } from "../shared/mmd-material-pipeline";
import {
    normalizeSkydomeBackgroundStyle,
    type SkydomeBackgroundStyle,
} from "../shared/skydome-background-style";
import { serializeCameraTrack, serializeModelAnimation } from "./project-codec";

type ProjectExportAccessory = {
    index: number;
    path: string;
    visible: boolean;
};

type ProjectExportSceneModel = {
    info: { path: string };
    mesh: object;
    model: object;
    materialPipeline?: MmdMaterialPipelinePreset;
};

type ProjectExportHost = {
    sceneModels: ProjectExportSceneModel[];
    activeModelInfo: { path: string } | null;
    timelineTarget: "model" | "camera";
    _currentFrame: number;
    _playbackSpeed: number;
    cameraMotionPath: string | null;
    audioSourcePath: string | null;
    camera: {
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
    };
    cameraRotationEulerDeg: { x: number; y: number; z: number };
    modelMotionImportsByModel: WeakMap<object, ProjectMotionImport[]>;
    modelSourceAnimationsByModel: WeakMap<object, unknown>;
    cameraSourceAnimation: { cameraTrack?: unknown } | null;
    getCameraExternalParentKeyframes?: () => ProjectSerializedCameraExternalParentTrack | null;
    getModelExternalParentKeyframes?: () => ProjectSerializedModelExternalParentTrack[];
    lightIntensity: number;
    ambientIntensity: number;
    lightColorTemperature: number;
    lightFlatStrength: number;
    lightFlatColorInfluence: number;
    toonShadowInfluence: number;
    shadowEnabled: boolean;
    shadowMode: "cascaded" | "standard";
    shadowDarkness: number;
    shadowFrustumSize: number;
    shadowMaxZ: number;
    shadowBias: number;
    shadowNormalBias: number;
    shadowFilteringQuality: number;
    shadowBlurKernel: number;
    shadowBlurScale: number;
    shadowBlurBoxOffset: number;
    shadowPenumbraEnabled: boolean;
    shadowPenumbraSize: number;
    transparentShadowEnabled: boolean;
    softTransparentShadowEnabled: boolean;
    iblShadowsEnabled: boolean;
    environmentLightingEnabled: boolean;
    environmentLightingIntensity: number;
    environmentLightingSourcePath: string | null;
    environmentBackgroundVisible: boolean;
    environmentBackgroundIntensity: number;
    iblShadowOpacity: number;
    iblShadowDistanceScale: number;
    characterContactShadowEnabled: boolean;
    characterContactShadowOpacity: number;
    characterContactShadowScale: number;
    shadowEdgeSoftness: number;
    selfShadowEdgeSoftness: number;
    occlusionShadowEdgeSoftness: number;
    antialiasEnabled: boolean;
    mirroringFloorEnabled: boolean;
    mirroringFloorShape: "square" | "circle";
    mirroringFloorReflectance: number;
    mirroringFloorSize: number;
    mirroringFloorHeight: number;
    mirroringFloorResolution: number;
    dofEnabled: boolean;
    dofFocusDistanceMm: number;
    dofAutoFocusNearOffsetMm: number;
    dofBlurLevel: number;
    dofFStop: number;
    dofNearSuppressionScale: number;
    dofLensSize: number;
    dofFocalLength: number;
    dofFocalLengthDistanceInverted: boolean;
    dofLensBlurStrength: number;
    dofLensEdgeBlur: number;
    dofLensDistortion: number;
    dofLensDistortionInfluence: number;
    modelEdgeWidth: number;
    modelEdgeColorOverrideEnabled: boolean;
    getModelEdgeColor: () => { r: number; g: number; b: number };
    postEffectContrast: number;
    postEffectGamma: number;
    postEffectExposure: number;
    postEffectToneMappingEnabled: boolean;
    postEffectToneMappingType: number;
    postEffectDitheringEnabled: boolean;
    postEffectDitheringIntensity: number;
    postEffectVignetteEnabled: boolean;
    postEffectVignetteWeight: number;
    postEffectBloomEnabled: boolean;
    postEffectBloomWeight: number;
    postEffectBloomThreshold: number;
    postEffectBloomKernel: number;
    getPostEffectBloomColor: () => { r: number; g: number; b: number };
    postEffectChromaticAberration: number;
    postEffectGrainIntensity: number;
    postEffectSharpenEdge: number;
    postEffectSsaoEnabled: boolean;
    postEffectSsaoStrength: number;
    postEffectSsaoRadius: number;
    postEffectSsaoFadeEnd: number;
    postEffectSsaoDebugView: boolean;
    postEffectOffsetShadowEnabled: boolean;
    postEffectOffsetShadowStrength: number;
    postEffectOffsetShadowOffsetX: number;
    postEffectOffsetShadowOffsetY: number;
    postEffectOffsetShadowDepthBias: number;
    postEffectOffsetShadowMaxDepth: number;
    postEffectOffsetShadowDepthScale: number;
    postEffectOffsetShadowThickness: number;
    postEffectOffsetShadowSoftness: number;
    postEffectOffsetShadowNormalInfluence: number;
    getPostEffectOffsetShadowColor: () => { r: number; g: number; b: number };
    postEffectOffsetShadowDebugView: boolean;
    postEffectOffsetHighlightEnabled: boolean;
    postEffectOffsetHighlightStrength: number;
    postEffectOffsetHighlightOffsetX: number;
    postEffectOffsetHighlightOffsetY: number;
    postEffectOffsetHighlightDepthThreshold: number;
    postEffectOffsetHighlightNormalThreshold: number;
    postEffectOffsetHighlightThickness: number;
    postEffectOffsetHighlightSoftness: number;
    postEffectOffsetHighlightDepthScale: number;
    getPostEffectOffsetHighlightColor: () => { r: number; g: number; b: number };
    postEffectOffsetHighlightDebugView: boolean;
    postEffectColorCurvesEnabled: boolean;
    postEffectColorCurvesHue: number;
    postEffectColorCurvesDensity: number;
    postEffectColorCurvesSaturation: number;
    postEffectColorCurvesExposure: number;
    postEffectGlowEnabled: boolean;
    postEffectGlowIntensity: number;
    postEffectGlowThreshold: number;
    postEffectGlowKernel: number;
    postEffectGlowGlareCount: number;
    postEffectGlowGlareLength: number;
    postEffectGlowGlareAngle: number;
    postEffectGlowGlarePower: number;
    postEffectLutEnabled: boolean;
    postEffectLutIntensity: number;
    postEffectLutPreset: string;
    postEffectLutSourceMode: "builtin" | "external-absolute" | "project-relative";
    postEffectLutExternalPath: string | null;
    postEffectMotionBlurEnabled: boolean;
    postEffectMotionBlurStrength: number;
    postEffectMotionBlurSamples: number;
    postEffectSsrEnabled: boolean;
    postEffectSsrStrength: number;
    postEffectSsrStep: number;
    postEffectSsgiStrength: number;
    postEffectSsgiSampleRadius: number;
    postEffectSsgiBlendMode: SsgiBlendMode;
    postEffectOceanWaterHeight: number;
    postEffectOceanWaveStrength: number;
    postEffectOceanClarity: number;
    postEffectOceanCausticsStrength: number;
    postEffectOceanVolumeStrength: number;
    postEffectAerialPerspectiveStrength: number;
    postEffectAerialPerspectiveStart: number;
    postEffectAerialPerspectiveRange: number;
    getPostEffectAerialPerspectiveColor: () => { r: number; g: number; b: number };
    postEffectVlsEnabled: boolean;
    postEffectVlsExposure: number;
    postEffectVlsDecay: number;
    postEffectVlsWeight: number;
    postEffectVlsDensity: number;
    postEffectFogEnabled: boolean;
    postEffectFogMode: number;
    postEffectFogStart: number;
    postEffectFogEnd: number;
    postEffectFogDensity: number;
    postEffectFogOpacity: number;
    getModelVisibility: (mesh: object) => boolean;
    getModelCastsShadow: (entry: ProjectExportSceneModel) => boolean;
    getSerializedMaterialShaderStates: (entry: ProjectExportSceneModel) => ProjectModelMaterialShaderState[];
    getModelExternalParent?: (modelIndex: number) => {
        childBoneName: string;
        parentModelPath: string;
        parentBoneName: string;
        parentModelIndex: number;
    } | null;
    getSerializedLightDirection?: () => { x?: unknown; y?: unknown; z?: unknown } | null;
    getLightDirection: () => { x?: unknown; y?: unknown; z?: unknown };
    getLightColor: () => { r: number; g: number; b: number };
    getShadowColor: () => { r: number; g: number; b: number };
    getCameraFov: () => number;
    getCameraDistance: () => number;
    getCameraExternalParent?: () => { modelIndex: number | null; boneName: string | null } | null;
    getCameraProjectState?: () => {
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        fov: number;
        distance: number;
        externalParent?: {
            modelPath: string | null;
            boneName: string | null;
        } | null;
    };
    getPhysicsEnabled: () => boolean;
    getPhysicsFloorCollisionEnabled: () => boolean;
    getPhysicsSimulationRateHz: () => number;
    getPhysicsGravityAcceleration: () => number;
    getPhysicsGravityDirection: () => { x: number; y: number; z: number };
    getDofFocusTargetModelPath?: () => string | null;
    getDofFocusTargetBoneName?: () => string | null;
    getBackgroundImagePath: () => string | null;
    getBackgroundVideoPath: () => string | null;
    getSkydomeBackgroundStyle?: () => SkydomeBackgroundStyle;
    getExternalWgslToonShaderPath: () => string | null;
    getPostEffectFogColor: () => { r: number; g: number; b: number };
    getFrameGraphPostEffectStackEntries?: () => FrameGraphPostEffectStackEntry[];
    isGroundVisible: () => boolean;
    isSkydomeVisible: () => boolean;
};

export function exportProjectState(host: ProjectExportHost): MmdModokiProjectFileV1 {
    const accessoryExtension = host as {
        getLoadedAccessories?: () => ProjectExportAccessory[];
        getAccessoryTransform?: (index: number) => {
            position: { x: number; y: number; z: number };
            rotationDeg: { x: number; y: number; z: number };
            scale: number;
        } | null;
        getAccessoryParent?: (index: number) => { modelIndex: number | null; boneName: string | null } | null;
        getAccessoryTransformKeyframes?: (index: number) => ProjectSerializedAccessoryTransformTrack | null;
    };

    const models = host.sceneModels.map((entry, modelIndex) => ({
        path: entry.info.path,
        visible: host.getModelVisibility(entry.mesh),
        castsShadow: host.getModelCastsShadow(entry),
        materialPipeline: entry.materialPipeline ?? "mmd-standard",
        motionImports: (host.modelMotionImportsByModel.get(entry.model) ?? []).map((item) => ({ ...item })),
        materialShaders: host.getSerializedMaterialShaderStates(entry),
        externalParent: (() => {
            const parent = host.getModelExternalParent?.(modelIndex) ?? null;
            if (!parent) return null;
            return {
                childBoneName: parent.childBoneName,
                parentModelPath: parent.parentModelPath,
                parentBoneName: parent.parentBoneName,
            };
        })(),
    }));

    const accessories: ProjectAccessoryState[] = (accessoryExtension.getLoadedAccessories?.() ?? []).map((entry) => {
        const transform = accessoryExtension.getAccessoryTransform?.(entry.index) ?? null;
        const parent = accessoryExtension.getAccessoryParent?.(entry.index) ?? null;
        const parentModelPath = typeof parent?.modelIndex === "number" && parent.modelIndex >= 0
            ? host.sceneModels[parent.modelIndex]?.info.path ?? null
            : null;

        return {
            path: entry.path,
            visible: entry.visible,
            transform: transform ?? undefined,
            parentModelPath,
            parentBoneName: parent?.boneName ?? null,
        };
    });

    const keyframes: ProjectKeyframeBundle = {
        modelAnimations: host.sceneModels.map((entry) => ({
            modelPath: entry.info.path,
            animation: serializeModelAnimation(host.modelSourceAnimationsByModel.get(entry.model)),
        })),
        cameraAnimation: serializeCameraTrack(host.cameraSourceAnimation?.cameraTrack),
        modelExternalParents: host.getModelExternalParentKeyframes?.() ?? [],
        cameraExternalParents: host.getCameraExternalParentKeyframes?.() ?? null,
    };

    const accessoryTransformAnimations = (accessoryExtension.getLoadedAccessories?.() ?? [])
        .map((entry) => accessoryExtension.getAccessoryTransformKeyframes?.(entry.index) ?? null);
    if (accessoryTransformAnimations.length > 0) {
        keyframes.accessoryTransformAnimations = accessoryTransformAnimations;
    }

    const serializedLightDirection = typeof host.getSerializedLightDirection === "function"
        ? host.getSerializedLightDirection()
        : host.getLightDirection();
    const lightDirection = {
        x: Number(serializedLightDirection?.x ?? 0),
        y: Number(serializedLightDirection?.y ?? 0),
        z: Number(serializedLightDirection?.z ?? 0),
    };
    const serializedCamera = host.getCameraProjectState?.();

    return {
        format: "mmd_modoki_project",
        version: 1,
        savedAt: new Date().toISOString(),
        scene: {
            models,
            activeModelPath: host.activeModelInfo?.path ?? null,
            timelineTarget: host.timelineTarget,
            currentFrame: host._currentFrame,
            playbackSpeed: host._playbackSpeed,
        },
        assets: {
            cameraVmdPath: host.cameraMotionPath,
            audioPath: host.audioSourcePath,
        },
        camera: serializedCamera ?? {
            position: {
                x: host.camera.position.x,
                y: host.camera.position.y,
                z: host.camera.position.z,
            },
            target: {
                x: host.camera.target.x,
                y: host.camera.target.y,
                z: host.camera.target.z,
            },
            rotation: {
                x: host.cameraRotationEulerDeg.x,
                y: host.cameraRotationEulerDeg.y,
                z: host.cameraRotationEulerDeg.z,
            },
            fov: host.getCameraFov(),
            distance: host.getCameraDistance(),
            externalParent: (() => {
                const parent = host.getCameraExternalParent?.() ?? null;
                if (typeof parent?.modelIndex !== "number" || parent.modelIndex < 0) return null;
                return {
                    modelPath: host.sceneModels[parent.modelIndex]?.info.path ?? null,
                    boneName: parent.boneName ?? null,
                };
            })(),
        },
        lighting: {
            ...lightDirection,
            intensity: host.lightIntensity,
            ambientIntensity: host.ambientIntensity,
            environmentLightingEnabled: host.environmentLightingEnabled,
            environmentLightingIntensity: host.environmentLightingIntensity,
            environmentLightingSourcePath: host.environmentLightingSourcePath,
            environmentBackgroundVisible: host.environmentBackgroundVisible,
            environmentBackgroundIntensity: host.environmentBackgroundIntensity,
            temperatureKelvin: host.lightColorTemperature,
            lightColor: host.getLightColor(),
            lightFlatStrength: host.lightFlatStrength,
            lightFlatColorInfluence: host.lightFlatColorInfluence,
            shadowColor: host.getShadowColor(),
            toonShadowInfluence: host.toonShadowInfluence,
            shadowEnabled: host.shadowEnabled,
            shadowMode: host.shadowMode,
            shadowDarkness: host.shadowDarkness,
            shadowFrustumSize: host.shadowFrustumSize,
            shadowMaxZ: host.shadowMaxZ,
            shadowBias: host.shadowBias,
            shadowNormalBias: host.shadowNormalBias,
            shadowFilteringQuality: host.shadowFilteringQuality,
            shadowBlurKernel: host.shadowBlurKernel,
            shadowBlurScale: host.shadowBlurScale,
            shadowBlurBoxOffset: host.shadowBlurBoxOffset,
            shadowPenumbraEnabled: host.shadowPenumbraEnabled,
            shadowPenumbraSize: host.shadowPenumbraSize,
            transparentShadowEnabled: host.transparentShadowEnabled,
            softTransparentShadowEnabled: host.softTransparentShadowEnabled,
            iblShadowsEnabled: host.iblShadowsEnabled,
            iblShadowOpacity: host.iblShadowOpacity,
            iblShadowDistanceScale: host.iblShadowDistanceScale,
            characterContactShadowEnabled: host.characterContactShadowEnabled,
            characterContactShadowOpacity: host.characterContactShadowOpacity,
            characterContactShadowScale: host.characterContactShadowScale,
            shadowEdgeSoftness: host.shadowEdgeSoftness,
            selfShadowEdgeSoftness: host.selfShadowEdgeSoftness,
            occlusionShadowEdgeSoftness: host.occlusionShadowEdgeSoftness,
        },
        viewport: {
            groundVisible: host.isGroundVisible(),
            skydomeVisible: host.isSkydomeVisible(),
            skydomeBackground: normalizeSkydomeBackgroundStyle(host.getSkydomeBackgroundStyle?.()),
            antialiasEnabled: host.antialiasEnabled,
            mirroringFloorEnabled: host.mirroringFloorEnabled,
            mirroringFloorShape: host.mirroringFloorShape,
            mirroringFloorReflectance: host.mirroringFloorReflectance,
            mirroringFloorSize: host.mirroringFloorSize,
            mirroringFloorHeight: host.mirroringFloorHeight,
            mirroringFloorResolution: host.mirroringFloorResolution,
            backgroundImagePath: host.getBackgroundImagePath(),
            backgroundVideoPath: host.getBackgroundVideoPath(),
        },
        physics: {
            enabled: host.getPhysicsEnabled(),
            floorCollisionEnabled: host.getPhysicsFloorCollisionEnabled(),
            simulationRateHz: host.getPhysicsSimulationRateHz(),
            gravityAcceleration: host.getPhysicsGravityAcceleration(),
            gravityDirection: host.getPhysicsGravityDirection(),
        },
        effects: {
            dofEnabled: host.dofEnabled,
            dofFocusDistanceMm: host.dofFocusDistanceMm,
            dofFocusOffsetMm: host.dofAutoFocusNearOffsetMm,
            dofTargetModelPath: host.getDofFocusTargetModelPath?.() ?? null,
            dofTargetBoneName: host.getDofFocusTargetBoneName?.() ?? null,
            dofBlurLevel: host.dofBlurLevel,
            dofFStop: host.dofFStop,
            dofNearSuppressionScale: host.dofNearSuppressionScale,
            dofLensSize: host.dofLensSize,
            dofFocalLength: host.dofFocalLength,
            dofFocalLengthDistanceInverted: host.dofFocalLengthDistanceInverted,
            dofLensBlurStrength: host.dofLensBlurStrength,
            dofLensEdgeBlur: host.dofLensEdgeBlur,
            dofLensDistortion: host.dofLensDistortion,
            dofLensDistortionInfluence: host.dofLensDistortionInfluence,
            modelEdgeWidth: host.modelEdgeWidth,
            modelEdgeColorOverrideEnabled: host.modelEdgeColorOverrideEnabled,
            modelEdgeColor: host.getModelEdgeColor(),
            contrast: host.postEffectContrast,
            gamma: host.postEffectGamma,
            exposure: host.postEffectExposure,
            toneMappingEnabled: host.postEffectToneMappingEnabled,
            toneMappingType: host.postEffectToneMappingType,
            ditheringEnabled: host.postEffectDitheringEnabled,
            ditheringIntensity: host.postEffectDitheringIntensity,
            vignetteEnabled: host.postEffectVignetteEnabled,
            vignetteWeight: host.postEffectVignetteWeight,
            bloomEnabled: host.postEffectBloomEnabled,
            bloomWeight: host.postEffectBloomWeight,
            bloomThreshold: host.postEffectBloomThreshold,
            bloomKernel: host.postEffectBloomKernel,
            bloomColor: host.getPostEffectBloomColor(),
            chromaticAberration: host.postEffectChromaticAberration,
            grainIntensity: host.postEffectGrainIntensity,
            sharpenEdge: host.postEffectSharpenEdge,
            ssaoEnabled: host.postEffectSsaoEnabled,
            ssaoStrength: host.postEffectSsaoStrength,
            ssaoRadius: host.postEffectSsaoRadius,
            ssaoFadeEnd: host.postEffectSsaoFadeEnd,
            ssaoDebugView: host.postEffectSsaoDebugView,
            offsetShadowEnabled: host.postEffectOffsetShadowEnabled,
            offsetShadowStrength: host.postEffectOffsetShadowStrength,
            offsetShadowOffsetX: host.postEffectOffsetShadowOffsetX,
            offsetShadowOffsetY: host.postEffectOffsetShadowOffsetY,
            offsetShadowDepthBias: host.postEffectOffsetShadowDepthBias,
            offsetShadowMaxDepth: host.postEffectOffsetShadowMaxDepth,
            offsetShadowDepthScale: host.postEffectOffsetShadowDepthScale,
            offsetShadowThickness: host.postEffectOffsetShadowThickness,
            offsetShadowSoftness: host.postEffectOffsetShadowSoftness,
            offsetShadowNormalInfluence: host.postEffectOffsetShadowNormalInfluence,
            offsetShadowColor: host.getPostEffectOffsetShadowColor(),
            offsetShadowDebugView: host.postEffectOffsetShadowDebugView,
            offsetHighlightEnabled: host.postEffectOffsetHighlightEnabled,
            offsetHighlightStrength: host.postEffectOffsetHighlightStrength,
            offsetHighlightOffsetX: host.postEffectOffsetHighlightOffsetX,
            offsetHighlightOffsetY: host.postEffectOffsetHighlightOffsetY,
            offsetHighlightDepthThreshold: host.postEffectOffsetHighlightDepthThreshold,
            offsetHighlightNormalThreshold: host.postEffectOffsetHighlightNormalThreshold,
            offsetHighlightThickness: host.postEffectOffsetHighlightThickness,
            offsetHighlightSoftness: host.postEffectOffsetHighlightSoftness,
            offsetHighlightDepthScale: host.postEffectOffsetHighlightDepthScale,
            offsetHighlightColor: host.getPostEffectOffsetHighlightColor(),
            offsetHighlightDebugView: host.postEffectOffsetHighlightDebugView,
            colorCurvesEnabled: host.postEffectColorCurvesEnabled,
            colorCurvesHue: host.postEffectColorCurvesHue,
            colorCurvesDensity: host.postEffectColorCurvesDensity,
            colorCurvesSaturation: host.postEffectColorCurvesSaturation,
            colorCurvesExposure: host.postEffectColorCurvesExposure,
            glowEnabled: host.postEffectGlowEnabled,
            glowIntensity: host.postEffectGlowIntensity,
            glowThreshold: host.postEffectGlowThreshold,
            glowKernel: host.postEffectGlowKernel,
            glowGlareCount: host.postEffectGlowGlareCount,
            glowGlareLength: host.postEffectGlowGlareLength,
            glowGlareAngle: host.postEffectGlowGlareAngle,
            glowGlarePower: host.postEffectGlowGlarePower,
            lutEnabled: host.postEffectLutEnabled,
            lutIntensity: host.postEffectLutIntensity,
            lutPreset: host.postEffectLutPreset,
            lutSourceMode: host.postEffectLutSourceMode,
            lutExternalPath: host.postEffectLutExternalPath,
            wgslToonShaderPath: host.getExternalWgslToonShaderPath(),
            motionBlurEnabled: host.postEffectMotionBlurEnabled,
            motionBlurStrength: host.postEffectMotionBlurStrength,
            motionBlurSamples: host.postEffectMotionBlurSamples,
            ssrEnabled: host.postEffectSsrEnabled,
            ssrStrength: host.postEffectSsrStrength,
            ssrStep: host.postEffectSsrStep,
            ssgiStrength: host.postEffectSsgiStrength,
            ssgiSampleRadius: host.postEffectSsgiSampleRadius,
            ssgiBlendMode: "softLight",
            oceanWaterHeight: host.postEffectOceanWaterHeight,
            oceanWaveStrength: host.postEffectOceanWaveStrength,
            oceanClarity: host.postEffectOceanClarity,
            oceanCausticsStrength: host.postEffectOceanCausticsStrength,
            oceanVolumeStrength: host.postEffectOceanVolumeStrength,
            aerialPerspectiveStrength: host.postEffectAerialPerspectiveStrength,
            aerialPerspectiveStart: host.postEffectAerialPerspectiveStart,
            aerialPerspectiveRange: host.postEffectAerialPerspectiveRange,
            aerialPerspectiveColor: host.getPostEffectAerialPerspectiveColor(),
            vlsEnabled: host.postEffectVlsEnabled,
            vlsExposure: host.postEffectVlsExposure,
            vlsDecay: host.postEffectVlsDecay,
            vlsWeight: host.postEffectVlsWeight,
            vlsDensity: host.postEffectVlsDensity,
            fogEnabled: host.postEffectFogEnabled,
            fogMode: host.postEffectFogMode,
            fogStart: host.postEffectFogStart,
            fogEnd: host.postEffectFogEnd,
            fogDensity: host.postEffectFogDensity,
            fogOpacity: host.postEffectFogOpacity,
            fogColor: host.getPostEffectFogColor(),
            frameGraphPostStack: host.getFrameGraphPostEffectStackEntries?.()
                .filter((entry) => entry.id !== "ocean"),
            gammaEncodingVersion: 2,
        },
        accessories,
        keyframes,
    };
}

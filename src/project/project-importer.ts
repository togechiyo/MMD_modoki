import type {
    MmdModokiProjectFileV1,
    ProjectAccessoryState,
    ProjectModelMaterialShaderState,
    ProjectMotionImport,
    ProjectSerializedAccessoryTransformTrack,
    ProjectSerializedCameraExternalParentTrack,
    ProjectSerializedModelExternalParentTrack,
    ProjectSerializedModelAnimation,
    SsgiBlendMode,
    ProjectRingParticleState,
} from "../types";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { createCameraAnimationFromTrack, deserializeCameraTrack, deserializeModelAnimation } from "./project-codec";
import {
    addFrameGraphPostEffectId,
    normalizeFrameGraphPostEffectStack,
    type FrameGraphPostEffectId,
    type FrameGraphPostEffectStackEntry,
} from "../shared/frame-graph-post-effect-stack";
import {
    normalizeSkydomeBackgroundStyle,
    type SkydomeBackgroundStyle,
} from "../shared/skydome-background-style";
import {
    normalizeMmdMaterialPipelinePreset,
    type MmdMaterialPipelinePreset,
    type PbrMaterialShaderPreset,
} from "../shared/mmd-material-pipeline";
import {
    normalizeMmdCoplanarDepthBiasStrength,
    normalizeMmdRenderOrderMode,
    type MmdRenderOrderMode,
} from "../shared/mmd-render-order";
import {
    normalizeBackgroundDisplayMode,
    type BackgroundDisplayMode,
} from "../shared/background-display-mode";
import { normalizeModelInstanceId } from "../shared/model-instance-id";

type ProjectImportRuntimeModel = {
    createRuntimeAnimation(animation: object): unknown;
    setRuntimeAnimation(animationHandle: unknown): void;
};

type ProjectImportSceneModel = {
    info: { instanceId: string; path: string };
    mesh: object;
    model: ProjectImportRuntimeModel;
};

type ProjectImportHost = {
    sceneModels: ProjectImportSceneModel[];
    modelSourceAnimationsByModel: WeakMap<ProjectImportRuntimeModel, object>;
    modelKeyframeTracksByModel: WeakMap<ProjectImportRuntimeModel, Map<string, Uint32Array>>;
    clearProjectForImport(): void;
    loadPMX(
        path: string,
        materialPipeline?: MmdMaterialPipelinePreset,
        renderOrder?: number,
        instanceId?: string,
    ): Promise<{ name: string; instanceId?: string } | null>;
    setMmdRenderOrderMode?: (value: MmdRenderOrderMode) => MmdRenderOrderMode;
    setMmdCoplanarDepthBiasStrength?: (value: number) => number;
    loadVMD(path: string): Promise<unknown>;
    loadVPD(path: string): Promise<unknown>;
    loadCameraVMD(path: string): Promise<boolean>;
    loadMP3(path: string): Promise<boolean>;
    applyImportedMaterialShaderStates(
        modelIndex: number,
        states: ProjectModelMaterialShaderState[] | undefined,
        warnings: string[],
        modelPath: string,
    ): void;
    setPbrMaterialShaderPreset?(
        modelIndex: number,
        materialKey: string | null,
        presetId: PbrMaterialShaderPreset,
    ): boolean;
    setLightDirection(x: number, y: number, z: number): void;
    setDofFocusTargetByPath?: (modelPath: string | null, boneName: string | null) => void;
    setDofFocusTargetByInstanceId?: (instanceId: string | null, boneName: string | null) => void;
    updateEditorDofFocusAndFStop?: () => void;
    applyEditorDofSettings?: () => void;
    applyDofLensBlurSettings?: () => void;
    applyLightColorTemperature?: () => void;
    applyToonShadowInfluenceToAllModels?: () => void;
    syncLuminousGlowLayer?: () => void;
    engine?: { releaseEffects?: () => void };
    setActiveModelByIndex(index: number): void;
    setModelExternalParent?: (
        childModelIndex: number,
        childBoneName: string,
        parentModelIndex: number | null,
        parentBoneName: string | null,
    ) => boolean;
    setModelExternalParentKeyframes?: (
        tracks: readonly ProjectSerializedModelExternalParentTrack[] | null,
    ) => boolean;
    setActiveModelVisibility(visible: boolean): void;
    applySceneMeshVisibility(mesh: object, visible: boolean): void;
    setModelCastsShadowByIndex?: (modelIndex: number, castsShadow: boolean) => void;
    setModelMotionImports(model: ProjectImportRuntimeModel, imports: ProjectMotionImport[]): void;
    buildModelTrackFrameMapFromAnimation(animation: object): Map<string, Uint32Array>;
    emitMergedKeyframeTracks(): void;
    applyCameraAnimation(animation: object, path: string | null): void;
    getCameraDistance(): number;
    getCameraFov(): number;
    applyCameraTrackPose(
        target: { x: number; y: number; z: number },
        rotation: { x: number; y: number; z: number },
        distance: number,
        fov: number,
    ): void;
    setCameraExternalParent?: (modelIndex: number | null, boneName: string | null) => boolean;
    setCameraExternalParentKeyframes?: (track: ProjectSerializedCameraExternalParentTrack | null) => boolean;
    setGroundVisible(visible: boolean): void;
    setSkydomeVisible(visible: boolean): void;
    setBackgroundBlack?: (enabled: boolean) => void;
    setBackgroundDisplayMode?: (mode: BackgroundDisplayMode) => BackgroundDisplayMode;
    setSkydomeBackgroundStyle?: (style: SkydomeBackgroundStyle) => void;
    antialiasEnabled: boolean;
    mirroringFloorReflectance: number;
    mirroringFloorShape: "square" | "circle";
    mirroringFloorSize: number;
    mirroringFloorHeight: number;
    mirroringFloorResolution: number;
    mirroringFloorEnabled: boolean;
    setBackgroundVideoFromPath(path: string): Promise<void>;
    setBackgroundImageFromPath(path: string): Promise<void>;
    clearBackgroundMedia(): void;
    lightIntensity: number;
    ambientIntensity: number;
    lightColorTemperature: number;
    setLightColor(r: number, g: number, b: number): void;
    lightFlatStrength: number;
    lightFlatColorInfluence: number;
    setShadowColor(r: number, g: number, b: number): void;
    toonShadowInfluence: number;
    shadowMode: "cascaded" | "standard";
    shadowDarkness: number;
    shadowFrustumSize: number;
    shadowFrustumSizeValue: number;
    shadowMaxZ: number;
    shadowMaxZValue: number;
    shadowBias: number;
    shadowBiasValue: number;
    shadowNormalBias: number;
    shadowNormalBiasValue: number;
    shadowFilteringQuality: number;
    shadowBlurKernel: number;
    shadowBlurScale: number;
    shadowBlurBoxOffset: number;
    shadowPenumbraEnabled: boolean;
    shadowPenumbraSize: number;
    transparentShadowEnabled: boolean;
    softTransparentShadowEnabled: boolean;
    iblShadowOpacity: number;
    iblShadowDistanceScale: number;
    iblShadowsEnabled: boolean;
    environmentLightingEnabled: boolean;
    environmentLightingIntensity: number;
    environmentBackgroundVisible: boolean;
    environmentBackgroundIntensity: number;
    setEnvironmentLightingSourcePath(path: string | null): Promise<boolean>;
    characterContactShadowOpacity: number;
    characterContactShadowScale: number;
    characterContactShadowEnabled: boolean;
    selfShadowEdgeSoftness: number;
    occlusionShadowEdgeSoftness: number;
    setShadowEnabled(enabled: boolean): void;
    setPhysicsSimulationRateHz(value: number): void;
    setPhysicsGravityAcceleration(value: number): void;
    setPhysicsGravityDirection(x: number, y: number, z: number): void;
    setPhysicsFloorCollisionEnabled(enabled: boolean): void;
    isPhysicsAvailable(): boolean;
    setPhysicsEnabled(enabled: boolean): void;
    dofEnabled: boolean;
    dofFocusDistanceMm: number;
    dofAutoFocusNearOffsetMm: number;
    dofBlurLevel: number;
    dofFStop: number;
    dofNearSuppressionScale: number;
    dofLensSize: number;
    dofFocalLengthDistanceInverted: boolean;
    dofFocalLength: number;
    dofLensBlurStrength: number;
    dofLensEdgeBlur: number;
    dofLensDistortion: number;
    dofLensDistortionInfluence: number;
    modelEdgeWidth: number;
    modelEdgeColorOverrideEnabled: boolean;
    setModelEdgeColor: (r: number, g: number, b: number) => void;
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
    setPostEffectBloomColor(r: number, g: number, b: number): void;
    postEffectChromaticAberration: number;
    postEffectGrainIntensity: number;
    postEffectSharpenEdge: number;
    postEffectSsaoStrength: number;
    postEffectSsaoRadius: number;
    postEffectSsaoFadeEnd: number;
    postEffectSsaoDebugView: boolean;
    postEffectSsaoEnabled: boolean;
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
    setPostEffectOffsetShadowColor(r: number, g: number, b: number): void;
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
    setPostEffectOffsetHighlightColor(r: number, g: number, b: number): void;
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
    postEffectLutPreset: string;
    postEffectLutSourceMode: string;
    setPostEffectExternalLut(path: string | null, label: string | null, content: string | null): void;
    postEffectLutIntensity: number;
    postEffectLutEnabled: boolean;
    setExternalWgslToonShader(path: string | null, content: string | null): void;
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
    setPostEffectAerialPerspectiveColor(r: number, g: number, b: number): void;
    postEffectDirectionalLightShaftsStrength: number;
    postEffectDirectionalLightShaftsPhaseG: number;
    setPostEffectDirectionalLightShaftsLightColor(r: number, g: number, b: number): void;
    setPostEffectDirectionalLightShaftsShadowColor(r: number, g: number, b: number): void;
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
    setRingParticleSettings?(settings: ProjectRingParticleState): void;
    setPostEffectFogColor(r: number, g: number, b: number): void;
    setFrameGraphPostEffectStackIds?: (ids: readonly FrameGraphPostEffectId[]) => void;
    setFrameGraphPostEffectStackEntries?: (entries: readonly FrameGraphPostEffectStackEntry[]) => void;
    refreshTotalFramesFromContent(): void;
    setRenderFpsLimit(value: number): void;
    renderFpsLimit: number;
    seekTo(frame: number): void;
    setPlaybackSpeed(speed: number): void;
    setTimelineTarget(target: "model" | "camera"): void;
};

function normalizePathForCompare(value: string): string {
    return value.replace(/\\/g, "/").toLowerCase();
}

function readFiniteNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readLightingDirectionComponent(
    lighting: { x?: unknown; y?: unknown; z?: unknown; _x?: unknown; _y?: unknown; _z?: unknown },
    key: "x" | "y" | "z",
): number | null {
    const direct = lighting[key];
    if (typeof direct === "number" && Number.isFinite(direct)) {
        return direct;
    }

    const legacyKey = (`_${key}`) as "_x" | "_y" | "_z";
    const legacy = lighting[legacyKey];
    if (typeof legacy === "number" && Number.isFinite(legacy)) {
        return legacy;
    }

    return null;
}

function isProjectFileV1(value: unknown): value is MmdModokiProjectFileV1 {
    return !!value
        && typeof value === "object"
        && (value as MmdModokiProjectFileV1).format === "mmd_modoki_project"
        && (value as MmdModokiProjectFileV1).version === 1;
}

function finalizeImportedRenderState(
    host: ProjectImportHost,
    data: MmdModokiProjectFileV1,
    warnings: string[],
): void {
    const lightDirectionX = readLightingDirectionComponent(data.lighting, "x");
    const lightDirectionY = readLightingDirectionComponent(data.lighting, "y");
    const lightDirectionZ = readLightingDirectionComponent(data.lighting, "z");
    for (let modelIndex = 0; modelIndex < data.scene.models.length; modelIndex += 1) {
        const modelState = data.scene.models[modelIndex];
        const legacyPbrPreset = (modelState as { pbrMaterialPreset?: unknown }).pbrMaterialPreset;
        if (legacyPbrPreset === "pbr-mmd-like") {
            host.setPbrMaterialShaderPreset?.(modelIndex, null, "pbr-mmd-like");
        }
        host.applyImportedMaterialShaderStates(modelIndex, modelState.materialShaders, warnings, modelState.path);
    }

    if (
        lightDirectionX !== null
        && lightDirectionY !== null
        && lightDirectionZ !== null
    ) {
        host.setLightDirection(lightDirectionX, lightDirectionY, lightDirectionZ);
    }

    const dofTargetBoneName = typeof data.effects.dofTargetBoneName === "string"
        && data.effects.dofTargetBoneName.length > 0
        ? data.effects.dofTargetBoneName
        : null;
    const dofTargetInstanceId = normalizeModelInstanceId(data.effects.dofTargetModelInstanceId);
    if (dofTargetInstanceId && host.setDofFocusTargetByInstanceId) {
        host.setDofFocusTargetByInstanceId(dofTargetInstanceId, dofTargetBoneName);
    } else {
        host.setDofFocusTargetByPath?.(
            typeof data.effects.dofTargetModelPath === "string" && data.effects.dofTargetModelPath.length > 0
                ? data.effects.dofTargetModelPath
                : null,
            dofTargetBoneName,
        );
    }
    host.updateEditorDofFocusAndFStop?.();
    host.applyEditorDofSettings?.();
    host.applyDofLensBlurSettings?.();
    host.applyLightColorTemperature?.();
    host.applyToonShadowInfluenceToAllModels?.();
    host.syncLuminousGlowLayer?.();
    host.engine?.releaseEffects?.();
}

export async function importProjectState(
    host: ProjectImportHost,
    data: unknown,
    options: { forExport?: boolean } = {},
): Promise<{ loadedModels: number; warnings: string[] }> {
    if (!isProjectFileV1(data)) {
        throw new Error("Invalid project file format or version");
    }

    const warnings: string[] = [];
    const isExportImport = options.forExport === true;
    const lightDirectionX = readLightingDirectionComponent(data.lighting, "x");
    const lightDirectionY = readLightingDirectionComponent(data.lighting, "y");
    const lightDirectionZ = readLightingDirectionComponent(data.lighting, "z");
    host.clearProjectForImport();
    host.setMmdRenderOrderMode?.(normalizeMmdRenderOrderMode(data.scene.renderOrderMode));
    host.setMmdCoplanarDepthBiasStrength?.(
        normalizeMmdCoplanarDepthBiasStrength(data.scene.coplanarMaterialDepthBiasStrength),
    );

    let loadedModels = 0;
    const embeddedModelAnimationsByInstanceId = new Map<string, ProjectSerializedModelAnimation | null>();
    const legacyEmbeddedModelAnimationsByPath = new Map<string, Array<ProjectSerializedModelAnimation | null>>();
    const keyframeModelAnimations = Array.isArray(data.keyframes?.modelAnimations)
        ? data.keyframes.modelAnimations
        : [];
    for (const keyframeModel of keyframeModelAnimations) {
        if (!keyframeModel || typeof keyframeModel.modelPath !== "string") continue;
        const instanceId = normalizeModelInstanceId(keyframeModel.modelInstanceId);
        if (instanceId) {
            embeddedModelAnimationsByInstanceId.set(instanceId, keyframeModel.animation ?? null);
            continue;
        }
        const normalizedPath = normalizePathForCompare(keyframeModel.modelPath);
        const animations = legacyEmbeddedModelAnimationsByPath.get(normalizedPath) ?? [];
        animations.push(keyframeModel.animation ?? null);
        legacyEmbeddedModelAnimationsByPath.set(normalizedPath, animations);
    }
    const legacyAnimationOffsetsByPath = new Map<string, number>();

    for (const modelState of data.scene.models) {
        const materialPipeline = normalizeMmdMaterialPipelinePreset(modelState.materialPipeline);
        const requestedInstanceId = normalizeModelInstanceId(modelState.instanceId) ?? undefined;
        const modelInfo = typeof modelState.renderOrder === "number"
            ? requestedInstanceId
                ? await host.loadPMX(modelState.path, materialPipeline, modelState.renderOrder, requestedInstanceId)
                : await host.loadPMX(modelState.path, materialPipeline, modelState.renderOrder)
            : requestedInstanceId
                ? await host.loadPMX(modelState.path, materialPipeline, undefined, requestedInstanceId)
                : await host.loadPMX(modelState.path, materialPipeline);
        if (!modelInfo) {
            warnings.push(`Model load failed: ${modelState.path}`);
            continue;
        }

        loadedModels += 1;
        const modelIndex = host.sceneModels.length - 1;
        if (modelIndex < 0) continue;

        const targetEntry = host.sceneModels[modelIndex];
        if (!targetEntry) {
            warnings.push(`Failed to activate model for motion restore: ${modelState.path}`);
            continue;
        }

        if (!isExportImport) {
            host.setActiveModelByIndex(modelIndex);
            host.setActiveModelVisibility(Boolean(modelState.visible));
        } else {
            host.applySceneMeshVisibility(targetEntry.mesh, Boolean(modelState.visible));
        }
        host.setModelCastsShadowByIndex?.(
            modelIndex,
            typeof modelState.castsShadow === "boolean" ? modelState.castsShadow : true,
        );

        const targetModel = targetEntry.model;

        let restoredEmbeddedAnimation = false;
        const actualInstanceId = normalizeModelInstanceId(targetEntry.info.instanceId);
        let embeddedAnimationData: ProjectSerializedModelAnimation | null = modelState.animation ?? null;
        const animationInstanceId = requestedInstanceId ?? actualInstanceId;
        if (animationInstanceId && embeddedModelAnimationsByInstanceId.has(animationInstanceId)) {
            embeddedAnimationData = embeddedModelAnimationsByInstanceId.get(animationInstanceId) ?? null;
        } else {
            const normalizedPath = normalizePathForCompare(modelState.path);
            const legacyAnimations = legacyEmbeddedModelAnimationsByPath.get(normalizedPath) ?? [];
            const legacyOffset = legacyAnimationOffsetsByPath.get(normalizedPath) ?? 0;
            if (legacyOffset < legacyAnimations.length) {
                embeddedAnimationData = legacyAnimations[legacyOffset] ?? null;
                legacyAnimationOffsetsByPath.set(normalizedPath, legacyOffset + 1);
            }
        }
        if (embeddedAnimationData) {
            const embeddedAnimation = deserializeModelAnimation(embeddedAnimationData, `${modelInfo.name}@project`);
            if (embeddedAnimation) {
                host.modelSourceAnimationsByModel.set(targetModel, embeddedAnimation);
                host.setModelMotionImports(targetModel, (modelState.motionImports ?? []).map((item) => ({ ...item })));
                const animHandle = targetModel.createRuntimeAnimation(embeddedAnimation);
                targetModel.setRuntimeAnimation(animHandle);
                host.modelKeyframeTracksByModel.set(
                    targetModel,
                    host.buildModelTrackFrameMapFromAnimation(embeddedAnimation),
                );
                host.emitMergedKeyframeTracks();
                restoredEmbeddedAnimation = true;
            } else {
                warnings.push(`Embedded model animation restore failed: ${modelState.path}`);
            }
        }

        if (!restoredEmbeddedAnimation) {
            host.setModelMotionImports(targetModel, []);
            for (const motionImport of modelState.motionImports ?? []) {
                if (motionImport.type === "vmd") {
                    const motion = await host.loadVMD(motionImport.path);
                    if (!motion) {
                        warnings.push(`Model VMD load failed: ${motionImport.path}`);
                    }
                    continue;
                }

                if (motionImport.type === "vpd") {
                    if (typeof motionImport.frame === "number" && Number.isFinite(motionImport.frame)) {
                        host.seekTo(Math.max(0, Math.floor(motionImport.frame)));
                    }
                    const pose = await host.loadVPD(motionImport.path);
                    if (!pose) {
                        warnings.push(`Model VPD load failed: ${motionImport.path}`);
                    }
                }
            }
        }
    }

    const findLoadedModelIndex = (
        instanceId: unknown,
        fallbackPath: unknown,
    ): number => {
        const normalizedInstanceId = normalizeModelInstanceId(instanceId);
        if (normalizedInstanceId) {
            return host.sceneModels.findIndex((entry) => entry.info.instanceId === normalizedInstanceId);
        }
        if (typeof fallbackPath !== "string") return -1;
        const normalizedPath = normalizePathForCompare(fallbackPath);
        return host.sceneModels.findIndex(
            (entry) => normalizePathForCompare(entry.info.path) === normalizedPath,
        );
    };

    const modelExternalParentTracks = data.keyframes?.modelExternalParents;
    if (Array.isArray(modelExternalParentTracks)) {
        const normalizedTracks: ProjectSerializedModelExternalParentTrack[] = [];
        for (const track of modelExternalParentTracks) {
            if (!track || typeof track.modelPath !== "string") {
                warnings.push("Model external parent keyframe data is invalid");
                continue;
            }
            const childEntry = host.sceneModels[findLoadedModelIndex(track.modelInstanceId, track.modelPath)];
            if (!childEntry) {
                warnings.push(`Model external parent keyframe model not found: ${track.modelPath}`);
                continue;
            }
            const parentModelInstanceIds: Array<string | null> = [];
            const parentModelPaths = (track.parentModelPaths ?? []).map((parentPath, index) => {
                const parentInstanceId = track.parentModelInstanceIds?.[index] ?? null;
                if (!parentInstanceId && !parentPath) {
                    parentModelInstanceIds.push(null);
                    return null;
                }
                const parentEntry = host.sceneModels[findLoadedModelIndex(parentInstanceId, parentPath)];
                if (!parentEntry) {
                    warnings.push(`Model external parent keyframe parent not found: ${parentInstanceId ?? parentPath}`);
                    parentModelInstanceIds.push(null);
                    return null;
                }
                parentModelInstanceIds.push(parentEntry.info.instanceId);
                return parentEntry.info.path;
            });
            normalizedTracks.push({
                ...track,
                modelInstanceId: childEntry.info.instanceId,
                modelPath: childEntry.info.path,
                parentModelInstanceIds,
                parentModelPaths,
            });
        }
        if (host.setModelExternalParentKeyframes?.(normalizedTracks) === false) {
            warnings.push("Model external parent keyframe restore failed");
        }
    } else {
        const legacyTracks: ProjectSerializedModelExternalParentTrack[] = [];
        for (const modelState of data.scene.models) {
            const parent = modelState?.externalParent;
            if (!parent || typeof parent !== "object") continue;
            if (
                typeof modelState.path !== "string"
                || typeof parent.parentModelPath !== "string"
                || typeof parent.childBoneName !== "string"
                || typeof parent.parentBoneName !== "string"
            ) {
                warnings.push("Model external parent data is invalid");
                continue;
            }

            const childModelIndex = findLoadedModelIndex(modelState.instanceId, modelState.path);
            if (childModelIndex < 0) continue;

            const parentModelIndex = findLoadedModelIndex(parent.parentModelInstanceId, parent.parentModelPath);
            if (parentModelIndex < 0) {
                warnings.push(`Model external parent not found: ${parent.parentModelPath} (${modelState.path})`);
                continue;
            }

            if (host.setModelExternalParentKeyframes) {
                legacyTracks.push({
                    modelInstanceId: host.sceneModels[childModelIndex].info.instanceId,
                    modelPath: host.sceneModels[childModelIndex].info.path,
                    frameNumbers: [0],
                    childBoneNames: [parent.childBoneName],
                    parentModelInstanceIds: [host.sceneModels[parentModelIndex].info.instanceId],
                    parentModelPaths: [host.sceneModels[parentModelIndex].info.path],
                    parentBoneNames: [parent.parentBoneName],
                });
                continue;
            }

            const restored = host.setModelExternalParent?.(
                childModelIndex,
                parent.childBoneName,
                parentModelIndex,
                parent.parentBoneName,
            );
            if (restored === false) {
                warnings.push(`Model external parent restore failed: ${modelState.path}`);
            }
        }
        if (legacyTracks.length > 0 && host.setModelExternalParentKeyframes?.(legacyTracks) === false) {
            warnings.push("Model external parent restore failed");
        }
    }

    let restoredEmbeddedCamera = false;
    const embeddedCameraAnimationData = data.keyframes?.cameraAnimation ?? data.assets.cameraAnimation ?? null;
    if (embeddedCameraAnimationData) {
        const cameraTrack = deserializeCameraTrack(embeddedCameraAnimationData);
        if (cameraTrack.frameNumbers.length > 0) {
            const cameraAnimation = createCameraAnimationFromTrack(cameraTrack, "projectCamera");
            host.applyCameraAnimation(cameraAnimation, data.assets.cameraVmdPath ?? null);
            restoredEmbeddedCamera = true;
        } else {
            warnings.push("Embedded camera animation is empty");
        }
    }

    if (!restoredEmbeddedCamera && data.assets.cameraVmdPath) {
        const loaded = await host.loadCameraVMD(data.assets.cameraVmdPath);
        if (!loaded) warnings.push(`Camera VMD load failed: ${data.assets.cameraVmdPath}`);
    }

    if (
        !restoredEmbeddedCamera &&
        data.camera &&
        typeof data.camera === "object" &&
        data.camera.target &&
        data.camera.rotation &&
        Number.isFinite(data.camera.target.x) &&
        Number.isFinite(data.camera.target.y) &&
        Number.isFinite(data.camera.target.z) &&
        Number.isFinite(data.camera.rotation.x) &&
        Number.isFinite(data.camera.rotation.y) &&
        Number.isFinite(data.camera.rotation.z)
    ) {
        const fallbackDistance = typeof data.camera.distance === "number" && Number.isFinite(data.camera.distance)
            ? data.camera.distance
            : (
                data.camera.position &&
                Number.isFinite(data.camera.position.x) &&
                Number.isFinite(data.camera.position.y) &&
                Number.isFinite(data.camera.position.z)
            )
                ? Math.max(
                    0.1,
                    Math.hypot(
                        data.camera.position.x - data.camera.target.x,
                        data.camera.position.y - data.camera.target.y,
                        data.camera.position.z - data.camera.target.z,
                    ),
                )
                : host.getCameraDistance();
        const fallbackFov = typeof data.camera.fov === "number" && Number.isFinite(data.camera.fov)
            ? data.camera.fov
            : host.getCameraFov();

        host.applyCameraTrackPose(
            {
                x: data.camera.target.x,
                y: data.camera.target.y,
                z: data.camera.target.z,
            },
            {
                x: data.camera.rotation.x,
                y: data.camera.rotation.y,
                z: data.camera.rotation.z,
            },
            fallbackDistance,
            fallbackFov,
        );
    }

    const cameraExternalParentTrack = data.keyframes?.cameraExternalParents ?? null;
    if (cameraExternalParentTrack) {
        host.setCameraExternalParentKeyframes?.(cameraExternalParentTrack);
    }

    const cameraExternalParent = cameraExternalParentTrack ? null : data.camera?.externalParent ?? null;
    if (cameraExternalParent && typeof cameraExternalParent === "object") {
        let parentModelIndex: number | null = null;
        if (cameraExternalParent.modelInstanceId || cameraExternalParent.modelPath) {
            parentModelIndex = findLoadedModelIndex(
                cameraExternalParent.modelInstanceId,
                cameraExternalParent.modelPath,
            );
            if (parentModelIndex < 0) {
                warnings.push(
                    `Camera external parent model not found: ${cameraExternalParent.modelInstanceId ?? cameraExternalParent.modelPath}`,
                );
                parentModelIndex = null;
            }
        }
        if (parentModelIndex !== null) {
            host.setCameraExternalParent?.(
                parentModelIndex,
                typeof cameraExternalParent.boneName === "string" && cameraExternalParent.boneName.length > 0
                    ? cameraExternalParent.boneName
                    : null,
            );
        }
    }

    if (data.assets.audioPath) {
        const loaded = await host.loadMP3(data.assets.audioPath);
        if (!loaded) warnings.push(`Audio load failed: ${data.assets.audioPath}`);
    }

    if (!isExportImport && (data.scene.activeModelInstanceId || data.scene.activeModelPath)) {
        const activeInstanceId = normalizeModelInstanceId(data.scene.activeModelInstanceId);
        const targetPath = typeof data.scene.activeModelPath === "string"
            ? normalizePathForCompare(data.scene.activeModelPath)
            : null;
        const targetIndex = activeInstanceId
            ? host.sceneModels.findIndex((entry) => entry.info.instanceId === activeInstanceId)
            : host.sceneModels.findIndex(
                (entry) => targetPath !== null && normalizePathForCompare(entry.info.path) === targetPath,
            );
        if (targetIndex >= 0) {
            host.setActiveModelByIndex(targetIndex);
        } else {
            warnings.push(
                activeInstanceId
                    ? `Active model instance not found: ${activeInstanceId}`
                    : `Active model path not found: ${data.scene.activeModelPath}`,
            );
        }
    }

    const accessoryExtension = host as {
        loadX?: (filePath: string) => Promise<boolean>;
        loadGlb?: (filePath: string) => Promise<boolean>;
        getLoadedAccessories?: () => Array<{ index: number }>;
        setAccessoryVisibility?: (index: number, visible: boolean) => boolean;
        setAccessoryTransform?: (
            index: number,
            transform: Partial<NonNullable<ProjectAccessoryState["transform"]>>,
        ) => boolean;
        setAccessoryParent?: (index: number, modelIndex: number | null, boneName: string | null) => boolean;
        setAccessoryTransformKeyframes?: (index: number, track: ProjectSerializedAccessoryTransformTrack | null) => boolean;
    };
    const accessories = Array.isArray(data.accessories) ? data.accessories : [];
    const accessoryKeyframeTracks = Array.isArray(data.keyframes?.accessoryTransformAnimations)
        ? data.keyframes.accessoryTransformAnimations
        : [];
    if (accessories.length > 0) {
        if (typeof accessoryExtension.loadX !== "function") {
            warnings.push("Accessory restore skipped: accessory loader is unavailable");
        } else {
            for (let accessoryIndex = 0; accessoryIndex < accessories.length; accessoryIndex += 1) {
                const accessoryState = accessories[accessoryIndex];
                if (!accessoryState || typeof accessoryState.path !== "string" || accessoryState.path.trim().length === 0) {
                    warnings.push(`Accessory restore skipped at index ${accessoryIndex}: invalid path`);
                    continue;
                }

                const normalizedPath = accessoryState.path.replace(/\\/g, "/");
                const ext = normalizedPath.substring(normalizedPath.lastIndexOf(".") + 1).toLowerCase();
                const loadAccessory = ext === "glb"
                    ? accessoryExtension.loadGlb
                    : accessoryExtension.loadX;
                if (typeof loadAccessory !== "function") {
                    warnings.push(`Accessory restore skipped: unsupported accessory type for ${accessoryState.path}`);
                    continue;
                }

                const beforeCount = accessoryExtension.getLoadedAccessories?.().length ?? 0;
                const loaded = await loadAccessory(accessoryState.path);
                if (!loaded) {
                    warnings.push(`Accessory load failed: ${accessoryState.path}`);
                    continue;
                }
                const restoredAccessoryIndex = Math.max(
                    0,
                    (accessoryExtension.getLoadedAccessories?.().length ?? (beforeCount + 1)) - 1,
                );

                accessoryExtension.setAccessoryVisibility?.(restoredAccessoryIndex, Boolean(accessoryState.visible));

                const transform = accessoryState.transform;
                if (transform) {
                    accessoryExtension.setAccessoryTransform?.(restoredAccessoryIndex, {
                        position: {
                            x: Number.isFinite(transform.position?.x) ? transform.position.x : 0,
                            y: Number.isFinite(transform.position?.y) ? transform.position.y : 0,
                            z: Number.isFinite(transform.position?.z) ? transform.position.z : 0,
                        },
                        rotationDeg: {
                            x: Number.isFinite(transform.rotationDeg?.x) ? transform.rotationDeg.x : 0,
                            y: Number.isFinite(transform.rotationDeg?.y) ? transform.rotationDeg.y : 0,
                            z: Number.isFinite(transform.rotationDeg?.z) ? transform.rotationDeg.z : 0,
                        },
                        scale: Number.isFinite(transform.scale) ? transform.scale : 1,
                    });
                }

                let parentModelIndex: number | null = null;
                if (accessoryState.parentModelInstanceId || accessoryState.parentModelPath) {
                    parentModelIndex = findLoadedModelIndex(
                        accessoryState.parentModelInstanceId,
                        accessoryState.parentModelPath,
                    );
                    if (parentModelIndex < 0) {
                        warnings.push(
                            `Accessory parent model not found: ${accessoryState.parentModelInstanceId ?? accessoryState.parentModelPath} (${accessoryState.path})`,
                        );
                        parentModelIndex = null;
                    }
                }

                accessoryExtension.setAccessoryParent?.(
                    restoredAccessoryIndex,
                    parentModelIndex,
                    typeof accessoryState.parentBoneName === "string" && accessoryState.parentBoneName.length > 0
                        ? accessoryState.parentBoneName
                        : null,
                );

                const keyframeTrack = accessoryKeyframeTracks[accessoryIndex] ?? null;
                if (accessoryExtension.setAccessoryTransformKeyframes && keyframeTrack) {
                    accessoryExtension.setAccessoryTransformKeyframes(restoredAccessoryIndex, keyframeTrack);
                }
            }
        }
    }

    host.setGroundVisible(Boolean(data.viewport.groundVisible));
    host.setSkydomeBackgroundStyle?.(normalizeSkydomeBackgroundStyle(data.viewport.skydomeBackground));
    host.setSkydomeVisible(Boolean(data.viewport.skydomeVisible));
    const backgroundDisplayMode = normalizeBackgroundDisplayMode(
        data.viewport.backgroundDisplayMode,
        Boolean(data.viewport.backgroundBlack),
    );
    if (host.setBackgroundDisplayMode) {
        host.setBackgroundDisplayMode(backgroundDisplayMode);
    } else {
        host.setBackgroundBlack?.(backgroundDisplayMode === "black");
    }
    host.antialiasEnabled = Boolean(data.viewport.antialiasEnabled);
    host.mirroringFloorReflectance = typeof data.viewport.mirroringFloorReflectance === "number" && Number.isFinite(data.viewport.mirroringFloorReflectance)
        ? data.viewport.mirroringFloorReflectance
        : 0.3;
    host.mirroringFloorShape = data.viewport.mirroringFloorShape === "circle"
        ? "circle"
        : "square";
    host.mirroringFloorSize = typeof data.viewport.mirroringFloorSize === "number" && Number.isFinite(data.viewport.mirroringFloorSize)
        ? data.viewport.mirroringFloorSize
        : 100;
    host.mirroringFloorHeight = typeof data.viewport.mirroringFloorHeight === "number" && Number.isFinite(data.viewport.mirroringFloorHeight)
        ? data.viewport.mirroringFloorHeight
        : 0;
    host.mirroringFloorResolution = typeof data.viewport.mirroringFloorResolution === "number" && Number.isFinite(data.viewport.mirroringFloorResolution)
        ? data.viewport.mirroringFloorResolution
        : 1024;
    host.mirroringFloorEnabled = typeof data.viewport.mirroringFloorEnabled === "boolean"
        ? data.viewport.mirroringFloorEnabled
        : false;
    if (typeof data.viewport.backgroundVideoPath === "string" && data.viewport.backgroundVideoPath.trim().length > 0) {
        try {
            await host.setBackgroundVideoFromPath(data.viewport.backgroundVideoPath);
        } catch {
            warnings.push(`Background video load failed: ${data.viewport.backgroundVideoPath}`);
            host.clearBackgroundMedia();
        }
    } else if (typeof data.viewport.backgroundImagePath === "string" && data.viewport.backgroundImagePath.trim().length > 0) {
        try {
            await host.setBackgroundImageFromPath(data.viewport.backgroundImagePath);
        } catch {
            warnings.push(`Background image load failed: ${data.viewport.backgroundImagePath}`);
            host.clearBackgroundMedia();
        }
    } else {
        host.clearBackgroundMedia();
    }

    if (lightDirectionX !== null && lightDirectionY !== null && lightDirectionZ !== null) {
        host.setLightDirection(lightDirectionX, lightDirectionY, lightDirectionZ);
    }
    host.lightIntensity = data.lighting.intensity;
    host.ambientIntensity = data.lighting.ambientIntensity;
    host.lightColorTemperature = data.lighting.temperatureKelvin;
    if (data.lighting.lightColor &&
        Number.isFinite(data.lighting.lightColor.r) &&
        Number.isFinite(data.lighting.lightColor.g) &&
        Number.isFinite(data.lighting.lightColor.b)) {
        host.setLightColor(data.lighting.lightColor.r, data.lighting.lightColor.g, data.lighting.lightColor.b);
    }
    host.lightFlatStrength = typeof data.lighting.lightFlatStrength === "number" && Number.isFinite(data.lighting.lightFlatStrength)
        ? data.lighting.lightFlatStrength
        : 0;
    host.lightFlatColorInfluence = typeof data.lighting.lightFlatColorInfluence === "number" && Number.isFinite(data.lighting.lightFlatColorInfluence)
        ? data.lighting.lightFlatColorInfluence
        : 0.35;
    if (data.lighting.shadowColor &&
        Number.isFinite(data.lighting.shadowColor.r) &&
        Number.isFinite(data.lighting.shadowColor.g) &&
        Number.isFinite(data.lighting.shadowColor.b)) {
        host.setShadowColor(data.lighting.shadowColor.r, data.lighting.shadowColor.g, data.lighting.shadowColor.b);
    }
    host.toonShadowInfluence = typeof data.lighting.toonShadowInfluence === "number" && Number.isFinite(data.lighting.toonShadowInfluence)
        ? data.lighting.toonShadowInfluence
        : 1;
    host.shadowDarkness = typeof data.lighting.shadowDarkness === "number" && Number.isFinite(data.lighting.shadowDarkness)
        ? data.lighting.shadowDarkness
        : 0.2;
    host.shadowFrustumSize = typeof data.lighting.shadowFrustumSize === "number" && Number.isFinite(data.lighting.shadowFrustumSize)
        ? data.lighting.shadowFrustumSize
        : host.shadowFrustumSizeValue;
    host.shadowMaxZ = typeof data.lighting.shadowMaxZ === "number" && Number.isFinite(data.lighting.shadowMaxZ)
        ? data.lighting.shadowMaxZ
        : host.shadowMaxZValue;
    host.shadowBias = typeof data.lighting.shadowBias === "number" && Number.isFinite(data.lighting.shadowBias)
        ? data.lighting.shadowBias
        : host.shadowBiasValue;
    host.shadowNormalBias = typeof data.lighting.shadowNormalBias === "number" && Number.isFinite(data.lighting.shadowNormalBias)
        ? data.lighting.shadowNormalBias
        : host.shadowNormalBiasValue;
    host.shadowFilteringQuality = typeof data.lighting.shadowFilteringQuality === "number" && Number.isFinite(data.lighting.shadowFilteringQuality)
        ? data.lighting.shadowFilteringQuality
        : 0;
    host.shadowBlurKernel = typeof data.lighting.shadowBlurKernel === "number" && Number.isFinite(data.lighting.shadowBlurKernel)
        ? data.lighting.shadowBlurKernel
        : 0;
    host.shadowBlurScale = typeof data.lighting.shadowBlurScale === "number" && Number.isFinite(data.lighting.shadowBlurScale)
        ? data.lighting.shadowBlurScale
        : 2;
    host.shadowBlurBoxOffset = typeof data.lighting.shadowBlurBoxOffset === "number" && Number.isFinite(data.lighting.shadowBlurBoxOffset)
        ? data.lighting.shadowBlurBoxOffset
        : 1;
    host.shadowPenumbraEnabled = typeof data.lighting.shadowPenumbraEnabled === "boolean"
        ? data.lighting.shadowPenumbraEnabled
        : false;
    host.shadowPenumbraSize = typeof data.lighting.shadowPenumbraSize === "number" && Number.isFinite(data.lighting.shadowPenumbraSize)
        ? data.lighting.shadowPenumbraSize
        : 0.08;
    host.transparentShadowEnabled = typeof data.lighting.transparentShadowEnabled === "boolean"
        ? data.lighting.transparentShadowEnabled
        : true;
    host.softTransparentShadowEnabled = typeof data.lighting.softTransparentShadowEnabled === "boolean"
        ? data.lighting.softTransparentShadowEnabled
        : true;
    if (data.lighting.shadowMode === "standard" || data.lighting.shadowMode === "cascaded") {
        host.shadowMode = data.lighting.shadowMode;
    }
    host.iblShadowOpacity = typeof data.lighting.iblShadowOpacity === "number" && Number.isFinite(data.lighting.iblShadowOpacity)
        ? data.lighting.iblShadowOpacity
        : 0.25;
    host.iblShadowDistanceScale = typeof data.lighting.iblShadowDistanceScale === "number" && Number.isFinite(data.lighting.iblShadowDistanceScale)
        ? data.lighting.iblShadowDistanceScale
        : 4;
    host.iblShadowsEnabled = typeof data.lighting.iblShadowsEnabled === "boolean"
        ? data.lighting.iblShadowsEnabled
        : false;
    const environmentLightingSourcePath = typeof data.lighting.environmentLightingSourcePath === "string"
        && data.lighting.environmentLightingSourcePath.trim().length > 0
        ? data.lighting.environmentLightingSourcePath
        : null;
    if (!await host.setEnvironmentLightingSourcePath(environmentLightingSourcePath)) {
        warnings.push(`Environment HDR load failed: ${environmentLightingSourcePath ?? "bundled"}`);
    }
    host.environmentBackgroundVisible = typeof data.lighting.environmentBackgroundVisible === "boolean"
        ? data.lighting.environmentBackgroundVisible
        : false;
    host.environmentBackgroundIntensity = typeof data.lighting.environmentBackgroundIntensity === "number"
        && Number.isFinite(data.lighting.environmentBackgroundIntensity)
        ? data.lighting.environmentBackgroundIntensity
        : 0.03;
    host.environmentLightingEnabled = typeof data.lighting.environmentLightingEnabled === "boolean"
        ? data.lighting.environmentLightingEnabled
        : false;
    host.environmentLightingIntensity = typeof data.lighting.environmentLightingIntensity === "number"
        && Number.isFinite(data.lighting.environmentLightingIntensity)
        ? data.lighting.environmentLightingIntensity
        : 1;
    host.characterContactShadowOpacity = typeof data.lighting.characterContactShadowOpacity === "number" && Number.isFinite(data.lighting.characterContactShadowOpacity)
        ? data.lighting.characterContactShadowOpacity
        : 0.5;
    host.characterContactShadowScale = typeof data.lighting.characterContactShadowScale === "number" && Number.isFinite(data.lighting.characterContactShadowScale)
        ? data.lighting.characterContactShadowScale
        : 2;
    host.characterContactShadowEnabled = typeof data.lighting.characterContactShadowEnabled === "boolean"
        ? data.lighting.characterContactShadowEnabled
        : false;
    const legacyShadowEdgeSoftness = typeof data.lighting.shadowEdgeSoftness === "number" && Number.isFinite(data.lighting.shadowEdgeSoftness)
        ? data.lighting.shadowEdgeSoftness
        : null;
    const selfShadowEdgeSoftness = typeof data.lighting.selfShadowEdgeSoftness === "number" && Number.isFinite(data.lighting.selfShadowEdgeSoftness)
        ? data.lighting.selfShadowEdgeSoftness
        : legacyShadowEdgeSoftness;
    const occlusionShadowEdgeSoftness = typeof data.lighting.occlusionShadowEdgeSoftness === "number" && Number.isFinite(data.lighting.occlusionShadowEdgeSoftness)
        ? data.lighting.occlusionShadowEdgeSoftness
        : legacyShadowEdgeSoftness ?? 0.1;
    if (typeof selfShadowEdgeSoftness === "number") host.selfShadowEdgeSoftness = selfShadowEdgeSoftness;
    if (typeof occlusionShadowEdgeSoftness === "number") host.occlusionShadowEdgeSoftness = occlusionShadowEdgeSoftness;
    host.setShadowEnabled(Boolean(data.lighting.shadowEnabled));

    host.setPhysicsSimulationRateHz(data.physics.simulationRateHz ?? 60);
    host.setPhysicsGravityAcceleration(data.physics.gravityAcceleration);
    host.setPhysicsGravityDirection(
        data.physics.gravityDirection.x,
        data.physics.gravityDirection.y,
        data.physics.gravityDirection.z,
    );
    host.setPhysicsFloorCollisionEnabled(data.physics.floorCollisionEnabled ?? true);
    if (host.isPhysicsAvailable()) {
        host.setPhysicsEnabled(Boolean(data.physics.enabled));
    } else if (data.physics.enabled) {
        warnings.push("Physics was enabled in project, but physics is unavailable in this environment");
    }

    host.dofEnabled = Boolean(data.effects.dofEnabled);
    host.dofFocusDistanceMm = readFiniteNumber(data.effects.dofFocusDistanceMm, 10000);
    host.dofAutoFocusNearOffsetMm = readFiniteNumber(data.effects.dofFocusOffsetMm, 0);
    host.dofBlurLevel = readFiniteNumber(data.effects.dofBlurLevel, 1);
    const dofTargetBoneName = typeof data.effects.dofTargetBoneName === "string"
        && data.effects.dofTargetBoneName.length > 0
        ? data.effects.dofTargetBoneName
        : null;
    const dofTargetInstanceId = normalizeModelInstanceId(data.effects.dofTargetModelInstanceId);
    if (dofTargetInstanceId && host.setDofFocusTargetByInstanceId) {
        host.setDofFocusTargetByInstanceId(dofTargetInstanceId, dofTargetBoneName);
    } else {
        host.setDofFocusTargetByPath?.(
            typeof data.effects.dofTargetModelPath === "string" && data.effects.dofTargetModelPath.length > 0
                ? data.effects.dofTargetModelPath
                : null,
            dofTargetBoneName,
        );
    }
    host.dofFStop = 2.0;
    host.dofNearSuppressionScale = readFiniteNumber(data.effects.dofNearSuppressionScale, 4);
    host.dofLensSize = readFiniteNumber(data.effects.dofLensSize, 1000);
    host.dofFocalLengthDistanceInverted = typeof data.effects.dofFocalLengthDistanceInverted === "boolean"
        ? data.effects.dofFocalLengthDistanceInverted
        : false;
    host.dofFocalLength = readFiniteNumber(data.effects.dofFocalLength, 50);
    host.dofLensBlurStrength = readFiniteNumber(data.effects.dofLensBlurStrength, 0);
    host.dofLensEdgeBlur = readFiniteNumber(data.effects.dofLensEdgeBlur, 0);
    host.dofLensDistortion = readFiniteNumber(data.effects.dofLensDistortion, 0);
    host.dofLensDistortionInfluence = readFiniteNumber(data.effects.dofLensDistortionInfluence, 0);
    host.modelEdgeWidth = readFiniteNumber(data.effects.modelEdgeWidth, 1);
    host.modelEdgeColorOverrideEnabled = typeof data.effects.modelEdgeColorOverrideEnabled === "boolean"
        ? data.effects.modelEdgeColorOverrideEnabled
        : false;
    const modelEdgeColor = data.effects.modelEdgeColor;
    host.setModelEdgeColor(
        modelEdgeColor && Number.isFinite(modelEdgeColor.r) ? modelEdgeColor.r : 0,
        modelEdgeColor && Number.isFinite(modelEdgeColor.g) ? modelEdgeColor.g : 0,
        modelEdgeColor && Number.isFinite(modelEdgeColor.b) ? modelEdgeColor.b : 0,
    );
    host.postEffectContrast = readFiniteNumber(data.effects.contrast, 1);
    const importedGamma = readFiniteNumber(data.effects.gamma, 1);
    const gammaEncodingVersion = (data.effects as { gammaEncodingVersion?: unknown }).gammaEncodingVersion;
    host.postEffectGamma = gammaEncodingVersion === 2 ? importedGamma : importedGamma * 0.5;
    host.postEffectExposure = typeof data.effects.exposure === "number" && Number.isFinite(data.effects.exposure)
        ? data.effects.exposure
        : 1;
    host.postEffectToneMappingEnabled = typeof data.effects.toneMappingEnabled === "boolean"
        ? data.effects.toneMappingEnabled
        : false;
    host.postEffectToneMappingType = typeof data.effects.toneMappingType === "number" && Number.isFinite(data.effects.toneMappingType)
        ? data.effects.toneMappingType
        : ImageProcessingConfiguration.TONEMAPPING_STANDARD;
    host.postEffectDitheringEnabled = typeof data.effects.ditheringEnabled === "boolean"
        ? data.effects.ditheringEnabled
        : false;
    host.postEffectDitheringIntensity = typeof data.effects.ditheringIntensity === "number" && Number.isFinite(data.effects.ditheringIntensity)
        ? data.effects.ditheringIntensity
        : (1 / 255);
    host.postEffectVignetteEnabled = typeof data.effects.vignetteEnabled === "boolean"
        ? data.effects.vignetteEnabled
        : false;
    host.postEffectVignetteWeight = typeof data.effects.vignetteWeight === "number" && Number.isFinite(data.effects.vignetteWeight)
        ? data.effects.vignetteWeight
        : 0.3;
    host.postEffectBloomEnabled = typeof data.effects.bloomEnabled === "boolean"
        ? data.effects.bloomEnabled
        : (typeof data.effects.bloomWeight === "number" && Number.isFinite(data.effects.bloomWeight)
            ? data.effects.bloomWeight > 0.0001
            : false);
    host.postEffectBloomWeight = typeof data.effects.bloomWeight === "number" && Number.isFinite(data.effects.bloomWeight)
        ? data.effects.bloomWeight
        : 1;
    host.postEffectBloomThreshold = typeof data.effects.bloomThreshold === "number" && Number.isFinite(data.effects.bloomThreshold)
        ? data.effects.bloomThreshold
        : 1;
    host.postEffectBloomKernel = typeof data.effects.bloomKernel === "number" && Number.isFinite(data.effects.bloomKernel)
        ? data.effects.bloomKernel
        : 100;
    if (data.effects.bloomColor &&
        Number.isFinite(data.effects.bloomColor.r) &&
        Number.isFinite(data.effects.bloomColor.g) &&
        Number.isFinite(data.effects.bloomColor.b)) {
        host.setPostEffectBloomColor(data.effects.bloomColor.r, data.effects.bloomColor.g, data.effects.bloomColor.b);
    } else {
        host.setPostEffectBloomColor(1, 0.48, 0.16);
    }
    host.postEffectChromaticAberration = typeof data.effects.chromaticAberration === "number" && Number.isFinite(data.effects.chromaticAberration)
        ? data.effects.chromaticAberration
        : 0;
    host.postEffectGrainIntensity = typeof data.effects.grainIntensity === "number" && Number.isFinite(data.effects.grainIntensity)
        ? data.effects.grainIntensity
        : 0;
    host.postEffectSharpenEdge = typeof data.effects.sharpenEdge === "number" && Number.isFinite(data.effects.sharpenEdge)
        ? data.effects.sharpenEdge
        : 0;
    host.postEffectSsaoStrength = typeof data.effects.ssaoStrength === "number" && Number.isFinite(data.effects.ssaoStrength)
        ? data.effects.ssaoStrength
        : 0.5;
    host.postEffectSsaoRadius = typeof data.effects.ssaoRadius === "number" && Number.isFinite(data.effects.ssaoRadius)
        ? data.effects.ssaoRadius
        : 3;
    host.postEffectSsaoFadeEnd = typeof data.effects.ssaoFadeEnd === "number" && Number.isFinite(data.effects.ssaoFadeEnd)
        ? data.effects.ssaoFadeEnd
        : 200;
    host.postEffectSsaoDebugView = typeof data.effects.ssaoDebugView === "boolean"
        ? data.effects.ssaoDebugView
        : false;
    host.postEffectSsaoEnabled = typeof data.effects.ssaoEnabled === "boolean"
        ? data.effects.ssaoEnabled
        : false;
    host.postEffectOffsetShadowStrength = readFiniteNumber(data.effects.offsetShadowStrength, 0.35);
    host.postEffectOffsetShadowOffsetX = readFiniteNumber(data.effects.offsetShadowOffsetX, 0);
    host.postEffectOffsetShadowOffsetY = readFiniteNumber(data.effects.offsetShadowOffsetY, -30);
    host.postEffectOffsetShadowDepthBias = readFiniteNumber(data.effects.offsetShadowDepthBias, 0.2);
    host.postEffectOffsetShadowMaxDepth = readFiniteNumber(data.effects.offsetShadowMaxDepth, 2);
    host.postEffectOffsetShadowDepthScale = readFiniteNumber(data.effects.offsetShadowDepthScale, 1);
    host.postEffectOffsetShadowThickness = readFiniteNumber(data.effects.offsetShadowThickness, 1);
    host.postEffectOffsetShadowSoftness = readFiniteNumber(data.effects.offsetShadowSoftness, 0);
    host.postEffectOffsetShadowNormalInfluence = readFiniteNumber(data.effects.offsetShadowNormalInfluence, 0);
    if (data.effects.offsetShadowColor &&
        Number.isFinite(data.effects.offsetShadowColor.r) &&
        Number.isFinite(data.effects.offsetShadowColor.g) &&
        Number.isFinite(data.effects.offsetShadowColor.b)) {
        host.setPostEffectOffsetShadowColor(
            data.effects.offsetShadowColor.r,
            data.effects.offsetShadowColor.g,
            data.effects.offsetShadowColor.b,
        );
    } else {
        host.setPostEffectOffsetShadowColor(0.29, 0.21, 0.16);
    }
    host.postEffectOffsetShadowDebugView = typeof data.effects.offsetShadowDebugView === "boolean"
        ? data.effects.offsetShadowDebugView
        : false;
    host.postEffectOffsetShadowEnabled = typeof data.effects.offsetShadowEnabled === "boolean"
        ? data.effects.offsetShadowEnabled
        : false;
    host.postEffectOffsetHighlightStrength = readFiniteNumber(data.effects.offsetHighlightStrength, 1);
    host.postEffectOffsetHighlightOffsetX = readFiniteNumber(data.effects.offsetHighlightOffsetX, 0);
    host.postEffectOffsetHighlightOffsetY = readFiniteNumber(data.effects.offsetHighlightOffsetY, -100);
    host.postEffectOffsetHighlightDepthThreshold = readFiniteNumber(data.effects.offsetHighlightDepthThreshold, 0.1);
    host.postEffectOffsetHighlightNormalThreshold = readFiniteNumber(data.effects.offsetHighlightNormalThreshold, 0);
    host.postEffectOffsetHighlightThickness = readFiniteNumber(data.effects.offsetHighlightThickness, 1);
    host.postEffectOffsetHighlightSoftness = readFiniteNumber(data.effects.offsetHighlightSoftness, 0);
    host.postEffectOffsetHighlightDepthScale = readFiniteNumber(data.effects.offsetHighlightDepthScale, 1);
    if (data.effects.offsetHighlightColor &&
        Number.isFinite(data.effects.offsetHighlightColor.r) &&
        Number.isFinite(data.effects.offsetHighlightColor.g) &&
        Number.isFinite(data.effects.offsetHighlightColor.b)) {
        host.setPostEffectOffsetHighlightColor(
            data.effects.offsetHighlightColor.r,
            data.effects.offsetHighlightColor.g,
            data.effects.offsetHighlightColor.b,
        );
    } else {
        host.setPostEffectOffsetHighlightColor(1, 1, 1);
    }
    host.postEffectOffsetHighlightDebugView = typeof data.effects.offsetHighlightDebugView === "boolean"
        ? data.effects.offsetHighlightDebugView
        : false;
    host.postEffectOffsetHighlightEnabled = typeof data.effects.offsetHighlightEnabled === "boolean"
        ? data.effects.offsetHighlightEnabled
        : false;
    host.postEffectColorCurvesEnabled = typeof data.effects.colorCurvesEnabled === "boolean"
        ? data.effects.colorCurvesEnabled
        : false;
    host.postEffectColorCurvesHue = typeof data.effects.colorCurvesHue === "number" && Number.isFinite(data.effects.colorCurvesHue)
        ? data.effects.colorCurvesHue
        : 30;
    host.postEffectColorCurvesDensity = typeof data.effects.colorCurvesDensity === "number" && Number.isFinite(data.effects.colorCurvesDensity)
        ? data.effects.colorCurvesDensity
        : 0;
    host.postEffectColorCurvesSaturation = typeof data.effects.colorCurvesSaturation === "number" && Number.isFinite(data.effects.colorCurvesSaturation)
        ? data.effects.colorCurvesSaturation
        : 0;
    host.postEffectColorCurvesExposure = typeof data.effects.colorCurvesExposure === "number" && Number.isFinite(data.effects.colorCurvesExposure)
        ? data.effects.colorCurvesExposure
        : 0;
    host.postEffectGlowEnabled = typeof data.effects.glowEnabled === "boolean"
        ? data.effects.glowEnabled
        : false;
    host.postEffectGlowIntensity = typeof data.effects.glowIntensity === "number" && Number.isFinite(data.effects.glowIntensity)
        ? data.effects.glowIntensity
        : 0.5;
    host.postEffectGlowThreshold = typeof data.effects.glowThreshold === "number" && Number.isFinite(data.effects.glowThreshold)
        ? data.effects.glowThreshold
        : 0.5;
    host.postEffectGlowKernel = typeof data.effects.glowKernel === "number" && Number.isFinite(data.effects.glowKernel)
        ? data.effects.glowKernel
        : 20;
    host.postEffectGlowGlareCount = typeof data.effects.glowGlareCount === "number" && Number.isFinite(data.effects.glowGlareCount)
        ? data.effects.glowGlareCount
        : 0;
    host.postEffectGlowGlareLength = typeof data.effects.glowGlareLength === "number" && Number.isFinite(data.effects.glowGlareLength)
        ? data.effects.glowGlareLength
        : 48;
    host.postEffectGlowGlareAngle = typeof data.effects.glowGlareAngle === "number" && Number.isFinite(data.effects.glowGlareAngle)
        ? data.effects.glowGlareAngle
        : 0;
    host.postEffectGlowGlarePower = typeof data.effects.glowGlarePower === "number" && Number.isFinite(data.effects.glowGlarePower)
        ? data.effects.glowGlarePower
        : 0.4;
    host.postEffectLutPreset = typeof data.effects.lutPreset === "string"
        ? data.effects.lutPreset
        : host.postEffectLutPreset;
    host.postEffectLutSourceMode = typeof data.effects.lutSourceMode === "string"
        ? data.effects.lutSourceMode
        : host.postEffectLutSourceMode;
    host.setPostEffectExternalLut(
        typeof data.effects.lutExternalPath === "string" ? data.effects.lutExternalPath : null,
        null,
        null,
    );
    host.postEffectLutIntensity = typeof data.effects.lutIntensity === "number" && Number.isFinite(data.effects.lutIntensity)
        ? data.effects.lutIntensity
        : 1;
    host.postEffectLutEnabled = typeof data.effects.lutEnabled === "boolean"
        ? data.effects.lutEnabled
        : false;
    host.setExternalWgslToonShader(
        typeof data.effects.wgslToonShaderPath === "string" ? data.effects.wgslToonShaderPath : null,
        null,
    );
    host.postEffectMotionBlurEnabled = typeof data.effects.motionBlurEnabled === "boolean"
        ? data.effects.motionBlurEnabled
        : false;
    host.postEffectMotionBlurStrength = typeof data.effects.motionBlurStrength === "number" && Number.isFinite(data.effects.motionBlurStrength)
        ? data.effects.motionBlurStrength
        : 0.35;
    host.postEffectMotionBlurSamples = typeof data.effects.motionBlurSamples === "number" && Number.isFinite(data.effects.motionBlurSamples)
        ? data.effects.motionBlurSamples
        : 8;
    host.postEffectSsrEnabled = typeof data.effects.ssrEnabled === "boolean"
        ? data.effects.ssrEnabled
        : false;
    host.postEffectSsrStrength = typeof data.effects.ssrStrength === "number" && Number.isFinite(data.effects.ssrStrength)
        ? data.effects.ssrStrength
        : 0.3;
    host.postEffectSsrStep = typeof data.effects.ssrStep === "number" && Number.isFinite(data.effects.ssrStep)
        ? data.effects.ssrStep
        : 4;
    host.postEffectSsgiStrength = Math.max(0, Math.min(
        1,
        readFiniteNumber(data.effects.ssgiStrength, 0.3),
    ));
    host.postEffectSsgiSampleRadius = Math.max(1, Math.min(
        256,
        readFiniteNumber(data.effects.ssgiSampleRadius, 64),
    ));
    host.postEffectSsgiBlendMode = "softLight";
    host.postEffectOceanWaterHeight = Math.max(-20, Math.min(
        40,
        readFiniteNumber(data.effects.oceanWaterHeight, 8),
    ));
    host.postEffectOceanWaveStrength = Math.max(0, Math.min(
        2,
        readFiniteNumber(data.effects.oceanWaveStrength, 0.7),
    ));
    host.postEffectOceanClarity = Math.max(0, Math.min(
        4,
        readFiniteNumber(data.effects.oceanClarity, 0.85),
    ));
    host.postEffectOceanCausticsStrength = Math.max(0, Math.min(
        2,
        readFiniteNumber(data.effects.oceanCausticsStrength, 1.1),
    ));
    host.postEffectOceanVolumeStrength = Math.max(0, Math.min(
        2,
        readFiniteNumber(data.effects.oceanVolumeStrength, 0.65),
    ));
    host.postEffectAerialPerspectiveStrength = Math.max(0, Math.min(
        0.6,
        readFiniteNumber(data.effects.aerialPerspectiveStrength, 0.18),
    ));
    host.postEffectAerialPerspectiveStart = Math.max(0, Math.min(
        2000,
        readFiniteNumber(data.effects.aerialPerspectiveStart, 55),
    ));
    host.postEffectAerialPerspectiveRange = Math.max(1, Math.min(
        4000,
        readFiniteNumber(data.effects.aerialPerspectiveRange, 180),
    ));
    const aerialColor = data.effects.aerialPerspectiveColor;
    host.setPostEffectAerialPerspectiveColor(
        readFiniteNumber(aerialColor?.r, 0.72),
        readFiniteNumber(aerialColor?.g, 0.79),
        readFiniteNumber(aerialColor?.b, 0.83),
    );
    host.postEffectDirectionalLightShaftsStrength = Math.max(0, Math.min(
        0.16,
        readFiniteNumber(data.effects.directionalLightShaftsStrength, 0.08),
    ));
    host.postEffectDirectionalLightShaftsPhaseG = Math.max(-0.9, Math.min(
        0.9,
        readFiniteNumber(data.effects.directionalLightShaftsPhaseG, 0),
    ));
    const paraLightColor = data.effects.directionalLightShaftsLightColor;
    host.setPostEffectDirectionalLightShaftsLightColor(
        readFiniteNumber(paraLightColor?.r, 1),
        readFiniteNumber(paraLightColor?.g, 1),
        readFiniteNumber(paraLightColor?.b, 1),
    );
    const paraShadowColor = data.effects.directionalLightShaftsShadowColor;
    host.setPostEffectDirectionalLightShaftsShadowColor(
        readFiniteNumber(paraShadowColor?.r, 0),
        readFiniteNumber(paraShadowColor?.g, 0),
        readFiniteNumber(paraShadowColor?.b, 0),
    );
    host.postEffectVlsEnabled = typeof data.effects.vlsEnabled === "boolean"
        ? data.effects.vlsEnabled
        : false;
    host.postEffectVlsExposure = typeof data.effects.vlsExposure === "number" && Number.isFinite(data.effects.vlsExposure)
        ? data.effects.vlsExposure
        : 0.18;
    host.postEffectVlsDecay = typeof data.effects.vlsDecay === "number" && Number.isFinite(data.effects.vlsDecay)
        ? data.effects.vlsDecay
        : 0.95;
    host.postEffectVlsWeight = typeof data.effects.vlsWeight === "number" && Number.isFinite(data.effects.vlsWeight)
        ? data.effects.vlsWeight
        : 0.2;
    host.postEffectVlsDensity = typeof data.effects.vlsDensity === "number" && Number.isFinite(data.effects.vlsDensity)
        ? data.effects.vlsDensity
        : 0.8;
    host.postEffectFogEnabled = typeof data.effects.fogEnabled === "boolean"
        ? data.effects.fogEnabled
        : false;
    host.postEffectFogMode = typeof data.effects.fogMode === "number" && Number.isFinite(data.effects.fogMode)
        ? data.effects.fogMode
        : 0;
    host.postEffectFogStart = typeof data.effects.fogStart === "number" && Number.isFinite(data.effects.fogStart)
        ? data.effects.fogStart
        : 100;
    host.postEffectFogEnd = typeof data.effects.fogEnd === "number" && Number.isFinite(data.effects.fogEnd)
        ? data.effects.fogEnd
        : 300;
    host.postEffectFogDensity = typeof data.effects.fogDensity === "number" && Number.isFinite(data.effects.fogDensity)
        ? data.effects.fogDensity
        : 0.01;
    host.postEffectFogOpacity = typeof data.effects.fogOpacity === "number" && Number.isFinite(data.effects.fogOpacity)
        ? data.effects.fogOpacity
        : 1;
    if (data.effects.fogColor &&
        Number.isFinite(data.effects.fogColor.r) &&
        Number.isFinite(data.effects.fogColor.g) &&
        Number.isFinite(data.effects.fogColor.b)) {
        host.setPostEffectFogColor(data.effects.fogColor.r, data.effects.fogColor.g, data.effects.fogColor.b);
    }
    const ringParticles = data.effects.ringParticles;
    host.setRingParticleSettings?.({
        enabled: typeof ringParticles?.enabled === "boolean" ? ringParticles.enabled : false,
        count: readFiniteNumber(ringParticles?.count, 180),
        density: readFiniteNumber(ringParticles?.density, 32.5),
        size: readFiniteNumber(ringParticles?.size, 0.335),
        speed: readFiniteNumber(ringParticles?.speed, 0.05),
        intensity: readFiniteNumber(ringParticles?.intensity, 4),
        colorA: {
            r: readFiniteNumber(ringParticles?.colorA?.r, 0),
            g: readFiniteNumber(ringParticles?.colorA?.g, 0.8),
            b: readFiniteNumber(ringParticles?.colorA?.b, 0.8),
        },
        colorB: {
            r: readFiniteNumber(ringParticles?.colorB?.r, 1),
            g: readFiniteNumber(ringParticles?.colorB?.g, 1),
            b: readFiniteNumber(ringParticles?.colorB?.b, 1),
        },
    });
    if (Array.isArray(data.effects.frameGraphPostStack) || ringParticles?.enabled) {
        const stackEntries = normalizeFrameGraphPostEffectStack(data.effects.frameGraphPostStack ?? []);
        if (ringParticles?.enabled && !stackEntries.some((entry) => entry.id === "ringParticles")) {
            stackEntries.push({ id: "ringParticles", enabled: true });
        }
        if (
            gammaEncodingVersion === 2
            && Math.abs(host.postEffectGamma - 1) > 0.000001
            && !stackEntries.some((entry) => entry.id === "gamma")
        ) {
            const enabledById = new Map(stackEntries.map((entry) => [entry.id, entry.enabled]));
            const migratedIds = addFrameGraphPostEffectId(
                stackEntries.map((entry) => entry.id),
                "gamma",
            );
            stackEntries.splice(0, stackEntries.length, ...migratedIds.map((id) => ({
                id,
                enabled: id === "gamma" ? true : (enabledById.get(id) ?? false),
            })));
        }
        if (host.setFrameGraphPostEffectStackEntries) {
            host.setFrameGraphPostEffectStackEntries(stackEntries);
        } else {
            host.setFrameGraphPostEffectStackIds?.(stackEntries.map((entry) => entry.id));
        }
    }

    host.refreshTotalFramesFromContent();
    host.setRenderFpsLimit(host.renderFpsLimit);
    host.seekTo(Math.max(0, Math.floor(data.scene.currentFrame ?? 0)));
    host.setPlaybackSpeed(Math.max(0.01, data.scene.playbackSpeed));
    host.setTimelineTarget(data.scene.timelineTarget === "camera" ? "camera" : "model");
    finalizeImportedRenderState(host, data, warnings);

    return { loadedModels, warnings };
}

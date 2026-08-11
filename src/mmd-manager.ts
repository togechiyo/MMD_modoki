import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebGPUTintWASM } from "@babylonjs/core/Engines/WebGPU/webgpuTintWASM";
import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { Matrix, Quaternion, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Layer } from "@babylonjs/core/Layers/layer";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { BackgroundMaterial } from "@babylonjs/core/Materials/Background/backgroundMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { RawCubeTexture } from "@babylonjs/core/Materials/Textures/rawCubeTexture";
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";
import { ColorGradingTexture } from "@babylonjs/core/Materials/Textures/colorGradingTexture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { PassPostProcess } from "@babylonjs/core/PostProcesses/passPostProcess";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { BloomEffect } from "@babylonjs/core/PostProcesses/bloomEffect";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { LensRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/lensRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { SSRRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline";
import { IblShadowsRenderPipeline } from "@babylonjs/core/Rendering/IBLShadows/iblShadowsRenderPipeline";
import { VolumetricLightScatteringPostProcess } from "@babylonjs/core/PostProcesses/volumetricLightScatteringPostProcess";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { PerfCounter } from "@babylonjs/core/Misc/perfCounter";
import type { SmartArray } from "@babylonjs/core/Misc/smartArray";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type {
    BoneControlInfo,
    MmdModokiProjectFileV1,
    ModelInfo,
    MotionInfo,
    ProjectMotionImport,
    ProjectNumberArray,
    ProjectPackedArray,
    ProjectCameraState,
    ProjectSerializedCameraExternalParentTrack,
    ProjectSerializedModelExternalParentTrack,
    ProjectModelMaterialShaderState,
    KeyframeTrack,
    MirroringFloorShape,
    SsgiBlendMode,
    WebmInitialPhysicsState,
} from "./types";
import type { IMmdBindableCameraAnimation } from "babylon-mmd/esm/Runtime/Animation/IMmdBindableAnimation";
import type { IMmdRuntimeBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeBone";
import { exportProjectState as exportProjectStateImpl } from "./project/project-serializer";
import { importProjectState as importProjectStateImpl } from "./project/project-importer";
import {
    colorToHex,
    DEFAULT_SKYDOME_BACKGROUND_STYLE,
    normalizeSkydomeBackgroundStyle,
    type SkydomeBackgroundStyle,
} from "./shared/skydome-background-style";
import {
    DEFAULT_MMD_MATERIAL_PIPELINE_PRESET,
    normalizeMmdMaterialPipelinePreset,
    normalizePbrMaterialShaderPreset,
    resolveNextImportMaterialPipelinePreset,
    type MmdMaterialPipelinePreset,
    type PbrMaterialShaderPreset,
} from "./shared/mmd-material-pipeline";
import {
    selectModelExternalParentKeyframeAtFrame,
    wouldCreateModelExternalParentCycle,
    type ModelExternalParentKeyframePayload,
} from "./shared/model-external-parent";
import {
    moveCameraExternalParentKeyframe,
    normalizeCameraExternalParentPayload,
    removeCameraExternalParentKeyframes,
    selectCameraExternalParentKeyframeAtFrame,
    transformCameraExternalParentVectorsToRef,
    upsertCameraExternalParentKeyframe,
    type CameraExternalParentKeyframeLike,
} from "./shared/camera-external-parent";
import {
    loadCameraVMD as loadCameraVMDImpl,
    loadMP3 as loadMP3Impl,
    loadVMD as loadVMDImpl,
    loadVPD as loadVPDImpl,
} from "./assets/motion-asset-service";
import { isDebugLogEnabled, logDebugIfEnabled, logInfo, logWarn, toLogErrorData } from "./app-logger";
import { loadPMX as loadPMXImpl } from "./assets/model-asset-service";
import {
    applyPbrMaterialShaderPreset,
    getPbrSkinSssRelativeRadius,
    PBR_SKIN_SSS_DEBUG_VISUALIZATION,
    PBR_SKIN_SSS_DIFFUSION_PROFILE_RGB,
    PBR_SKIN_SSS_METERS_PER_UNIT,
} from "./render/pbr-mmd-like-toon-settings";
import {
    getStandardMaterialSssPrePassPatchDiagnostics,
} from "./render/standard-material-sss-prepass-fix";
import {
    getPbrMaterialSssPrePassMaskPatchDiagnostics,
    PBR_MATERIAL_SSS_SCATTERING_BLEND_STRENGTH,
} from "./render/pbr-material-sss-prepass-mask-fix";
import {
    installSdefUniformBoneWgslEngineFix,
    installSdefUniformBoneWgslFix,
} from "./render/sdef-uniform-bone-wgsl-fix";
import {
    buildSubSurfaceCompositionDefines,
    resolveSubSurfaceFrameGraphPolicy,
} from "./render/subsurface-frame-graph-policy";
import {
    applyImportedMaterialShaderStates as applyImportedMaterialShaderStatesImpl,
    getExternalWgslToonShaderPath as getExternalWgslToonShaderPathImpl,
    getExternalWgslToonShaderPathForMaterial as getExternalWgslToonShaderPathForMaterialImpl,
    getSerializedMaterialShaderStates as getSerializedMaterialShaderStatesImpl,
    getWgslMaterialShaderPresetForMaterial as getWgslMaterialShaderPresetForMaterialImpl,
    getWgslMaterialShaderPresets as getWgslMaterialShaderPresetsImpl,
    getWgslModelShaderStates as getWgslModelShaderStatesImpl,
    getFrameGraphLuminousMaskMaterialState as getFrameGraphLuminousMaskMaterialStateImpl,
    hasExternalWgslToonShader as hasExternalWgslToonShaderImpl,
    isWgslMaterialShaderAssignmentAvailable as isWgslMaterialShaderAssignmentAvailableImpl,
    ensureMaterialShaderDefaults as ensureMaterialShaderDefaultsImpl,
    applyWgslAlphaTextureDebugToMaterials as applyWgslAlphaTextureDebugToMaterialsImpl,
    setExternalWgslToonShader as setExternalWgslToonShaderImpl,
    setExternalWgslToonShaderForModel as setExternalWgslToonShaderForModelImpl,
    setWgslMaterialShaderPreset as setWgslMaterialShaderPresetImpl,
    syncLuminousGlowLayer as syncLuminousGlowLayerImpl,
} from "./scene/material-shader-service";
import {
    getAntialiasEnabled as getAntialiasEnabledImpl,
    getDofAutoFocusEnabled as getDofAutoFocusEnabledImpl,
    getDofAutoFocusNearOffsetMm as getDofAutoFocusNearOffsetMmImpl,
    getDofAutoFocusRangeMeters as getDofAutoFocusRangeMetersImpl,
    getDofBlurLevel as getDofBlurLevelImpl,
    getDofEffectiveFStop as getDofEffectiveFStopImpl,
    getDofEnabled as getDofEnabledImpl,
    getDofFocalLength as getDofFocalLengthImpl,
    getDofFocalLengthDistanceInverted as getDofFocalLengthDistanceInvertedImpl,
    getDofFocalLengthLinkedToCameraDistance as getDofFocalLengthLinkedToCameraDistanceImpl,
    getDofFocalLengthLinkedToCameraFov as getDofFocalLengthLinkedToCameraFovImpl,
    getDofFStop as getDofFStopImpl,
    getDofFocusDistanceMm as getDofFocusDistanceMmImpl,
    getDofLensBlurEnabled as getDofLensBlurEnabledImpl,
    getDofLensBlurStrength as getDofLensBlurStrengthImpl,
    getDofLensDistortion as getDofLensDistortionImpl,
    getDofLensDistortionInfluence as getDofLensDistortionInfluenceImpl,
    getDofLensDistortionLinkedToCameraFov as getDofLensDistortionLinkedToCameraFovImpl,
    getDofLensEdgeBlur as getDofLensEdgeBlurImpl,
    getDofLensSize as getDofLensSizeImpl,
    getDofNearSuppressionScale as getDofNearSuppressionScaleImpl,
    getPostEffectFarDofStrength as getPostEffectFarDofStrengthImpl,
    getPostEffectFogColor as getPostEffectFogColorImpl,
    getPostEffectFogDensity as getPostEffectFogDensityImpl,
    getPostEffectFogEnabled as getPostEffectFogEnabledImpl,
    getPostEffectFogEnd as getPostEffectFogEndImpl,
    getPostEffectFogMode as getPostEffectFogModeImpl,
    getPostEffectFogOpacity as getPostEffectFogOpacityImpl,
    getPostEffectFogStart as getPostEffectFogStartImpl,
    getPostEffectLutPresetOptions as getPostEffectLutPresetOptionsImpl,
    getPostEffectMotionBlurEnabled as getPostEffectMotionBlurEnabledImpl,
    getPostEffectMotionBlurSamples as getPostEffectMotionBlurSamplesImpl,
    getPostEffectMotionBlurStrength as getPostEffectMotionBlurStrengthImpl,
    getPostEffectSsrEnabled as getPostEffectSsrEnabledImpl,
    getPostEffectSsrStep as getPostEffectSsrStepImpl,
    getPostEffectSsrStrength as getPostEffectSsrStrengthImpl,
    getPostEffectVlsDecay as getPostEffectVlsDecayImpl,
    getPostEffectVlsDensity as getPostEffectVlsDensityImpl,
    getPostEffectVlsEnabled as getPostEffectVlsEnabledImpl,
    getPostEffectVlsExposure as getPostEffectVlsExposureImpl,
    getPostEffectVlsWeight as getPostEffectVlsWeightImpl,
    setAntialiasEnabled as setAntialiasEnabledImpl,
    setDofAutoFocusNearOffsetMm as setDofAutoFocusNearOffsetMmImpl,
    setDofBlurLevel as setDofBlurLevelImpl,
    setDofEnabled as setDofEnabledImpl,
    setDofFocalLength as setDofFocalLengthImpl,
    setDofFocalLengthDistanceInverted as setDofFocalLengthDistanceInvertedImpl,
    setDofFStop as setDofFStopImpl,
    setDofFocusDistanceMm as setDofFocusDistanceMmImpl,
    setDofLensBlurEnabled as setDofLensBlurEnabledImpl,
    setDofLensBlurStrength as setDofLensBlurStrengthImpl,
    setDofLensDistortion as setDofLensDistortionImpl,
    setDofLensDistortionInfluence as setDofLensDistortionInfluenceImpl,
    setDofLensEdgeBlur as setDofLensEdgeBlurImpl,
    setDofLensSize as setDofLensSizeImpl,
    setDofNearSuppressionScale as setDofNearSuppressionScaleImpl,
    setPostEffectExternalLut as setPostEffectExternalLutImpl,
    setPostEffectFarDofStrength as setPostEffectFarDofStrengthImpl,
    setPostEffectFogColor as setPostEffectFogColorImpl,
    setPostEffectFogDensity as setPostEffectFogDensityImpl,
    setPostEffectFogEnabled as setPostEffectFogEnabledImpl,
    setPostEffectFogEnd as setPostEffectFogEndImpl,
    setPostEffectFogMode as setPostEffectFogModeImpl,
    setPostEffectFogOpacity as setPostEffectFogOpacityImpl,
    setPostEffectFogStart as setPostEffectFogStartImpl,
    setPostEffectMotionBlurEnabled as setPostEffectMotionBlurEnabledImpl,
    setPostEffectMotionBlurSamples as setPostEffectMotionBlurSamplesImpl,
    setPostEffectMotionBlurStrength as setPostEffectMotionBlurStrengthImpl,
    setPostEffectSsrEnabled as setPostEffectSsrEnabledImpl,
    setPostEffectSsrStep as setPostEffectSsrStepImpl,
    setPostEffectSsrStrength as setPostEffectSsrStrengthImpl,
    setPostEffectVlsDecay as setPostEffectVlsDecayImpl,
    setPostEffectVlsDensity as setPostEffectVlsDensityImpl,
    setPostEffectVlsEnabled as setPostEffectVlsEnabledImpl,
    setPostEffectVlsExposure as setPostEffectVlsExposureImpl,
    setPostEffectVlsWeight as setPostEffectVlsWeightImpl,
} from "./render/effects-pipeline-controller";
import {
    applyAntialiasSettings as applyAntialiasSettingsImpl,
    applyDefaultPipelinePostProcessSettings as applyDefaultPipelinePostProcessSettingsImpl,
    applyDofLensBlurSettings as applyDofLensBlurSettingsImpl,
    applyDofLensOpticsSettings as applyDofLensOpticsSettingsImpl,
    applyEditorDofSettings as applyEditorDofSettingsImpl,
    applyFogSettings as applyFogSettingsImpl,
    applyImageProcessingSettings as applyImageProcessingSettingsImpl,
    applyMotionBlurSettings as applyMotionBlurSettingsImpl,
    applyLutSettings as applyLutSettingsImpl,
    applySsrSettings as applySsrSettingsImpl,
    applyVolumetricLightSettings as applyVolumetricLightSettingsImpl,
    computeAdjustedAutoMinFStop as computeAdjustedAutoMinFStopImpl,
    computeAutoFocusMinFStop as computeAutoFocusMinFStopImpl,
    configureDofDepthRenderer as configureDofDepthRendererImpl,
    enforceFinalPostProcessOrder as enforceFinalPostProcessOrderImpl,
    getOrCreateExternalLutBlobUrl as getOrCreateExternalLutBlobUrlImpl,
    getOrCreateLutPresetBlobUrl as getOrCreateLutPresetBlobUrlImpl,
    isImageProcessingEffectsEnabled as isImageProcessingEffectsEnabledImpl,
    isLutSourceReady as isLutSourceReadyImpl,
    setupFarDofPostProcess as setupFarDofPostProcessImpl,
    setupFinalLensDistortionPostProcess as setupFinalLensDistortionPostProcessImpl,
    setupLensHighlightsPipeline as setupLensHighlightsPipelineImpl,
    setupOriginFogPostProcess as setupOriginFogPostProcessImpl,
    updateDofFocalLengthFromCameraFov as updateDofFocalLengthFromCameraFovImpl,
    updateDofLensDistortionFromCameraFov as updateDofLensDistortionFromCameraFovImpl,
    updateEditorDofFocusAndFStop as updateEditorDofFocusAndFStopImpl,
    updateSimpleMotionBlurState as updateSimpleMotionBlurStateImpl,
} from "./render/post-process-controller";
import {
    applySsaoSettings as applySsaoSettingsImpl,
    configureSsaoDepthRenderer as configureSsaoDepthRendererImpl,
    disposeSsaoDepthRenderer as disposeSsaoDepthRendererImpl,
    ensureSsaoFallbackPostProcess as ensureSsaoFallbackPostProcessImpl,
    getSsaoPostProcessScale as getSsaoPostProcessScaleImpl,
    shouldUseToonTintedSsaoComposite as shouldUseToonTintedSsaoCompositeImpl,
    syncShaderContactAoState as syncShaderContactAoStateImpl,
} from "./render/ssao-controller";
import { ensureSimpleSsaoShader as ensureSimpleSsaoShaderImpl } from "./render/ssao-shader";
import {
    normalizePerformanceLogMode,
    PerformanceProfiler,
} from "./diagnostics/performance-profiler";
import {
    POST_EFFECT_BACKEND_STORAGE_KEY,
    readPostEffectBackendLocalStorage,
    type PostEffectBackend,
} from "./render/post-effect-backend";
import {
    FrameGraphPostEffectsController,
    type FrameGraphPostEffectsSettings,
} from "./render/frame-graph-post-effects-controller";
import {
    ExportRenderSurface,
    type ExportRenderSurfaceDiagnostics,
    type RenderedExportFrame,
} from "./render/export-render-surface";
import { buildFrameGraphResourcePlan } from "./render/frame-graph-resource-plan";
import {
    addFrameGraphPostEffectId,
    FRAME_GRAPH_POST_EFFECT_IDS,
    normalizeFrameGraphPostEffectIds,
    type FrameGraphPostEffectId,
    type FrameGraphPostEffectStackEntry,
} from "./shared/frame-graph-post-effect-stack";
import {
    MAX_DIRECTIONAL_LIGHT_INTENSITY,
    applyLightColorTemperature as applyLightColorTemperatureImpl,
    applyShadowEdgeSoftness as applyShadowEdgeSoftnessImpl,
    applyShadowFrustumSize as applyShadowFrustumSizeImpl,
    applyToonShadowInfluenceToAllModels as applyToonShadowInfluenceToAllModelsImpl,
    applyToonShadowInfluenceToMeshes as applyToonShadowInfluenceToMeshesImpl,
    getLightColor as getLightColorImpl,
    getLightDirection as getLightDirectionImpl,
    getSerializedLightDirection as getSerializedLightDirectionImpl,
    getShadowColor as getShadowColorImpl,
    getShadowEnabled as getShadowEnabledImpl,
    getShadowBias as getShadowBiasImpl,
    getShadowBlurBoxOffset as getShadowBlurBoxOffsetImpl,
    getShadowBlurKernel as getShadowBlurKernelImpl,
    getShadowBlurScale as getShadowBlurScaleImpl,
    getShadowMaxZ as getShadowMaxZImpl,
    getShadowNormalBias as getShadowNormalBiasImpl,
    getShadowPenumbraEnabled as getShadowPenumbraEnabledImpl,
    getShadowPenumbraSize as getShadowPenumbraSizeImpl,
    getTransparentShadowEnabled as getTransparentShadowEnabledImpl,
    setLightColor as setLightColorImpl,
    setLightDirection as setLightDirectionImpl,
    setLightIntensity as setLightIntensityImpl,
    setShadowColor as setShadowColorImpl,
    setShadowEnabled as setShadowEnabledImpl,
    setShadowBias as setShadowBiasImpl,
    setShadowBlurBoxOffset as setShadowBlurBoxOffsetImpl,
    setShadowBlurKernel as setShadowBlurKernelImpl,
    setShadowBlurScale as setShadowBlurScaleImpl,
    setShadowMaxZ as setShadowMaxZImpl,
    setShadowNormalBias as setShadowNormalBiasImpl,
    setShadowPenumbraEnabled as setShadowPenumbraEnabledImpl,
    setShadowPenumbraSize as setShadowPenumbraSizeImpl,
    setTransparentShadowEnabled as setTransparentShadowEnabledImpl,
} from "./scene/light-shadow-controller";
import {
    readExistingSubMeshEffectReadiness,
    refreshMeshBoundingInfoForRenderStability,
    stabilizeAppGeneratedPlanarMesh,
} from "./scene/mesh-render-stability";
import {
    decodeDdsTextureToRgba,
    isDdsTexturePath,
    shouldSkipDdsTextureForWebGpu,
} from "./scene/dds-texture-compat";
import {
    decodeBmpTextureToRgba,
    isBmpTexturePath,
} from "./scene/bmp-texture-compat";
import { GlobalIlluminationController } from "./render/global-illumination-controller";
import {
    applyEnvironmentLightingIntensity,
    calculateEnvironmentTextureLevel,
    combineEnvironmentLightingAndIlluminance,
    createConstantEnvironmentSphericalPolynomial,
    runEnvironmentLightingDiagnosticProbe,
    type EnvironmentLightingIntensityResult,
} from "./render/environment-lighting";
import {
    addTimelineKeyframe as addTimelineKeyframeImpl,
    applyTimelineKeyframePayload as applyTimelineKeyframePayloadImpl,
    beginTimelineEditBatch as beginTimelineEditBatchImpl,
    buildModelTrackFrameMapFromAnimation as buildModelTrackFrameMapFromAnimationImpl,
    addInfoKeyframe as addInfoKeyframeImpl,
    emitMergedKeyframeTracks as emitMergedKeyframeTracksImpl,
    endTimelineEditBatch as endTimelineEditBatchImpl,
    createOffsetModelAnimation as createOffsetModelAnimationImpl,
    ensureCameraAnimationForEditing as ensureCameraAnimationForEditingImpl,
    ensureModelAnimationForEditing as ensureModelAnimationForEditingImpl,
    getActiveModelTimelineTracks as getActiveModelTimelineTracksImpl,
    getCameraTimelineTracks as getCameraTimelineTracksImpl,
    getOrCreateModelTrackFrameMap as getOrCreateModelTrackFrameMapImpl,
    getRegisteredKeyframeStats as getRegisteredKeyframeStatsImpl,
    hasInfoKeyframe as hasInfoKeyframeImpl,
    hasTimelineKeyframe as hasTimelineKeyframeImpl,
    moveTimelineKeyframe as moveTimelineKeyframeImpl,
    mergeModelAnimations as mergeModelAnimationsImpl,
    readTimelineKeyframePayload as readTimelineKeyframePayloadImpl,
    refreshTotalFramesFromContent as refreshTotalFramesFromContentImpl,
    removeTimelineKeyframe as removeTimelineKeyframeImpl,
    removeTimelineKeyframePayloads as removeTimelineKeyframePayloadsImpl,
    type TimelineKeyframePayload,
} from "./editor/timeline-edit-service";
import {
    buildMmdAnimationFromEditorMotion,
    createEditorModelMotionFromMmdAnimation,
    resolveBoneTrackKind,
} from "./editor/mmd-animation-builder";
import { getPhysicsOffBoneNamesAtFrame } from "./editor/physics-bone-visibility";
import { upsertBoneKey, type EditorBoneTrackKind } from "./editor/motion-document";
import { bindModelAnimationToRuntime } from "./editor/runtime-animation-binder";
import {
    disposeBoneGizmoSystem as disposeBoneGizmoSystemImpl,
    handleBoneGizmoBeforeRender as handleBoneGizmoBeforeRenderImpl,
    initializeBoneGizmoSystem as initializeBoneGizmoSystemImpl,
    resetBoneGizmoInteraction as resetBoneGizmoInteractionImpl,
    updateBoneGizmoTarget as updateBoneGizmoTargetImpl,
} from "./editor/bone-gizmo-controller";
import {
    clearBoneOverlay as clearBoneOverlayImpl,
    disposeBoneVisualizer as disposeBoneVisualizerImpl,
    ensureBoneOverlayCanvas as ensureBoneOverlayCanvasImpl,
    getBoneWorldPositionToRef as getBoneWorldPositionToRefImpl,
    refreshBoneVisualizerTarget as refreshBoneVisualizerTargetImpl,
    syncBoneVisualizerVisibility as syncBoneVisualizerVisibilityImpl,
    resizeBoneOverlayCanvas as resizeBoneOverlayCanvasImpl,
    tryPickBoneVisualizerAtClientPosition as tryPickBoneVisualizerAtClientPositionImpl,
    updateBoneVisualizer as updateBoneVisualizerImpl,
} from "./editor/bone-visualizer-controller";
import {
    disposeRigidBodyVisualizer as disposeRigidBodyVisualizerImpl,
    refreshRigidBodyVisualizerTarget as refreshRigidBodyVisualizerTargetImpl,
    syncRigidBodyVisualizerVisibility as syncRigidBodyVisualizerVisibilityImpl,
    updateRigidBodyVisualizer as updateRigidBodyVisualizerImpl,
} from "./editor/rigid-body-visualizer-controller";
import {
    PhysicsRuntimeController,
    type PhysicsBackendLabel,
    type PhysicsEvaluationTypeLabel,
    type PreferredBulletPhysicsBackend,
    type PhysicsSimulationRateHz,
} from "./physics/physics-runtime-controller";
import {
    PhysicsModelController,
    type PhysicsJointDiagnosticEntry,
    type PhysicsRigidBodyDiagnosticEntry,
    type PhysicsRuntimeModel,
} from "./physics/physics-model-controller";
import { applyMmdOutlineTaperingShader } from "./render/mmd-outline-tuning";

type EditorRuntimeBone = IMmdRuntimeBone & {
    getAnimationPositionOffsetToRef?: (target: Vector3) => Vector3;
    getAnimatedRotationToRef?: (target: Quaternion) => Quaternion;
    getWorldMatrixToRef(target: Matrix): Matrix;
};

type RuntimeMode = "classic" | "wasm";
type RuntimeModel = PhysicsRuntimeModel;
type BoneKeyframePoseInput = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
};
type RuntimeMmdRuntime = MmdRuntime | MmdWasmRuntime;
type FramePerformanceSection =
    | "frameTotal"
    | "manualPlayback"
    | "motionBlur"
    | "backgroundVideo"
    | "sceneRender"
    | "sceneRenderCore"
    | "postEffectBackend"
    | "boneGizmoUtilityLayer"
    | "frameGraphSceneColorRenderTarget"
    | "frameGraphLuminousMaskRenderTarget"
    | "mmdBeforePhysics"
    | "mmdAfterPhysics"
    | "sceneAnimations"
    | "activeMeshesEvaluation"
    | "renderTargetsRender"
    | "cameraRender"
    | "drawPhase"
    | "cameraMotionToViewport"
    | "viewportCameraInput"
    | "cameraExternalParent"
    | "boneGizmo"
    | "boneVisualizer"
    | "rigidBodyVisualizer"
    | "characterContactShadow"
    | "editorDof"
    | "frameStateUpdate";

const FRAME_PERFORMANCE_SECTIONS: readonly FramePerformanceSection[] = [
    "frameTotal",
    "manualPlayback",
    "motionBlur",
    "backgroundVideo",
    "sceneRender",
    "sceneRenderCore",
    "postEffectBackend",
    "boneGizmoUtilityLayer",
    "frameGraphSceneColorRenderTarget",
    "frameGraphLuminousMaskRenderTarget",
    "mmdBeforePhysics",
    "mmdAfterPhysics",
    "sceneAnimations",
    "activeMeshesEvaluation",
    "renderTargetsRender",
    "cameraRender",
    "drawPhase",
    "cameraMotionToViewport",
    "viewportCameraInput",
    "cameraExternalParent",
    "boneGizmo",
    "boneVisualizer",
    "rigidBodyVisualizer",
    "characterContactShadow",
    "editorDof",
    "frameStateUpdate",
];

let bundledMprWasmInstancePromise: Promise<IMmdWasmInstance> | null = null;
let bundledSprWasmInstancePromise: Promise<IMmdWasmInstance> | null = null;
const DEFAULT_CSM_FRUSTUM_SIZE = 960;
const DEFAULT_CSM_CASCADE_COUNT = 3;
const DEFAULT_CSM_LAMBDA = 0.9;
const DEFAULT_CSM_CASCADE_BLEND = 0.1;
const DEFAULT_CSM_DEPTH_BOUNDS_REFRESH_RATE = 1;
const PCSS_CSM_LAMBDA = 0.6;
const PCSS_CSM_CASCADE_BLEND = 0.2;
const PCSS_CSM_LIGHT_SIZE_SCALE = 0.1;
const PCSS_CSM_MAX_LIGHT_SIZE_UV_RATIO = 0.02;
const PCSS_CSM_PENUMBRA_DARKNESS = 0.17;
const FRAME_GRAPH_LUMINOUS_MASK_EXPERIMENT_SCALE = 1.0;
const DEFAULT_CAMERA_MAX_Z = 10000;
const VIEWPORT_CAMERA_ROTATE_SENSIBILITY = 400;
const VIEWPORT_CAMERA_PAN_SCALE = 0.0022;
const VIEWPORT_CAMERA_DRAG_ZOOM_SCALE = 0.0075;
const VIEWPORT_CAMERA_WHEEL_ZOOM_EXPONENT = 0.00225;
const DOF_FOCUS_BONE_CANDIDATES = [
    "頭",
    "head",
    "Head",
    "首",
    "neck",
    "Neck",
    "上半身2",
    "upperbody2",
    "upper body2",
    "upperbody",
    "上半身",
    "センター",
    "center",
    "Center",
] as const;

function localPathToFileUrl(pathText: string): string {
    const normalized = pathText.replace(/\\/g, "/");
    const rawUrl = /^[A-Za-z]:\//.test(normalized)
        ? `file:///${normalized}`
        : `file://${normalized}`;
    return encodeURI(rawUrl);
}

const EMPTY_KEYFRAME_FRAMES = new Uint32Array(0);
const PMX_MATERIAL_FLAG_ENABLED_DRAW_SHADOW = 0x0004;
const PMX_MATERIAL_FLAG_ENABLED_RECEIVE_SHADOW = 0x0008;


function mergeFrameNumbers(a: Uint32Array, b: Uint32Array): Uint32Array {
    if (a.length === 0) return b;
    if (b.length === 0) return a;

    const merged = new Uint32Array(a.length + b.length);
    let i = 0;
    let j = 0;
    let k = 0;
    let last = -1;

    while (i < a.length || j < b.length) {
        const pickA = j >= b.length || (i < a.length && a[i] <= b[j]);
        const value = pickA ? a[i++] : b[j++];
        if (value === last) continue;
        merged[k++] = value;
        last = value;
    }

    return merged.subarray(0, k);
}

async function loadBundledSprWasmInstance(): Promise<IMmdWasmInstance> {
    if (bundledSprWasmInstancePromise) return bundledSprWasmInstancePromise;

    bundledSprWasmInstancePromise = (async () => {
        const initOutput = await sprWasmBindgen.default({ module_or_path: sprWasmBinaryUrl });
        sprWasmBindgen.init();

        const memory = initOutput.memory;
        const mmdWasmInstance = { ...sprWasmBindgen } as unknown as IMmdWasmInstance;
        mmdWasmInstance.memory = memory;
        mmdWasmInstance.createTypedArray = <T extends ArrayBufferView>(
            typedArrayConstructor: new (buffer: ArrayBufferLike, byteOffset: number, length: number) => T,
            byteOffset: number,
            length: number,
        ) => {
            if (memory.buffer instanceof ArrayBuffer) {
                return new WasmTypedArray(typedArrayConstructor, memory, byteOffset, length);
            }
            return new WasmSharedTypedArray(typedArrayConstructor, memory, byteOffset, length);
        };

        await mmdWasmInstance.initThreadPool?.(navigator.hardwareConcurrency);
        return mmdWasmInstance;
    })();

    return bundledSprWasmInstancePromise;
}

async function loadBundledMprWasmInstance(): Promise<IMmdWasmInstance> {
    if (bundledMprWasmInstancePromise) return bundledMprWasmInstancePromise;

    bundledMprWasmInstancePromise = (async () => {
        const importModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("babylon-mmd/esm/Runtime/Optimized/wasm/mpr")>;
        const mprWasmBindgen = await importModule("/node_modules/babylon-mmd/esm/Runtime/Optimized/wasm/mpr/index.js");
        const initOutput = await mprWasmBindgen.default({ module_or_path: mprWasmBinaryUrl });
        mprWasmBindgen.init();

        const memory = initOutput.memory;
        const mmdWasmInstance = { ...mprWasmBindgen } as unknown as IMmdWasmInstance;
        mmdWasmInstance.memory = memory;
        mmdWasmInstance.createTypedArray = <T extends ArrayBufferView>(
            typedArrayConstructor: new (buffer: ArrayBufferLike, byteOffset: number, length: number) => T,
            byteOffset: number,
            length: number,
        ) => {
            if (memory.buffer instanceof ArrayBuffer) {
                return new WasmTypedArray(typedArrayConstructor, memory, byteOffset, length);
            }
            return new WasmSharedTypedArray(typedArrayConstructor, memory, byteOffset, length);
        };

        await mmdWasmInstance.initThreadPool?.(navigator.hardwareConcurrency);
        return mmdWasmInstance;
    })();

    return bundledMprWasmInstancePromise;
}

// Side effects - register loaders
import "babylon-mmd/esm/Loader/pmxLoader";
import "babylon-mmd/esm/Loader/pmdLoader";
import "babylon-mmd/esm/Loader/mmdOutlineRenderer";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "babylon-mmd/esm/Runtime/Optimized/Animation/mmdWasmRuntimeModelAnimation";
import "@babylonjs/core/Materials/Textures/Loaders/tgaTextureLoader";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture";
import "@babylonjs/core/Engines/Extensions/engine.rawTexture";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.rawTexture";
import "@babylonjs/core/Materials/Textures/baseTexture.polynomial";
import "@babylonjs/core/ShadersWGSL/background.vertex";
import "@babylonjs/core/ShadersWGSL/background.fragment";
import "@babylonjs/core/ShadersWGSL/default.vertex";
import "@babylonjs/core/ShadersWGSL/default.fragment";
// HDRCubeTexture prefiltering loads these dynamically in Babylon.js. Register
// both backends eagerly because the Electron/Vite dev server can otherwise
// resolve the shader fallback request to index.html before that import settles.
import "@babylonjs/core/Shaders/hdrFiltering.vertex";
import "@babylonjs/core/Shaders/hdrFiltering.fragment";
import "@babylonjs/core/ShadersWGSL/hdrFiltering.vertex";
import "@babylonjs/core/ShadersWGSL/hdrFiltering.fragment";
import "@babylonjs/core/ShadersWGSL/postprocess.vertex";
import "@babylonjs/core/ShadersWGSL/imageProcessing.fragment";
import "@babylonjs/core/ShadersWGSL/rgbdDecode.fragment";
import "@babylonjs/core/ShadersWGSL/bloomMerge.fragment";
import "@babylonjs/core/ShadersWGSL/chromaticAberration.fragment";
import "@babylonjs/core/ShadersWGSL/copyTextureToTexture.fragment";
import "@babylonjs/core/ShadersWGSL/depth.vertex";
import "@babylonjs/core/ShadersWGSL/depth.fragment";
import "@babylonjs/core/ShadersWGSL/extractHighlights.fragment";
import "@babylonjs/core/ShadersWGSL/fxaa.vertex";
import "@babylonjs/core/ShadersWGSL/fxaa.fragment";
import "@babylonjs/core/ShadersWGSL/grain.fragment";
import "@babylonjs/core/ShadersWGSL/circleOfConfusion.fragment";
import "@babylonjs/core/ShadersWGSL/depthOfFieldMerge.fragment";
import "@babylonjs/core/ShadersWGSL/kernelBlur.vertex";
import "@babylonjs/core/ShadersWGSL/kernelBlur.fragment";
import "@babylonjs/core/ShadersWGSL/motionBlur.fragment";
import "@babylonjs/core/ShadersWGSL/oitBackBlend.fragment";
import "@babylonjs/core/ShadersWGSL/oitFinalSimpleBlend.fragment";
import "@babylonjs/core/ShadersWGSL/sharpen.fragment";
import "@babylonjs/core/ShadersWGSL/shadowMap.vertex";
import "@babylonjs/core/ShadersWGSL/shadowMap.fragment";
import "@babylonjs/core/ShadersWGSL/screenSpaceReflection2.fragment";
import "@babylonjs/core/ShadersWGSL/screenSpaceReflection2Blur.fragment";
import "@babylonjs/core/ShadersWGSL/screenSpaceReflection2BlurCombiner.fragment";
import "@babylonjs/core/ShadersWGSL/ssao2.fragment";
import "@babylonjs/core/ShadersWGSL/ssaoCombine.fragment";
import "@babylonjs/core/ShadersWGSL/volumetricLightingRenderVolume.vertex";

applyMmdOutlineTaperingShader();
import "@babylonjs/core/ShadersWGSL/volumetricLightingRenderVolume.fragment";
import "@babylonjs/core/ShadersWGSL/volumetricLightingBlendVolume.fragment";
import "babylon-mmd/esm/Loader/ShadersWGSL/mmdOutline.vertex";
import "babylon-mmd/esm/Loader/ShadersWGSL/mmdOutline.fragment";
import "babylon-mmd/esm/Loader/Shaders/mmdOutline.vertex";
import "babylon-mmd/esm/Loader/Shaders/mmdOutline.fragment";
import "babylon-mmd/esm/Loader/ShadersWGSL/textureAlphaChecker.vertex";
import "babylon-mmd/esm/Loader/ShadersWGSL/textureAlphaChecker.fragment";

import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdWasmRuntime } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmRuntime";
import { MmdWasmAnimation } from "babylon-mmd/esm/Runtime/Optimized/Animation/mmdWasmAnimation";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { VpdLoader } from "babylon-mmd/esm/Loader/vpdLoader";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdBoneAnimationTrack, MmdMorphAnimationTrack, MmdMovableBoneAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { MmdStandardMaterial } from "babylon-mmd/esm/Loader/mmdStandardMaterial";
import { MmdMaterialRenderMethod } from "babylon-mmd/esm/Loader/materialBuilderBase";
import { MmdPluginMaterial as MmdStandardShaderPluginGLSL } from "babylon-mmd/esm/Loader/Shaders/mmdStandard";
import { MmdPluginMaterial as MmdStandardShaderPluginWGSL } from "babylon-mmd/esm/Loader/ShadersWGSL/mmdStandard";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { PathNormalize } from "babylon-mmd/esm/Loader/Util/pathNormalize";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import { MmdWasmPhysics } from "babylon-mmd/esm/Runtime/Optimized/Physics/mmdWasmPhysics";
import * as sprWasmBindgen from "babylon-mmd/esm/Runtime/Optimized/wasm/spr";
import type { IMmdWasmInstance } from "babylon-mmd/esm/Runtime/Optimized/mmdWasmInstance";
import { WasmTypedArray } from "babylon-mmd/esm/Runtime/Optimized/Misc/wasmTypedArray";
import { WasmSharedTypedArray } from "babylon-mmd/esm/Runtime/Optimized/Misc/wasmSharedTypedArray";
// eslint-disable-next-line import/no-unresolved
import mprWasmBinaryUrl from "babylon-mmd/esm/Runtime/Optimized/wasm/mpr/index_bg.wasm?url";
// eslint-disable-next-line import/no-unresolved
import sprWasmBinaryUrl from "babylon-mmd/esm/Runtime/Optimized/wasm/spr/index_bg.wasm?url";
// eslint-disable-next-line import/no-unresolved
import glslangJsUrl from "@babylonjs/core/assets/glslang/glslang.js?url";
// eslint-disable-next-line import/no-unresolved
import glslangWasmUrl from "@babylonjs/core/assets/glslang/glslang.wasm?url";
// eslint-disable-next-line import/no-unresolved
import twgslJsUrl from "@babylonjs/core/assets/twgsl/twgsl.js?url";
// eslint-disable-next-line import/no-unresolved
import twgslWasmUrl from "@babylonjs/core/assets/twgsl/twgsl.wasm?url";
// eslint-disable-next-line import/no-unresolved
import bundledEnvironmentTextureUrl from "./assets/ibl-shadows/yamagata-field-20181231-1137-2k.hdr?url";
// eslint-disable-next-line import/no-unresolved
import blobShadowTextureUrl from "./assets/blob-shadows/BlobShadow.png?url";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
// eslint-disable-next-line import/no-unresolved
import animeSoftLutText from "../lut/anime-soft.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import animeCoolLutText from "../lut/anime-cool.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import animeDramaticLutText from "../lut/anime-dramatic.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import monotoneLutText from "../lut/monotone.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import sepiaLutText from "../lut/sepia.3dl?raw";
// eslint-disable-next-line import/no-unresolved
import tealOrangeLutText from "../lut/teal-orange.3dl?raw";
import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import type { MmdRuntimeAnimationHandle } from "babylon-mmd/esm/Runtime/mmdRuntimeAnimationHandle";

// IBL Shadows is intentionally frozen: Babylon.js 9.2 WebGPU validation issues
// and dynamic/skinned mesh costs made it unsuitable for MMD contact shadows.
const IBL_SHADOWS_EXPERIMENT_ENABLED = false;

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
    | "wgsl-light-and-shadow"
    | "wgsl-gloss-highlight"
    | "wgsl-semi-matte-highlight"
    | "wgsl-matte-highlight"
    | "wgsl-specular"
    | "wgsl-ssr-reflective"
    | "wgsl-cel-sharp"
    | "wgsl-cel-shadow-sharp"
    | "wgsl-accessory-toon"
    | "wgsl-rim-lift"
    | "wgsl-mono-flat";

export interface WgslMaterialShaderPresetInfo {
    id: WgslMaterialShaderPresetId;
    label: string;
    description: string;
}

export interface WgslMaterialShaderInfo {
    key: string;
    name: string;
    presetId: WgslMaterialShaderPresetId;
    pbrPresetId: PbrMaterialShaderPreset;
    externalWgslPath: string | null;
    visible: boolean;
}

export interface WgslModelShaderInfo {
    modelIndex: number;
    modelName: string;
    modelPath: string;
    active: boolean;
    materialPipeline: MmdMaterialPipelinePreset;
    materials: WgslMaterialShaderInfo[];
}

type SceneModelMaterialEntry = {
    key: string;
    name: string;
    material: MmdManagerMaterialLike;
};

type MmdManagerMaterialLike = object & {
    name?: unknown;
    metadata?: Record<string, unknown> | null;
    alpha?: unknown;
    diffuseTexture?: { name?: unknown; hasAlpha?: unknown; metadata?: Record<string, unknown> | null } | null;
    albedoTexture?: { name?: unknown; hasAlpha?: unknown; metadata?: Record<string, unknown> | null } | null;
    opacityTexture?: unknown;
    useAlphaFromDiffuseTexture?: unknown;
    useAlphaFromAlbedoTexture?: unknown;
    alphaCutOff?: unknown;
    backFaceCulling?: unknown;
    forceDepthWrite?: unknown;
    transparencyMode?: unknown;
    zOffset?: number;
    zOffsetUnits?: number;
    useLogarithmicDepth?: boolean;
    subMaterials?: Array<MmdManagerMaterialLike | null | undefined>;
    renderOutline?: boolean;
    outlineWidth?: number;
    outlineAlpha?: number;
    outlineColor?: { r?: unknown; g?: unknown; b?: unknown; set?: (r: number, g: number, b: number) => void };
    toonTexture?: Texture | null;
    ignoreDiffuseWhenToonTextureIsNull?: boolean;
    markAsDirty?: (flag?: number) => void;
    _markAllSubMeshesAsTexturesDirty?: () => void;
} & Record<string, unknown>;

const PMX_MATERIAL_DIAGNOSTIC_METADATA_KEY = "mmdModokiPmxMaterialInfo";

type SceneModelRigidBodyEntry = {
    name: string;
    boneIndex: number;
    shapeType: number;
    shapeSize: [number, number, number];
    physicsMode: number;
} & PhysicsRigidBodyDiagnosticEntry;

type SceneModelJointEntry = PhysicsJointDiagnosticEntry;

type SceneModelEntry = {
    mesh: MmdMesh;
    model: RuntimeModel;
    info: ModelInfo;
    materials: SceneModelMaterialEntry[];
    rigidBodies: SceneModelRigidBodyEntry[];
    joints: SceneModelJointEntry[];
    shadowCasterMeshes: Mesh[];
    contactShadowMesh: Mesh | null;
    castShadow: boolean;
    materialPipeline: MmdMaterialPipelinePreset;
    externalParent: ModelExternalParentState | null;
    externalParentKeyframes: ModelExternalParentKeyframe[];
};

export type ModelExternalParentState = {
    childBoneName: string;
    parentModelPath: string;
    parentBoneName: string;
};

type ModelExternalParentKeyframe = ModelExternalParentKeyframePayload & {
    frame: number;
};

type CameraExternalParentKeyframe = CameraExternalParentKeyframeLike;

export type ShadowMode = "cascaded" | "standard";

type ContactShadowBlobKind = "body" | "leftFoot" | "rightFoot";
type ContactShadowBlobMeshes = Partial<Record<ContactShadowBlobKind, Mesh>>;
type ContactShadowTarget = {
    kind: ContactShadowBlobKind;
    position: Vector3;
    width: number;
    depth: number;
    opacityScale: number;
};

type MaterialShaderDefaults = {
    disableLighting: boolean | null;
    specularPower: number | null;
    specularColor: Color3 | null;
    emissiveColor: Color3 | null;
};

type PostEffectLutSourceMode = "builtin" | "external-absolute" | "project-relative";

interface PreferredEngineResult {
    engine: Engine | WebGPUEngine;
    startupDiagnostics: string[];
}

export type RenderEnginePreference = "auto" | "webgpu" | "webgl2";

export class MmdManager {
    private static readonly RENDER_ENGINE_OPTIONS = {
        preserveDrawingBuffer: false,
        stencil: true,
        antialias: true,
        alpha: false,
        premultipliedAlpha: false,
        desynchronized: false,
        adaptToDeviceRatio: false,
    };
    private static readonly RENDER_HARDWARE_SCALING_LEVEL = 0.75;
    private static readonly WEBGPU_COMPATIBILITY_MODE = true;
    private static readonly PHYSICS_SCENE_MAX_DELTA_MS = 3_000;
    private static readonly WEBGPU_SDEF_CPU_FALLBACK_STORAGE_KEY = "mmd_modoki.webGpuSdefCpuFallback";
    private static readonly PHYSICS_PREFERRED_BULLET_BACKEND_STORAGE_KEY = "mmd_modoki.physics.preferredBulletBackend";
    private static readonly PHYSICS_BUFFERED_EVALUATION_STORAGE_KEY = "mmd_modoki.physics.bufferedEvaluation";
    private static readonly RENDER_FPS_LIMIT_STORAGE_KEY = "mmd_modoki.render.fpsLimit";
    private static readonly RUNTIME_MODE_STORAGE_KEY = "mmd_modoki.runtimeMode";
    private static readonly FRAME_PERFORMANCE_LOG_STORAGE_KEY = "mmd_modoki.framePerfLog";
    private static readonly FORCE_MODEL_DEBUG_MATERIAL_STORAGE_KEY = "mmd_modoki.debug.forceModelDebugMaterial";
    private static readonly ALPHA_TEXTURE_DEBUG_STORAGE_KEY = "mmd_modoki.debug.alphaTextureView";
    private static readonly MMD_MATERIAL_PIPELINE_STORAGE_KEY = "mmd_modoki.materialPipeline";
    private static readonly ENVIRONMENT_LIGHTING_STORAGE_KEY = "mmd_modoki.environmentLighting";
    private static readonly ENVIRONMENT_LIGHTING_INTENSITY_STORAGE_KEY = "mmd_modoki.environmentLightingIntensity";
    private static readonly ENVIRONMENT_BACKGROUND_STORAGE_KEY = "mmd_modoki.environmentBackground";
    private static readonly ENVIRONMENT_BACKGROUND_INTENSITY_STORAGE_KEY = "mmd_modoki.environmentBackgroundIntensity";
    private static readonly MAX_ENVIRONMENT_LIGHTING_INTENSITY = 4;
    private static readonly MAX_ENVIRONMENT_BACKGROUND_INTENSITY = 1;
    private static readonly DEFAULT_ENVIRONMENT_BACKGROUND_INTENSITY = 0.03;
    // External HDR is also displayed directly in the viewport. 256px faces
    // visibly pixelate a 16K panorama at ordinary editor viewport sizes.
    private static readonly EXTERNAL_ENVIRONMENT_CUBE_FACE_SIZE = 1024;
    private static readonly FRAME_PERFORMANCE_LOG_INTERVAL_MS = 10_000;
    private static readonly DEFAULT_WGSL_MATERIAL_SHADER_PRESET: WgslMaterialShaderPresetId = "wgsl-mmd-standard";
    private static readonly WGSL_MATERIAL_SHADER_PRESETS: readonly WgslMaterialShaderPresetInfo[] = [
        {
            id: "wgsl-mmd-standard",
            label: "MMD Standard",
            description: "Default MMD shading",
        },
        {
            id: "wgsl-unlit",
            label: "Unlit Flat",
            description: "Disable lighting for flat anime-like output",
        },
        {
            id: "wgsl-soft-lit",
            label: "Soft Lit",
            description: "Softer highlights with gentle emissive lift",
        },
        {
            id: "wgsl-full-alpha-test",
            label: "AlphaCutOff",
            description: "Convert semi-transparent layers into softer alpha-cutoff rendering with more preserved edge coverage",
        },
        {
            id: "wgsl-full-alpha-test-hard",
            label: "AlphaCutOff Hard",
            description: "Stronger alpha-cutoff rendering for textures that need a firmer transparency mask",
        },
        {
            id: "wgsl-alpha-mask",
            label: "Alpha Mask",
            description: "Use the source texture alpha directly for transparency",
        },
        {
            id: "wgsl-white-key-cutout",
            label: "White Key Cutout",
            description: "Cut out bright backgrounds by keying on luminance instead of texture alpha",
        },
        {
            id: "wgsl-black-key-cutout",
            label: "Black Key Cutout",
            description: "Cut out dark backgrounds by keying on luminance instead of texture alpha",
        },
        {
            id: "wgsl-autoluminous",
            label: "Luminous",
            description: "GlowLayer-based luminous preset that routes into LuminousGlow",
        },
        {
            id: "wgsl-full-light",
            label: "full_light",
            description: "Treat the material as always facing light regardless of PMX toon flags",
        },
        {
            id: "wgsl-full-light-add",
            label: "full_light_add",
            description: "Read light sliders directly and add a dedicated light boost regardless of PMX toon flags",
        },
        {
            id: "wgsl-full-shadow",
            label: "full_shadow",
            description: "Treat the material as always in shadow regardless of PMX toon flags",
        },
        {
            id: "wgsl-light-and-shadow",
            label: "light_and_shadow",
            description: "Use the standard MMD light-and-shadow path, including fallback toon ramps for non-toon materials",
        },
        {
            id: "wgsl-cel-shadow-sharp",
            label: "Cel Shadow Sharp",
            description: "Hardens the self-shadow boundary for a crisper cel-look shadow band",
        },
        {
            id: "wgsl-gloss-highlight",
            label: "Gloss Highlight",
            description: "Narrow, strong highlight that tightens toward the light direction",
        },
        {
            id: "wgsl-semi-matte-highlight",
            label: "Semi-Matte Highlight",
            description: "Balanced highlight with moderate spread toward the light direction",
        },
        {
            id: "wgsl-matte-highlight",
            label: "Matte Highlight",
            description: "Broad, soft highlight with a restrained light-facing lift",
        },
        {
            id: "wgsl-specular",
            label: "Specular Boost",
            description: "Sharper highlights for glossy materials",
        },
        {
            id: "wgsl-ssr-reflective",
            label: "SSR Reflective",
            description: "Marks a stage material as reflective for Frame Graph SSR",
        },
        {
            id: "wgsl-cel-sharp",
            label: "Cel Sharp",
            description: "Stronger toon contrast with reduced specular spread",
        },
        {
            id: "wgsl-accessory-toon",
            label: "Accessory Toon",
            description: "Use the standard MMD shading path with an accessory-oriented fallback toon ramp",
        },
        {
            id: "wgsl-rim-lift",
            label: "Rim Lift",
            description: "Adds diffuse-based emissive lift for a brighter anime edge feel",
        },
        {
            id: "wgsl-mono-flat",
            label: "Mono Flat",
            description: "Monochrome flat shading with lighting disabled",
        },
        {
            id: "wgsl-debug-white",
            label: "debug_white",
            description: "White-shadow debug view using the built-in toon debug WGSL",
        },
    ];
    private static readonly POST_EFFECT_LUT_PRESETS = [
        { id: "anime-soft", label: "Anime Soft" },
        { id: "anime-cool", label: "Anime Cool" },
        { id: "anime-dramatic", label: "Anime Dramatic" },
        { id: "monotone", label: "Monotone" },
        { id: "sepia", label: "Sepia" },
        { id: "teal-orange", label: "Teal Orange" },
    ] as const;
    private static readonly POST_EFFECT_LUT_TEXT_BY_ID: Record<string, string> = {
        "anime-soft": animeSoftLutText,
        "anime-cool": animeCoolLutText,
        "anime-dramatic": animeDramaticLutText,
        "monotone": monotoneLutText,
        "sepia": sepiaLutText,
        "teal-orange": tealOrangeLutText,
    };
    private static toonLightSeparationShaderPatched = false;
    private static mmdStandardMaterialPluginInitPatched = false;
    private static toonSelfShadowBoundarySoftness = 0.055;
    private static toonOcclusionShadowBoundarySoftness = 0.075;
    private static toonFlatLightColorInfluence = 0.35;
    private static toonContactAoEnabled = false;
    private static toonContactAoStrength = 0;
    private static toonContactAoRadius = 0.8;
    private static toonContactAoFadeStartMeters = 6;
    private static toonContactAoFadeEndMeters = 14;
    private static toonContactAoDebugView = false;
    private static toonContactAoDepthRenderer: DepthRenderer | null = null;
    private static toonContactAoFallbackTexture: DynamicTexture | null = null;
    private static externalWgslToonFragmentReplacement: string | null = null;
    private static externalWgslToonSourcePath: string | null = null;
    private static readonly externalWgslToonFragmentByMaterial = new WeakMap<object, string>();
    private static readonly presetWgslToonFragmentByMaterial = new WeakMap<object, string>();

    private static shadowSoftnessToToonBoundaryWidth(v: number): number {
        if (!Number.isFinite(v)) return 0.09;
        return Math.max(0.02, Math.min(0.35, v * 2.5));
    }

    private static getToonContactAoFallbackTexture(scene: Scene): DynamicTexture {
        if (MmdManager.toonContactAoFallbackTexture) {
            return MmdManager.toonContactAoFallbackTexture;
        }

        const texture = new DynamicTexture(
            "mmdContactAoFallback",
            { width: 1, height: 1 },
            scene,
            false,
            Texture.NEAREST_SAMPLINGMODE,
        );
        const context = texture.getContext();
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 1, 1);
        texture.update(false);
        MmdManager.toonContactAoFallbackTexture = texture;
        return texture;
    }

    private static patchMmdToonLightSeparationShader(): void {
        if (MmdManager.toonLightSeparationShaderPatched) return;

        const patchGetCustomCode = (
            ctor: { prototype: { getCustomCode?: (shaderType: string) => unknown } },
            isWgsl: boolean,
        ): void => {
            const originalGetCustomCode = ctor.prototype.getCustomCode;
            if (typeof originalGetCustomCode !== "function") return;

            ctor.prototype.getCustomCode = function patchedGetCustomCode(shaderType: string): unknown {
                const codes = originalGetCustomCode.call(this, shaderType);
                if (shaderType !== "fragment" || !codes || typeof codes !== "object") {
                    return codes;
                }

                const target = "diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);";
                const selfWidth = MmdManager.shadowSoftnessToToonBoundaryWidth(MmdManager.toonSelfShadowBoundarySoftness);
                const occlusionWidth = MmdManager.shadowSoftnessToToonBoundaryWidth(MmdManager.toonOcclusionShadowBoundarySoftness);
                const selfMaskMin = (0.5 - selfWidth).toFixed(6);
                const selfMaskMax = (0.5 + selfWidth).toFixed(6);
                const occlusionMaskMin = (0.5 - occlusionWidth).toFixed(6);
                const occlusionMaskMax = (0.5 + occlusionWidth).toFixed(6);
                const lightColorInfluence = MmdManager.toonFlatLightColorInfluence.toFixed(6);
                const toonBandAlignment = 0.75;
                const defaultReplacementLine = isWgsl
                    ? `#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
var toonRaw=vec3f(clamp(info.ndl*shadow,0.02,0.98));
toonRaw.r=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.r)).r;
toonRaw.g=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.g)).g;
toonRaw.b=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.b)).b;
let selfMask=smoothstep(${selfMaskMin},${selfMaskMax},clamp(info.ndl,0.0,1.0));
let occlusionMask=smoothstep(${occlusionMaskMin},${occlusionMaskMax},clamp(shadow,0.0,1.0));
let toneBandLuma=clamp(dot(toonRaw,vec3f(0.299,0.587,0.114)),0.0,1.0);
let geometricLitMask=clamp(selfMask*occlusionMask,0.0,1.0);
let litMask=clamp(geometricLitMask*mix(1.0,toneBandLuma,${toonBandAlignment.toFixed(6)}),0.0,1.0);
let shadowMask=1.0-litMask;
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let shadowTerm=info.diffuse*mix(one,toonShadowBand,shadowMask);
let lightBoost=max(lightTint-one,vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=litMask*clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+${lightColorInfluence}*1.8);
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif`
                    : `#ifdef TOON_TEXTURE_COLOR
{
vec3 one=vec3(1.0);
vec3 lightTint=max(toonTextureMultiplicativeColor.rgb,vec3(0.0));
float flatStrength=clamp(toonTextureMultiplicativeColor.a,0.0,1.0);
vec3 shadowTint=clamp(toonTextureAdditiveColor.rgb,vec3(0.0),vec3(1.0));
float toonInfluence=clamp(toonTextureAdditiveColor.a,0.0,1.0);
vec3 toonRaw=vec3(clamp(info.ndl*shadow,0.02,0.98));
toonRaw.r=texture2D(toonSampler,vec2(0.5,toonRaw.r)).r;
toonRaw.g=texture2D(toonSampler,vec2(0.5,toonRaw.g)).g;
toonRaw.b=texture2D(toonSampler,vec2(0.5,toonRaw.b)).b;
float selfMask=smoothstep(${selfMaskMin},${selfMaskMax},clamp(info.ndl,0.0,1.0));
float occlusionMask=smoothstep(${occlusionMaskMin},${occlusionMaskMax},clamp(shadow,0.0,1.0));
float toneBandLuma=clamp(dot(toonRaw,vec3(0.299,0.587,0.114)),0.0,1.0);
float geometricLitMask=clamp(selfMask*occlusionMask,0.0,1.0);
float litMask=clamp(geometricLitMask*mix(1.0,toneBandLuma,${toonBandAlignment.toFixed(6)}),0.0,1.0);
float shadowMask=1.0-litMask;
vec3 toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
vec3 shadowTerm=info.diffuse*mix(one,toonShadowBand,shadowMask);
vec3 lightBoost=max(lightTint-one,vec3(0.0));
float boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
toonFlatLightMask=litMask*clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+${lightColorInfluence}*1.8);
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif`;

                const pluginMaterial = (this as { _material?: unknown })._material;
                const replacementLine = isWgsl && pluginMaterial && typeof pluginMaterial === "object"
                    ? (
                        MmdManager.externalWgslToonFragmentByMaterial.get(pluginMaterial as object)
                        ?? MmdManager.presetWgslToonFragmentByMaterial.get(pluginMaterial as object)
                        ?? null
                    )
                    : null;
                const applyWithoutToonTexture = typeof replacementLine === "string"
                    && replacementLine.includes("@apply-without-toon");
                const replacementBlock = isWgsl && replacementLine && applyWithoutToonTexture
                    ? `#ifdef TOON_TEXTURE
toonNdl=vec3f(clamp(info.ndl*shadow,0.02,0.98));
toonNdl.r=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonNdl.r)).r;
toonNdl.g=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonNdl.g)).g;
toonNdl.b=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonNdl.b)).b;
${replacementLine}
#elif defined(IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED)
${replacementLine}
#else
${replacementLine}
#endif`
                    : (replacementLine ?? defaultReplacementLine);

                const codeMap = codes as Record<string, unknown>;
                const contactAoDefinitions = isWgsl
                    ? `
#ifdef MMD_CONTACT_AO
var mmdContactAoDepthSamplerSampler: sampler;
var mmdContactAoDepthSampler: texture_2d<f32>;
fn mmdContactAoReadDepth(uv: vec2f) -> f32 {
    return abs(textureSampleLevel(mmdContactAoDepthSampler, mmdContactAoDepthSamplerSampler, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0).r);
}
fn mmdContactAoDirection(index: i32) -> vec2f {
    switch index {
        case 0: { return vec2f(1.0, 0.0); }
        case 1: { return vec2f(0.7071, 0.7071); }
        case 2: { return vec2f(0.0, 1.0); }
        case 3: { return vec2f(-0.7071, 0.7071); }
        case 4: { return vec2f(-1.0, 0.0); }
        case 5: { return vec2f(-0.7071, -0.7071); }
        case 6: { return vec2f(0.0, -1.0); }
        default: { return vec2f(0.7071, -0.7071); }
    }
}
fn mmdComputeContactAo(screenUv: vec2f, positionW: vec3f, normalW: vec3f) -> f32 {
    let strength = clamp(uniforms.mmdContactAoParams.x * 2.4, 0.0, 28.0);
    if (strength <= 0.00001) {
        return 0.0;
    }
    let centerDepth = mmdContactAoReadDepth(screenUv);
    if (centerDepth <= 0.00001) {
        return 0.0;
    }
    let safeScreen = max(uniforms.mmdContactAoScreenSize, vec2f(1.0));
    let texel = vec2f(1.0) / safeScreen;
    let resolutionScale = safeScreen.y / 1080.0;
    let radiusNorm = clamp((uniforms.mmdContactAoParams.y - 0.2) / 2.4, 0.0, 1.0);
    let sampleRadiusPx = mix(0.8, 3.2, radiusNorm) * resolutionScale;
    let dL = mmdContactAoReadDepth(screenUv - vec2f(texel.x, 0.0));
    let dR = mmdContactAoReadDepth(screenUv + vec2f(texel.x, 0.0));
    let dD = mmdContactAoReadDepth(screenUv - vec2f(0.0, texel.y));
    let dU = mmdContactAoReadDepth(screenUv + vec2f(0.0, texel.y));
    let depthGrad = max(max(abs(dR - dL), abs(dU - dD)), 0.00003);
    let depthSlopePerPx = vec2f((dR - dL) * 0.5, (dU - dD) * 0.5);
    let nearDepth = min(min(dL, dR), min(dD, dU));
    let microCavity = smoothstep(
        depthGrad * 0.14 + 0.00004,
        depthGrad * 1.45 + 0.00055,
        centerDepth - nearDepth
    );
    var occlusion = 0.0;
    var totalWeight = 0.0;
    for (var ring: i32 = 1; ring <= 2; ring = ring + 1) {
        let ringFactor = f32(ring) / 2.0;
        let ringWeight = mix(1.0, 0.5, ringFactor);
        for (var i: i32 = 0; i < 8; i = i + 1) {
            let sampleOffsetPx = mmdContactAoDirection(i) * sampleRadiusPx * ringFactor;
            let sampleSpanPx = max(1.0, sampleRadiusPx * ringFactor);
            let sampleUv = clamp(
                screenUv + sampleOffsetPx * texel,
                vec2f(0.001),
                vec2f(0.999)
            );
            let sampleDepth = mmdContactAoReadDepth(sampleUv);
            if (sampleDepth <= 0.00001) {
                continue;
            }
            let expectedDepth = centerDepth + dot(depthSlopePerPx, sampleOffsetPx);
            let planeDelta = expectedDepth - sampleDepth;
            let gradientAllowance = depthGrad * sampleSpanPx;
            let shallowLo = gradientAllowance * (0.2 + ringFactor * 0.18) + 0.00004;
            let shallowMid = gradientAllowance * (1.65 + ringFactor * 1.25) + (0.00022 + ringFactor * 0.00028);
            let shallowHi = gradientAllowance * (3.8 + ringFactor * 2.4) + (0.00072 + ringFactor * 0.00082);
            let positiveGate = smoothstep(shallowLo, shallowMid, planeDelta);
            let shallowGate = 1.0 - smoothstep(shallowMid, shallowHi, planeDelta);
            let largeGapReject = 1.0 - smoothstep(shallowHi * 1.15, shallowHi * 2.9, abs(planeDelta));
            occlusion += positiveGate * shallowGate * largeGapReject * ringWeight;
            totalWeight += ringWeight;
        }
    }
    let aoRaw = occlusion / max(totalWeight, 0.0001);
    let aoCombined = clamp(aoRaw * 1.1 + microCavity * 0.05, 0.0, 1.0);
    let cameraDistance = length(scene.vEyePosition.xyz - positionW);
    let worldFade = 1.0 - smoothstep(uniforms.mmdContactAoFade.x, uniforms.mmdContactAoFade.y, cameraDistance);
    let viewFacing = clamp(dot(normalize(normalW), normalize(scene.vEyePosition.xyz - positionW)), 0.0, 1.0);
    let viewWeight = smoothstep(0.34, 0.86, viewFacing);
    var ao = clamp(pow(aoCombined, 3.0) * strength * 0.48, 0.0, 0.82);
    ao *= worldFade * viewWeight;
    return ao;
}
#endif`
                    : "";
                const contactAoBeforeLights = isWgsl
                    ? `
#ifdef MMD_CONTACT_AO
let toonContactAoUv = clamp(
    fragmentInputs.position.xy / max(uniforms.mmdContactAoScreenSize, vec2f(1.0)),
    vec2f(0.001),
    vec2f(0.999)
);
toonContactAo = mmdComputeContactAo(toonContactAoUv, fragmentInputs.vPositionW, normalW);
#endif
`
                    : `
toonContactAo=0.0;
`;
                for (const key of Object.keys(codeMap)) {
                    const value = codeMap[key];
                    if (typeof value !== "string") continue;

                    if (!value.includes(target)) continue;
                    codeMap[key] = applyWithoutToonTexture
                        ? replacementBlock
                        : (codeMap[key] as string).replace(target, replacementBlock);
                }

                if (isWgsl && typeof codeMap["CUSTOM_FRAGMENT_DEFINITIONS"] === "string") {
                    const definitions = codeMap["CUSTOM_FRAGMENT_DEFINITIONS"] as string;
                    if (!definitions.includes("mmdContactAoDepthSampler")) {
                        codeMap["CUSTOM_FRAGMENT_DEFINITIONS"] = `${definitions}
${contactAoDefinitions}
`;
                    }
                }

                if (typeof codeMap["CUSTOM_FRAGMENT_MAIN_BEGIN"] === "string") {
                    const begin = codeMap["CUSTOM_FRAGMENT_MAIN_BEGIN"] as string;
                    if (!begin.includes("toonFlatLightMask")) {
                        codeMap["CUSTOM_FRAGMENT_MAIN_BEGIN"] = `${begin}
${isWgsl
        ? "var toonFlatLightMask: f32=0.0;\nvar toonFlatLightColor: vec3f=vec3f(0.0);\nvar toonContactAo: f32=0.0;\nvar toonFinalOverrideMix: f32=0.0;\nvar toonFinalOverrideColor: vec3f=vec3f(0.0);\nvar toonFinalOverrideUseColorLuma: f32=0.0;\nvar toonFinalOverrideLumaMin: f32=0.0;\nvar toonFinalOverrideLumaMax: f32=1.0;"
        : "float toonFlatLightMask=0.0;\nvec3 toonFlatLightColor=vec3(0.0);\nfloat toonContactAo=0.0;\nfloat toonFinalOverrideMix=0.0;\nvec3 toonFinalOverrideColor=vec3(0.0);\nfloat toonFinalOverrideUseColorLuma=0.0;\nfloat toonFinalOverrideLumaMin=0.0;\nfloat toonFinalOverrideLumaMax=1.0;"}
`;
                    }
                }

                if (typeof codeMap["CUSTOM_FRAGMENT_BEFORE_LIGHTS"] === "string") {
                    const beforeLights = codeMap["CUSTOM_FRAGMENT_BEFORE_LIGHTS"] as string;
                    if (!beforeLights.includes("toonContactAoUv")) {
                        codeMap["CUSTOM_FRAGMENT_BEFORE_LIGHTS"] = `${beforeLights}
${contactAoBeforeLights}
`;
                    }
                } else {
                    codeMap["CUSTOM_FRAGMENT_BEFORE_LIGHTS"] = contactAoBeforeLights;
                }

                const beforeFogAppendBlock = isWgsl
                    ? `
let toonFlatMix=clamp(toonFlatLightMask,0.0,1.0);
color=vec4f(color.rgb+toonFlatLightColor*toonFlatMix,color.a);
let toonFinalMix=clamp(toonFinalOverrideMix,0.0,1.0);
let toonFinalColorLumaMix=clamp(toonFinalOverrideUseColorLuma,0.0,1.0);
let toonColorLuma=clamp(dot(color.rgb,vec3f(0.299,0.587,0.114)),0.0,1.0);
let toonLumaMin=clamp(toonFinalOverrideLumaMin,0.0,1.0);
let toonLumaMax=clamp(max(toonLumaMin,toonFinalOverrideLumaMax),toonLumaMin,1.0);
let toonRemappedLuma=mix(toonLumaMin,toonLumaMax,toonColorLuma);
let toonFinalColor=mix(toonFinalOverrideColor,vec3f(toonRemappedLuma),toonFinalColorLumaMix);
color=vec4f(mix(color.rgb,toonFinalColor,toonFinalMix),color.a);
let toonContactAoMix=clamp(toonContactAo,0.0,1.0);
let toonContactAoDebug=clamp(uniforms.mmdContactAoParams.z,0.0,1.0);
let toonContactAoApplied=1.0-pow(1.0-clamp(toonContactAoMix*7.0,0.0,0.998),1.15);
let toonContactAoMask=vec3f(1.0-toonContactAoApplied);
color=vec4f(mix(color.rgb*toonContactAoMask,toonContactAoMask,toonContactAoDebug),color.a);
`
                    : `
float toonFlatMix=clamp(toonFlatLightMask,0.0,1.0);
color.rgb+=toonFlatLightColor*toonFlatMix;
float toonFinalMix=clamp(toonFinalOverrideMix,0.0,1.0);
float toonFinalColorLumaMix=clamp(toonFinalOverrideUseColorLuma,0.0,1.0);
float toonColorLuma=clamp(dot(color.rgb,vec3(0.299,0.587,0.114)),0.0,1.0);
float toonLumaMin=clamp(toonFinalOverrideLumaMin,0.0,1.0);
float toonLumaMax=clamp(max(toonLumaMin,toonFinalOverrideLumaMax),toonLumaMin,1.0);
float toonRemappedLuma=mix(toonLumaMin,toonLumaMax,toonColorLuma);
vec3 toonFinalColor=mix(toonFinalOverrideColor,vec3(toonRemappedLuma),toonFinalColorLumaMix);
color.rgb=mix(color.rgb,toonFinalColor,toonFinalMix);
float toonContactAoMix=clamp(toonContactAo,0.0,1.0);
float toonContactAoApplied=1.0-pow(1.0-clamp(toonContactAoMix*7.0,0.0,0.998),1.15);
color.rgb*=(1.0-toonContactAoApplied);
`;
                if (typeof codeMap["CUSTOM_FRAGMENT_BEFORE_FOG"] === "string") {
                    const beforeFog = codeMap["CUSTOM_FRAGMENT_BEFORE_FOG"] as string;
                    if (!beforeFog.includes("toonFinalOverrideMix")) {
                        codeMap["CUSTOM_FRAGMENT_BEFORE_FOG"] = `${beforeFog}
${beforeFogAppendBlock}
`;
                    }
                } else {
                    codeMap["CUSTOM_FRAGMENT_BEFORE_FOG"] = beforeFogAppendBlock;
                }

                return codes;
            };
        };

        const patchGetSamplers = (
            ctor: { prototype: { getSamplers?: (samplers: string[]) => void } },
        ): void => {
            const originalGetSamplers = ctor.prototype.getSamplers;
            if (typeof originalGetSamplers !== "function") return;

            ctor.prototype.getSamplers = function patchedGetSamplers(samplers: string[]): void {
                originalGetSamplers.call(this, samplers);
                if (MmdManager.toonContactAoEnabled && !samplers.includes("mmdContactAoDepthSampler")) {
                    samplers.push("mmdContactAoDepthSampler");
                }
            };
        };

        const patchPrepareDefines = (
            ctor: { prototype: { prepareDefines?: (...args: unknown[]) => void } },
        ): void => {
            const originalPrepareDefines = ctor.prototype.prepareDefines;
            if (typeof originalPrepareDefines !== "function") return;

            ctor.prototype.prepareDefines = function patchedPrepareDefines(...args: unknown[]): void {
                originalPrepareDefines.apply(this, args);

                const defines = args[0] as Record<string, unknown> | undefined;
                if (!defines || typeof defines !== "object") return;
                defines.MMD_CONTACT_AO = MmdManager.toonContactAoEnabled;
            };
        };

        const patchGetUniforms = (
            ctor: { prototype: { getUniforms?: (shaderLanguage?: ShaderLanguage) => unknown } },
        ): void => {
            const originalGetUniforms = ctor.prototype.getUniforms;
            if (typeof originalGetUniforms !== "function") return;

            ctor.prototype.getUniforms = function patchedGetUniforms(shaderLanguage?: ShaderLanguage): unknown {
                const uniforms = originalGetUniforms.call(this, shaderLanguage) as {
                    ubo?: { name: string; size: number; type: string }[];
                    fragment?: string;
                };
                if (!uniforms || typeof uniforms !== "object") {
                    return uniforms;
                }

                uniforms.ubo ??= [];
                if (!uniforms.ubo.some((entry) => entry.name === "mmdContactAoParams")) {
                    uniforms.ubo.push(
                        { name: "mmdContactAoParams", size: 4, type: "vec4" },
                        { name: "mmdContactAoScreenSize", size: 2, type: "vec2" },
                        { name: "mmdContactAoFade", size: 2, type: "vec2" },
                    );
                }
                return uniforms;
            };
        };

        const patchBindForSubMesh = (
            ctor: { prototype: { bindForSubMesh?: (...args: unknown[]) => void } },
        ): void => {
            const originalBindForSubMesh = ctor.prototype.bindForSubMesh;
            if (typeof originalBindForSubMesh !== "function") return;

            ctor.prototype.bindForSubMesh = function patchedBindForSubMesh(...args: unknown[]): void {
                originalBindForSubMesh.apply(this, args);

                const uniformBuffer = args[0] as {
                    updateFloat4?: (name: string, x: number, y: number, z: number, w: number) => void;
                    updateFloat2?: (name: string, x: number, y: number) => void;
                    setTexture?: (name: string, texture: Texture | null) => void;
                    _currentEffect?: Effect | null;
                } | undefined;
                const scene = args[1] as Scene | undefined;
                if (!uniformBuffer || !scene) return;

                const strength = MmdManager.toonContactAoEnabled ? MmdManager.toonContactAoStrength : 0;
                const radius = MmdManager.toonContactAoEnabled ? MmdManager.toonContactAoRadius : 0.8;
                const debugView = MmdManager.toonContactAoEnabled && MmdManager.toonContactAoDebugView ? 1 : 0;
                uniformBuffer.updateFloat4?.("mmdContactAoParams", strength, radius, debugView, 0);
                uniformBuffer.updateFloat2?.(
                    "mmdContactAoScreenSize",
                    Math.max(1, scene.getEngine().getRenderWidth()),
                    Math.max(1, scene.getEngine().getRenderHeight()),
                );
                uniformBuffer.updateFloat2?.(
                    "mmdContactAoFade",
                    MmdManager.toonContactAoFadeStartMeters,
                    MmdManager.toonContactAoFadeEndMeters,
                );

                if (!MmdManager.toonContactAoEnabled) {
                    return;
                }

                const depthMap = MmdManager.toonContactAoDepthRenderer?.getDepthMap()
                    ?? MmdManager.getToonContactAoFallbackTexture(scene);
                const subMesh = args[3] as { effect?: Effect | null } | undefined;
                const effect = subMesh?.effect ?? uniformBuffer._currentEffect ?? null;
                effect?.setTexture("mmdContactAoDepthSampler", depthMap);
                uniformBuffer.setTexture?.("mmdContactAoDepthSampler", depthMap);
            };
        };

        patchGetCustomCode(MmdStandardShaderPluginGLSL as unknown as { prototype: { getCustomCode?: (shaderType: string) => unknown } }, false);
        patchGetCustomCode(MmdStandardShaderPluginWGSL as unknown as { prototype: { getCustomCode?: (shaderType: string) => unknown } }, true);
        patchGetSamplers(MmdStandardShaderPluginWGSL as unknown as { prototype: { getSamplers?: (samplers: string[]) => void } });
        patchPrepareDefines(MmdStandardShaderPluginWGSL as unknown as { prototype: { prepareDefines?: (...args: unknown[]) => void } });
        patchGetUniforms(MmdStandardShaderPluginWGSL as unknown as { prototype: { getUniforms?: (shaderLanguage?: ShaderLanguage) => unknown } });
        patchBindForSubMesh(MmdStandardShaderPluginWGSL as unknown as { prototype: { bindForSubMesh?: (...args: unknown[]) => void } });
        MmdManager.toonLightSeparationShaderPatched = true;
    }

    private static patchMmdStandardMaterialPluginInitDirty(): void {
        if (MmdManager.mmdStandardMaterialPluginInitPatched) return;

        type MmdStandardMaterialInternal = MmdStandardMaterial & {
            _initPluginShaderSourceAsync?: (shaderLanguage: ShaderLanguage) => Promise<void>;
            markAsDirty?: (flag?: number) => void;
        };
        const prototype = MmdStandardMaterial.prototype as MmdStandardMaterialInternal;
        const originalInit = prototype._initPluginShaderSourceAsync;
        if (typeof originalInit !== "function") {
            return;
        }

        prototype._initPluginShaderSourceAsync = async function patchedInitPluginShaderSourceAsync(shaderLanguage: ShaderLanguage): Promise<void> {
            await originalInit.call(this, shaderLanguage);
            try {
                this.markAsDirty?.(Material.AllDirtyFlag);
            } catch {
                try {
                    this.markAsDirty?.();
                } catch {
                    // Keep babylon-mmd startup resilient if a material is already disposed.
                }
            }
        };
        MmdManager.mmdStandardMaterialPluginInitPatched = true;
    }
    private readonly renderingCanvas: HTMLCanvasElement;
    private engine: Engine | WebGPUEngine;
    private readonly runtimeDiagnostics = new Set<string>();
    private readonly webGpuTextureMipmapDecisionCache = new Map<string, Promise<boolean>>();
    private readonly webGpuTextureFallbackCache = new Map<string, Promise<Texture | null>>();
    private readonly webGpuConfiguredMmdTextureLoaders = new WeakSet<object>();
    private webGpuValidationErrorCount = 0;
    private readonly webGpuValidationErrorMessages: string[] = [];
    private disposeWebGpuValidationMonitor: (() => void) | null = null;
    private scene: Scene;
    private readonly framePerformanceLogMode = MmdManager.readPerformanceLogModeLocalStorage();
    private readonly framePerformanceLogEnabled = this.framePerformanceLogMode !== "off";
    private readonly requestedPostEffectBackend = readPostEffectBackendLocalStorage();
    private postEffectBackend: PostEffectBackend = this.requestedPostEffectBackend;
    private frameGraphPostEffectsController: FrameGraphPostEffectsController | null = null;
    private frameGraphPostEffectsRebuildPending = false;
    private frameGraphPostEffectsRebuildScheduled = false;
    private sceneInstrumentation: SceneInstrumentation | null = null;
    private camera: ArcRotateCamera;
    private mmdCamera: MmdCamera;
    private mmdRuntime: RuntimeMmdRuntime;
    private runtimeMode: RuntimeMode = MmdManager.readRuntimeModeLocalStorage();
    private mmdWasmInstance: IMmdWasmInstance | null = null;
    private vmdLoader: VmdLoader;
    private vpdLoader: VpdLoader;
    private currentMesh: MmdMesh | null = null;
    private currentModel: RuntimeModel | null = null;
    private activeModelInfo: ModelInfo | null = null;
    private sceneModels: SceneModelEntry[] = [];
    private readonly modelExternalParentMatrix = Matrix.Identity();
    private readonly modelExternalParentBoneMatrix = Matrix.Identity();
    private mmdMaterialPipelinePresetValue = MmdManager.readMmdMaterialPipelinePresetLocalStorage();
    private _isPlaying = false;
    private _currentFrame = 0;
    private _totalFrames = 300;
    private _playbackSpeed = 1;
    private manualPlaybackWithoutAudio = false;
    private externalPlaybackSimulationEnabled = false;
    private preferredBulletPhysicsBackend = MmdManager.readPreferredBulletBackendLocalStorage();
    private physicsBufferedEvaluationDuringPlayback = MmdManager.readBooleanLocalStorage(
        MmdManager.PHYSICS_BUFFERED_EVALUATION_STORAGE_KEY,
        true,
    );
    private physicsMaxSubSteps = PhysicsRuntimeController.normalizeMaxSubSteps(0);
    private manualPlaybackFrameCursor = 0;
    private lastRenderTimestampMs = performance.now();
    private nextRenderDueTimestampMs = performance.now();
    private renderFpsLimit = MmdManager.normalizeRenderFpsLimit(MmdManager.readNumberLocalStorage(
        MmdManager.RENDER_FPS_LIMIT_STORAGE_KEY,
        60,
        0,
        60,
    ));
    private nextRenderStabilityDiagnosticMs = 0;
    private nextFramePerformanceLogMs = performance.now() + MmdManager.FRAME_PERFORMANCE_LOG_INTERVAL_MS;
    private nextPhysicsChainDiagnosticsMs = 0;
    private readonly framePerformanceProfiler = new PerformanceProfiler(FRAME_PERFORMANCE_SECTIONS);
    private readonly framePerformancePhaseStartMs = new Map<FramePerformanceSection, number>();
    private readonly performanceHookedRuntimes = new WeakSet<object>();
    private ground: Mesh | null = null;
    private mirroringFloor: Mesh | null = null;
    private mirroringFloorMaterial: StandardMaterial | null = null;
    private mirroringFloorTexture: MirrorTexture | null = null;
    private mirroringFloorEnabledValue = false;
    private mirroringFloorShapeValue: MirroringFloorShape = "square";
    private mirroringFloorReflectanceValue = 0.3;
    private mirroringFloorSizeValue = 100;
    private mirroringFloorHeightValue = 0;
    private mirroringFloorResolutionValue = 1024;
    private skydome: Mesh | null = null;
    private skydomeMaterial: BackgroundMaterial | null = null;
    private skydomeGradientTexture: DynamicTexture | null = null;
    private environmentSkyboxTexture: BaseTexture | null = null;
    private skydomeVisibleValue = true;
    private skydomeBackgroundStyleValue = normalizeSkydomeBackgroundStyle(DEFAULT_SKYDOME_BACKGROUND_STYLE);
    private backgroundImageLayer: Layer | null = null;
    private backgroundImagePath: string | null = null;
    private backgroundVideoLayer: Layer | null = null;
    private backgroundVideoTexture: DynamicTexture | null = null;
    private backgroundVideoElement: HTMLVideoElement | null = null;
    private backgroundVideoCanvas: HTMLCanvasElement | null = null;
    private backgroundVideoPath: string | null = null;
    private backgroundMediaVisible = true;
    private backgroundVideoLastSyncedTime = Number.NaN;
    private backgroundVideoLastDrawnTime = Number.NaN;
    private readonly blackClearColor = new Color4(0, 0, 0, 1);
    private backgroundBlackEnabled = false;
    private audioPlayer: StreamAudioPlayer | null = null;
    private audioBlobUrl: string | null = null;
    // Lighting references
    private dirLight!: DirectionalLight;
    private hemiLight!: HemisphericLight;
    private shadowGenerator!: ShadowGenerator;
    private shadowSceneContentRefreshScheduled = false;
    private iblShadowsPipeline: IblShadowsRenderPipeline | null = null;
    private iblFallbackEnvironmentTexture: RawCubeTexture | null = null;
    private environmentLightingSuppressedTexture: BaseTexture | null = null;
    private bundledEnvironmentTexture: HDRCubeTexture | null = null;
    private externalEnvironmentTexture: HDRCubeTexture | null = null;
    private environmentLightingSourcePathValue: string | null = null;
    private environmentLightingLoadGeneration = 0;
    private iblWebGpuCdfFallbackTexture: RawTexture | null = null;
    private iblWebGpuSuppressedEnvironmentTexture: BaseTexture | null = null;
    private iblShadowDebugPassSignature = "";
    private environmentLightingEnabledValue = MmdManager.readBooleanLocalStorage(
        MmdManager.ENVIRONMENT_LIGHTING_STORAGE_KEY,
        true,
    );
    private environmentLightingIntensityValue = MmdManager.readEnvironmentLightingIntensityLocalStorage();
    private environmentBackgroundVisibleValue = MmdManager.readBooleanLocalStorage(
        MmdManager.ENVIRONMENT_BACKGROUND_STORAGE_KEY,
        false,
    );
    private environmentBackgroundIntensityValue = this.initializeEnvironmentBackgroundIntensityLocalStorage();
    private contactShadowTexture: DynamicTexture | null = null;
    private contactShadowBlobTexture: Texture | null = null;
    private contactShadowMaterial: StandardMaterial | null = null;
    private contactShadowMeshesByModel = new WeakMap<SceneModelEntry, ContactShadowBlobMeshes>();
    private characterContactShadowEnabledValue = false;
    private characterContactShadowOpacityValue = 0.5;
    private characterContactShadowScaleValue = 2.0;
    private cameraRotationEulerDeg = new Vector3(0, 0, 0);
    private cameraAnimationHandle: MmdRuntimeAnimationHandle | null = null;
    private hasCameraMotion = false;
    private readonly modelKeyframeTracksByModel = new WeakMap<RuntimeModel, Map<string, Uint32Array>>();
    private readonly modelSourceAnimationsByModel = new WeakMap<RuntimeModel, MmdAnimation>();
    private readonly editorModelAnimations = new WeakSet<MmdAnimation>();
    private cameraSourceAnimation: MmdAnimation | null = null;
    private readonly modelMotionImportsByModel = new WeakMap<RuntimeModel, ProjectMotionImport[]>();
    private cameraMotionPath: string | null = null;
    private audioSourcePath: string | null = null;
    private cameraKeyframeFrames: Uint32Array = EMPTY_KEYFRAME_FRAMES;
    private timelineTarget: "model" | "camera" = "model";
    private boneVisualizerTarget: { mesh: Mesh; skeleton: Skeleton | null; pairs: Array<[number, number]>; positionMesh: Mesh; runtimeBones: readonly IMmdRuntimeBone[] | null; runtimeUseMeshWorldMatrix: boolean; boneControlInfoByName: ReadonlyMap<string, BoneControlInfo> } | null = null;
    private boneOverlayCanvas: HTMLCanvasElement | null = null;
    private boneOverlayCtx: CanvasRenderingContext2D | null = null;
    private boneOverlayDpr = 1;
    private readonly boneOverlayChildWorld = new Vector3();
    private readonly boneOverlayParentWorld = new Vector3();
    private readonly boneOverlayChildScreen = new Vector3();
    private readonly boneOverlayParentScreen = new Vector3();
    private readonly boneOverlayIdentity = Matrix.Identity();
    private boneVisualizerSelectedBoneName: string | null = null;
    private boneVisualizerSelectedBoneNames: ReadonlySet<string> = new Set<string>();
    private boneVisualizerPickPoints: { boneName: string; x: number; y: number }[] = [];
    private bonePickPointerDown: { pointerId: number; clientX: number; clientY: number } | null = null;
    private captureEditorOverlaysSuppressed = false;
    private rigidBodyVisualizerEnabled = false;
    private showPhysicsBonesInViewport = false;
    private showPhysicsBonesInTimeline = false;
    private rigidBodyVisualizerTargets: {
        sceneModel: SceneModelEntry;
        backend: "ammo" | "bullet";
        physicsModel: unknown;
        rigidBodies: SceneModelRigidBodyEntry[];
        meshes: Mesh[];
    }[] = [];
    private readonly rigidBodyVisualizerTempMatrix = Matrix.Identity();
    private readonly rigidBodyVisualizerTempScaling = new Vector3(1, 1, 1);
    private readonly rigidBodyVisualizerTempPosition = new Vector3();
    private readonly rigidBodyVisualizerTempRotation = Quaternion.Identity();
    private readonly rigidBodyVisualizerMaterials = new Map<number, StandardMaterial>();
    private cameraMouseDragState: {
        pointerId: number;
        mode: "rotate" | "pan" | "zoom";
        lastClientX: number;
        lastClientY: number;
    } | null = null;
    private lastViewportCameraSyncState:
        | {
            position: Vector3;
            target: Vector3;
            radius: number;
            fov: number;
        }
        | null = null;
    private cameraExternalParentModelIndex: number | null = null;
    private cameraExternalParentModelPath: string | null = null;
    private cameraExternalParentBoneName: string | null = null;
    private cameraLowerRadiusLimitBeforeExternalParent: number | null | undefined;
    private cameraExternalParentKeyframes: CameraExternalParentKeyframe[] = [];
    private readonly cameraExternalParentMatrix = Matrix.Identity();
    private readonly cameraExternalParentInverseMatrix = Matrix.Identity();
    private readonly cameraExternalParentPosition = new Vector3();
    private readonly cameraExternalParentTarget = new Vector3();
    private readonly cameraExternalParentUp = new Vector3();
    private readonly cameraExternalParentForward = new Vector3();
    private readonly cameraExternalParentPanMove = new Vector3();
    private boneGizmoManager: GizmoManager | null = null;
    private boneGizmoRuntimeBone: EditorRuntimeBone | null = null;
    private boneGizmoProxyNode: TransformNode | null = null;
    private readonly boneGizmoTempMatrix = Matrix.Identity();
    private readonly boneGizmoTempMatrix2 = Matrix.Identity();
    private readonly boneGizmoTempScale = new Vector3(1, 1, 1);
    private readonly boneGizmoTempScale2 = new Vector3(1, 1, 1);
    private readonly boneGizmoTempPosition = new Vector3();
    private readonly boneGizmoTempPosition2 = new Vector3();
    private readonly boneGizmoTempPosition3 = new Vector3();
    private readonly boneGizmoTempRotation = Quaternion.Identity();
    private readonly boneGizmoTempRotation2 = Quaternion.Identity();
    private physicsEnabledBeforeBoneGizmoDrag: boolean | null = null;
    private globalIlluminationController: GlobalIlluminationController | null = null;
    private physicsController!: PhysicsRuntimeController;
    private physicsModelController!: PhysicsModelController;
    private physicsInitializationPromise: Promise<boolean>;
    private webGpuSdefCpuFallbackEnabled = MmdManager.readBooleanLocalStorage(
        MmdManager.WEBGPU_SDEF_CPU_FALLBACK_STORAGE_KEY,
        false,
    );
    private shadowEnabled = true;
    private shadowDarknessValue = 0.05;
    private shadowModeValue: ShadowMode = "cascaded";
    private shadowFrustumSizeValue = 220;
    private shadowMaxZValue = 1000;
    private shadowBiasValue = 0.0005;
    private shadowNormalBiasValue = 0.01;
    private shadowFilteringQualityValue = ShadowGenerator.QUALITY_HIGH;
    private shadowBlurKernelValue = 0;
    private shadowBlurScaleValue = 2;
    private shadowBlurBoxOffsetValue = 1;
    private shadowPenumbraEnabledValue = false;
    private shadowPenumbraSizeValue = 0.08;
    private transparentShadowEnabledValue = true;
    private softTransparentShadowEnabledValue = true;
    private iblShadowsEnabledValue = false;
    private iblShadowOpacityValue = 0.6;
    private iblShadowDistanceScaleValue = 4;
    private selfShadowEdgeSoftnessValue = 0.05;
    private occlusionShadowEdgeSoftnessValue = 0.1;
    private toonShadowInfluenceValue = 1;

    private lightColorTemperatureKelvin = 6500;
    private lightColorScaleValue = new Color3(1, 1, 1);
    private lightFlatStrengthValue = 0;
    private lightFlatColorInfluenceValue = 0.35;
    private shadowGroundColorValue = new Color3(0.5, 0.5, 0.5);
    private postEffectContrastValue = 1;
    private postEffectGammaValue = 1;
    private postEffectExposureValue = 1;
    private postEffectToneMappingEnabledValue = false;
    private postEffectToneMappingTypeValue = ImageProcessingConfiguration.TONEMAPPING_STANDARD;
    private postEffectDitheringEnabledValue = false;
    private postEffectDitheringIntensityValue = 1 / 255;
    private postEffectVignetteEnabledValue = false;
    private postEffectVignetteWeightValue = 0.3;
    private postEffectBloomEnabledValue = false;
    private postEffectBloomWeightValue = 1;
    private postEffectBloomThresholdValue = 1;
    private postEffectBloomKernelValue = 100;
    private postEffectBloomColorValue = new Color3(1, 0.48, 0.16);
    private postEffectChromaticAberrationValue = 0;
    private postEffectGrainIntensityValue = 0;
    private postEffectSharpenEdgeValue = 0;
    private postEffectSsaoEnabledValue = false;
    private postEffectSsaoStrengthValue = 0.5;
    private postEffectSsaoRadiusValue = 3;
    private postEffectSsaoFadeEndValue = 200;
    private postEffectSsaoDebugViewValue = false;
    private postEffectOffsetShadowEnabledValue = false;
    private postEffectOffsetShadowStrengthValue = 0.35;
    private postEffectOffsetShadowOffsetXValue = 0;
    private postEffectOffsetShadowOffsetYValue = -30;
    private postEffectOffsetShadowDepthBiasValue = 0.2;
    private postEffectOffsetShadowMaxDepthValue = 2;
    private postEffectOffsetShadowDepthScaleValue = 1;
    private postEffectOffsetShadowThicknessValue = 1;
    private postEffectOffsetShadowSoftnessValue = 0;
    private postEffectOffsetShadowNormalInfluenceValue = 0;
    private postEffectOffsetShadowColorValue = new Color3(0.29, 0.21, 0.16);
    private postEffectOffsetShadowDebugViewValue = false;
    private postEffectOffsetHighlightEnabledValue = false;
    private postEffectOffsetHighlightStrengthValue = 1;
    private postEffectOffsetHighlightOffsetXValue = 0;
    private postEffectOffsetHighlightOffsetYValue = -100;
    private postEffectOffsetHighlightDepthThresholdValue = 0.1;
    private postEffectOffsetHighlightNormalThresholdValue = 0;
    private postEffectOffsetHighlightThicknessValue = 1;
    private postEffectOffsetHighlightSoftnessValue = 0;
    private postEffectOffsetHighlightDepthScaleValue = 1;
    private postEffectOffsetHighlightColorValue = new Color3(1, 1, 1);
    private postEffectOffsetHighlightDebugViewValue = false;
    private postEffectColorCurvesEnabledValue = false;
    private postEffectColorCurvesHueValue = 30;
    private postEffectColorCurvesDensityValue = 0;
    private postEffectColorCurvesSaturationValue = 0;
    private postEffectColorCurvesExposureValue = 0;
    private postEffectGlowEnabledValue = false;
    private postEffectGlowIntensityValue = 0.5;
    private postEffectGlowThresholdValue = 0.5;
    private postEffectGlowKernelValue = 20;
    private postEffectGlowGlareCountValue = 0;
    private postEffectGlowGlareLengthValue = 48;
    private postEffectGlowGlareAngleValue = 0;
    private postEffectGlowGlarePowerValue = 0.4;
    private postEffectLutEnabledValue = false;
    private postEffectLutIntensityValue = 1;
    private postEffectLutPresetValue = "anime-soft";
    private postEffectLutSourceModeValue: PostEffectLutSourceMode = "builtin";
    private postEffectLutExternalPathValue: string | null = null;
    private postEffectLutExternalTextValue: string | null = null;
    private postEffectLutExternalSourceFormatValue: "3dl" | "cube" | null = null;
    private postEffectLutExternalRevision = 0;
    private postEffectMotionBlurEnabledValue = false;
    private postEffectMotionBlurStrengthValue = 10;
    private postEffectMotionBlurSamplesValue = 32;
    private postEffectSsrEnabledValue = false;
    private postEffectSsrStrengthValue = 0.3;
    private postEffectSsrStepValue = 4;
    private postEffectSsgiStrengthValue = 0.3;
    private postEffectSsgiSampleRadiusValue = 64;
    private postEffectVlsEnabledValue = false;
    private postEffectVlsExposureValue = 0.3;
    private postEffectVlsDecayValue = 0.95;
    private postEffectVlsWeightValue = 0.4;
    private postEffectVlsDensityValue = 0.9;
    private postEffectFogEnabledValue = false;
    private postEffectFogModeValue = 2;
    private postEffectFogStartValue = 100;
    private postEffectFogEndValue = 300;
    private postEffectFogDensityValue = 0.002;
    private postEffectFogOpacityValue = 0.2;
    private postEffectFogColorValue = new Color3(0.04, 0.04, 0.06);
    private frameGraphPostEffectStackIdsValue: FrameGraphPostEffectId[] = [];
    private frameGraphPostEffectStackEnabledValue = new Map<FrameGraphPostEffectId, boolean>();
    private frameGraphPostEffectStackInitializedValue = false;
    private antialiasEnabledValue = true;
    private postEffectFarDofStrengthValue = 0;
    private readonly farDofEnabled = false;
    private readonly farDofFocusSharpRadiusMm = 1000;
    private modelEdgeWidthValue = 0;
    private modelEdgeColorOverrideEnabledValue = false;
    private modelEdgeColorValue = { r: 0, g: 0, b: 0 };
    private readonly modelEdgeMaterialDefaults = new WeakMap<object, { enabled: boolean; width: number; alpha: number; colorR: number; colorG: number; colorB: number }>();
    private readonly materialBaseAlphaByMaterial = new WeakMap<object, number>();
    private readonly materialShaderDefaultsByMaterial = new WeakMap<object, MaterialShaderDefaults>();
    private readonly materialShaderPresetByMaterial = new WeakMap<object, WgslMaterialShaderPresetId>();
    private readonly externalWgslToonShaderPathByMaterial = new WeakMap<object, string>();
    private readonly materialHiddenByMaterial = new WeakMap<object, boolean>();
    private externalWgslToonShaderPathValue: string | null = null;
    private colorCorrectionPostProcess: PostProcess | null = null;
    private exportRenderSurface: ExportRenderSurface | null = null;
    private frameGraphPostEffectsSceneColorTarget: RenderTargetTexture | null = null;
    private frameGraphPostEffectsSceneColorPrePassActivationPass: PassPostProcess | null = null;
    private subSurfaceCompositionUsesLocalGamma: boolean | null = null;
    private frameGraphPostEffectsLuminousMaskTarget: RenderTargetTexture | null = null;
    private frameGraphPostEffectsLuminousMaskMaterial: StandardMaterial | null = null;
    private frameGraphPostEffectsLuminousMaskRenderedSubMeshCount = 0;
    private frameGraphPostEffectsLuminousMaskZeroWarningEmitted = false;
    private frameGraphPostEffectsSsgiUnsupportedWarningEmitted = false;
    private originFogPostProcess: PostProcess | null = null;
    private finalAntialiasPostProcess: FxaaPostProcess | null = null;
    private finalLensDistortionPostProcess: PostProcess | null = null;
    private dofPostProcess: PostProcess | null = null;
    private depthRenderer: DepthRenderer | null = null;
    private ssaoDepthRenderer: DepthRenderer | null = null;
    private defaultRenderingPipeline: DefaultRenderingPipeline | null = null;
    private lensRenderingPipeline: LensRenderingPipeline | null = null;
    private ssaoRenderingPipeline: SSAO2RenderingPipeline | null = null;
    private ssaoPostProcess: PostProcess | null = null;
    private ssrRenderingPipeline: SSRRenderingPipeline | null = null;
    private motionBlurPostProcess: PostProcess | null = null;
    private motionBlurPreviousCameraPosition: Vector3 | null = null;
    private motionBlurScreenDirection = new Vector2(0, 0);
    private motionBlurScreenAmount = 0;
    private standaloneBloomEffect: BloomEffect | null = null;
    private luminousGlowLayer: GlowLayer | null = null;
    private luminousGlowCoreLayer: GlowLayer | null = null;
    private luminousGlowMorphRevision = 0;
    private standaloneLensBlurPostProcess: PostProcess | null = null;
    private standaloneEdgeBlurPostProcess: PostProcess | null = null;
    private volumetricLightPostProcess: VolumetricLightScatteringPostProcess | null = null;
    private postEffectLutTexture: ColorGradingTexture | null = null;
    private postEffectLutTextureKey: string | null = null;
    private readonly postEffectLutPresetBlobUrlById = new Map<string, string>();
    private postEffectLutExternalBlobUrl: string | null = null;
    private dofEnabledValue = false;
    private dofBlurLevelValue = DepthOfFieldEffectBlurLevel.Medium;
    private dofFocusDistanceMmValue = 55000;
    private dofFStopValue = 2.0;
    private dofEffectiveFStopValue = 2.0;
    private dofLensBlurStrengthValue = 0;
    private dofLensBlurEnabledValue = true;
    private dofLensEdgeBlurValue = 0;
    private dofLensDistortionValue = 0;
    private readonly dofLensDistortionFollowsCameraFov = true;
    private readonly dofLensDistortionNeutralFovDeg = 30;
    private readonly dofLensDistortionMinTeleFovDeg = 10;
    private readonly dofLensDistortionMaxWideFovDeg = 120;
    private dofLensDistortionInfluenceValue = 0;
    private readonly dofLensHighlightsBaseGain = 1.1;
    private readonly dofLensHighlightsGainRange = 8.0;
    private readonly dofLensHighlightsBaseThreshold = 0.62;
    private readonly dofLensHighlightsThresholdRange = 0.72;
    private dofLensSizeValue = 1000;
    private dofFocalLengthValue = 50;
    private readonly dofFocalLengthFollowsCameraFov = true;
    private readonly dofFovLinkSensorWidthMm = 36;
    private dofFocalLengthDistanceInvertedValue = false;
    private readonly dofAutoFocusToCameraTarget = true;
    private readonly dofAutoFocusInFocusRadiusMm = 6000;
    private readonly dofAutoFocusCocAtRangeEdge = 0.05;
    private readonly dofAutoFocusLensCompensationExponent = 0.72;
    private dofNearSuppressionScaleValue = 4.0;
    private dofAutoFocusNearOffsetMmValue = 0;
    private dofFocusTargetModelPathValue: string | null = null;
    private dofFocusTargetBoneNameValue: string | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private autoRenderEnabled = true;
    private readonly onWindowResize = () => {
        this.resize();
    };
    private isBoneGizmoPointerInteractionActive(clientX?: number, clientY?: number): boolean {
        const gizmoManager = this.boneGizmoManager;
        if (!gizmoManager) return false;
        if (gizmoManager.isDragging || gizmoManager.isHovered) return true;
        if (clientX === undefined || clientY === undefined) return false;

        const utilityLayerScene = gizmoManager.utilityLayer.utilityLayerScene;
        const canvasRect = this.renderingCanvas.getBoundingClientRect();
        const pickX = clientX - canvasRect.left;
        const pickY = clientY - canvasRect.top;
        if (pickX < 0 || pickY < 0 || pickX > canvasRect.width || pickY > canvasRect.height) {
            return false;
        }

        const pickInfo = utilityLayerScene.pick(pickX, pickY);
        return pickInfo?.hit === true && pickInfo.pickedMesh !== null;
    }
    private readonly onCanvasPointerDown = (event: PointerEvent) => {
        if (event.button === 0) {
            if (this.isBoneGizmoPointerInteractionActive(event.clientX, event.clientY)) {
                this.bonePickPointerDown = null;
                return;
            }
            this.bonePickPointerDown = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
            };
            return;
        }

        const dragMode = this.resolveCameraMouseDragMode(event);
        if (!dragMode) return;

        this.cameraMouseDragState = {
            pointerId: event.pointerId,
            mode: dragMode,
            lastClientX: event.clientX,
            lastClientY: event.clientY,
        };
        this.bonePickPointerDown = null;

        try {
            this.renderingCanvas.setPointerCapture(event.pointerId);
        } catch {
            // ignore capture errors
        }

        event.preventDefault();
    };
    private readonly onCanvasPointerMove = (event: PointerEvent) => {
        const dragState = this.cameraMouseDragState;
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - dragState.lastClientX;
        const deltaY = event.clientY - dragState.lastClientY;
        dragState.lastClientX = event.clientX;
        dragState.lastClientY = event.clientY;

        this.applyCameraMouseDrag(dragState.mode, deltaX, deltaY);
        event.preventDefault();
    };
    private readonly onCanvasPointerUp = (event: PointerEvent) => {
        if (event.button === 0) {
            const pointerDown = this.bonePickPointerDown;
            this.bonePickPointerDown = null;
            if (!pointerDown || pointerDown.pointerId !== event.pointerId) return;
            if (this.isBoneGizmoPointerInteractionActive(event.clientX, event.clientY)) return;

            const movedDistance = Math.hypot(event.clientX - pointerDown.clientX, event.clientY - pointerDown.clientY);
            if (movedDistance > 6) return;

            this.tryPickBoneVisualizerAtClientPosition(event.clientX, event.clientY, { additive: event.shiftKey });
            return;
        }

        const dragState = this.cameraMouseDragState;
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        this.cameraMouseDragState = null;
        try {
            this.renderingCanvas.releasePointerCapture(event.pointerId);
        } catch {
            // ignore capture errors
        }
        event.preventDefault();
    };
    private readonly onCanvasPointerCancel = (event?: PointerEvent) => {
        this.bonePickPointerDown = null;
        if (!event || !this.cameraMouseDragState || this.cameraMouseDragState.pointerId === event.pointerId) {
            this.cameraMouseDragState = null;
        }
    };
    private readonly onCanvasContextMenu = (event: MouseEvent) => {
        // Keep RMB drag available for camera control (MMD-like).
        event.preventDefault();
    };
    private readonly onCanvasMouseDown = (event: MouseEvent) => {
        // Suppress Chromium autoscroll so MMB drag behaves like MMD viewport pan.
        if (event.button === 1) {
            event.preventDefault();
        }
    };
    private readonly onCanvasAuxClick = (event: MouseEvent) => {
        if (event.button === 1) {
            event.preventDefault();
        }
    };
    private readonly onCanvasWheel = (event: WheelEvent) => {
        if (this.hasActiveCameraAnimation() && this._isPlaying) {
            return;
        }

        const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                ? 600
                : 1;
        const scaledDelta = event.deltaY * deltaScale;
        if (!Number.isFinite(scaledDelta) || Math.abs(scaledDelta) < 0.001) return;

        const zoomFactor = Math.exp(scaledDelta * VIEWPORT_CAMERA_WHEEL_ZOOM_EXPONENT);
        if (this.cameraExternalParentModelIndex !== null) {
            this.applyExternalParentCameraZoomFactor(1 / zoomFactor);
            this.onCameraTransformEdited?.();
            event.preventDefault();
            return;
        }

        this.camera.radius = this.clampCameraRadius(this.camera.radius * zoomFactor);
        this.syncCameraRotationFromCurrentView({ preserveRoll: true });
        this.clearCameraInertialOffsets();
        this.syncMmdCameraFromViewportCamera();
        this.updateOrthographicCameraBounds();
        this.onCameraTransformEdited?.();
        event.preventDefault();
    };
    private suspendSceneRenderCount = 0;

    private resolveCameraMouseDragMode(event: PointerEvent): "rotate" | "pan" | "zoom" | null {
        if (this.hasActiveCameraAnimation() && this._isPlaying) {
            return null;
        }
        if (event.button === 1) {
            return "pan";
        }

        if (event.button !== 2) {
            return null;
        }

        if (event.shiftKey) {
            return "pan";
        }

        if (event.ctrlKey || event.metaKey) {
            return "zoom";
        }

        return "rotate";
    }

    private applyCameraMouseDrag(mode: "rotate" | "pan" | "zoom", deltaX: number, deltaY: number): void {
        if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;

        if (this.cameraExternalParentModelIndex !== null) {
            this.applyExternalParentCameraMouseDrag(mode, deltaX, deltaY);
            return;
        }

        if (mode === "rotate") {
            const sensibilityX = Math.max(80, this.camera.angularSensibilityX || VIEWPORT_CAMERA_ROTATE_SENSIBILITY);
            const sensibilityY = Math.max(80, this.camera.angularSensibilityY || VIEWPORT_CAMERA_ROTATE_SENSIBILITY);
            this.cameraRotationEulerDeg.x -= (deltaY / sensibilityY) * (180 / Math.PI);
            this.cameraRotationEulerDeg.y -= (deltaX / sensibilityX) * (180 / Math.PI);
            this.cameraRotationEulerDeg.y = this.normalizeCameraAngleDeg(this.cameraRotationEulerDeg.y);
            this.clampCameraRotationPitch();
            this.applyCameraOrbitRotationFromEuler();
        } else if (mode === "pan") {
            const forward = this.camera.target.subtract(this.camera.position);
            if (forward.lengthSquared() > 1e-8) {
                forward.normalize();
                const up = this.camera.upVector.clone();
                if (up.lengthSquared() < 1e-8) {
                    up.set(0, 1, 0);
                } else {
                    up.normalize();
                }
                let right = Vector3.Cross(forward, up);
                if (right.lengthSquared() < 1e-8) {
                    right = Vector3.Right();
                } else {
                    right.normalize();
                }
                const trueUp = Vector3.Cross(right, forward).normalize();
                const panScale = Math.max(0.001, this.camera.radius * VIEWPORT_CAMERA_PAN_SCALE);
                const move = right.scale(deltaX * panScale).add(trueUp.scale(deltaY * panScale));
                this.camera.target.addInPlace(move);
                this.camera.position.addInPlace(move);
            }
        } else {
            const zoomScale = Math.max(0.01, this.camera.radius * VIEWPORT_CAMERA_DRAG_ZOOM_SCALE);
            this.camera.radius = this.clampCameraRadius(this.camera.radius + deltaY * zoomScale);
        }

        if (mode !== "rotate") {
            this.syncCameraRotationFromCurrentView({ preserveRoll: true });
        }
        this.clearCameraInertialOffsets();
        this.syncMmdCameraFromViewportCamera();
        this.updateOrthographicCameraBounds();
        this.onCameraTransformEdited?.();
    }

    private hasActiveCameraAnimation(): boolean {
        return this.cameraSourceAnimation !== null || this.cameraAnimationHandle !== null || this.hasCameraMotion;
    }

    private shouldApplyCameraMotionToViewport(): boolean {
        return this.hasActiveCameraAnimation() && (this._isPlaying || this.externalPlaybackSimulationEnabled);
    }

    private shouldSyncViewportCameraToMmdCamera(): boolean {
        if (!this.hasActiveCameraAnimation()) return true;
        if (this._isPlaying || this.externalPlaybackSimulationEnabled) return false;
        return this.timelineTarget === "camera";
    }

    private clampCameraRadius(radius: number): number {
        const lower = this.camera.lowerRadiusLimit ?? 0.1;
        const upper = this.camera.upperRadiusLimit ?? Number.POSITIVE_INFINITY;
        return Math.max(lower, Math.min(upper, radius));
    }

    private applyExternalParentCameraZoomFactor(zoomFactor: number): void {
        if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) return;
        const currentCenterZ = this.mmdCamera.target.z;
        const referenceDistance = Math.max(1, Math.abs(currentCenterZ), this.camera.radius);
        this.applyExternalParentCameraCenterZ(
            currentCenterZ + (zoomFactor - 1) * referenceDistance,
        );
    }

    private applyExternalParentCameraCenterZ(centerZ: number): void {
        if (!Number.isFinite(centerZ)) return;
        this.mmdCamera.target.z = centerZ;
        this.mmdCamera.distance = 0;
        this.mmdCamera.updatePosition();
        this.syncViewportCameraFromMmdCamera(true);
    }

    private applyExternalParentCameraMouseDrag(mode: "rotate" | "pan" | "zoom", deltaX: number, deltaY: number): void {
        if (mode === "rotate") {
            const sensibilityX = Math.max(80, this.camera.angularSensibilityX || VIEWPORT_CAMERA_ROTATE_SENSIBILITY);
            const sensibilityY = Math.max(80, this.camera.angularSensibilityY || VIEWPORT_CAMERA_ROTATE_SENSIBILITY);
            this.cameraRotationEulerDeg.x -= (deltaY / sensibilityY) * (180 / Math.PI);
            this.cameraRotationEulerDeg.y -= (deltaX / sensibilityX) * (180 / Math.PI);
            this.cameraRotationEulerDeg.y = this.normalizeCameraAngleDeg(this.cameraRotationEulerDeg.y);
            this.clampCameraRotationPitch();
            this.applyExternalParentCameraRotationFromEuler();
        } else if (mode === "pan") {
            this.applyExternalParentCameraPan(deltaX, deltaY);
        } else {
            this.applyExternalParentCameraZoomFactor(Math.exp(deltaY * VIEWPORT_CAMERA_DRAG_ZOOM_SCALE));
        }

        this.clearCameraInertialOffsets();
        this.onCameraTransformEdited?.();
    }

    private applyExternalParentCameraRotationFromEuler(): void {
        this.mmdCamera.rotation.set(
            (this.cameraRotationEulerDeg.x * Math.PI) / 180,
            (this.normalizeCameraAngleDeg(this.cameraRotationEulerDeg.y) * Math.PI) / 180,
            (this.normalizeCameraAngleDeg(this.cameraRotationEulerDeg.z) * Math.PI) / 180,
        );
        this.mmdCamera.distance = 0;
        this.mmdCamera.updatePosition();
        this.syncViewportCameraFromMmdCamera(true);
    }

    private applyExternalParentCameraPan(deltaX: number, deltaY: number): void {
        const rotationMatrix = Matrix.RotationYawPitchRoll(
            -this.mmdCamera.rotation.y,
            -this.mmdCamera.rotation.x,
            -this.mmdCamera.rotation.z,
        );
        const forward = this.camera.target.subtract(this.camera.position);
        if (forward.lengthSquared() < 1e-8) return;
        forward.normalize();
        const up = this.camera.upVector.clone();
        if (up.lengthSquared() < 1e-8) {
            up.set(0, 1, 0);
        } else {
            up.normalize();
        }

        let right = Vector3.Cross(forward, up);
        if (right.lengthSquared() < 1e-8) {
            right = Vector3.Right();
        } else {
            right.normalize();
        }
        const trueUp = Vector3.Cross(right, forward).normalize();
        const panScale = Math.max(0.001, Math.abs(this.mmdCamera.target.z) * VIEWPORT_CAMERA_PAN_SCALE);
        const worldMove = right.scale(deltaX * panScale).add(trueUp.scale(deltaY * panScale));

        // Pan is calculated in the current viewport plane. Convert it back through
        // the parent and local-camera rotations before storing it in editable XYZ;
        // otherwise the local camera rotation is applied a second time on render.
        this.cameraExternalParentPanMove.copyFrom(worldMove);
        if (this.getCameraExternalParentMatrixToRef(this.cameraExternalParentMatrix)) {
            this.cameraExternalParentMatrix.invertToRef(this.cameraExternalParentInverseMatrix);
            Vector3.TransformNormalToRef(
                worldMove,
                this.cameraExternalParentInverseMatrix,
                this.cameraExternalParentPanMove,
            );
        }
        rotationMatrix.invertToRef(this.cameraExternalParentInverseMatrix);
        Vector3.TransformNormalToRef(
            this.cameraExternalParentPanMove,
            this.cameraExternalParentInverseMatrix,
            this.cameraExternalParentForward,
        );
        this.mmdCamera.target.addInPlace(this.cameraExternalParentForward);
        this.mmdCamera.distance = 0;
        this.mmdCamera.updatePosition();
        this.syncViewportCameraFromMmdCamera(true);
    }

    // Callbacks
    public onFrameUpdate: ((frame: number, total: number) => void) | null = null;
    public onModelLoaded: ((info: ModelInfo) => void) | null = null;
    public onSceneModelLoaded: ((info: ModelInfo, totalCount: number, active: boolean) => void) | null = null;
    public onMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onCameraMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onKeyframesLoaded: ((tracks: KeyframeTrack[]) => void) | null = null;
    public onError: ((message: string) => void) | null = null;
    public onWebGpuValidationError: ((message: string) => void) | null = null;
    public onAudioLoaded: ((name: string) => void) | null = null;
    public onPhysicsStateChanged: ((enabled: boolean, available: boolean) => void) | null = null;
    public onBoneVisualizerBonePicked: ((pick: { boneName: string; additive: boolean }) => void) | null = null;
    public onBoneTransformEditStarted: ((boneName: string) => void) | null = null;
    public onBoneTransformEdited: ((boneName: string) => void) | null = null;
    public onBoneTransformEditCommitted: ((boneName: string) => void) | null = null;
    public onCameraTransformEdited: (() => void) | null = null;
    public onMaterialShaderStateChanged: (() => void) | null = null;
    public onGlobalIlluminationStateChanged: ((enabled: boolean) => void) | null = null;
    public onDofFocusTargetChanged: (() => void) | null = null;

    public getLoadedModels(): { index: number; name: string; path: string; active: boolean; castsShadow: boolean }[] {
        return this.sceneModels.map((entry, index) => ({
            index,
            name: entry.info.name,
            path: entry.info.path,
            active: entry.model === this.currentModel,
            castsShadow: entry.castShadow,
        }));
    }

    public getModelBoneNames(modelIndex: number): string[] {
        return [...(this.sceneModels[modelIndex]?.info.boneNames ?? [])];
    }

    public getModelExternalParent(modelIndex: number): (ModelExternalParentState & { parentModelIndex: number }) | null {
        this.applyModelExternalParentKeyframesAtFrame(this._currentFrame);
        const state = this.sceneModels[modelIndex]?.externalParent;
        if (!state) return null;
        const parentModelIndex = this.sceneModels.findIndex((entry) => entry.info.path === state.parentModelPath);
        if (parentModelIndex < 0) return null;
        return { ...state, parentModelIndex };
    }

    public readModelExternalParentKeyframe(
        frame: number,
        childBoneName: string,
    ): ModelExternalParentKeyframePayload | null {
        const entry = this.sceneModels.find((candidate) => candidate.model === this.currentModel);
        if (!entry) return null;
        const normalized = Math.max(0, Math.floor(frame));
        const keyframe = entry.externalParentKeyframes.find((candidate) =>
            candidate.frame === normalized && candidate.childBoneName === childBoneName
        );
        if (!keyframe) return null;
        return {
            childBoneName: keyframe.childBoneName,
            parentModelPath: keyframe.parentModelPath,
            parentBoneName: keyframe.parentBoneName,
        };
    }

    public upsertModelExternalParentKeyframe(
        frame: number,
        payload: ModelExternalParentKeyframePayload,
    ): boolean {
        const childModelIndex = this.sceneModels.findIndex((entry) => entry.model === this.currentModel);
        const childEntry = this.sceneModels[childModelIndex];
        if (!childEntry || !this.getRuntimeBoneByNameFromModel(childEntry.model, payload.childBoneName)) {
            return false;
        }

        const normalizedPayload: ModelExternalParentKeyframe = {
            frame: Math.max(0, Math.floor(frame)),
            childBoneName: payload.childBoneName,
            parentModelPath: payload.parentModelPath || null,
            parentBoneName: payload.parentModelPath ? payload.parentBoneName || null : null,
        };
        if (normalizedPayload.parentModelPath) {
            const parentModelIndex = this.sceneModels.findIndex((entry) => entry.info.path === normalizedPayload.parentModelPath);
            const parentEntry = this.sceneModels[parentModelIndex];
            if (
                !parentEntry
                || !normalizedPayload.parentBoneName
                || !this.getRuntimeBoneByNameFromModel(parentEntry.model, normalizedPayload.parentBoneName)
            ) {
                return false;
            }
        }

        const nextKeyframes = childEntry.externalParentKeyframes.filter((entry) => entry.frame !== normalizedPayload.frame);
        nextKeyframes.push(normalizedPayload);
        nextKeyframes.sort((a, b) => a.frame - b.frame);
        if (!this.validateModelExternalParentTimeline(childModelIndex, nextKeyframes)) {
            return false;
        }

        childEntry.externalParentKeyframes = nextKeyframes;
        this.applyModelExternalParentKeyframesAtFrame(this._currentFrame);
        return true;
    }

    public removeModelExternalParentKeyframes(frames: readonly number[], childBoneName: string): boolean {
        const childEntry = this.sceneModels.find((entry) => entry.model === this.currentModel);
        if (!childEntry) return false;
        const targets = new Set(frames.map((frame) => Math.max(0, Math.floor(frame))));
        childEntry.externalParentKeyframes = childEntry.externalParentKeyframes.filter((entry) =>
            !targets.has(entry.frame) || entry.childBoneName !== childBoneName
        );
        this.applyModelExternalParentKeyframesAtFrame(this._currentFrame);
        return true;
    }

    public moveModelExternalParentKeyframe(
        fromFrame: number,
        toFrame: number,
        childBoneName: string,
    ): boolean {
        const childEntry = this.sceneModels.find((entry) => entry.model === this.currentModel);
        if (!childEntry) return false;
        const from = Math.max(0, Math.floor(fromFrame));
        const to = Math.max(0, Math.floor(toFrame));
        const keyframe = childEntry.externalParentKeyframes.find((entry) =>
            entry.frame === from && entry.childBoneName === childBoneName
        );
        if (!keyframe) return true;
        const nextKeyframes = childEntry.externalParentKeyframes.filter((entry) => entry !== keyframe && entry.frame !== to);
        nextKeyframes.push({ ...keyframe, frame: to });
        nextKeyframes.sort((a, b) => a.frame - b.frame);
        const childModelIndex = this.sceneModels.indexOf(childEntry);
        if (!this.validateModelExternalParentTimeline(childModelIndex, nextKeyframes)) return false;
        childEntry.externalParentKeyframes = nextKeyframes;
        this.applyModelExternalParentKeyframesAtFrame(this._currentFrame);
        return true;
    }

    public getModelExternalParentKeyframes(): ProjectSerializedModelExternalParentTrack[] {
        return this.sceneModels
            .filter((entry) => entry.externalParentKeyframes.length > 0)
            .map((entry) => ({
                modelPath: entry.info.path,
                frameNumbers: this.packFrameNumbers(new Uint32Array(entry.externalParentKeyframes.map((keyframe) => keyframe.frame))),
                childBoneNames: entry.externalParentKeyframes.map((keyframe) => keyframe.childBoneName),
                parentModelPaths: entry.externalParentKeyframes.map((keyframe) => keyframe.parentModelPath),
                parentBoneNames: entry.externalParentKeyframes.map((keyframe) => keyframe.parentBoneName),
            }));
    }

    public setModelExternalParentKeyframes(
        tracks: readonly ProjectSerializedModelExternalParentTrack[] | null | undefined,
    ): boolean {
        for (const entry of this.sceneModels) {
            entry.externalParentKeyframes = [];
            entry.externalParent = null;
        }
        if (!tracks) return true;

        for (const track of tracks) {
            const childModelIndex = this.sceneModels.findIndex((entry) => entry.info.path === track.modelPath);
            const childEntry = this.sceneModels[childModelIndex];
            if (!childEntry || !Array.isArray(track.childBoneNames)) return false;
            const frameCount = track.childBoneNames.length;
            const frames = new Uint32Array(frameCount);
            this.copyProjectArrayToUint32(track.frameNumbers, frames);
            const keyframes: ModelExternalParentKeyframe[] = [];
            for (let index = 0; index < frameCount; index += 1) {
                const childBoneName = track.childBoneNames[index];
                if (!childBoneName || !this.getRuntimeBoneByNameFromModel(childEntry.model, childBoneName)) return false;
                const parentModelPath = typeof track.parentModelPaths?.[index] === "string" && track.parentModelPaths[index]
                    ? track.parentModelPaths[index]
                    : null;
                const parentBoneName = parentModelPath && typeof track.parentBoneNames?.[index] === "string"
                    ? track.parentBoneNames[index] || null
                    : null;
                if (parentModelPath) {
                    const parentEntry = this.sceneModels.find((entry) => entry.info.path === parentModelPath);
                    if (!parentEntry || !parentBoneName || !this.getRuntimeBoneByNameFromModel(parentEntry.model, parentBoneName)) {
                        return false;
                    }
                }
                keyframes.push({
                    frame: Math.max(0, Math.floor(Number(frames[index] ?? 0))),
                    childBoneName,
                    parentModelPath,
                    parentBoneName,
                });
            }
            childEntry.externalParentKeyframes = keyframes
                .sort((a, b) => a.frame - b.frame)
                .filter((entry, index, array) => index === array.findIndex((candidate) => candidate.frame === entry.frame));
        }

        for (let childModelIndex = 0; childModelIndex < this.sceneModels.length; childModelIndex += 1) {
            const keyframes = this.sceneModels[childModelIndex].externalParentKeyframes;
            if (!this.validateModelExternalParentTimeline(childModelIndex, keyframes)) {
                for (const entry of this.sceneModels) {
                    entry.externalParentKeyframes = [];
                    entry.externalParent = null;
                }
                return false;
            }
        }
        this.applyModelExternalParentKeyframesAtFrame(this._currentFrame);
        return true;
    }

    private validateModelExternalParentTimeline(
        candidateChildModelIndex: number,
        candidateKeyframes: readonly ModelExternalParentKeyframe[],
    ): boolean {
        const frames = new Set<number>([0, this._currentFrame]);
        for (let modelIndex = 0; modelIndex < this.sceneModels.length; modelIndex += 1) {
            const keyframes = modelIndex === candidateChildModelIndex
                ? candidateKeyframes
                : this.sceneModels[modelIndex].externalParentKeyframes;
            for (const keyframe of keyframes) frames.add(keyframe.frame);
        }

        for (const frame of frames) {
            const links = new Map<number, { parentModelIndex: number }>();
            for (let modelIndex = 0; modelIndex < this.sceneModels.length; modelIndex += 1) {
                const entry = this.sceneModels[modelIndex];
                const keyframes = modelIndex === candidateChildModelIndex
                    ? candidateKeyframes
                    : entry.externalParentKeyframes;
                const selected = selectModelExternalParentKeyframeAtFrame(keyframes, frame);
                const state = keyframes.length > 0
                    ? selected
                    : entry.externalParent;
                if (!state?.parentModelPath) continue;
                const parentModelIndex = this.sceneModels.findIndex((candidate) => candidate.info.path === state.parentModelPath);
                if (parentModelIndex < 0 || parentModelIndex === modelIndex) return false;
                links.set(modelIndex, { parentModelIndex });
            }
            for (const [childModelIndex, link] of links) {
                if (wouldCreateModelExternalParentCycle(childModelIndex, link.parentModelIndex, links)) return false;
            }
        }
        return true;
    }

    public setModelExternalParent(
        childModelIndex: number,
        childBoneName: string,
        parentModelIndex: number | null,
        parentBoneName: string | null,
    ): boolean {
        const childEntry = this.sceneModels[childModelIndex];
        const childBone = childEntry
            ? this.getRuntimeBoneByNameFromModel(childEntry.model, childBoneName)
            : null;
        if (!childEntry || !childBone) {
            return false;
        }
        if (parentModelIndex === null) {
            childEntry.externalParent = null;
            return true;
        }

        const parentEntry = this.sceneModels[parentModelIndex];
        if (!parentEntry || !parentBoneName || !this.getRuntimeBoneByNameFromModel(parentEntry.model, parentBoneName)) {
            return false;
        }

        const linksByChildModelIndex = new Map<number, { parentModelIndex: number }>();
        for (let index = 0; index < this.sceneModels.length; index += 1) {
            if (index === childModelIndex) continue;
            const state = this.sceneModels[index]?.externalParent;
            if (!state) continue;
            const resolvedParentIndex = this.sceneModels.findIndex((entry) => entry.info.path === state.parentModelPath);
            if (resolvedParentIndex >= 0) {
                linksByChildModelIndex.set(index, { parentModelIndex: resolvedParentIndex });
            }
        }
        if (wouldCreateModelExternalParentCycle(childModelIndex, parentModelIndex, linksByChildModelIndex)) {
            return false;
        }

        this.resetModelExternalParentChildBone(childEntry, childBone);
        childEntry.externalParent = {
            childBoneName,
            parentModelPath: parentEntry.info.path,
            parentBoneName,
        };
        if (childEntry.model === this.currentModel) {
            this.onBoneTransformEdited?.(childBoneName);
        }
        return true;
    }

    private resetModelExternalParentChildBone(
        childEntry: SceneModelEntry,
        childBone: EditorRuntimeBone,
    ): void {
        const restPosition = childBone.linkedBone.getRestMatrix().getTranslation();
        childBone.linkedBone.position.copyFrom(restPosition);
        childBone.linkedBone.setRotationQuaternion(Quaternion.Identity(), Space.LOCAL);
        const linkedBoneInternal = childBone.linkedBone as unknown as {
            markAsDirty?: () => void;
            getSkeleton?: () => Skeleton;
        };
        linkedBoneInternal.markAsDirty?.();
        PhysicsModelController.beforeAndAfterPhysics(childEntry.model);
        linkedBoneInternal.getSkeleton?.()?.computeAbsoluteMatrices(true);
        if (childEntry.model === this.currentModel) {
            this.boneVisualizerTarget?.skeleton?.computeAbsoluteMatrices(true);
        }
    }

    public getModelBoneRenderedPosition(modelIndex: number, boneName: string): { x: number; y: number; z: number } | null {
        const entry = this.sceneModels[modelIndex];
        const runtimeBone = entry ? this.getRuntimeBoneByNameFromModel(entry.model, boneName) : null;
        if (!runtimeBone) return null;
        const position = runtimeBone.linkedBone.getFinalMatrix().getTranslation();
        return { x: position.x, y: position.y, z: position.z };
    }

    public getBoneGizmoPosition(): { x: number; y: number; z: number } | null {
        const position = this.boneGizmoProxyNode?.position;
        if (!position || this.boneGizmoProxyNode?.isEnabled() !== true) return null;
        return { x: position.x, y: position.y, z: position.z };
    }

    public setBoneGizmoRotationDragForE2e(
        rotation: { x: number; y: number; z: number },
        dragging: boolean,
    ): boolean {
        const proxy = this.boneGizmoProxyNode;
        const rotationGizmo = this.boneGizmoManager?.gizmos.rotationGizmo;
        if (!proxy || !rotationGizmo) return false;

        const degToRad = Math.PI / 180;
        proxy.rotationQuaternion = Quaternion.RotationYawPitchRoll(
            rotation.y * degToRad,
            rotation.x * degToRad,
            rotation.z * degToRad,
        );
        rotationGizmo.xGizmo.dragBehavior.dragging = dragging;
        return true;
    }

    public getActiveModelInfo(): ModelInfo | null {
        return this.activeModelInfo;
    }

    public captureWebmInitialPhysicsState(): WebmInitialPhysicsState | null {
        if (!this.getPhysicsEnabled()) {
            return null;
        }

        const models = this.sceneModels
            .map((entry, modelIndex) => PhysicsModelController.captureWebmPhysicsModelSnapshot(
                entry.model,
                modelIndex,
                entry.info.name,
            ))
            .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot !== null);
        if (models.length === 0) {
            return null;
        }

        return {
            capturedFrame: this._currentFrame,
            physicsEnabled: this.getPhysicsEnabled(),
            models,
        };
    }

    public applyWebmInitialPhysicsState(snapshot: WebmInitialPhysicsState | null | undefined): boolean {
        if (!snapshot?.physicsEnabled || snapshot.models.length === 0) {
            return false;
        }

        const clearedPendingInitializations = PhysicsModelController.clearPendingPhysicsInitializations(this.mmdRuntime);
        let restoredCount = 0;
        for (const modelSnapshot of snapshot.models) {
            const sceneModel = this.sceneModels[modelSnapshot.modelIndex];
            if (!sceneModel) {
                continue;
            }
            if (PhysicsModelController.applyWebmPhysicsModelSnapshot(sceneModel.model, modelSnapshot)) {
                this.syncCpuSkinnedMorphSourceBuffers(sceneModel.model);
                restoredCount += 1;
            }
        }
        if (restoredCount > 0) {
            this.syncScenePhysicsSimulationState();
            logInfo("webm", "initial physics snapshot restored", {
                capturedFrame: snapshot.capturedFrame,
                restoredModels: restoredCount,
                requestedModels: snapshot.models.length,
                clearedPendingInitializations,
            });
        }
        return restoredCount > 0;
    }

    public setModelMotionImports(model: RuntimeModel, imports: ProjectMotionImport[]): void {
        this.modelMotionImportsByModel.set(model, imports.map((item) => ({ ...item })));
    }

    public appendModelMotionImport(model: RuntimeModel, value: ProjectMotionImport): void {
        const current = this.modelMotionImportsByModel.get(model) ?? [];
        current.push({ ...value });
        this.modelMotionImportsByModel.set(model, current);
    }

    public isWgslMaterialShaderAssignmentAvailable(): boolean {
        return isWgslMaterialShaderAssignmentAvailableImpl(this);
    }

    public getWgslMaterialShaderPresets(): readonly WgslMaterialShaderPresetInfo[] {
        return getWgslMaterialShaderPresetsImpl(this) as readonly WgslMaterialShaderPresetInfo[];
    }

    public getMmdMaterialPipelinePreset(): MmdMaterialPipelinePreset {
        return this.mmdMaterialPipelinePresetValue;
    }

    public setMmdMaterialPipelinePreset(value: unknown): MmdMaterialPipelinePreset {
        const next = normalizeMmdMaterialPipelinePreset(value);
        this.mmdMaterialPipelinePresetValue = next;
        MmdManager.writeStringLocalStorage(MmdManager.MMD_MATERIAL_PIPELINE_STORAGE_KEY, next);
        return next;
    }

    public isEnvironmentLightingEnabled(): boolean {
        return this.environmentLightingEnabledValue;
    }

    public getEnvironmentLightingDiagnostics(): {
        enabled: boolean;
        source: "external" | "bundled" | "fallback" | "none";
        sourcePath: string | null;
        textureName: string | null;
        textureReady: boolean;
        hasSphericalPolynomial: boolean;
        backgroundVisible: boolean;
        backgroundTextureReady: boolean;
        backgroundMeshEnabled: boolean;
        backgroundIntensity: number;
        environmentTextureSize: { width: number; height: number };
        environmentTextureLevel: number;
        backgroundTextureSize: { width: number; height: number };
        pbrMaterialCount: number;
        iblIntensity: number;
        environmentIntensity: number;
    } {
        const environmentTexture = this.scene.environmentTexture;
        const availableTexture = environmentTexture ?? this.environmentLightingSuppressedTexture;
        const source = availableTexture === this.externalEnvironmentTexture
            ? "external"
            : availableTexture === this.bundledEnvironmentTexture
                ? "bundled"
                : availableTexture === this.iblFallbackEnvironmentTexture
                    ? "fallback"
                    : "none";
        return {
            enabled: this.environmentLightingEnabledValue,
            source,
            sourcePath: this.environmentLightingSourcePathValue,
            textureName: environmentTexture?.name ?? null,
            textureReady: environmentTexture?.isReady() ?? false,
            hasSphericalPolynomial: environmentTexture?.sphericalPolynomial != null,
            backgroundVisible: this.isEnvironmentBackgroundVisible(),
            backgroundTextureReady: this.environmentSkyboxTexture?.isReady() ?? false,
            backgroundMeshEnabled: this.skydome?.isEnabled() ?? false,
            backgroundIntensity: this.environmentBackgroundIntensityValue,
            environmentTextureSize: environmentTexture?.getSize() ?? { width: 0, height: 0 },
            environmentTextureLevel: environmentTexture?.level ?? 0,
            backgroundTextureSize: this.environmentSkyboxTexture?.getSize() ?? { width: 0, height: 0 },
            pbrMaterialCount: this.scene.materials.filter(
                (material) => material.getClassName() === "PBRMaterial",
            ).length,
            iblIntensity: this.scene.iblIntensity,
            environmentIntensity: this.scene.environmentIntensity,
        };
    }

    public async runEnvironmentLightingDiagnosticProbe(): Promise<{
        passed: boolean;
        darkLuminance: number;
        litLuminance: number;
        luminanceDelta: number;
    }> {
        const effectiveIntensity = this.environmentLightingEnabledValue
            ? combineEnvironmentLightingAndIlluminance(
                this.environmentLightingIntensityValue,
                this.dirLight?.intensity ?? 1,
                MmdManager.MAX_ENVIRONMENT_LIGHTING_INTENSITY * MAX_DIRECTIONAL_LIGHT_INTENSITY,
            )
            : 0;
        const result = await runEnvironmentLightingDiagnosticProbe(
            this.scene,
            effectiveIntensity,
            MmdManager.MAX_ENVIRONMENT_LIGHTING_INTENSITY * MAX_DIRECTIONAL_LIGHT_INTENSITY,
        );
        this.applyCurrentEnvironmentLightingIntensity();
        return result;
    }

    public getPbrMmdLikeScatteringDiagnostics(): {
        materialCount: number;
        configurationEnabled: boolean;
        configurationNeedsImageProcessing: boolean | null;
        prePassEnabled: boolean;
        metersPerUnit: number | null;
        compiledSssCenterBlendPresent: boolean | null;
        frameGraphSceneColorUsesCameraPostProcesses: boolean;
        frameGraphSceneColorPrePassActivationPassAttached: boolean;
        frameGraphSceneColorTargetActive: boolean;
        compositionUsesLocalGamma: boolean | null;
        debugVisualization: typeof PBR_SKIN_SSS_DEBUG_VISUALIZATION;
    } {
        const configuration = this.scene.subSurfaceConfiguration;
        const compiledSssFragmentSource =
            configuration?.postProcess?.getEffect().fragmentSourceCode;
        const sceneColorTarget = this.frameGraphPostEffectsSceneColorTarget;
        return {
            materialCount: this.scene.materials.filter((material) => {
                const subSurface = (material as Material & {
                    subSurface?: { isScatteringEnabled?: boolean };
                }).subSurface;
                return subSurface?.isScatteringEnabled === true;
            }).length,
            configurationEnabled: configuration?.enabled === true,
            configurationNeedsImageProcessing: configuration?.needsImageProcessing ?? null,
            prePassEnabled: this.scene.prePassRenderer?.enabled === true,
            metersPerUnit: configuration?.metersPerUnit ?? null,
            compiledSssCenterBlendPresent:
                typeof compiledSssFragmentSource === "string"
                    ? compiledSssFragmentSource.includes("composedIrradiance")
                    : null,
            frameGraphSceneColorUsesCameraPostProcesses:
                sceneColorTarget?.useCameraPostProcesses === true,
            frameGraphSceneColorPrePassActivationPassAttached:
                this.frameGraphPostEffectsSceneColorPrePassActivationPass !== null,
            frameGraphSceneColorTargetActive:
                sceneColorTarget !== null
                && (this.camera?.customRenderTargets.includes(sceneColorTarget) ?? false),
            compositionUsesLocalGamma: this.subSurfaceCompositionUsesLocalGamma,
            debugVisualization: PBR_SKIN_SSS_DEBUG_VISUALIZATION,
        };
    }

    public setEnvironmentLightingEnabled(enabled: boolean): boolean {
        this.environmentLightingEnabledValue = Boolean(enabled);
        MmdManager.writeBooleanLocalStorage(
            MmdManager.ENVIRONMENT_LIGHTING_STORAGE_KEY,
            this.environmentLightingEnabledValue,
        );
        this.syncEnvironmentLightingTexture();
        this.applyCurrentEnvironmentLightingIntensity();
        logInfo("render", "environment lighting changed", {
            ...this.getEnvironmentLightingDiagnostics(),
        });
        return this.environmentLightingEnabledValue;
    }

    public getEnvironmentLightingIntensity(): number {
        return this.environmentLightingIntensityValue;
    }

    public setEnvironmentLightingIntensity(value: number): number {
        const next = Number.isFinite(value)
            ? Math.max(0, Math.min(MmdManager.MAX_ENVIRONMENT_LIGHTING_INTENSITY, value))
            : 1;
        this.environmentLightingIntensityValue = next;
        const applied = this.applyCurrentEnvironmentLightingIntensity();
        MmdManager.writeNumberLocalStorage(
            MmdManager.ENVIRONMENT_LIGHTING_INTENSITY_STORAGE_KEY,
            next,
        );
        logInfo("render", "environment lighting intensity changed", {
            ...this.getEnvironmentLightingDiagnostics(),
            refreshedMaterialCount: applied.refreshedMaterialCount,
            refreshedFrozenMaterialCount: applied.refreshedFrozenMaterialCount,
        });
        return next;
    }

    public getEnvironmentLightingSourcePath(): string | null {
        return this.environmentLightingSourcePathValue;
    }

    public canShowEnvironmentBackground(): boolean {
        return this.getEnvironmentBackgroundSourceTexture() !== null;
    }

    public isEnvironmentBackgroundVisible(): boolean {
        return this.environmentBackgroundVisibleValue && this.canShowEnvironmentBackground();
    }

    public setEnvironmentBackgroundVisible(visible: boolean): boolean {
        this.environmentBackgroundVisibleValue = Boolean(visible) && this.canShowEnvironmentBackground();
        MmdManager.writeBooleanLocalStorage(
            MmdManager.ENVIRONMENT_BACKGROUND_STORAGE_KEY,
            this.environmentBackgroundVisibleValue,
        );
        this.syncEnvironmentSkybox();
        return this.isEnvironmentBackgroundVisible();
    }

    public toggleEnvironmentBackgroundVisible(): boolean {
        return this.setEnvironmentBackgroundVisible(!this.isEnvironmentBackgroundVisible());
    }

    public getEnvironmentBackgroundIntensity(): number {
        return this.environmentBackgroundIntensityValue;
    }

    public setEnvironmentBackgroundIntensity(value: number): number {
        const next = Number.isFinite(value)
            ? Math.max(0, Math.min(MmdManager.MAX_ENVIRONMENT_BACKGROUND_INTENSITY, value))
            : MmdManager.DEFAULT_ENVIRONMENT_BACKGROUND_INTENSITY;
        this.environmentBackgroundIntensityValue = next;
        MmdManager.writeNumberLocalStorage(
            MmdManager.ENVIRONMENT_BACKGROUND_INTENSITY_STORAGE_KEY,
            next,
        );
        this.applyEnvironmentBackgroundIntensity();
        logInfo("render", "environment background intensity changed", {
            ...this.getEnvironmentLightingDiagnostics(),
        });
        return next;
    }

    public async setEnvironmentLightingSourcePath(filePath: string | null): Promise<boolean> {
        const normalizedPath = filePath?.trim().replace(/\\/g, "/") ?? "";
        if (!normalizedPath) {
            this.clearExternalEnvironmentLightingSource();
            return true;
        }
        if (!normalizedPath.toLowerCase().endsWith(".hdr")) {
            logWarn("render", "external environment texture rejected", {
                reason: "unsupported extension",
                path: normalizedPath,
            });
            return false;
        }

        const loadGeneration = ++this.environmentLightingLoadGeneration;
        let nextTexture: HDRCubeTexture;
        try {
            nextTexture = await new Promise<HDRCubeTexture>((resolve, reject) => {
                let settled = false;
                const texture = new HDRCubeTexture(
                    localPathToFileUrl(normalizedPath),
                    this.scene,
                    MmdManager.EXTERNAL_ENVIRONMENT_CUBE_FACE_SIZE,
                    false,
                    true,
                    false,
                    true,
                    () => {
                        if (settled) return;
                        settled = true;
                        resolve(texture);
                    },
                    (message, exception) => {
                        if (settled) return;
                        settled = true;
                        const detail = exception instanceof Error
                            ? exception.message
                            : String(exception ?? message ?? "unknown HDR load error");
                        texture.dispose();
                        reject(new Error(detail));
                    },
                    false,
                    // Babylon PBR prefers an irradianceTexture over the
                    // spherical polynomial when both are present. The GPU
                    // irradiance prefilter can produce a black texture on the
                    // current WebGPU path, which makes scene.environmentIntensity
                    // appear ineffective. Keep radiance prefiltering above for
                    // reflections, but use the CPU spherical polynomial for
                    // diffuse IBL.
                    false,
                    false,
                    64,
                );
                texture.name = `mmdModokiExternalEnvironment:${normalizedPath.split("/").pop() ?? "HDR"}`;
                texture.gammaSpace = false;
                texture.coordinatesMode = Texture.CUBIC_MODE;
            });
        } catch (err: unknown) {
            logWarn("render", "external environment texture failed", {
                path: normalizedPath,
                message: err instanceof Error ? err.message : String(err),
            });
            return false;
        }

        if (loadGeneration !== this.environmentLightingLoadGeneration) {
            nextTexture.dispose();
            return false;
        }

        nextTexture.level = calculateEnvironmentTextureLevel(nextTexture.sphericalPolynomial);

        const previousTexture = this.externalEnvironmentTexture;
        this.externalEnvironmentTexture = nextTexture;
        this.environmentLightingSourcePathValue = normalizedPath;
        this.scene.environmentTexture = nextTexture;
        this.environmentLightingSuppressedTexture = null;
        this.setEnvironmentBackgroundVisible(true);
        if (previousTexture && previousTexture !== nextTexture) {
            previousTexture.dispose();
        }
        this.applyCurrentEnvironmentLightingIntensity();
        logInfo("render", "external environment texture loaded", {
            path: normalizedPath,
            ...this.getEnvironmentLightingDiagnostics(),
        });
        return true;
    }

    public clearExternalEnvironmentLightingSource(): void {
        this.environmentLightingLoadGeneration += 1;
        const previousTexture = this.externalEnvironmentTexture;
        if (this.scene.environmentTexture === previousTexture) {
            this.scene.environmentTexture = null;
        }
        if (this.environmentLightingSuppressedTexture === previousTexture) {
            this.environmentLightingSuppressedTexture = null;
        }
        this.externalEnvironmentTexture = null;
        this.environmentLightingSourcePathValue = null;
        this.setEnvironmentBackgroundVisible(false);
        previousTexture?.dispose();
        this.syncEnvironmentLightingTexture();
        this.applyCurrentEnvironmentLightingIntensity();
        logInfo("render", "external environment texture cleared", {
            ...this.getEnvironmentLightingDiagnostics(),
        });
    }

    public get environmentLightingEnabled(): boolean {
        return this.environmentLightingEnabledValue;
    }

    public set environmentLightingEnabled(enabled: boolean) {
        this.setEnvironmentLightingEnabled(enabled);
    }

    public get environmentLightingIntensity(): number {
        return this.environmentLightingIntensityValue;
    }

    public set environmentLightingIntensity(value: number) {
        this.setEnvironmentLightingIntensity(value);
    }

    public get environmentLightingSourcePath(): string | null {
        return this.environmentLightingSourcePathValue;
    }

    public get environmentBackgroundVisible(): boolean {
        return this.environmentBackgroundVisibleValue;
    }

    public set environmentBackgroundVisible(visible: boolean) {
        this.setEnvironmentBackgroundVisible(visible);
    }

    public get environmentBackgroundIntensity(): number {
        return this.environmentBackgroundIntensityValue;
    }

    public set environmentBackgroundIntensity(value: number) {
        this.setEnvironmentBackgroundIntensity(value);
    }

    public getPostEffectLutPresetOptions(): ReadonlyArray<{ id: string; label: string }> {
        return getPostEffectLutPresetOptionsImpl(this);
    }

    public getExternalWgslToonShaderPath(modelIndex?: number, materialKey: string | null = null): string | null {
        return getExternalWgslToonShaderPathImpl(this, modelIndex, materialKey);
    }

    public hasExternalWgslToonShader(modelIndex?: number, materialKey: string | null = null): boolean {
        return hasExternalWgslToonShaderImpl(this, modelIndex, materialKey);
    }

    public setExternalWgslToonShader(path: string | null, source: string | null): void {
        setExternalWgslToonShaderImpl(this, path, source);
    }

    public setExternalWgslToonShaderForModel(
        modelIndex: number,
        materialKey: string | null,
        path: string | null,
        source: string | null,
    ): boolean {
        return setExternalWgslToonShaderForModelImpl(this, modelIndex, materialKey, path, source);
    }

    public getWgslModelShaderStates(): WgslModelShaderInfo[] {
        return getWgslModelShaderStatesImpl(this);
    }

    public isMaterialVisible(material: MmdManagerMaterialLike | null | undefined): boolean {
        if (!material || typeof material !== "object") return true;
        return this.materialHiddenByMaterial.get(material as object) !== true;
    }

    public toggleModelMaterialVisibility(modelIndex: number, materialKey: string | null): boolean | null {
        const targetMaterial = this.findTargetSceneMaterials(modelIndex, materialKey)[0]?.material;
        if (!targetMaterial) {
            return null;
        }

        const nextVisible = !this.isMaterialVisible(targetMaterial);
        const ok = this.setModelMaterialVisibility(modelIndex, materialKey, nextVisible);
        return ok ? nextVisible : null;
    }

    public setModelMaterialVisibility(modelIndex: number, materialKey: string | null, visible: boolean): boolean {
        const targets = this.findTargetSceneMaterials(modelIndex, materialKey);
        if (targets.length === 0) {
            return false;
        }

        for (const target of targets) {
            this.setMaterialHiddenState(target.material, !visible);
        }

        syncLuminousGlowLayerImpl(this);
        this.onMaterialShaderStateChanged?.();
        return true;
    }

    public getSerializedMaterialShaderStates(entry: SceneModelEntry): ProjectModelMaterialShaderState[] {
        return getSerializedMaterialShaderStatesImpl(this, entry);
    }

    public setWgslMaterialShaderPreset(
        modelIndex: number,
        materialKey: string | null,
        presetId: WgslMaterialShaderPresetId,
    ): boolean {
        return setWgslMaterialShaderPresetImpl(this, modelIndex, materialKey, presetId);
    }

    public setPbrMaterialShaderPreset(
        modelIndex: number,
        materialKey: string | null,
        presetId: PbrMaterialShaderPreset,
    ): boolean {
        const entry = this.sceneModels[modelIndex];
        if (!entry || entry.materialPipeline !== "pbr-standard") return false;
        const targets = materialKey === null
            ? entry.materials
            : entry.materials.filter((material) => material.key === materialKey);
        if (targets.length === 0) return false;
        const nextPreset = normalizePbrMaterialShaderPreset(presetId);
        const createPbrAppearanceDiagnostics = (material: MmdManagerMaterialLike): Record<string, unknown> => {
            const colorToRgb = (value: unknown): [number, number, number] | null => {
                if (!value || typeof value !== "object") return null;
                const color = value as { r?: unknown; g?: unknown; b?: unknown };
                return typeof color.r === "number"
                    && typeof color.g === "number"
                    && typeof color.b === "number"
                    ? [color.r, color.g, color.b]
                    : null;
            };
            const pbrMaterial = material as MmdManagerMaterialLike & {
                albedoColor?: unknown;
                ambientColor?: unknown;
                emissiveColor?: unknown;
                reflectionColor?: unknown;
                metallic?: unknown;
                roughness?: unknown;
                environmentIntensity?: unknown;
                albedoTexture?: {
                    level?: unknown;
                    gammaSpace?: unknown;
                } | null;
                subSurface?: {
                    isScatteringEnabled?: unknown;
                    isTranslucencyEnabled?: unknown;
                    scatteringDiffusionProfile?: unknown;
                };
            };
            return {
                albedoColor: colorToRgb(pbrMaterial.albedoColor),
                ambientColor: colorToRgb(pbrMaterial.ambientColor),
                emissiveColor: colorToRgb(pbrMaterial.emissiveColor),
                reflectionColor: colorToRgb(pbrMaterial.reflectionColor),
                hasAlbedoTexture: pbrMaterial.albedoTexture != null,
                albedoTextureLevel: typeof pbrMaterial.albedoTexture?.level === "number"
                    ? pbrMaterial.albedoTexture.level
                    : null,
                albedoTextureGammaSpace: typeof pbrMaterial.albedoTexture?.gammaSpace === "boolean"
                    ? pbrMaterial.albedoTexture.gammaSpace
                    : null,
                metallic: typeof pbrMaterial.metallic === "number" ? pbrMaterial.metallic : null,
                roughness: typeof pbrMaterial.roughness === "number" ? pbrMaterial.roughness : null,
                environmentIntensity: typeof pbrMaterial.environmentIntensity === "number"
                    ? pbrMaterial.environmentIntensity
                    : null,
                alpha: typeof pbrMaterial.alpha === "number" ? pbrMaterial.alpha : null,
                scatteringEnabled: pbrMaterial.subSurface?.isScatteringEnabled === true,
                translucencyEnabled: pbrMaterial.subSurface?.isTranslucencyEnabled === true,
                scatteringDiffusionProfile: colorToRgb(
                    pbrMaterial.subSurface?.scatteringDiffusionProfile,
                ),
            };
        };
        const appearanceBefore = nextPreset === "pbr-skin-sss"
            ? targets.map((target) => ({
                key: target.key,
                name: target.name,
                ...createPbrAppearanceDiagnostics(target.material),
            }))
            : undefined;

        let applied = false;
        let appliedMaterialCount = 0;
        for (const target of targets) {
            const materialApplied = applyPbrMaterialShaderPreset(
                target.material,
                nextPreset,
            );
            applied = materialApplied || applied;
            if (materialApplied) {
                appliedMaterialCount += 1;
            }
        }
        if (applied) {
            if (nextPreset === "pbr-skin-sss") {
                // The SSS post-process can already be compiled when a preset
                // is changed during an Electron session. Force the color-space
                // define to be rebuilt from the patched ShaderStore source.
                this.subSurfaceCompositionUsesLocalGamma = null;
            }
            this.applyToonShadowInfluenceToAllModels();
            this.syncFrameGraphRenderTargetState();
            const appearanceAfter = nextPreset === "pbr-skin-sss"
                ? targets.map((target) => ({
                    key: target.key,
                    name: target.name,
                    ...createPbrAppearanceDiagnostics(target.material),
                }))
                : undefined;
            const sssConfiguration = nextPreset === "pbr-skin-sss"
                ? this.scene.subSurfaceConfiguration
                : null;
            const sssProfileIndex = sssConfiguration
                ? sssConfiguration.ssDiffusionProfileColors.findIndex((color) =>
                    color.r === PBR_SKIN_SSS_DIFFUSION_PROFILE_RGB[0]
                    && color.g === PBR_SKIN_SSS_DIFFUSION_PROFILE_RGB[1]
                    && color.b === PBR_SKIN_SSS_DIFFUSION_PROFILE_RGB[2]
                )
                : -1;
            const sssDiagnostics = nextPreset === "pbr-skin-sss"
                ? {
                    ...this.getPbrMmdLikeScatteringDiagnostics(),
                    metersPerUnit: PBR_SKIN_SSS_METERS_PER_UNIT,
                    diffusionProfile: [...PBR_SKIN_SSS_DIFFUSION_PROFILE_RGB],
                    relativeFilterRadius: getPbrSkinSssRelativeRadius(
                        PBR_SKIN_SSS_METERS_PER_UNIT,
                        PBR_SKIN_SSS_DIFFUSION_PROFILE_RGB,
                    ),
                    profileIndex: sssProfileIndex,
                    storedDiffusionS: sssProfileIndex >= 0
                        ? sssConfiguration?.ssDiffusionS.slice(
                            sssProfileIndex * 3,
                            sssProfileIndex * 3 + 3,
                        ) ?? null
                        : null,
                    storedDiffusionD: sssProfileIndex >= 0
                        ? sssConfiguration?.ssDiffusionD[sssProfileIndex] ?? null
                        : null,
                    storedFilterRadius: sssProfileIndex >= 0
                        ? sssConfiguration?.ssFilterRadii[sssProfileIndex] ?? null
                        : null,
                    scatteringBlendStrength:
                        PBR_MATERIAL_SSS_SCATTERING_BLEND_STRENGTH,
                    standardMaterialPatch:
                        getStandardMaterialSssPrePassPatchDiagnostics(),
                    pbrMaterialMaskPatch:
                        getPbrMaterialSssPrePassMaskPatchDiagnostics(),
                    // electron-log collapses nested object arrays to "[object]".
                    // Keep this JSON-encoded so PMX-to-PBR conversion values remain inspectable.
                    appearanceBeforeJson: JSON.stringify(appearanceBefore ?? []),
                    appearanceAfterJson: JSON.stringify(appearanceAfter ?? []),
                }
                : undefined;
            logInfo("render", "per-material PBR shader preset applied", {
                modelIndex,
                materialKey,
                preset: nextPreset,
                materialCount: targets.length,
                appliedMaterialCount,
                sssDiagnostics,
            });
            this.onMaterialShaderStateChanged?.();
        }
        return applied;
    }

    public enableAlphaTextureDebugView(): boolean {
        MmdManager.writeBooleanLocalStorage(MmdManager.ALPHA_TEXTURE_DEBUG_STORAGE_KEY, true);
        let applied = false;
        for (const sceneModel of this.sceneModels) {
            applied = this.applyAlphaTextureDebugToMeshes(sceneModel.info.name, [
                sceneModel.mesh,
                ...sceneModel.mesh.getChildMeshes(),
            ] as Mesh[]) || applied;
        }
        if (!applied) {
            const meshes = this.scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh);
            applied = this.applyAlphaTextureDebugToMeshes("scene-meshes", meshes);
        }
        logWarn("asset", "alpha texture debug view requested", {
            storageKey: MmdManager.ALPHA_TEXTURE_DEBUG_STORAGE_KEY,
            sceneModelCount: this.sceneModels.length,
            sceneMeshCount: this.scene.meshes.length,
            applied,
        });
        return applied;
    }

    public disableAlphaTextureDebugView(): void {
        MmdManager.writeBooleanLocalStorage(MmdManager.ALPHA_TEXTURE_DEBUG_STORAGE_KEY, false);
    }

    private findTargetSceneMaterials(modelIndex: number, materialKey: string | null): SceneModelMaterialEntry[] {
        const entry = this.sceneModels[modelIndex];
        if (!entry) {
            return [];
        }

        if (materialKey === null) {
            return entry.materials;
        }

        return entry.materials.filter((materialEntry) => materialEntry.key === materialKey);
    }

    private getMaterialBaseAlpha(material: MmdManagerMaterialLike | null | undefined): number {
        if (!material || typeof material !== "object") {
            return 1;
        }

        const key = material as object;
        const cached = this.materialBaseAlphaByMaterial.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const alpha = Number(material.alpha);
        const resolved = Number.isFinite(alpha) ? alpha : 1;
        this.materialBaseAlphaByMaterial.set(key, resolved);
        return resolved;
    }

    private setMaterialHiddenState(material: MmdManagerMaterialLike | null | undefined, hidden: boolean): void {
        if (!material || typeof material !== "object") {
            return;
        }

        const key = material as object;
        this.getMaterialBaseAlpha(material);

        if (hidden) {
            this.materialHiddenByMaterial.set(key, true);
        } else {
            this.materialHiddenByMaterial.delete(key);
        }

        if ("alpha" in material) {
            material.alpha = hidden ? 0 : this.getMaterialBaseAlpha(material);
        }

        const outlineDefaults = this.modelEdgeMaterialDefaults.get(key);
        if (hidden) {
            if ("renderOutline" in material) {
                material.renderOutline = false;
            }
            if ("outlineWidth" in material) {
                material.outlineWidth = 0;
            }
            if ("outlineAlpha" in material) {
                material.outlineAlpha = 0;
            }
        } else if (outlineDefaults && "renderOutline" in material && "outlineWidth" in material) {
            const enabled = outlineDefaults.enabled && this.modelEdgeWidthValue > 0;
            material.renderOutline = enabled;
            material.outlineWidth = enabled ? outlineDefaults.width * this.modelEdgeWidthValue : 0;
            if ("outlineAlpha" in material) {
                material.outlineAlpha = outlineDefaults.alpha;
            }
            if ("outlineColor" in material && material.outlineColor?.set) {
                const color = this.modelEdgeColorOverrideEnabledValue
                    ? this.modelEdgeColorValue
                    : { r: outlineDefaults.colorR, g: outlineDefaults.colorG, b: outlineDefaults.colorB };
                material.outlineColor.set(color.r, color.g, color.b);
            }
        }

        this.markMaterialShaderDirty(material);
    }

    private syncLuminousGlowLayer(): void {
        return syncLuminousGlowLayerImpl(this);
    }

    private markMaterialShaderDirty(material: MmdManagerMaterialLike | null | undefined): void {
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

    private applyImportedMaterialShaderStates(
        modelIndex: number,
        states: ProjectModelMaterialShaderState[] | undefined,
        warnings: string[],
        modelPath: string,
    ): void {
        applyImportedMaterialShaderStatesImpl(this, modelIndex, states, warnings, modelPath);
        this.syncFrameGraphRenderTargetState();
    }

    private getModelVisibility(mesh: MmdMesh): boolean {
        if (mesh.isEnabled() && mesh.isVisible) return true;

        for (const childMesh of mesh.getChildMeshes()) {
            if (childMesh.isEnabled() && childMesh.isVisible) {
                return true;
            }
        }

        return false;
    }

    public getActiveModelCastsShadow(): boolean {
        const entry = this.currentModel
            ? this.sceneModels.find((sceneModel) => sceneModel.model === this.currentModel)
            : null;
        return entry?.castShadow ?? false;
    }

    public getModelCastsShadow(entry: { castShadow?: boolean }): boolean {
        return entry.castShadow !== false;
    }

    public setModelCastsShadowByIndex(index: number, castShadow: boolean): boolean {
        const entry = this.sceneModels[index];
        if (!entry) return false;
        if (entry.castShadow === castShadow) return true;

        entry.castShadow = castShadow;
        this.applyModelShadowCasterState(entry);
        return true;
    }

    public setActiveModelCastsShadow(castShadow: boolean): boolean {
        if (!this.currentModel) return false;
        const index = this.sceneModels.findIndex((entry) => entry.model === this.currentModel);
        if (index < 0) return false;
        return this.setModelCastsShadowByIndex(index, castShadow);
    }

    private applyModelShadowCasterState(entry: SceneModelEntry): void {
        for (const mesh of entry.shadowCasterMeshes) {
            if (this.shadowEnabled && entry.castShadow) {
                this.shadowGenerator.addShadowCaster(mesh, true);
            } else {
                this.shadowGenerator.removeShadowCaster(mesh, true);
            }
        }
    }

    private applyShadowCasterStateToAllModels(): void {
        for (const entry of this.sceneModels) {
            this.applyModelShadowCasterState(entry);
        }
    }

    public refreshShadowAfterSceneContentChanged(): void {
        const refresh = (): void => {
            if (!this.dirLight || !this.shadowGenerator) return;
            this.applyShadowFrustumSize();
            this.applyShadowEdgeSoftness();
            this.applyShadowCasterStateToAllModels();
            const direction = this.getSerializedLightDirection();
            this.setLightDirection(direction.x, direction.y, direction.z);
            this.scene.markAllMaterialsAsDirty(Material.AllDirtyFlag);
            this.engine.releaseEffects();
        };

        refresh();
        if (this.shadowSceneContentRefreshScheduled) return;
        if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;

        this.shadowSceneContentRefreshScheduled = true;
        window.requestAnimationFrame(() => {
            this.shadowSceneContentRefreshScheduled = false;
            refresh();
        });
    }

    private createConfiguredShadowGenerator(dirLight: DirectionalLight): ShadowGenerator {
        const maxTextureSize = this.engine.getCaps().maxTextureSize ?? 4096;
        const shadowMapSize = Math.min(8192, maxTextureSize);
        const useCascaded = this.shadowModeValue === "cascaded" && CascadedShadowGenerator.IsSupported;
        const shadowGenerator = useCascaded
            ? new CascadedShadowGenerator(shadowMapSize, dirLight, undefined, this.camera)
            : new ShadowGenerator(shadowMapSize, dirLight);

        if (shadowGenerator instanceof CascadedShadowGenerator) {
            shadowGenerator.numCascades = DEFAULT_CSM_CASCADE_COUNT;
            shadowGenerator.stabilizeCascades = !this.shadowPenumbraEnabledValue;
            shadowGenerator.lambda = this.shadowPenumbraEnabledValue ? PCSS_CSM_LAMBDA : DEFAULT_CSM_LAMBDA;
            shadowGenerator.cascadeBlendPercentage = this.shadowPenumbraEnabledValue ? PCSS_CSM_CASCADE_BLEND : DEFAULT_CSM_CASCADE_BLEND;
            shadowGenerator.autoCalcDepthBounds = !this.shadowPenumbraEnabledValue;
            shadowGenerator.autoCalcDepthBoundsRefreshRate = DEFAULT_CSM_DEPTH_BOUNDS_REFRESH_RATE;
            shadowGenerator.depthClamp = !this.shadowPenumbraEnabledValue;
            shadowGenerator.penumbraDarkness = this.shadowPenumbraEnabledValue ? PCSS_CSM_PENUMBRA_DARKNESS : 1.0;
            shadowGenerator.shadowMaxZ = this.shadowMaxZValue;
            dirLight.shadowFrustumSize = DEFAULT_CSM_FRUSTUM_SIZE;
            dirLight.shadowMaxZ = this.shadowMaxZValue;
        }

        if (this.shadowPenumbraEnabledValue) {
            shadowGenerator.filter = ShadowGenerator.FILTER_PCSS;
        } else if (this.shadowBlurKernelValue > 0 && !(shadowGenerator instanceof CascadedShadowGenerator)) {
            shadowGenerator.filter = ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP;
            shadowGenerator.useKernelBlur = true;
            shadowGenerator.blurScale = this.shadowBlurScaleValue;
            shadowGenerator.blurBoxOffset = this.shadowBlurBoxOffsetValue;
            shadowGenerator.blurKernel = this.shadowBlurKernelValue;
        } else {
            shadowGenerator.filter = ShadowGenerator.FILTER_PCF;
        }
        shadowGenerator.filteringQuality = shadowGenerator instanceof CascadedShadowGenerator
            ? ShadowGenerator.QUALITY_HIGH
            : this.shadowFilteringQualityValue;
        shadowGenerator.contactHardeningLightSizeUVRatio = shadowGenerator instanceof CascadedShadowGenerator
            ? Math.min(PCSS_CSM_MAX_LIGHT_SIZE_UV_RATIO, Math.max(0.001, this.shadowPenumbraSizeValue * PCSS_CSM_LIGHT_SIZE_SCALE))
            : this.shadowPenumbraSizeValue;

        shadowGenerator.bias = this.shadowBiasValue;
        shadowGenerator.normalBias = this.shadowNormalBiasValue;
        shadowGenerator.frustumEdgeFalloff = 0.26;
        shadowGenerator.transparencyShadow = this.transparentShadowEnabledValue;
        shadowGenerator.enableSoftTransparentShadow = this.transparentShadowEnabledValue && this.softTransparentShadowEnabledValue;
        shadowGenerator.useOpacityTextureForTransparentShadow = this.transparentShadowEnabledValue;
        shadowGenerator.darkness = this.shadowEnabled ? this.shadowDarknessValue : 0;
        return shadowGenerator;
    }

    public isCascadedShadowSupported(): boolean {
        return CascadedShadowGenerator.IsSupported;
    }

    public getEffectiveShadowMode(): ShadowMode {
        return this.shadowGenerator instanceof CascadedShadowGenerator ? "cascaded" : "standard";
    }

    public get shadowMode(): ShadowMode {
        return this.shadowModeValue;
    }

    public set shadowMode(mode: ShadowMode) {
        const requestedMode: ShadowMode = mode === "standard" ? "standard" : "cascaded";
        const nextMode: ShadowMode = requestedMode === "cascaded" && !CascadedShadowGenerator.IsSupported
            ? "standard"
            : requestedMode;
        if (this.shadowModeValue === nextMode && this.getEffectiveShadowMode() === nextMode) return;

        this.shadowModeValue = nextMode;
        if (!this.dirLight) return;

        const previousGenerator = this.shadowGenerator;
        this.shadowGenerator = this.createConfiguredShadowGenerator(this.dirLight);
        previousGenerator?.dispose();
        this.applyShadowFrustumSize();
        this.applyShadowEdgeSoftness();
        this.applyShadowCasterStateToAllModels();
        if (this.dirLight) {
            const direction = this.getSerializedLightDirection();
            this.setLightDirection(direction.x, direction.y, direction.z);
        }
        this.scene.markAllMaterialsAsDirty(Material.AllDirtyFlag);
        this.engine.releaseEffects();
    }

    public getActiveModelVisibility(): boolean {
        if (!this.currentMesh) return false;
        if (this.currentMesh.isEnabled() && this.currentMesh.isVisible) return true;

        for (const childMesh of this.currentMesh.getChildMeshes()) {
            if (childMesh.isEnabled() && childMesh.isVisible) {
                return true;
            }
        }

        return false;
    }

    public setActiveModelVisibility(visible: boolean): boolean {
        if (!this.currentMesh) return false;

        this.applySceneMeshVisibility(this.currentMesh, visible);

        this.syncBoneVisualizerVisibility();
        this.syncRigidBodyVisualizerVisibility();
        this.updateBoneGizmoTarget();
        return visible;
    }

    private applySceneMeshVisibility(mesh: MmdMesh, visible: boolean): void {
        mesh.setEnabled(visible);
        mesh.isVisible = visible;

        for (const childMesh of mesh.getChildMeshes()) {
            childMesh.setEnabled(visible);
            childMesh.isVisible = visible;
        }
    }

    public toggleActiveModelVisibility(): boolean {
        const next = !this.getActiveModelVisibility();
        this.setActiveModelVisibility(next);
        return next;
    }

    public removeActiveModel(): boolean {
        if (!this.currentModel || !this.currentMesh) return false;

        const removeIndex = this.sceneModels.findIndex((entry) => entry.model === this.currentModel);
        if (removeIndex < 0) return false;

        const removed = this.sceneModels[removeIndex];
        const cameraExternalParentBeforeRemoval = this.getCameraExternalParentPayload();
        for (const entry of this.sceneModels) {
            if (entry.externalParent?.parentModelPath === removed.info.path) {
                entry.externalParent = null;
            }
            entry.externalParentKeyframes = entry.externalParentKeyframes.map((keyframe) =>
                keyframe.parentModelPath === removed.info.path
                    ? { ...keyframe, parentModelPath: null, parentBoneName: null }
                    : keyframe
            );
        }
        removed.castShadow = false;
        this.applyModelShadowCasterState(removed);

        try {
            this.mmdRuntime.destroyMmdModel(removed.model as never);
        } catch {
            // no-op
        }

        this.removeGlobalIlluminationSceneModel(removed);
        this.modelKeyframeTracksByModel.delete(removed.model);
        this.modelSourceAnimationsByModel.delete(removed.model);
        this.modelMotionImportsByModel.delete(removed.model);
        this.disposeContactShadowForModel(removed);
        removed.mesh.dispose();
        this.sceneModels.splice(removeIndex, 1);
        this.setCameraExternalParentState(
            cameraExternalParentBeforeRemoval.modelPath,
            cameraExternalParentBeforeRemoval.boneName,
        );
        this.syncLuminousGlowLayer();

        if (this.sceneModels.length === 0) {
            this.currentMesh = null;
            this.currentModel = null;
            this.activeModelInfo = null;
        } else {
            const nextIndex = Math.min(removeIndex, this.sceneModels.length - 1);
            const nextModel = this.sceneModels[nextIndex];
            this.currentMesh = nextModel.mesh;
            this.currentModel = nextModel.model;
            this.activeModelInfo = nextModel.info;
            this.timelineTarget = "model";
            this.onModelLoaded?.(nextModel.info);
        }

        this.refreshBoneVisualizerTarget();
        this.refreshRigidBodyVisualizerTarget();
        this.updateBoneGizmoTarget();
        this.emitMergedKeyframeTracks();
        return true;
    }
    public setActiveModelByIndex(index: number): boolean {
        const target = this.sceneModels[index];
        if (!target) return false;

        this.currentMesh = target.mesh;
        this.currentModel = target.model;
        this.activeModelInfo = target.info;
        this.timelineTarget = "model";
        this.refreshBoneVisualizerTarget();
        this.refreshRigidBodyVisualizerTarget();
        this.updateBoneGizmoTarget();
        this.onModelLoaded?.(target.info);
        this.emitMergedKeyframeTracks();
        return true;
    }

    public getDofFocusTargetModelPath(): string | null {
        return this.dofFocusTargetModelPathValue;
    }

    public getDofFocusTargetBoneName(): string | null {
        return this.dofFocusTargetBoneNameValue;
    }

    public setDofFocusTargetByIndex(index: number | null, boneName: string | null): void {
        if (index === null || !Number.isInteger(index) || index < 0 || index >= this.sceneModels.length) {
            this.setDofFocusTargetByPath(null, null);
            return;
        }
        this.setDofFocusTargetByPath(this.sceneModels[index]?.info.path ?? null, boneName);
    }

    public setDofFocusTargetByPath(modelPath: string | null, boneName: string | null): void {
        const nextModelPath = typeof modelPath === "string" && modelPath.length > 0 ? modelPath : null;
        const entry = nextModelPath !== null ? this.findSceneModelEntryByPath(nextModelPath) : null;
        let nextBoneName = typeof boneName === "string" && boneName.length > 0 ? boneName : null;

        if (entry) {
            const boneNames = Array.isArray(entry.info.boneNames) ? entry.info.boneNames : [];
            if (nextBoneName === null || !boneNames.includes(nextBoneName)) {
                nextBoneName = this.findPreferredDofFocusBoneName(boneNames) ?? boneNames[0] ?? null;
            }
        } else {
            nextBoneName = null;
        }

        const changed =
            this.dofFocusTargetModelPathValue !== nextModelPath ||
            this.dofFocusTargetBoneNameValue !== nextBoneName;

        this.dofFocusTargetModelPathValue = nextModelPath;
        this.dofFocusTargetBoneNameValue = nextBoneName;

        if (this.dofAutoFocusEnabled) {
            this.dofFocusDistanceMmValue = this.getDofAutoFocusDistanceMm();
            this.updateEditorDofFocusAndFStop();
        }

        if (changed) {
            this.onDofFocusTargetChanged?.();
        }
    }

    public setTimelineTarget(target: "model" | "camera"): void {
        this.timelineTarget = target;
        if (target === "camera" && this.hasActiveCameraAnimation() && !this._isPlaying) {
            this.syncViewportCameraFromMmdCamera();
        }
        this.syncBoneVisualizerVisibility();
        this.syncRigidBodyVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.emitMergedKeyframeTracks();
        this.dumpRenderDiagnostics(`after setTimelineTarget:${target}`);
    }
    public getTimelineTarget(): "model" | "camera" {
        return this.timelineTarget;
    }

    public isGlobalIlluminationEnabled(): boolean {
        return this.globalIlluminationController?.isEnabled() ?? false;
    }

    public isGlobalIlluminationPending(): boolean {
        return this.globalIlluminationController?.isPending() ?? false;
    }

    public setGlobalIlluminationEnabled(enabled: boolean): boolean {
        return this.globalIlluminationController?.setEnabled(enabled) ?? false;
    }

    public toggleGlobalIlluminationEnabled(): boolean {
        return this.globalIlluminationController?.toggleEnabled() ?? false;
    }

    public syncGlobalIlluminationSceneModels(): void {
        this.globalIlluminationController?.syncSceneModels();
    }

    public removeGlobalIlluminationSceneModel(sceneModel: { mesh: Mesh }): void {
        this.globalIlluminationController?.removeSceneModel(sceneModel);
    }

    public refreshGlobalIlluminationLightParameters(): void {
        this.globalIlluminationController?.updateLightParameters();
    }

    public isIblShadowsEnabled(): boolean {
        return this.iblShadowsEnabledValue;
    }

    public setIblShadowsEnabled(enabled: boolean): boolean {
        // Keep old project data and debug code readable, but do not instantiate
        // the rejected IBL Shadows pipeline in normal builds.
        if (!IBL_SHADOWS_EXPERIMENT_ENABLED) {
            this.iblShadowsEnabledValue = false;
            this.iblShadowsPipeline?.toggleShadow(false);
            return false;
        }

        this.iblShadowsEnabledValue = Boolean(enabled);

        if (!this.iblShadowsEnabledValue) {
            this.iblShadowsPipeline?.toggleShadow(false);
            return true;
        }

        if (!this.ensureIblShadowsPipeline()) {
            this.iblShadowsEnabledValue = false;
            return false;
        }

        this.iblShadowsPipeline?.toggleShadow(true);
        this.applyIblShadowDebugSettings();
        this.syncIblShadowsScene();
        return true;
    }

    public toggleIblShadowsEnabled(): boolean {
        this.setIblShadowsEnabled(!this.iblShadowsEnabledValue);
        return this.iblShadowsEnabledValue;
    }

    public get iblShadowOpacity(): number {
        return this.iblShadowOpacityValue;
    }

    public set iblShadowOpacity(value: number) {
        const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.25));
        this.iblShadowOpacityValue = next;
        if (this.iblShadowsPipeline) {
            this.iblShadowsPipeline.shadowOpacity = next;
            this.iblShadowsPipeline.resetAccumulation();
        }
    }

    public get iblShadowDistanceScale(): number {
        return this.iblShadowDistanceScaleValue;
    }

    public set iblShadowDistanceScale(value: number) {
        const next = Math.max(0.5, Math.min(12, Number.isFinite(value) ? value : 4));
        this.iblShadowDistanceScaleValue = next;
        if (this.iblShadowsPipeline) {
            this.iblShadowsPipeline.ssShadowDistanceScale = next;
            this.iblShadowsPipeline.resetAccumulation();
        }
    }

    public syncIblShadowsScene(): void {
        if (!this.iblShadowsEnabledValue || !this.iblShadowsPipeline) return;

        this.applyIblShadowDebugSettings();
        const castingMeshes = this.collectIblShadowCastingMeshes();
        this.iblShadowsPipeline.clearShadowCastingMeshes();
        if (castingMeshes.length > 0) {
            this.iblShadowsPipeline.addShadowCastingMesh(castingMeshes);
        }

        this.iblShadowsPipeline.clearShadowReceivingMaterials();
        this.iblShadowsPipeline.addShadowReceivingMaterial();
        this.iblShadowsPipeline.shadowOpacity = this.iblShadowOpacityValue;

        if (castingMeshes.length === 0) {
            this.iblShadowsPipeline.resetAccumulation();
            return;
        }

        try {
            this.iblShadowsPipeline.updateSceneBounds();
            logInfo("render", "IBL Shadows scene bounds updated", {
                casterCount: castingMeshes.length,
                voxelGridSize: this.iblShadowsPipeline.voxelGridSize,
            });
            this.iblShadowsPipeline.updateVoxelization();
            this.iblShadowsPipeline.resetAccumulation();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logWarn("render", "IBL Shadows voxel update failed", { message });
            this.onError?.(`IBL Shadows update failed: ${message}`);
        }
    }

    private ensureIblShadowsPipeline(): boolean {
        if (this.iblShadowsPipeline) return true;

        if (!IblShadowsRenderPipeline.IsSupported) {
            this.onError?.("IBL Shadows are not supported by this engine.");
            return false;
        }

        this.ensureFallbackIblEnvironmentTexture();

        try {
            this.prepareIblCdfSourceForWebGpuBeforePipelineCreation();
            this.iblShadowsPipeline = new IblShadowsRenderPipeline(
                "MmdModokiIblShadows",
                this.scene,
                {
                    resolutionExp: 5,
                    sampleDirections: 8,
                    shadowOpacity: this.iblShadowOpacityValue,
                    shadowRenderSizeFactor: 0.35,
                    shadowRemanence: 0.9,
                    ssShadowsEnabled: false,
                    ssShadowSampleCount: 8,
                    ssShadowStride: 12,
                    ssShadowDistanceScale: Math.min(this.iblShadowDistanceScaleValue, 2),
                    triPlanarVoxelization: true,
                    voxelShadowOpacity: 1,
                },
                [this.camera],
            );
            this.configureIblCdfSourceForWebGpu();
            this.iblShadowsPipeline.toggleShadow(this.iblShadowsEnabledValue);
            this.applyIblShadowDebugSettings();
            this.iblShadowsPipeline.onVoxelizationCompleteObservable.add(() => {
                logInfo("render", "IBL Shadows voxelization complete", {
                    voxelGridSize: this.iblShadowsPipeline?.voxelGridSize ?? 0,
                });
            });
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logWarn("render", "IBL Shadows initialization failed", { message });
            this.onError?.(`IBL Shadows initialization failed: ${message}`);
            this.iblShadowsPipeline = null;
            return false;
        }
    }

    private shouldUseEnvironmentCdfForIblShadows(): boolean {
        try {
            const raw = globalThis.localStorage?.getItem("mmd_modoki.iblShadowUseEnvironmentCdf") ?? "";
            return raw === "1" || raw.toLowerCase() === "true";
        } catch {
            return false;
        }
    }

    private shouldUseIblWebGpuCdfFallback(): boolean {
        return this.engine instanceof WebGPUEngine && !this.shouldUseEnvironmentCdfForIblShadows();
    }

    private ensureIblWebGpuCdfFallbackTexture(): RawTexture {
        if (!this.iblWebGpuCdfFallbackTexture) {
            this.iblWebGpuCdfFallbackTexture = new RawTexture(
                new Uint8Array([255, 255, 255, 255]),
                1,
                1,
                Engine.TEXTUREFORMAT_RGBA,
                this.scene,
                false,
                false,
                Texture.NEAREST_SAMPLINGMODE,
                Engine.TEXTURETYPE_UNSIGNED_BYTE,
            );
            this.iblWebGpuCdfFallbackTexture.name = "mmdModokiIblWebGpuCdfFallback";
            this.iblWebGpuCdfFallbackTexture.gammaSpace = false;
        }
        return this.iblWebGpuCdfFallbackTexture;
    }

    private prepareIblCdfSourceForWebGpuBeforePipelineCreation(): void {
        if (!this.shouldUseIblWebGpuCdfFallback()) return;

        const fallbackTexture = this.ensureIblWebGpuCdfFallbackTexture();
        if (this.scene.environmentTexture !== fallbackTexture) {
            this.iblWebGpuSuppressedEnvironmentTexture = this.scene.environmentTexture;
            this.scene.environmentTexture = fallbackTexture;
        }
        logInfo("render", "IBL Shadows using WebGPU CDF fallback texture", {
            reason: "avoid r32float mipmap validation errors",
            timing: "before pipeline creation",
        });
    }

    private configureIblCdfSourceForWebGpu(): void {
        if (!this.shouldUseIblWebGpuCdfFallback()) return;

        const cdfGenerator = this.scene.iblCdfGenerator;
        if (!cdfGenerator) return;

        cdfGenerator.iblSource = this.ensureIblWebGpuCdfFallbackTexture();
    }

    private getIblShadowDebugPasses(): Set<string> {
        try {
            const raw = globalThis.localStorage?.getItem("mmd_modoki.iblShadowDebugPasses") ?? "";
            return new Set(raw.split(/[\s,]+/).map((value) => value.trim().toLowerCase()).filter(Boolean));
        } catch {
            return new Set<string>();
        }
    }

    private applyIblShadowDebugSettings(): void {
        if (!this.iblShadowsPipeline) return;

        const passes = this.getIblShadowDebugPasses();
        const all = passes.has("all") || passes.has("1") || passes.has("true");
        const includesPass = (...names: string[]): boolean => all || names.some((name) => passes.has(name));
        const gbuffer = includesPass("gbuffer", "g-buffer");
        const cdf = includesPass("cdf");
        const voxel = includesPass("voxel", "voxels");
        const tracing = includesPass("trace", "tracing", "voxel-tracing");
        const blur = includesPass("blur", "spatial-blur");
        const accumulation = includesPass("accum", "accumulation");
        const enabled = gbuffer || cdf || voxel || tracing || blur || accumulation;

        this.iblShadowsPipeline.allowDebugPasses = enabled;
        this.iblShadowsPipeline.gbufferDebugEnabled = gbuffer;
        this.iblShadowsPipeline.cdfDebugEnabled = cdf;
        this.iblShadowsPipeline.voxelDebugEnabled = voxel;
        this.iblShadowsPipeline.voxelTracingDebugEnabled = tracing;
        this.iblShadowsPipeline.spatialBlurPassDebugEnabled = blur;
        this.iblShadowsPipeline.accumulationPassDebugEnabled = accumulation;

        const signature = enabled ? [...passes].sort().join(",") || "all" : "";
        if (signature !== this.iblShadowDebugPassSignature) {
            this.iblShadowDebugPassSignature = signature;
            if (enabled) {
                logInfo("render", "IBL Shadows debug passes enabled", { passes: signature });
            }
        }
    }

    private ensureFallbackIblEnvironmentTexture(): void {
        if (this.scene.environmentTexture) return;
        if (!this.iblFallbackEnvironmentTexture) {
            const face = new Uint8Array([190, 190, 190]);
            this.iblFallbackEnvironmentTexture = new RawCubeTexture(
                this.scene,
                [face.slice(), face.slice(), face.slice(), face.slice(), face.slice(), face.slice()],
                1,
                Engine.TEXTUREFORMAT_RGB,
                Engine.TEXTURETYPE_UNSIGNED_BYTE,
                false,
                false,
                Texture.TRILINEAR_SAMPLINGMODE,
            );
            this.iblFallbackEnvironmentTexture.name = "mmdModokiIblFallbackEnvironment";
            this.iblFallbackEnvironmentTexture.gammaSpace = false;
            this.iblFallbackEnvironmentTexture.coordinatesMode = Texture.CUBIC_MODE;
            this.iblFallbackEnvironmentTexture.sphericalPolynomial =
                createConstantEnvironmentSphericalPolynomial(190, 190, 190);
        }
        this.scene.environmentTexture = this.iblFallbackEnvironmentTexture;
    }

    private syncEnvironmentLightingTexture(): void {
        const preferredTexture = this.externalEnvironmentTexture
            ?? this.bundledEnvironmentTexture
            ?? this.iblFallbackEnvironmentTexture;
        if (preferredTexture) {
            this.scene.environmentTexture = preferredTexture;
            this.environmentLightingSuppressedTexture = null;
        } else {
            this.ensureFallbackIblEnvironmentTexture();
        }
    }

    private applyCurrentEnvironmentLightingIntensity(): EnvironmentLightingIntensityResult {
        const effectiveIntensity = this.environmentLightingEnabledValue
            ? combineEnvironmentLightingAndIlluminance(
                this.environmentLightingIntensityValue,
                this.dirLight?.intensity ?? 1,
                MmdManager.MAX_ENVIRONMENT_LIGHTING_INTENSITY * MAX_DIRECTIONAL_LIGHT_INTENSITY,
            )
            : 0;
        return applyEnvironmentLightingIntensity(
            this.scene,
            effectiveIntensity,
            MmdManager.MAX_ENVIRONMENT_LIGHTING_INTENSITY * MAX_DIRECTIONAL_LIGHT_INTENSITY,
        );
    }

    private getEnvironmentBackgroundSourceTexture(): HDRCubeTexture | null {
        return this.externalEnvironmentTexture ?? this.bundledEnvironmentTexture;
    }

    private syncEnvironmentSkybox(): void {
        if (this.skydomeMaterial) this.skydomeMaterial.reflectionTexture = null;
        this.environmentSkyboxTexture?.dispose();
        this.environmentSkyboxTexture = null;

        const sourceTexture = this.getEnvironmentBackgroundSourceTexture();
        if (this.environmentBackgroundVisibleValue && sourceTexture && this.skydomeMaterial) {
            const skyboxTexture = sourceTexture.clone();
            if (skyboxTexture) {
                skyboxTexture.name = `${sourceTexture.name}:skybox`;
                skyboxTexture.coordinatesMode = Texture.SKYBOX_MODE;
                skyboxTexture.gammaSpace = false;
                this.environmentSkyboxTexture = skyboxTexture;
                this.skydomeMaterial.reflectionTexture = skyboxTexture;
                this.applyEnvironmentBackgroundIntensity();
            }
        }
        this.applySkydomeBackgroundStyle();
        this.syncSkydomeVisibility();
    }

    private applyEnvironmentBackgroundIntensity(): void {
        if (this.environmentSkyboxTexture) {
            this.environmentSkyboxTexture.level = this.environmentBackgroundIntensityValue;
        }
        this.skydomeMaterial?.markDirty();
        this.scene?.resetCachedMaterial();
    }

    private configureBundledEnvironmentTexture(): void {
        if (this.scene.environmentTexture) return;

        try {
            const environmentTexture = new HDRCubeTexture(
                bundledEnvironmentTextureUrl,
                this.scene,
                128,
                false,
                true,
                false,
                true,
                () => {
                    environmentTexture.level = calculateEnvironmentTextureLevel(
                        environmentTexture.sphericalPolynomial,
                    );
                    if (this.environmentBackgroundVisibleValue) {
                        this.syncEnvironmentSkybox();
                    }
                    logInfo("render", "bundled IBL environment texture loaded", {
                        url: bundledEnvironmentTextureUrl,
                        name: environmentTexture.name,
                        ready: environmentTexture.isReady(),
                        hasSphericalPolynomial: environmentTexture.sphericalPolynomial != null,
                        textureLevel: environmentTexture.level,
                    });
                },
                (message, exception) => {
                    logWarn("render", "bundled IBL environment texture failed; using neutral fallback", {
                        message: message ?? "unknown",
                        exception: exception instanceof Error ? exception.message : String(exception ?? ""),
                    });
                    if (this.scene.environmentTexture === environmentTexture) {
                        this.scene.environmentTexture = null;
                    }
                    if (this.environmentLightingSuppressedTexture === environmentTexture) {
                        this.environmentLightingSuppressedTexture = null;
                    }
                    if (this.bundledEnvironmentTexture === environmentTexture) {
                        this.bundledEnvironmentTexture = null;
                    }
                    environmentTexture.dispose();
                    this.ensureFallbackIblEnvironmentTexture();
                },
            );
            environmentTexture.name = "mmdModokiBundledEnvironment";
            environmentTexture.gammaSpace = false;
            environmentTexture.coordinatesMode = Texture.CUBIC_MODE;
            this.bundledEnvironmentTexture = environmentTexture;
            this.scene.environmentTexture = environmentTexture;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logWarn("render", "bundled IBL environment texture initialization failed; using neutral fallback", {
                message,
            });
            this.bundledEnvironmentTexture = null;
            this.ensureFallbackIblEnvironmentTexture();
        }
    }

    private collectIblShadowCastingMeshes(): Mesh[] {
        const meshes: Mesh[] = [];
        const seen = new Set<Mesh>();
        const addMesh = (mesh: unknown): void => {
            if (!(mesh instanceof Mesh)) return;
            if (seen.has(mesh)) return;
            if (mesh.isDisposed()) return;
            if (!mesh.isEnabled() || !mesh.isVisible) return;
            if (mesh.skeleton) return;
            if ((mesh.getTotalVertices?.() ?? 0) <= 0) return;
            seen.add(mesh);
            meshes.push(mesh);
        };

        for (const entry of this.sceneModels) {
            if (entry.castShadow === false) continue;
            for (const mesh of entry.shadowCasterMeshes) {
                addMesh(mesh);
            }
        }

        const accessoryMeshes = (this as unknown as { getIblShadowAccessoryMeshes?: () => unknown[] }).getIblShadowAccessoryMeshes?.() ?? [];
        for (const mesh of accessoryMeshes) {
            addMesh(mesh);
        }

        return meshes;
    }

    public get characterContactShadowEnabled(): boolean {
        return this.characterContactShadowEnabledValue;
    }

    public set characterContactShadowEnabled(enabled: boolean) {
        this.characterContactShadowEnabledValue = Boolean(enabled);
        this.updateCharacterContactShadows();
    }

    public get characterContactShadowOpacity(): number {
        return this.characterContactShadowOpacityValue;
    }

    public set characterContactShadowOpacity(value: number) {
        this.characterContactShadowOpacityValue = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
        this.updateCharacterContactShadows();
    }

    public get characterContactShadowScale(): number {
        return this.characterContactShadowScaleValue;
    }

    public set characterContactShadowScale(value: number) {
        this.characterContactShadowScaleValue = Math.max(0.5, Math.min(3, Number.isFinite(value) ? value : 2));
        this.updateCharacterContactShadows();
    }

    private ensureContactShadowMaterial(): StandardMaterial {
        if (this.contactShadowMaterial) return this.contactShadowMaterial;

        const texture = new Texture(blobShadowTextureUrl, this.scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
        texture.name = "characterContactBlobShadowTexture";
        texture.hasAlpha = true;
        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = Texture.CLAMP_ADDRESSMODE;

        const material = new StandardMaterial("characterContactShadowMaterial", this.scene);
        material.diffuseTexture = texture;
        material.useAlphaFromDiffuseTexture = true;
        material.diffuseColor = new Color3(0, 0, 0);
        material.emissiveColor = new Color3(0, 0, 0);
        material.specularColor = new Color3(0, 0, 0);
        material.disableLighting = true;
        material.backFaceCulling = false;
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        material.useLogarithmicDepth = false;
        material.disableDepthWrite = true;
        material.zOffset = -1;
        material.zOffsetUnits = -4;
        material.alpha = 1;

        this.contactShadowBlobTexture = texture;
        this.contactShadowMaterial = material;
        return material;
    }

    private ensureContactShadowMesh(entry: SceneModelEntry, kind: ContactShadowBlobKind): Mesh {
        if (kind === "body" && entry.contactShadowMesh && !entry.contactShadowMesh.isDisposed()) {
            return entry.contactShadowMesh;
        }

        const blobMeshes = this.contactShadowMeshesByModel.get(entry) ?? {};
        const existing = blobMeshes[kind];
        if (existing && !existing.isDisposed()) {
            return existing;
        }

        const mesh = CreateGround(
            `characterContactShadow:${kind}:${entry.info.name}`,
            { width: 1, height: 1, subdivisions: 1, updatable: false },
            this.scene,
        );
        mesh.material = this.ensureContactShadowMaterial();
        mesh.isPickable = false;
        mesh.receiveShadows = false;
        mesh.doNotSyncBoundingInfo = true;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.alphaIndex = 10;
        stabilizeAppGeneratedPlanarMesh(mesh, { zOffset: -1, zOffsetUnits: -4 });
        mesh.setEnabled(false);
        if (kind === "body") {
            entry.contactShadowMesh = mesh;
        }
        blobMeshes[kind] = mesh;
        this.contactShadowMeshesByModel.set(entry, blobMeshes);
        return mesh;
    }

    private disposeContactShadowForModel(entry: SceneModelEntry): void {
        const blobMeshes = this.contactShadowMeshesByModel.get(entry);
        if (blobMeshes) {
            for (const mesh of Object.values(blobMeshes)) {
                mesh?.dispose();
            }
            this.contactShadowMeshesByModel.delete(entry);
        } else {
            entry.contactShadowMesh?.dispose();
        }
        entry.contactShadowMesh = null;
    }

    private hideContactShadowMeshes(entry: SceneModelEntry): void {
        const blobMeshes = this.contactShadowMeshesByModel.get(entry);
        if (blobMeshes) {
            for (const mesh of Object.values(blobMeshes)) {
                mesh?.setEnabled(false);
            }
            return;
        }
        entry.contactShadowMesh?.setEnabled(false);
    }

    private getContactShadowBoneWorldPosition(entry: SceneModelEntry, candidates: readonly string[]): Vector3 | null {
        for (const boneName of candidates) {
            const runtimeBone = this.getRuntimeBoneByNameFromModel(entry.model, boneName);
            if (!runtimeBone) continue;
            const worldMatrix = Matrix.Identity();
            const worldPosition = Vector3.Zero();
            runtimeBone.getWorldMatrixToRef(worldMatrix);
            worldMatrix.getTranslationToRef(worldPosition);
            if (Number.isFinite(worldPosition.x) && Number.isFinite(worldPosition.y) && Number.isFinite(worldPosition.z)) {
                return worldPosition;
            }
        }
        return null;
    }

    private collectContactShadowTargets(entry: SceneModelEntry, bounds: { min: Vector3; max: Vector3 }): ContactShadowTarget[] {
        const min = bounds.min;
        const max = bounds.max;
        const modelWidth = Math.max(0.1, max.x - min.x);
        const modelDepth = Math.max(0.1, max.z - min.z);
        const targets: ContactShadowTarget[] = [];
        const leftFoot = this.getContactShadowBoneWorldPosition(entry, ["左足首", "左足", "左つま先", "左足ＩＫ", "左足IK", "左つま先ＩＫ", "左つま先IK"]);
        const rightFoot = this.getContactShadowBoneWorldPosition(entry, ["右足首", "右足", "右つま先", "右足ＩＫ", "右足IK", "右つま先ＩＫ", "右つま先IK"]);
        const baseFootWidth = Math.max(1.1, Math.min(3.6, modelWidth * 0.72));
        const baseFootDepth = Math.max(0.9, Math.min(3.0, modelDepth * 0.62));
        const footWidth = baseFootWidth * this.characterContactShadowScaleValue;
        const footDepth = baseFootDepth * this.characterContactShadowScaleValue;

        if (leftFoot) {
            targets.push({ kind: "leftFoot", position: leftFoot, width: footWidth, depth: footDepth, opacityScale: 1 });
        }
        if (rightFoot) {
            targets.push({ kind: "rightFoot", position: rightFoot, width: footWidth, depth: footDepth, opacityScale: 1 });
        }

        return targets;
    }

    private updateCharacterContactShadows(): void {
        const enabled = this.characterContactShadowEnabledValue && this.sceneModels.length > 0;
        for (const entry of this.sceneModels) {
            if (!enabled || !this.getModelVisibility(entry.mesh)) {
                this.hideContactShadowMeshes(entry);
                continue;
            }

            let vectors: { min: Vector3; max: Vector3 };
            try {
                vectors = entry.mesh.getHierarchyBoundingVectors(true);
            } catch {
                this.hideContactShadowMeshes(entry);
                continue;
            }

            const groundY = this.ground?.position.y ?? 0;
            const targets = this.collectContactShadowTargets(entry, vectors);
            const visibleKinds = new Set<ContactShadowBlobKind>();
            const maxDistance = 5.0;
            const liftAboveFloor = 0.018;
            const footTargets = targets.filter((target) => target.kind === "leftFoot" || target.kind === "rightFoot");
            const footOverlapScale = new Map<ContactShadowBlobKind, number>();
            if (footTargets.length >= 2) {
                const [first, second] = footTargets;
                const dx = first.position.x - second.position.x;
                const dz = first.position.z - second.position.z;
                const centerDistance = Math.sqrt(dx * dx + dz * dz);
                const overlapDistance = Math.max(0.1, (first.width + second.width + first.depth + second.depth) * 0.18);
                const overlap = Math.max(0, Math.min(1, 1 - centerDistance / overlapDistance));
                const scale = 1 - overlap * 0.45;
                footOverlapScale.set(first.kind, scale);
                footOverlapScale.set(second.kind, scale);
            }

            for (const target of targets) {
                if (!Number.isFinite(target.width) || !Number.isFinite(target.depth)) continue;
                const distance = Math.max(0, target.position.y - groundY);
                const t = Math.max(0, Math.min(1, 1 - distance / maxDistance));
                const heightFade = Math.pow(t, 1.25);
                const overlapOpacityScale = footOverlapScale.get(target.kind) ?? 1;
                const opacity = this.characterContactShadowOpacityValue * target.opacityScale * heightFade * overlapOpacityScale;
                const mesh = this.ensureContactShadowMesh(entry, target.kind);
                mesh.position.set(target.position.x, groundY + liftAboveFloor, target.position.z);
                mesh.scaling.set(target.width, 1, target.depth);
                refreshMeshBoundingInfoForRenderStability(mesh);
                mesh.visibility = opacity;
                mesh.setEnabled(opacity > 0.001);
                visibleKinds.add(target.kind);
            }

            const blobMeshes = this.contactShadowMeshesByModel.get(entry);
            if (blobMeshes) {
                for (const [kind, mesh] of Object.entries(blobMeshes) as Array<[ContactShadowBlobKind, Mesh | undefined]>) {
                    if (!visibleKinds.has(kind)) {
                        mesh?.setEnabled(false);
                    }
                }
            }
        }
    }

    private ensureMirroringFloor(): Mesh {
        if (this.mirroringFloor && !this.mirroringFloor.isDisposed()) {
            return this.mirroringFloor;
        }

        const mirrorTexture = new MirrorTexture(
            "mirroringFloorTexture",
            this.mirroringFloorResolutionValue,
            this.scene,
            true,
            undefined,
            Texture.TRILINEAR_SAMPLINGMODE,
            true,
        );
        mirrorTexture.name = "mirroringFloorTexture";
        mirrorTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
        mirrorTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
        mirrorTexture.blurKernel = 2;

        const material = new StandardMaterial("mirroringFloorMaterial", this.scene);
        material.reflectionTexture = mirrorTexture;
        material.diffuseColor = new Color3(0.04, 0.04, 0.04);
        material.ambientColor = new Color3(0, 0, 0);
        material.emissiveColor = new Color3(0, 0, 0);
        material.specularColor = new Color3(0, 0, 0);
        material.backFaceCulling = false;
        material.transparencyMode = Material.MATERIAL_ALPHABLEND;
        material.useLogarithmicDepth = false;
        material.disableDepthWrite = true;
        material.zOffset = -2;
        material.zOffsetUnits = -8;

        const floor = this.createMirroringFloorMesh();
        floor.material = material;
        floor.isPickable = false;
        floor.receiveShadows = false;
        floor.alphaIndex = 8;
        stabilizeAppGeneratedPlanarMesh(floor, { zOffset: -2, zOffsetUnits: -8 });

        this.mirroringFloorTexture = mirrorTexture;
        this.mirroringFloorMaterial = material;
        this.mirroringFloor = floor;
        this.applyMirroringFloorTransform();
        this.applyMirroringFloorMirrorPlane();
        this.applyMirroringFloorMaterialState();
        this.updateMirroringFloorRenderList();
        return floor;
    }

    private createMirroringFloorMesh(): Mesh {
        if (this.mirroringFloorShapeValue === "circle") {
            const floor = CreateDisc(
                "mirroringFloor",
                { radius: 1, tessellation: 96, updatable: false },
                this.scene,
            );
            floor.rotation.x = Math.PI / 2;
            return floor;
        }

        return CreateGround(
            "mirroringFloor",
            { width: 1, height: 1, subdivisions: 1, updatable: false },
            this.scene,
        );
    }

    private applyMirroringFloorTransform(): void {
        if (!this.mirroringFloor) return;
        const size = this.mirroringFloorSizeValue;
        this.mirroringFloor.position.set(0, this.mirroringFloorHeightValue + 0.006, 0);
        if (this.mirroringFloorShapeValue === "circle") {
            this.mirroringFloor.scaling.set(size, size, 1);
        } else {
            this.mirroringFloor.scaling.set(size, 1, size);
        }
        refreshMeshBoundingInfoForRenderStability(this.mirroringFloor);
    }

    private applyMirroringFloorMirrorPlane(): void {
        if (!this.mirroringFloorTexture) return;
        this.mirroringFloorTexture.mirrorPlane = new Plane(0, -1, 0, this.mirroringFloorHeightValue);
    }

    private applyMirroringFloorMaterialState(): void {
        if (!this.mirroringFloorMaterial || !this.mirroringFloorTexture) return;
        const reflectance = this.mirroringFloorReflectanceValue;
        this.mirroringFloorMaterial.alpha = reflectance;
        this.mirroringFloorTexture.level = 1;
    }

    private collectMirroringFloorRenderMeshes(): Mesh[] {
        const meshes: Mesh[] = [];
        const seen = new Set<Mesh>();
        const addMesh = (mesh: unknown): void => {
            if (!(mesh instanceof Mesh)) return;
            if (seen.has(mesh)) return;
            if (
                mesh === this.ground
                || mesh === this.skydome
                || mesh === this.mirroringFloor
            ) return;
            if (mesh.name.startsWith("characterContactShadow:")) return;
            if (mesh.isDisposed()) return;
            if (!mesh.isEnabled() || !mesh.isVisible) return;
            if ((mesh.getTotalVertices?.() ?? 0) <= 0) return;
            seen.add(mesh);
            meshes.push(mesh);
        };

        for (const entry of this.sceneModels) {
            if (!this.getModelVisibility(entry.mesh)) continue;
            addMesh(entry.mesh);
            for (const mesh of entry.mesh.getChildMeshes(false)) {
                addMesh(mesh);
            }
        }

        return meshes;
    }

    private updateMirroringFloorRenderList(): void {
        if (!this.mirroringFloorTexture) return;
        this.mirroringFloorTexture.renderList = this.collectMirroringFloorRenderMeshes();
    }

    private syncMirroringFloorState(): void {
        if (!this.mirroringFloorEnabledValue) {
            this.mirroringFloor?.setEnabled(false);
            return;
        }

        const floor = this.ensureMirroringFloor();
        floor.setEnabled(true);
        this.applyMirroringFloorTransform();
        this.applyMirroringFloorMirrorPlane();
        this.applyMirroringFloorMaterialState();
        this.updateMirroringFloorRenderList();
    }

    private disposeMirroringFloorResources(): void {
        this.mirroringFloor?.dispose();
        this.mirroringFloor = null;
        this.mirroringFloorMaterial?.dispose();
        this.mirroringFloorMaterial = null;
        this.mirroringFloorTexture?.dispose();
        this.mirroringFloorTexture = null;
    }

    public setBoneVisualizerSelectedBone(boneName: string | null): void {
        this.boneVisualizerSelectedBoneName = boneName && boneName.length > 0 ? boneName : null;
        this.boneVisualizerSelectedBoneNames = this.boneVisualizerSelectedBoneName
            ? new Set([this.boneVisualizerSelectedBoneName])
            : new Set<string>();
        this.updateBoneGizmoTarget();
    }

    public setBoneVisualizerSelectedBones(boneNames: readonly string[]): void {
        const normalizedNames = Array.from(new Set(boneNames.filter((boneName) => boneName.length > 0)));
        this.boneVisualizerSelectedBoneNames = new Set(normalizedNames);
        this.boneVisualizerSelectedBoneName = normalizedNames.length === 1 ? normalizedNames[0] : null;
        this.updateBoneGizmoTarget();
    }

    public getBoneVisualizerVisibleBoneNames(): ReadonlySet<string> | null {
        if (!this.activeModelInfo) return null;

        const visibleBoneNames = new Set(this.activeModelInfo.boneNames);
        if (!this.currentModel || !this.activeModelInfo.physicsBoneNames || this.activeModelInfo.physicsBoneNames.length === 0) {
            return visibleBoneNames;
        }

        if (this.showPhysicsBonesInViewport) {
            for (const boneName of this.activeModelInfo.physicsBoneNames) {
                visibleBoneNames.add(boneName);
            }
            return visibleBoneNames;
        }

        const animation = this.modelSourceAnimationsByModel.get(this.currentModel) ?? null;
        const physicsOffBoneNames = getPhysicsOffBoneNamesAtFrame(
            animation,
            this.activeModelInfo.physicsBoneNames,
            this._currentFrame,
        );
        for (const boneName of physicsOffBoneNames) {
            visibleBoneNames.add(boneName);
        }

        return visibleBoneNames;
    }

    public setCaptureEditorOverlaysSuppressed(suppressed: boolean): void {
        if (this.captureEditorOverlaysSuppressed === suppressed) return;
        this.captureEditorOverlaysSuppressed = suppressed;
        this.syncBoneVisualizerVisibility();
    }

    private updateBoneGizmoTarget(): void {
        return updateBoneGizmoTargetImpl(this);
    }

    private resetBoneGizmoInteraction(): void {
        return resetBoneGizmoInteractionImpl(this);
    }

    private initializeBoneGizmoSystem(): void {
        return initializeBoneGizmoSystemImpl(this);
    }

    private handleBoneGizmoBeforeRender(): boolean {
        return handleBoneGizmoBeforeRenderImpl(this);
    }

    private getExternalParentWorldMatrixForBoneToRef(runtimeBone: IMmdRuntimeBone, target: Matrix): boolean {
        const currentEntry = this.sceneModels.find((entry) => entry.model === this.currentModel);
        const state = currentEntry?.externalParent;
        if (!currentEntry || !state) return false;

        const externalParentRoot = this.getRuntimeBoneByNameFromModel(currentEntry.model, state.childBoneName);
        let cursor: IMmdRuntimeBone | null = runtimeBone;
        while (cursor && cursor !== externalParentRoot) {
            cursor = cursor.parentBone;
        }
        if (!externalParentRoot || cursor !== externalParentRoot) return false;

        const parentEntry = this.sceneModels.find((entry) => entry.info.path === state.parentModelPath);
        const parentBone = parentEntry
            ? this.getRuntimeBoneByNameFromModel(parentEntry.model, state.parentBoneName)
            : null;
        if (!parentBone) return false;
        parentBone.getWorldMatrixToRef(target);
        return true;
    }

    private disposeBoneGizmoSystem(): void {
        return disposeBoneGizmoSystemImpl(this);
    }

    private refreshBoneVisualizerTarget(): void {
        return refreshBoneVisualizerTargetImpl(this);
    }

    private updateBoneVisualizer(): void {
        return updateBoneVisualizerImpl(this);
    }

    private refreshRigidBodyVisualizerTarget(): void {
        return refreshRigidBodyVisualizerTargetImpl(this);
    }

    private syncRigidBodyVisualizerVisibility(): void {
        return syncRigidBodyVisualizerVisibilityImpl(this);
    }

    private updateRigidBodyVisualizer(): void {
        return updateRigidBodyVisualizerImpl(this);
    }

    private disposeRigidBodyVisualizer(): void {
        return disposeRigidBodyVisualizerImpl(this);
    }

    private tryPickBoneVisualizerAtClientPosition(
        clientX: number,
        clientY: number,
        options: { additive?: boolean } = {},
    ): void {
        return tryPickBoneVisualizerAtClientPositionImpl(this, clientX, clientY, options);
    }
    private resolveBoneVisualizerStyle(
        boneInfo: BoneControlInfo | undefined,
        isSelected: boolean
    ): { lineColor: string; markerColor: string; markerShape: "circle" | "square"; lineWidth: number } {
        const normalBlue = "rgba(120, 132, 255, 0.95)";
        const normalOrange = "rgba(255, 182, 74, 0.96)";
        const selectedColor = "rgba(255, 94, 108, 1)";

        const isIk = boneInfo?.isIk === true;
        const isIkAffected = boneInfo?.isIkAffected === true;

        const markerShape = isIk
            ? "square"
            : isIkAffected
                ? "circle"
                : boneInfo?.movable
                    ? "square"
                    : "circle";

        const baseColor = (isIk || isIkAffected) ? normalOrange : normalBlue;
        const color = isSelected ? selectedColor : baseColor;

        return {
            lineColor: color,
            markerColor: color,
            markerShape,
            lineWidth: isSelected ? 2.3 : 1.6,
        };
    }

    private drawBoneVisualizerSegment(
        ctx: CanvasRenderingContext2D,
        from: { x: number; y: number },
        to: { x: number; y: number },
        color: string,
        lineWidth: number
    ): void {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length <= 0.0001) return;

        const nx = -dy / length;
        const ny = dx / length;
        const halfWidth = Math.max(1.2, Math.min(6, length * 0.08));

        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;

        ctx.beginPath();
        ctx.moveTo(from.x + nx * halfWidth, from.y + ny * halfWidth);
        ctx.lineTo(to.x, to.y);
        ctx.moveTo(from.x - nx * halfWidth, from.y - ny * halfWidth);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
    }

    private drawBoneVisualizerMarker(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        markerShape: "circle" | "square",
        color: string,
        selected: boolean
    ): void {
        const size = selected ? 10 : 8;
        const half = size / 2;
        const innerSize = selected ? 4.2 : 3.2;

        ctx.lineWidth = selected ? 2.3 : 1.8;
        ctx.strokeStyle = color;
        ctx.fillStyle = "rgba(255, 255, 255, 0.78)";

        if (markerShape === "square") {
            ctx.beginPath();
            ctx.rect(x - half, y - half, size, size);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.fillRect(x - innerSize / 2, y - innerSize / 2, innerSize, innerSize);
            return;
        }

        ctx.beginPath();
        ctx.arc(x, y, half, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, innerSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    private getBoneWorldPositionToRef(bone: Skeleton["bones"][number], mesh: Mesh, result: Vector3): void {
        return getBoneWorldPositionToRefImpl(bone, mesh, result);
    }

    private syncBoneVisualizerVisibility(): void {
        return syncBoneVisualizerVisibilityImpl(this);
    }

    private clearBoneOverlay(): void {
        return clearBoneOverlayImpl(this);
    }

    private ensureBoneOverlayCanvas(): void {
        return ensureBoneOverlayCanvasImpl(this);
    }

    private resizeBoneOverlayCanvas(): void {
        return resizeBoneOverlayCanvasImpl(this);
    }

    private disposeBoneVisualizer(): void {
        return disposeBoneVisualizerImpl(this);
    }

    public hasTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        return hasTimelineKeyframeImpl(this, track, frame);
    }

    public addTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        const result = addTimelineKeyframeImpl(this, track, frame);
        return result;
    }

    public hasInfoKeyframe(frame: number): boolean {
        return hasInfoKeyframeImpl(this, frame);
    }

    public addInfoKeyframe(frame: number): boolean {
        const result = addInfoKeyframeImpl(this, frame);
        return result;
    }

    public ensureCameraAnimationForEditing(): boolean {
        return ensureCameraAnimationForEditingImpl(this);
    }

    public ensureModelAnimationForEditing(track: Pick<KeyframeTrack, "name" | "category">): boolean {
        return ensureModelAnimationForEditingImpl(this, track);
    }

    public removeTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        return removeTimelineKeyframeImpl(this, track, frame);
    }

    public removeTimelineKeyframePayloads(
        track: Pick<KeyframeTrack, "name" | "category">,
        frames: readonly number[],
    ): boolean {
        return removeTimelineKeyframePayloadsImpl(this, track, frames);
    }

    public moveTimelineKeyframe(
        track: Pick<KeyframeTrack, "name" | "category">,
        fromFrame: number,
        toFrame: number,
    ): boolean {
        return moveTimelineKeyframeImpl(this, track, fromFrame, toFrame);
    }

    public readTimelineKeyframePayload(
        track: Pick<KeyframeTrack, "name" | "category">,
        frame: number,
    ): TimelineKeyframePayload | null {
        return readTimelineKeyframePayloadImpl(this, track, frame);
    }

    public applyTimelineKeyframePayload(
        track: Pick<KeyframeTrack, "name" | "category">,
        frame: number,
        payload: TimelineKeyframePayload | null,
    ): boolean {
        return applyTimelineKeyframePayloadImpl(this, track, frame, payload);
    }

    public getShowPhysicsBonesInTimeline(): boolean {
        return this.showPhysicsBonesInTimeline;
    }

    public setShowPhysicsBonesInTimeline(visible: boolean): boolean {
        const next = Boolean(visible);
        if (this.showPhysicsBonesInTimeline === next) return next;
        this.showPhysicsBonesInTimeline = next;
        emitMergedKeyframeTracksImpl(this);
        return next;
    }

    public toggleShowPhysicsBonesInTimeline(): boolean {
        return this.setShowPhysicsBonesInTimeline(!this.showPhysicsBonesInTimeline);
    }

    public getShowPhysicsBonesInViewport(): boolean {
        return this.showPhysicsBonesInViewport;
    }

    public setShowPhysicsBonesInViewport(visible: boolean): boolean {
        const next = Boolean(visible);
        if (this.showPhysicsBonesInViewport === next) return next;
        this.showPhysicsBonesInViewport = next;
        this.updateBoneVisualizer();
        return next;
    }

    public toggleShowPhysicsBonesInViewport(): boolean {
        return this.setShowPhysicsBonesInViewport(!this.showPhysicsBonesInViewport);
    }

    public beginTimelineEditBatch(): void {
        beginTimelineEditBatchImpl(this);
    }

    public endTimelineEditBatch(): void {
        endTimelineEditBatchImpl(this);
    }

    public registerEditorBoneKeyframe(
        track: Pick<KeyframeTrack, "name" | "category">,
        frame: number,
        pose: BoneKeyframePoseInput,
        physicsToggle: 0 | 1 = 0,
    ): { created: boolean } | null {
        if (!this.currentModel || !this.activeModelInfo) return null;
        if (track.category !== "root" && track.category !== "semi-standard" && track.category !== "bone") {
            return null;
        }

        const normalizedFrame = Math.max(0, Math.floor(frame));
        const existingAnimation = this.modelSourceAnimationsByModel.get(this.currentModel) ?? null;
        const motion = createEditorModelMotionFromMmdAnimation(
            existingAnimation?.name ?? `${this.activeModelInfo.name}:manual`,
            existingAnimation,
            this.activeModelInfo,
        );
        const kind = this.resolveEditorBoneTrackKind(track);
        const upsert = upsertBoneKey(motion, track.name, kind, {
            frame: normalizedFrame,
            position: kind === "movableBone"
                ? [pose.position.x, pose.position.y, pose.position.z]
                : undefined,
            positionInterpolation: kind === "movableBone"
                ? this.createDefaultPositionInterpolationBlock()
                : undefined,
            rotation: this.rotationDegreesToQuaternionBlock(pose.rotation.x, pose.rotation.y, pose.rotation.z),
            rotationInterpolation: this.createDefaultInterpolationBlock(),
            physicsToggle,
        });
        const animation = buildMmdAnimationFromEditorMotion(
            upsert.motion.name,
            upsert.motion,
            this.activeModelInfo,
            existingAnimation?.cameraTrack ?? null,
        );

        this.editorModelAnimations.add(animation);
        this.modelSourceAnimationsByModel.set(this.currentModel, animation);
        this.modelKeyframeTracksByModel.set(
            this.currentModel,
            buildModelTrackFrameMapFromAnimationImpl(this, animation),
        );
        const handle = bindModelAnimationToRuntime(
            {
                runtimeMode: this.runtimeMode,
                scene: this.scene,
                mmdWasmInstance: this.mmdWasmInstance,
                mmdRuntime: this.mmdRuntime,
            },
            this.currentModel,
            animation,
            normalizedFrame,
            this.createEditorAnimationRetargetingMap(this.currentModel),
        );
        if (this.ensureRuntimeDurationCoversEditorAnimation(animation)) {
            this.mmdRuntime.seekAnimation(normalizedFrame, true);
        }
        this.logEditorAnimationRegistrationDiagnostics(this.currentModel, animation, handle, track, normalizedFrame);
        refreshTotalFramesFromContentImpl(this);
        emitMergedKeyframeTracksImpl(this);
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
        return { created: upsert.before === null };
    }

    public isGroundVisible(): boolean {
        return this.ground?.isEnabled() ?? false;
    }

    public isBackgroundBlack(): boolean {
        return this.backgroundBlackEnabled;
    }

    public setBackgroundBlack(enabled: boolean): void {
        this.backgroundBlackEnabled = Boolean(enabled);
        if (this.backgroundBlackEnabled) {
            this.scene.clearColor = this.blackClearColor.clone();
        } else {
            this.applySkydomeBackgroundStyle();
        }
        this.syncSkydomeVisibility();
    }

    public toggleBackgroundBlack(): boolean {
        const next = !this.backgroundBlackEnabled;
        this.setBackgroundBlack(next);
        return next;
    }

    public setGroundVisible(visible: boolean): void {
        if (!this.ground) return;
        this.ground.setEnabled(visible);
    }

    public toggleGroundVisible(): boolean {
        const next = !this.isGroundVisible();
        this.setGroundVisible(next);
        return next;
    }

    public get mirroringFloorEnabled(): boolean {
        return this.mirroringFloorEnabledValue;
    }

    public set mirroringFloorEnabled(enabled: boolean) {
        this.mirroringFloorEnabledValue = Boolean(enabled);
        this.syncMirroringFloorState();
    }

    public get mirroringFloorShape(): MirroringFloorShape {
        return this.mirroringFloorShapeValue;
    }

    public set mirroringFloorShape(shape: MirroringFloorShape) {
        const next = shape === "circle" ? "circle" : "square";
        if (this.mirroringFloorShapeValue === next) return;
        this.mirroringFloorShapeValue = next;
        if (this.mirroringFloor) {
            this.disposeMirroringFloorResources();
            this.syncMirroringFloorState();
        }
    }

    public get mirroringFloorReflectance(): number {
        return this.mirroringFloorReflectanceValue;
    }

    public set mirroringFloorReflectance(value: number) {
        this.mirroringFloorReflectanceValue = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.3));
        this.applyMirroringFloorMaterialState();
    }

    public get mirroringFloorSize(): number {
        return this.mirroringFloorSizeValue;
    }

    public set mirroringFloorSize(value: number) {
        this.mirroringFloorSizeValue = Math.max(1, Math.min(500, Number.isFinite(value) ? value : 100));
        this.applyMirroringFloorTransform();
    }

    public get mirroringFloorHeight(): number {
        return this.mirroringFloorHeightValue;
    }

    public set mirroringFloorHeight(value: number) {
        this.mirroringFloorHeightValue = Math.max(-20, Math.min(20, Number.isFinite(value) ? value : 0));
        this.applyMirroringFloorTransform();
        this.applyMirroringFloorMirrorPlane();
    }

    public get mirroringFloorResolution(): number {
        return this.mirroringFloorResolutionValue;
    }

    public set mirroringFloorResolution(value: number) {
        const normalized = Number.isFinite(value) ? value : 512;
        const next = normalized <= 256 ? 256 : normalized <= 512 ? 512 : normalized <= 1024 ? 1024 : 2048;
        if (this.mirroringFloorResolutionValue === next) return;
        this.mirroringFloorResolutionValue = next;
        if (this.mirroringFloorTexture) {
            this.disposeMirroringFloorResources();
            this.syncMirroringFloorState();
        }
    }

    public isSkydomeVisible(): boolean {
        return this.skydomeVisibleValue;
    }

    public getSkydomeBackgroundStyle(): SkydomeBackgroundStyle {
        return normalizeSkydomeBackgroundStyle(this.skydomeBackgroundStyleValue);
    }

    public setSkydomeBackgroundStyle(style: SkydomeBackgroundStyle): void {
        this.skydomeBackgroundStyleValue = normalizeSkydomeBackgroundStyle(style);
        this.applySkydomeBackgroundStyle();
    }

    public resetSkydomeBackgroundStyle(): void {
        this.setSkydomeBackgroundStyle(normalizeSkydomeBackgroundStyle(DEFAULT_SKYDOME_BACKGROUND_STYLE));
    }

    public getBackgroundImagePath(): string | null {
        return this.backgroundImagePath;
    }

    public getBackgroundVideoPath(): string | null {
        return this.backgroundVideoPath;
    }

    public hasBackgroundImage(): boolean {
        return this.backgroundImageLayer !== null;
    }

    public hasBackgroundVideo(): boolean {
        return this.backgroundVideoLayer !== null;
    }

    public hasBackgroundMedia(): boolean {
        return this.backgroundImageLayer !== null || this.backgroundVideoLayer !== null;
    }

    public isBackgroundMediaVisible(): boolean {
        return this.backgroundMediaVisible && this.hasBackgroundMedia();
    }

    public setSkydomeVisible(visible: boolean): void {
        this.skydomeVisibleValue = Boolean(visible);
        this.syncSkydomeVisibility();
    }

    public toggleSkydomeVisible(): boolean {
        const next = !this.isSkydomeVisible();
        this.setSkydomeVisible(next);
        return next;
    }

    private syncSkydomeVisibility(): void {
        const backgroundVisible = this.skydomeVisibleValue && !this.backgroundBlackEnabled;
        this.skydome?.setEnabled(backgroundVisible);
    }

    private applySkydomeBackgroundStyle(): void {
        const style = this.skydomeBackgroundStyleValue;
        const brightness = style.brightness;
        const clearColor = style.mode === "gradient" ? style.bottomColor : style.topColor;
        if (!this.backgroundBlackEnabled) {
            this.scene.clearColor = new Color4(
                clearColor.r * brightness,
                clearColor.g * brightness,
                clearColor.b * brightness,
                1,
            );
        }

        const material = this.skydomeMaterial;
        if (!material) return;

        if (this.environmentSkyboxTexture) {
            material.diffuseTexture = null;
            material.primaryColor = Color3.White();
            material.enableNoise = false;
            // The HDR background has its own exposure-like scale on the cloned
            // texture. It must not reuse the PBR environment-lighting strength.
            material.reflectionAmount = 1;
            material.reflectionBlur = 0;
            return;
        }

        material.enableNoise = true;
        material.primaryColor = new Color3(brightness, brightness, brightness);
        if (style.mode === "solid") {
            material.diffuseTexture = null;
            material.primaryColor = new Color3(
                style.topColor.r * brightness,
                style.topColor.g * brightness,
                style.topColor.b * brightness,
            );
            return;
        }

        if (!this.skydomeGradientTexture) {
            this.skydomeGradientTexture = new DynamicTexture(
                "skydomeGradientTexture",
                { width: 4, height: 256 },
                this.scene,
                false,
                Texture.BILINEAR_SAMPLINGMODE,
            );
            this.skydomeGradientTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
            this.skydomeGradientTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
            this.skydomeGradientTexture.gammaSpace = true;
        }

        const context = this.skydomeGradientTexture.getContext();
        const gradient = context.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, colorToHex(style.topColor));
        gradient.addColorStop(1, colorToHex(style.bottomColor));
        context.fillStyle = gradient;
        context.fillRect(0, 0, 4, 256);
        // Babylon sphere UVs use V=0 at the top. Keep the canvas orientation so
        // the popup's top/bottom color labels match the rendered skydome.
        this.skydomeGradientTexture.update(false);
        material.diffuseTexture = this.skydomeGradientTexture;
    }

    public setBackgroundMediaVisible(visible: boolean): boolean {
        this.backgroundMediaVisible = Boolean(visible);
        if (this.backgroundImageLayer) {
            this.backgroundImageLayer.isEnabled = this.backgroundMediaVisible;
        }
        if (this.backgroundVideoLayer) {
            this.backgroundVideoLayer.isEnabled = this.backgroundMediaVisible;
        }
        return this.isBackgroundMediaVisible();
    }

    public toggleBackgroundMediaVisible(): boolean {
        return this.setBackgroundMediaVisible(!this.backgroundMediaVisible);
    }

    public clearBackgroundImage(): void {
        if (this.backgroundImageLayer) {
            this.backgroundImageLayer.dispose();
            this.backgroundImageLayer = null;
        }
        this.backgroundImagePath = null;
    }

    public clearBackgroundVideo(): void {
        if (this.backgroundVideoElement) {
            this.backgroundVideoElement.pause();
            this.backgroundVideoElement.removeAttribute("src");
            this.backgroundVideoElement.load();
            this.backgroundVideoElement = null;
        }
        if (this.backgroundVideoTexture) {
            this.backgroundVideoTexture.dispose();
            this.backgroundVideoTexture = null;
        }
        this.backgroundVideoCanvas = null;
        if (this.backgroundVideoLayer) {
            this.backgroundVideoLayer.dispose();
            this.backgroundVideoLayer = null;
        }
        this.backgroundVideoPath = null;
        this.backgroundVideoLastSyncedTime = Number.NaN;
        this.backgroundVideoLastDrawnTime = Number.NaN;
    }

    public clearBackgroundMedia(): void {
        this.clearBackgroundVideo();
        this.clearBackgroundImage();
    }

    public async setBackgroundImageFromPath(filePath: string): Promise<void> {
        const normalizedPath = filePath.trim();
        if (normalizedPath.length === 0) {
            this.clearBackgroundMedia();
            return;
        }

        const texture = await new Promise<Texture>((resolve, reject) => {
            let settled = false;
            const nextTexture = new Texture(
                localPathToFileUrl(normalizedPath),
                this.scene,
                false,
                true,
                Texture.TRILINEAR_SAMPLINGMODE,
                () => {
                    if (settled) return;
                    settled = true;
                    resolve(nextTexture);
                },
                (message, exception) => {
                    if (settled) return;
                    settled = true;
                    nextTexture.dispose();
                    const detail = typeof message === "string" && message.trim().length > 0
                        ? message
                        : exception instanceof Error
                            ? exception.message
                            : "Background image load failed";
                    reject(new Error(detail));
                },
            );
            if (nextTexture.isReady()) {
                settled = true;
                resolve(nextTexture);
            }
        });

        texture.name = `background:${normalizedPath.replace(/^.*[\\/]/, "")}`;
        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);

        const previousLayer = this.backgroundImageLayer;
        const nextLayer = new Layer("backgroundImageLayer", null, this.scene, true, new Color4(1, 1, 1, 1));
        nextLayer.texture = texture;
        this.backgroundImageLayer = nextLayer;
        this.backgroundImagePath = normalizedPath;
        this.backgroundMediaVisible = true;
        this.backgroundImageLayer.isEnabled = true;
        previousLayer?.dispose();
        this.clearBackgroundVideo();

        // A fullscreen background image should replace the flat skydome rather than hide behind it.
        this.setSkydomeVisible(false);
    }

    public async setBackgroundVideoFromPath(filePath: string): Promise<void> {
        const normalizedPath = filePath.trim();
        if (normalizedPath.length === 0) {
            this.clearBackgroundMedia();
            return;
        }

        const video = document.createElement("video");
        video.preload = "auto";
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 0;
        video.loop = false;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.src = localPathToFileUrl(normalizedPath);

        let texture: DynamicTexture | null = null;
        let canvas: HTMLCanvasElement | null = null;
        try {
            texture = await new Promise<DynamicTexture>((resolve, reject) => {
                let settled = false;
                const cleanup = (): void => {
                    video.removeEventListener("error", onVideoError);
                    video.removeEventListener("loadeddata", onVideoLoaded);
                };
                const onVideoLoaded = (): void => {
                    if (settled) return;
                    const width = Math.max(1, video.videoWidth || 1);
                    const height = Math.max(1, video.videoHeight || 1);
                    canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    texture = new DynamicTexture(
                        `backgroundVideo:${normalizedPath.replace(/^.*[\\/]/, "")}`,
                        { width, height },
                        this.scene,
                        false,
                        Texture.TRILINEAR_SAMPLINGMODE,
                    );
                    const ctx = texture.getContext();
                    ctx.save();
                    ctx.translate(0, height);
                    ctx.scale(1, -1);
                    ctx.drawImage(video, 0, 0, width, height);
                    ctx.restore();
                    texture.update(false);
                    settled = true;
                    cleanup();
                    resolve(texture);
                };
                const onVideoError = (): void => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    const mediaError = video.error;
                    const detail = mediaError?.message
                        || `Background video load failed (${mediaError?.code ?? "unknown"})`;
                    reject(new Error(detail));
                };
                video.addEventListener("error", onVideoError, { once: true });
                video.addEventListener("loadeddata", onVideoLoaded, { once: true });
                if (video.readyState >= video.HAVE_CURRENT_DATA) {
                    onVideoLoaded();
                }
            });
        } catch (err) {
            video.pause();
            video.removeAttribute("src");
            video.load();
            throw err;
        }

        texture.wrapU = Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = Texture.CLAMP_ADDRESSMODE;
        texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);

        const previousLayer = this.backgroundVideoLayer;
        const previousTexture = this.backgroundVideoTexture;
        const previousVideo = this.backgroundVideoElement;
        const nextLayer = new Layer("backgroundVideoLayer", null, this.scene, true, new Color4(1, 1, 1, 1));
        nextLayer.texture = texture;
        this.backgroundVideoLayer = nextLayer;
        this.backgroundVideoTexture = texture;
        this.backgroundVideoElement = video;
        this.backgroundVideoCanvas = canvas;
        this.backgroundVideoPath = normalizedPath;
        this.backgroundMediaVisible = true;
        this.backgroundVideoLayer.isEnabled = true;
        this.backgroundVideoLastSyncedTime = Number.NaN;
        this.backgroundVideoLastDrawnTime = Number.NaN;
        previousLayer?.dispose();
        previousTexture?.dispose();
        if (previousVideo) {
            previousVideo.pause();
            previousVideo.removeAttribute("src");
            previousVideo.load();
        }
        this.clearBackgroundImage();
        this.syncBackgroundVideoFrame(true);

        // A fullscreen background video should replace the flat skydome rather than hide behind it.
        this.setSkydomeVisible(false);
    }

    private syncBackgroundVideoFrame(force = false): void {
        const texture = this.backgroundVideoTexture;
        const video = this.backgroundVideoElement;
        const canvas = this.backgroundVideoCanvas;
        if (!texture || !video || !canvas) return;
        if (video.readyState < video.HAVE_METADATA) return;

        const duration = Number.isFinite(video.duration) ? video.duration : Number.POSITIVE_INFINITY;
        const clampedTarget = Math.max(0, Math.min(this._currentFrame / 30, Math.max(0, duration - 0.001)));

        if (this._isPlaying) {
            if (video.paused) {
                void video.play().catch(() => {
                    // Some containers/codecs may reject autoplay despite mute. Keep falling back to manual seeks.
                });
            }
            if (Math.abs(video.currentTime - clampedTarget) > 0.2) {
                this.backgroundVideoLastSyncedTime = clampedTarget;
                try {
                    video.currentTime = clampedTarget;
                } catch {
                    // Browser may reject seeks while metadata is still settling. Try again next frame.
                }
            }
        } else {
            if (!video.paused) {
                video.pause();
            }
            if (force || Math.abs(clampedTarget - this.backgroundVideoLastSyncedTime) >= (1 / 120)) {
                this.backgroundVideoLastSyncedTime = clampedTarget;
                try {
                    video.currentTime = clampedTarget;
                } catch {
                    // Browser may reject seeks while metadata is still settling. Try again next frame.
                }
            }
        }
        if (video.readyState < video.HAVE_CURRENT_DATA) return;

        const width = Math.max(1, video.videoWidth || canvas.width || 1);
        const height = Math.max(1, video.videoHeight || canvas.height || 1);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        if (!force && Math.abs(video.currentTime - this.backgroundVideoLastDrawnTime) < (1 / 240)) {
            return;
        }

        const ctx = texture.getContext();
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(0, height);
        ctx.scale(1, -1);
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();
        texture.update(false);
        this.backgroundVideoLastDrawnTime = video.currentTime;
    }

    public isRigidBodyVisualizerEnabled(): boolean {
        return this.rigidBodyVisualizerEnabled;
    }

    public isRigidBodyVisualizerAvailable(): boolean {
        return this.sceneModels.some((sceneModel) => PhysicsModelController.hasPhysicsModel(
            sceneModel.model,
            sceneModel.rigidBodies.length,
        ));
    }

    public setRigidBodyVisualizerEnabled(enabled: boolean): boolean {
        this.rigidBodyVisualizerEnabled = Boolean(enabled);
        this.syncRigidBodyVisualizerVisibility();
        if (this.rigidBodyVisualizerEnabled) {
            this.updateRigidBodyVisualizer();
        }
        return this.rigidBodyVisualizerEnabled;
    }

    public toggleRigidBodyVisualizerEnabled(): boolean {
        return this.setRigidBodyVisualizerEnabled(!this.rigidBodyVisualizerEnabled);
    }

    public isPhysicsAvailable(): boolean {
        return this.physicsController.isAvailable();
    }

    public getPhysicsEnabled(): boolean {
        return this.physicsController.getEnabled();
    }

    public isPhysicsFloorCollisionAvailable(): boolean {
        return this.physicsController.isFloorCollisionAvailable();
    }

    public getPhysicsFloorCollisionEnabled(): boolean {
        return this.physicsController.getFloorCollisionEnabled();
    }

    public setPhysicsFloorCollisionEnabled(enabled: boolean): boolean {
        return this.physicsController.setFloorCollisionEnabled(enabled);
    }

    public togglePhysicsFloorCollisionEnabled(): boolean {
        return this.physicsController.toggleFloorCollisionEnabled();
    }

    public getPhysicsBufferedEvaluationEnabled(): boolean {
        return this.physicsController.getBufferedEvaluationDuringPlayback();
    }

    public setPhysicsBufferedEvaluationEnabled(enabled: boolean): boolean {
        this.physicsBufferedEvaluationDuringPlayback = Boolean(enabled);
        const next = this.physicsController.setBufferedEvaluationDuringPlayback(
            this.physicsBufferedEvaluationDuringPlayback,
            this._isPlaying,
        );
        MmdManager.writeBooleanLocalStorage(MmdManager.PHYSICS_BUFFERED_EVALUATION_STORAGE_KEY, next);
        return next;
    }

    public getPhysicsMaxSubSteps(): number {
        return this.physicsController.getMaxSubSteps();
    }

    public setPhysicsMaxSubSteps(value: number): number {
        this.physicsMaxSubSteps = PhysicsRuntimeController.normalizeMaxSubSteps(value);
        const next = this.physicsController.setMaxSubSteps(this.physicsMaxSubSteps);
        return next;
    }

    public getFullyDampedRigidBodyDampingCap(): number {
        return PhysicsModelController.getFullyDampedRigidBodyDampingCap();
    }

    public getFullyDampedRigidBodyCorrectionEnabled(): boolean {
        return PhysicsModelController.getFullyDampedRigidBodyCorrectionEnabled();
    }

    public setFullyDampedRigidBodyCorrectionEnabled(enabled: boolean): boolean {
        const next = PhysicsModelController.setFullyDampedRigidBodyCorrectionEnabled(enabled);
        for (const sceneModel of this.sceneModels) {
            this.physicsModelController.capFullyDampedRigidBodies(sceneModel.model);
        }
        this.applyPhysicsStateToAllModels();
        return next;
    }

    public getFullyDampedRigidBodyDampingCorrectionAmount(): number {
        return PhysicsModelController.getFullyDampedRigidBodyDampingCorrectionAmount();
    }

    public setFullyDampedRigidBodyDampingCorrectionAmount(value: number): number {
        const next = PhysicsModelController.setFullyDampedRigidBodyDampingCorrectionAmount(value);
        for (const sceneModel of this.sceneModels) {
            this.physicsModelController.capFullyDampedRigidBodies(sceneModel.model);
        }
        return next;
    }

    public getFullyDampedRigidBodyGravityCorrectionAmount(): number {
        return PhysicsModelController.getFullyDampedGravityCorrectionAmount();
    }

    public setFullyDampedRigidBodyGravityCorrectionAmount(value: number): number {
        const next = PhysicsModelController.setFullyDampedGravityCorrectionAmount(value);
        this.applyPhysicsStateToAllModels();
        return next;
    }

    public getAbnormalDynamicRigidBodyMassTowardUnit(): number {
        return PhysicsModelController.getAbnormalDynamicRigidBodyMassTowardUnit();
    }

    public setAbnormalDynamicRigidBodyMassTowardUnit(value: number): number {
        const next = PhysicsModelController.setAbnormalDynamicRigidBodyMassTowardUnit(value);
        this.applyPhysicsStateToAllModels();
        return next;
    }

    public getPreferredBulletPhysicsBackend(): PreferredBulletPhysicsBackend {
        return this.preferredBulletPhysicsBackend;
    }

    public async setPreferredBulletPhysicsBackend(backend: PreferredBulletPhysicsBackend): Promise<PreferredBulletPhysicsBackend> {
        const next = MmdManager.normalizePreferredBulletBackend(backend);
        if (this.preferredBulletPhysicsBackend === next) {
            return this.preferredBulletPhysicsBackend;
        }

        this.preferredBulletPhysicsBackend = next;
        this.physicsController.setPreferredBulletBackend(next);
        MmdManager.writePreferredBulletBackendLocalStorage(next);

        if (this.runtimeMode !== "wasm") {
            await this.physicsController.initializeClassic();
            this.physicsController.syncBulletEvaluationTypeForPlayback(this._isPlaying);
            this.syncScenePhysicsSimulationState();
            this.applyPhysicsStateToAllModels();
        }

        logInfo("physics", "preferred Bullet physics backend changed", {
            preferredBulletBackend: next,
            activeBackend: this.getPhysicsBackendLabel(),
            evaluationType: this.getPhysicsEvaluationTypeLabel(),
            bufferedEvaluationDuringPlayback: this.getPhysicsBufferedEvaluationEnabled(),
        });
        return this.preferredBulletPhysicsBackend;
    }

    public async waitForPhysicsInitialization(): Promise<boolean> {
        return this.physicsInitializationPromise;
    }

    public isWebGpuSdefCpuFallbackEnabled(): boolean {
        return this.webGpuSdefCpuFallbackEnabled;
    }

    public setWebGpuSdefCpuFallbackEnabled(enabled: boolean): boolean {
        this.webGpuSdefCpuFallbackEnabled = Boolean(enabled);
        MmdManager.writeBooleanLocalStorage(
            MmdManager.WEBGPU_SDEF_CPU_FALLBACK_STORAGE_KEY,
            this.webGpuSdefCpuFallbackEnabled,
        );
        return this.webGpuSdefCpuFallbackEnabled;
    }

    private isPhysicsSimulationActive(): boolean {
        return this.getPhysicsEnabled() || this.externalPlaybackSimulationEnabled;
    }

    private syncScenePhysicsSimulationState(): void {
        this.physicsController.syncScenePhysicsSimulationState(this.isPhysicsSimulationActive());
    }

    public setExternalPlaybackSimulationEnabled(enabled: boolean): boolean {
        this.externalPlaybackSimulationEnabled = Boolean(enabled);
        this.physicsController.syncBulletEvaluationTypeForPlayback(this._isPlaying);
        this.applyPhysicsStateToAllModels();
        this.syncScenePhysicsSimulationState();
        return this.externalPlaybackSimulationEnabled;
    }

    public setPhysicsEnabled(enabled: boolean): boolean {
        const wasEnabled = this.getPhysicsEnabled();
        const isResumingPhysics = enabled && !wasEnabled;
        const nextEnabled = this.physicsController.setEnabled(
            enabled,
            enabled || this.externalPlaybackSimulationEnabled,
            isResumingPhysics ? false : this._isPlaying,
        );
        this.applyPhysicsStateToAllModels(nextEnabled && isResumingPhysics);
        if (isResumingPhysics) {
            this.physicsController.syncBulletEvaluationTypeForPlayback(this._isPlaying);
        }
        return nextEnabled;
    }

    public togglePhysicsEnabled(): boolean {
        return this.setPhysicsEnabled(!this.getPhysicsEnabled());
    }

    public getPhysicsSimulationRateHz(): PhysicsSimulationRateHz {
        return this.physicsController.getSimulationRateHz();
    }

    public setPhysicsSimulationRateHz(value: number): PhysicsSimulationRateHz {
        return this.physicsController.setSimulationRateHz(value);
    }

    public getPhysicsGravityAcceleration(): number {
        return this.physicsController.getGravityAcceleration();
    }

    public setPhysicsGravityAcceleration(value: number): void {
        this.physicsController.setGravityAcceleration(value);
    }

    public getPhysicsGravityDirection(): { x: number; y: number; z: number } {
        return this.physicsController.getGravityDirection();
    }

    public setPhysicsGravityDirection(x: number, y: number, z: number): void {
        this.physicsController.setGravityDirection(x, y, z);
    }

    static async create(
        canvas: HTMLCanvasElement,
        enginePreference: RenderEnginePreference = "auto",
    ): Promise<MmdManager> {
        const { engine, startupDiagnostics } = await MmdManager.createPreferredEngine(
            canvas,
            enginePreference,
        );
        return new MmdManager(canvas, engine, startupDiagnostics);
    }

    private static createWebGlEngine(canvas: HTMLCanvasElement): Engine {
        return new Engine(canvas, false, MmdManager.RENDER_ENGINE_OPTIONS);
    }

    private static async createPreferredEngine(
        canvas: HTMLCanvasElement,
        enginePreference: RenderEnginePreference,
    ): Promise<PreferredEngineResult> {
        const startupDiagnostics: string[] = [];
        if (enginePreference === "webgl2") {
            console.info("Using WebGL2 renderer (forced by development setting).");
            logInfo("shader", "using WebGL2 renderer", { reason: "forced-development-setting" });
            startupDiagnostics.push("Development renderer override: WebGL2.");
            return {
                engine: MmdManager.createWebGlEngine(canvas),
                startupDiagnostics,
            };
        }

        try {
            const isWebGpuSupported = await WebGPUEngine.IsSupportedAsync;
            if (!isWebGpuSupported) {
                if (enginePreference === "webgpu") {
                    throw new Error("WebGPU was required by MMD_MODOKI_RENDERER but is unavailable.");
                }
                console.info("WebGPU unavailable. Falling back to WebGL2.");
                logInfo("shader", "WebGPU unavailable; falling back to WebGL2");
                startupDiagnostics.push("WebGPU unavailable. Using WebGL2.");
                return { engine: MmdManager.createWebGlEngine(canvas), startupDiagnostics };
            }

            WebGPUTintWASM.DisableUniformityAnalysis = true;
            const engine = await WebGPUEngine.CreateAsync(canvas, {
                ...MmdManager.RENDER_ENGINE_OPTIONS,
                setMaximumLimits: true,
                glslangOptions: {
                    jsPath: glslangJsUrl,
                    wasmPath: glslangWasmUrl,
                },
                twgslOptions: {
                    jsPath: twgslJsUrl,
                    wasmPath: twgslWasmUrl,
                },
            });
            engine.compatibilityMode = MmdManager.WEBGPU_COMPATIBILITY_MODE;
            const webGpuMode = engine.compatibilityMode ? "compatibility" : "native";
            console.info(`Using WebGPU renderer (${webGpuMode}, WGSL-first).`);
            logInfo("shader", "using WebGPU renderer", { mode: webGpuMode });
            return { engine, startupDiagnostics };
        } catch (err: unknown) {
            if (enginePreference === "webgpu") {
                logWarn("shader", "forced WebGPU renderer initialization failed", toLogErrorData(err));
                throw err;
            }
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`WebGPU initialization failed. Falling back to WebGL2. Reason: ${message}`);
            logWarn("shader", "WebGPU initialization failed; falling back to WebGL2", toLogErrorData(err));
            startupDiagnostics.push("WebGPU initialization failed. Using WebGL2.");
            return { engine: MmdManager.createWebGlEngine(canvas), startupDiagnostics };
        }
    }

    private installWebGpuValidationMonitor(): void {
        if (!(this.engine instanceof WebGPUEngine)) return;

        type WebGpuDeviceLike = {
            addEventListener(type: "uncapturederror", listener: (event: Event) => void): void;
            removeEventListener(type: "uncapturederror", listener: (event: Event) => void): void;
        };
        type WebGpuUncapturedErrorEventLike = Event & {
            error?: {
                message?: unknown;
                toString?: () => string;
            };
        };

        const device = (this.engine as unknown as { _device?: WebGpuDeviceLike })._device;
        if (!device) return;

        const listener = (event: Event): void => {
            const error = (event as WebGpuUncapturedErrorEventLike).error;
            const message = typeof error?.message === "string"
                ? error.message
                : error?.toString?.() ?? "Unknown WebGPU validation error";
            this.webGpuValidationErrorCount += 1;
            if (this.webGpuValidationErrorMessages.length < 20) {
                this.webGpuValidationErrorMessages.push(message);
                logWarn("render", "WebGPU uncaptured validation error", {
                    count: this.webGpuValidationErrorCount,
                    message,
                });
            }
            this.onWebGpuValidationError?.(message);
        };

        device.addEventListener("uncapturederror", listener);
        this.disposeWebGpuValidationMonitor = () => {
            device.removeEventListener("uncapturederror", listener);
        };
    }

    public getWebGpuValidationDiagnostics(): { count: number; messages: readonly string[] } {
        return {
            count: this.webGpuValidationErrorCount,
            messages: [...this.webGpuValidationErrorMessages],
        };
    }

    private static readBooleanLocalStorage(key: string, fallback: boolean): boolean {
        try {
            const value = globalThis.localStorage?.getItem(key);
            if (value === "1" || value === "true") return true;
            if (value === "0" || value === "false") return false;
        } catch {
            // Optional experiment flags must never block startup.
        }
        return fallback;
    }

    private static writeBooleanLocalStorage(key: string, value: boolean): void {
        try {
            globalThis.localStorage?.setItem(key, value ? "1" : "0");
        } catch {
            // Ignore persistence failures for optional experiment flags.
        }
    }

    private static writeStringLocalStorage(key: string, value: string): void {
        try {
            globalThis.localStorage?.setItem(key, value);
        } catch {
            // Ignore persistence failures for optional experiment flags.
        }
    }

    private static readMmdMaterialPipelinePresetLocalStorage(): MmdMaterialPipelinePreset {
        try {
            return resolveNextImportMaterialPipelinePreset(
                globalThis.localStorage?.getItem(MmdManager.MMD_MATERIAL_PIPELINE_STORAGE_KEY),
            );
        } catch {
            return DEFAULT_MMD_MATERIAL_PIPELINE_PRESET;
        }
    }

    private static readEnvironmentLightingIntensityLocalStorage(): number {
        try {
            const stored = globalThis.localStorage?.getItem(
                MmdManager.ENVIRONMENT_LIGHTING_INTENSITY_STORAGE_KEY,
            );
            if (stored === null || stored === undefined) return 1;
            const value = Number(stored);
            if (Number.isFinite(value)) {
                return Math.max(
                    0,
                    Math.min(MmdManager.MAX_ENVIRONMENT_LIGHTING_INTENSITY, value),
                );
            }
        } catch {
            // Optional experiment flags must never block startup.
        }
        return 1;
    }

    private initializeEnvironmentBackgroundIntensityLocalStorage(): number {
        try {
            const stored = globalThis.localStorage?.getItem(
                MmdManager.ENVIRONMENT_BACKGROUND_INTENSITY_STORAGE_KEY,
            );
            if (stored !== null && stored !== undefined) {
                return MmdManager.readNumberLocalStorage(
                    MmdManager.ENVIRONMENT_BACKGROUND_INTENSITY_STORAGE_KEY,
                    MmdManager.DEFAULT_ENVIRONMENT_BACKGROUND_INTENSITY,
                    0,
                    MmdManager.MAX_ENVIRONMENT_BACKGROUND_INTENSITY,
                );
            }

            // Before background brightness had its own control, users lowered
            // the shared IBL value to about 0.03 to keep HDR backdrops visible.
            // Move only that low legacy range to the new background setting.
            if (this.environmentLightingIntensityValue <= 0.1) {
                const migratedBackgroundIntensity = this.environmentLightingIntensityValue;
                this.environmentLightingIntensityValue = 1;
                MmdManager.writeNumberLocalStorage(
                    MmdManager.ENVIRONMENT_LIGHTING_INTENSITY_STORAGE_KEY,
                    this.environmentLightingIntensityValue,
                );
                MmdManager.writeNumberLocalStorage(
                    MmdManager.ENVIRONMENT_BACKGROUND_INTENSITY_STORAGE_KEY,
                    migratedBackgroundIntensity,
                );
                return migratedBackgroundIntensity;
            }
        } catch {
            // Optional rendering preferences must never block startup.
        }
        return MmdManager.DEFAULT_ENVIRONMENT_BACKGROUND_INTENSITY;
    }

    private static readNumberLocalStorage(key: string, fallback: number, min: number, max: number): number {
        try {
            const value = Number(globalThis.localStorage?.getItem(key));
            if (Number.isFinite(value)) {
                return Math.max(min, Math.min(max, value));
            }
        } catch {
            // Optional experiment flags must never block startup.
        }
        return fallback;
    }

    private static writeNumberLocalStorage(key: string, value: number): void {
        try {
            globalThis.localStorage?.setItem(key, String(value));
        } catch {
            // Ignore persistence failures for optional experiment flags.
        }
    }

    private static normalizePreferredBulletBackend(value: string): PreferredBulletPhysicsBackend {
        if (value === "bullet-mpr" || value === "bullet-spr") {
            return value;
        }
        return "auto";
    }

    private static readPreferredBulletBackendLocalStorage(): PreferredBulletPhysicsBackend {
        try {
            return MmdManager.normalizePreferredBulletBackend(
                globalThis.localStorage?.getItem(MmdManager.PHYSICS_PREFERRED_BULLET_BACKEND_STORAGE_KEY) ?? "auto",
            );
        } catch {
            // Optional experiment flags must never block startup.
            return "auto";
        }
    }

    private static writePreferredBulletBackendLocalStorage(value: PreferredBulletPhysicsBackend): void {
        try {
            globalThis.localStorage?.setItem(MmdManager.PHYSICS_PREFERRED_BULLET_BACKEND_STORAGE_KEY, value);
        } catch {
            // Ignore persistence failures for optional experiment flags.
        }
    }

    private static summarizePerfCounter(counter: PerfCounter): {
        current: number;
        lastSecAverage: number;
        average: number;
        max: number;
    } {
        return {
            current: Math.round(counter.current * 1000) / 1000,
            lastSecAverage: Math.round(counter.lastSecAverage * 1000) / 1000,
            average: Math.round(counter.average * 1000) / 1000,
            max: Math.round(counter.max * 1000) / 1000,
        };
    }

    private static readPerformanceLogModeLocalStorage(): "off" | "summary" | "trace" {
        try {
            return normalizePerformanceLogMode(
                globalThis.localStorage?.getItem(MmdManager.FRAME_PERFORMANCE_LOG_STORAGE_KEY),
            );
        } catch {
            return "off";
        }
    }

    private static readRuntimeModeLocalStorage(): RuntimeMode {
        try {
            const value = globalThis.localStorage?.getItem(MmdManager.RUNTIME_MODE_STORAGE_KEY);
            return value === "wasm" ? "wasm" : "classic";
        } catch {
            // Optional experiment flags must never block startup.
            return "classic";
        }
    }

    constructor(canvas: HTMLCanvasElement, engine?: Engine | WebGPUEngine, startupDiagnostics: readonly string[] = []) {
        this.renderingCanvas = canvas;
        for (const diagnostic of startupDiagnostics) {
            this.runtimeDiagnostics.add(diagnostic);
        }

        MmdManager.patchMmdStandardMaterialPluginInitDirty();
        MmdManager.patchMmdToonLightSeparationShader();

        // Register default material builder explicitly (avoids Vite tree-shaking side-effect imports).
        // Some loader paths can initialize a non-MMD material builder first; PMX/PMD imports must
        // still use MmdStandardMaterial so babylon-mmd shader plugins are attached.
        if (!(MmdModelLoader.SharedMaterialBuilder instanceof MmdStandardMaterialBuilder)) {
            MmdModelLoader.SharedMaterialBuilder = new MmdStandardMaterialBuilder();
        }
        if (MmdModelLoader.SharedMaterialBuilder instanceof MmdStandardMaterialBuilder) {
            // Keep the loader's default alpha path so ordinary translucent
            // materials continue to render as semi-transparent.
            MmdModelLoader.SharedMaterialBuilder.renderMethod =
                MmdMaterialRenderMethod.DepthWriteAlphaBlendingWithEvaluation;
        }

        // Create engine (WebGPU preferred path is handled by MmdManager.create)
        this.engine = engine ?? MmdManager.createWebGlEngine(canvas);
        this.installWebGpuValidationMonitor();
        this.configureMmdTextureLoaderForWebGpuForBuilder(MmdModelLoader.SharedMaterialBuilder);
        this.configureWebGpuRawTextureUploadForNonPOT();
        this.engine.setHardwareScalingLevel(MmdManager.RENDER_HARDWARE_SCALING_LEVEL);
        this.resizeToCanvasClientSize();
        this.ensureBoneOverlayCanvas();

        // Create scene
        this.scene = new Scene(this.engine);
        this.applyCurrentEnvironmentLightingIntensity();
        Scene.MaxDeltaTime = MmdManager.PHYSICS_SCENE_MAX_DELTA_MS;
        if (this.framePerformanceLogEnabled) {
            this.sceneInstrumentation = new SceneInstrumentation(this.scene);
            this.sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
            this.sceneInstrumentation.captureRenderTargetsRenderTime = true;
            this.sceneInstrumentation.captureFrameTime = true;
            this.sceneInstrumentation.captureRenderTime = true;
            this.sceneInstrumentation.captureParticlesRenderTime = true;
            this.sceneInstrumentation.captureSpritesRenderTime = true;
            this.sceneInstrumentation.capturePhysicsTime = true;
            this.sceneInstrumentation.captureAnimationsTime = true;
            this.sceneInstrumentation.captureCameraRenderTime = true;
            logInfo("performance", "frame performance log enabled", {
                storageKey: MmdManager.FRAME_PERFORMANCE_LOG_STORAGE_KEY,
            });
        }
        this.applySkydomeBackgroundStyle();
        this.scene.ambientColor = new Color3(0.5, 0.5, 0.5);
        this.scene.imageProcessingConfiguration.isEnabled = true;
        this.scene.imageProcessingConfiguration.applyByPostProcess = false;
        this.scene.imageProcessingConfiguration.contrast = 1;

        // SDEF support
        installSdefUniformBoneWgslFix(SdefInjector);
        SdefInjector.OverrideEngineCreateEffect(this.engine);
        installSdefUniformBoneWgslEngineFix(this.engine);

        // Camera
        this.camera = new ArcRotateCamera(
            "camera",
            -Math.PI / 2,
            Math.PI / 2,
            40,
            new Vector3(0, 10, 0),
            this.scene
        );
        this.camera.fov = (30 * Math.PI) / 180;
        this.camera.minZ = 0.15;
        this.camera.maxZ = DEFAULT_CAMERA_MAX_Z;
        this.camera.lowerRadiusLimit = 3;
        this.camera.upperRadiusLimit = null;
        this.camera.angularSensibilityX = VIEWPORT_CAMERA_ROTATE_SENSIBILITY;
        this.camera.angularSensibilityY = VIEWPORT_CAMERA_ROTATE_SENSIBILITY;
        this.camera.wheelDeltaPercentage = 0;
        this.camera.attachControl(canvas, true);
        this.camera.inputs.removeByType("ArcRotateCameraPointersInput");
        this.camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");
        this.scene.activeCamera = this.camera;
        this.initializeBoneGizmoSystem();
        canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
        canvas.addEventListener("pointermove", this.onCanvasPointerMove);
        canvas.addEventListener("pointerup", this.onCanvasPointerUp);
        canvas.addEventListener("pointercancel", this.onCanvasPointerCancel);
        canvas.addEventListener("pointerleave", this.onCanvasPointerCancel);
        canvas.addEventListener("mousedown", this.onCanvasMouseDown);
        canvas.addEventListener("auxclick", this.onCanvasAuxClick);
        canvas.addEventListener("contextmenu", this.onCanvasContextMenu);
        canvas.addEventListener("wheel", this.onCanvasWheel, { passive: false });
        this.syncCameraRotationFromCurrentView();
        this.recordViewportCameraSyncState();
        this.updateDofFocalLengthFromCameraFov();
        this.dofFocusDistanceMmValue = this.getDofAutoFocusDistanceMm();
        this.initializePostEffectBackend();
        this.initializeDofPipeline();
        this.setupColorCorrectionPostProcess();

        // Lights
        const hemiLight = this.hemiLight = new HemisphericLight(
            "hemiLight",
            new Vector3(0, 1, 0),
            this.scene
        );
        hemiLight.intensity = 0.0;
        hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
        hemiLight.groundColor = this.shadowGroundColorValue.clone();

        const dirLight = this.dirLight = new DirectionalLight(
            "dirLight",
            new Vector3(0.3, -0.5, 0.5),
            this.scene
        );
        dirLight.intensity = 1.0;
        dirLight.position = new Vector3(-20, 30, -20);
        // Keep a wide fixed shadow frustum so shadows can cover the stage and distant background geometry.
        dirLight.shadowMinZ = 1;
        dirLight.shadowMaxZ = 500;
        dirLight.autoUpdateExtends = true;
        dirLight.autoCalcShadowZBounds = true;
        this.applyShadowFrustumSize();
        this.applyLightColorTemperature();

        this.shadowGenerator = this.createConfiguredShadowGenerator(dirLight);
        this.applyShadowFrustumSize();
        this.applyShadowEdgeSoftness();

        // Ground
        this.ground = CreateGround("ground", {
            width: 80,
            height: 80,
            subdivisions: 2,
            updatable: false,
        }, this.scene);

        const groundMat = new StandardMaterial("groundMat", this.scene);
        groundMat.diffuseColor = new Color3(1, 1, 1);
        groundMat.ambientColor = new Color3(1, 1, 1);
        groundMat.specularColor = new Color3(0, 0, 0);
        groundMat.alpha = 1.0;
        groundMat.useLogarithmicDepth = false;

        const gridTextureSize = 512;
        const gridCell = 64;
        const groundGridTexture = new DynamicTexture(
            "groundGridTexture",
            { width: gridTextureSize, height: gridTextureSize },
            this.scene,
            true
        );
        const gridCtx = groundGridTexture.getContext();
        gridCtx.fillStyle = "#ededed";
        gridCtx.fillRect(0, 0, gridTextureSize, gridTextureSize);
        for (let i = 0; i <= gridTextureSize; i += gridCell) {
            const isMajor = i % (gridCell * 4) === 0;
            gridCtx.strokeStyle = isMajor ? "#b6b6b6" : "#c8c8c8";
            gridCtx.lineWidth = isMajor ? 3 : 1;
            gridCtx.beginPath();
            gridCtx.moveTo(i, 0);
            gridCtx.lineTo(i, gridTextureSize);
            gridCtx.stroke();
            gridCtx.beginPath();
            gridCtx.moveTo(0, i);
            gridCtx.lineTo(gridTextureSize, i);
            gridCtx.stroke();
        }
        groundGridTexture.wrapU = Texture.WRAP_ADDRESSMODE;
        groundGridTexture.wrapV = Texture.WRAP_ADDRESSMODE;
        groundGridTexture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
        const maxAnisotropy = this.engine.getCaps().maxAnisotropy ?? 1;
        groundGridTexture.anisotropicFilteringLevel = Math.min(16, maxAnisotropy);
        groundGridTexture.uScale = 20;
        groundGridTexture.vScale = 20;
        groundGridTexture.update();
        groundMat.diffuseTexture = groundGridTexture;
        this.ground.material = groundMat;
        this.ground.receiveShadows = true;
        stabilizeAppGeneratedPlanarMesh(this.ground);
        this.configureBundledEnvironmentTexture();
        this.syncEnvironmentLightingTexture();

        this.skydome = CreateSphere("skydome", {
            diameter: 1200,
            segments: 24,
            updatable: false,
        }, this.scene);
        const skydomeMat = new BackgroundMaterial("skydomeMat", this.scene);
        skydomeMat.backFaceCulling = false;
        skydomeMat.disableDepthWrite = true;
        skydomeMat.useLogarithmicDepth = false;
        skydomeMat.useRGBColor = false;
        skydomeMat.enableNoise = true;
        skydomeMat.maxSimultaneousLights = 0;
        this.skydomeMaterial = skydomeMat;
        this.skydome.material = skydomeMat;
        this.skydome.infiniteDistance = true;
        this.skydome.isPickable = false;
        this.skydome.receiveShadows = false;
        this.syncEnvironmentSkybox();
        refreshMeshBoundingInfoForRenderStability(this.skydome);
        // MMD Runtime (without physics for initial version)
        this.mmdRuntime = new MmdRuntime(this.scene);
        this.mmdRuntime.autoPhysicsInitialization = false;
        this.installMmdRuntimePerformanceHooks(this.mmdRuntime);
        this.mmdRuntime.register(this.scene);
        this.physicsController = new PhysicsRuntimeController({
            scene: this.scene,
            runtime: this.mmdRuntime,
            getMprUnavailableReason: () => this.getMprUnavailableReason(),
            loadMprWasmInstance: () => loadBundledMprWasmInstance(),
            loadSprWasmInstance: () => loadBundledSprWasmInstance(),
            onStateChanged: (enabled, available) => this.onPhysicsStateChanged?.(enabled, available),
            onError: (message) => this.onError?.(message),
        });
        this.physicsController.setPreferredBulletBackend(this.preferredBulletPhysicsBackend);
        this.physicsController.setBufferedEvaluationDuringPlayback(this.physicsBufferedEvaluationDuringPlayback);
        this.physicsController.setMaxSubSteps(this.physicsMaxSubSteps);
        this.physicsModelController = new PhysicsModelController({
            getRuntime: () => this.mmdRuntime,
            getPhysicsEnabled: () => this.getPhysicsEnabled(),
            isSimulationActive: () => this.isPhysicsSimulationActive(),
            getPhysicsBackendLabel: () => this.getPhysicsBackendLabel(),
            getPhysicsEvaluationTypeLabel: () => this.physicsController.getEvaluationTypeLabel(),
            isPlaybackActive: () => this._isPlaying,
            isScenePhysicsEnabled: () => this.scene.physicsEnabled,
            getCurrentFrameTime: () => Number.isFinite(this.mmdRuntime?.currentFrameTime)
                ? this.mmdRuntime.currentFrameTime
                : null,
            getPhysicsGravity: () => {
                const direction = this.physicsController.getGravityDirection();
                const gravity = new Vector3(direction.x, direction.y, direction.z);
                if (gravity.lengthSquared() < 1e-6) {
                    gravity.set(0, -1, 0);
                } else {
                    gravity.normalize();
                }
                return gravity.scale(this.physicsController.getGravityAcceleration());
            },
        });

        // MMD camera runtime object (used for camera VMD evaluation)
        this.mmdCamera = new MmdCamera("mmdRuntimeCamera", this.camera.target.clone(), this.scene, false);
        this.syncMmdCameraFromViewportCamera();
        this.mmdRuntime.addAnimatable(this.mmdCamera);
        this.physicsInitializationPromise = this.initializeRuntimeModeAndPhysics();
        this.installScenePerformancePhaseObservers();

        // VMD Loader
        this.vmdLoader = new VmdLoader(this.scene);
        this.vpdLoader = new VpdLoader(this.scene);
        this.globalIlluminationController = new GlobalIlluminationController(
            this.scene,
            this.renderingCanvas,
            () => this.dirLight ?? null,
            () => this.sceneModels,
            (enabled) => this.onGlobalIlluminationStateChanged?.(enabled),
        );

        // The runtime backend can be replaced asynchronously during physics initialization.
        // Apply external parents after every onBeforeRender observer (including the replacement
        // runtime's after-physics update), but before active mesh/skeleton evaluation begins.
        this.scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
            this.applyModelExternalParentKeyframesAtFrame(this._currentFrame);
            if (this.boneGizmoManager?.isDragging === true) {
                // Apply the gizmo to the raw runtime pose first. Applying external parents before
                // and after a parent-bone drag would multiply the same child pose twice for one frame.
                this.handleBoneGizmoBeforeRender();
                this.applyModelExternalParentsBeforeRender();
                return;
            }

            this.applyModelExternalParentsBeforeRender();
            this.handleBoneGizmoBeforeRender();
        });

        this.scene.onBeforeRenderObservable.add(() => {
            if (!this.framePerformanceLogEnabled) {
                if (this.shouldApplyCameraMotionToViewport()) {
                    this.syncViewportCameraFromMmdCamera();
                }
                this.syncViewportCameraDrivenStateFromNativeInputs();
                this.syncCameraExternalParentedViewport();
                this.updateBoneVisualizer();
                this.updateRigidBodyVisualizer();
                this.updateCharacterContactShadows();
                this.updateMirroringFloorRenderList();
                this.updateEditorDofFocusAndFStop();
                this.maybeLogRenderStabilityDiagnostics();
                return;
            }

            let sectionStartMs = performance.now();
            if (this.shouldApplyCameraMotionToViewport()) {
                this.syncViewportCameraFromMmdCamera();
            }
            this.recordFramePerformanceSection("cameraMotionToViewport", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.syncViewportCameraDrivenStateFromNativeInputs();
            this.recordFramePerformanceSection("viewportCameraInput", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.syncCameraExternalParentedViewport();
            this.recordFramePerformanceSection("cameraExternalParent", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.updateBoneVisualizer();
            this.recordFramePerformanceSection("boneVisualizer", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.updateRigidBodyVisualizer();
            this.recordFramePerformanceSection("rigidBodyVisualizer", performance.now() - sectionStartMs);
            sectionStartMs = performance.now();
            this.updateCharacterContactShadows();
            this.recordFramePerformanceSection("characterContactShadow", performance.now() - sectionStartMs);
            this.updateMirroringFloorRenderList();
            sectionStartMs = performance.now();
            this.updateEditorDofFocusAndFStop();
            this.recordFramePerformanceSection("editorDof", performance.now() - sectionStartMs);
            this.maybeLogRenderStabilityDiagnostics();
        });

        // Start render loop
        this.engine.runRenderLoop(() => {
            const frameStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            const nowMs = performance.now();
            if (this.suspendSceneRenderCount > 0) {
                this.lastRenderTimestampMs = nowMs;
                this.nextRenderDueTimestampMs = nowMs;
                return;
            }
            if (!this.autoRenderEnabled) {
                this.lastRenderTimestampMs = nowMs;
                this.nextRenderDueTimestampMs = nowMs;
                return;
            }

            if (this.renderFpsLimit > 0) {
                if (nowMs < this.nextRenderDueTimestampMs) {
                    return;
                }
                this.nextRenderDueTimestampMs = nowMs + (1000 / this.renderFpsLimit);
            }
            this.syncFrameGraphRenderTargetState();
            const deltaMs = Math.max(0, Math.min(100, nowMs - this.lastRenderTimestampMs));
            this.lastRenderTimestampMs = nowMs;

            let sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            const advancedManualPlayback = this.advanceManualPlaybackWithoutAudio(deltaMs);
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("manualPlayback", performance.now() - sectionStartMs);
            }

            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            this.updateSimpleMotionBlurState(deltaMs);
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("motionBlur", performance.now() - sectionStartMs);
            }
            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            this.syncBackgroundVideoFrame();
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("backgroundVideo", performance.now() - sectionStartMs);
            }
            const renderBlockStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            sectionStartMs = renderBlockStartMs;
            try {
                this.scene.render();
            } catch (err: unknown) {
                if (this.tryRecoverFrameGraphRenderTargetFailure(err)) {
                    return;
                }
                throw err;
            }
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("sceneRenderCore", performance.now() - sectionStartMs);
            }
            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            this.executePostEffectBackend();
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("postEffectBackend", performance.now() - sectionStartMs);
            }
            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            this.renderBoneGizmoUtilityLayerAfterPostEffects();
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("boneGizmoUtilityLayer", performance.now() - sectionStartMs);
            }
            const afterRenderMs = performance.now();
            if (this.framePerformanceLogEnabled) {
                this.recordFramePerformanceSection("sceneRender", afterRenderMs - renderBlockStartMs);
            }
            this.logPhysicsPerformanceSample(afterRenderMs);
            this.logPhysicsChainDiagnostics(afterRenderMs);
            if (!this._isPlaying) {
                if (this.framePerformanceLogEnabled) {
                    this.recordFramePerformanceSection("frameTotal", afterRenderMs - frameStartMs);
                    this.logFramePerformanceSample(afterRenderMs);
                }
                return;
            }

            sectionStartMs = this.framePerformanceLogEnabled ? performance.now() : 0;
            if (advancedManualPlayback) {
                this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
                if (this.framePerformanceLogEnabled) {
                    const frameEndMs = performance.now();
                    this.recordFramePerformanceSection("frameStateUpdate", frameEndMs - sectionStartMs);
                    this.recordFramePerformanceSection("frameTotal", frameEndMs - frameStartMs);
                    this.logFramePerformanceSample(frameEndMs);
                }
                return;
            }

            const runtimeFrame = Math.floor(this.mmdRuntime.currentFrameTime);
            this._currentFrame = Math.min(runtimeFrame, this._totalFrames);
            this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
            if (this.framePerformanceLogEnabled) {
                const frameEndMs = performance.now();
                this.recordFramePerformanceSection("frameStateUpdate", frameEndMs - sectionStartMs);
                this.recordFramePerformanceSection("frameTotal", frameEndMs - frameStartMs);
                this.logFramePerformanceSample(frameEndMs);
            }
        });

        // Handle resize
        window.addEventListener("resize", this.onWindowResize);

        this.resizeObserver = new ResizeObserver(() => {
            this.resizeToCanvasClientSize();
        });
        this.resizeObserver.observe(canvas.parentElement ?? canvas);
    }

    private async initializeRuntimeModeAndPhysics(): Promise<boolean> {
        if (this.runtimeMode !== "wasm") {
            return await this.physicsController.initializeClassic();
        }

        try {
            await this.initializeWasmRuntimeMode();
            logInfo("physics", "experimental MMD WASM runtime initialized", {
                runtimeMode: this.runtimeMode,
                backend: this.getPhysicsBackendLabel(),
                evaluationType: this.getPhysicsEvaluationTypeLabel(),
                simulationRateHz: this.getPhysicsSimulationRateHz(),
            });
            return true;
        } catch (err: unknown) {
            logWarn("physics", "experimental MMD WASM runtime failed; falling back to classic runtime", toLogErrorData(err));
            console.warn("Experimental MMD WASM runtime failed. Falling back to classic runtime:", err);
            this.runtimeMode = "classic";
            this.mmdWasmInstance = null;
            this.physicsController.setRuntime(this.mmdRuntime);
            return await this.physicsController.initializeClassic();
        }
    }

    private async initializeWasmRuntimeMode(): Promise<void> {
        const mprUnavailableReason = this.getMprUnavailableReason();
        if (mprUnavailableReason !== null) {
            throw new Error(mprUnavailableReason);
        }

        const wasmInstance = await loadBundledMprWasmInstance();
        const wasmRuntime = new MmdWasmRuntime(wasmInstance, this.scene, new MmdWasmPhysics(this.scene));
        wasmRuntime.autoPhysicsInitialization = false;
        this.installMmdRuntimePerformanceHooks(wasmRuntime);
        wasmRuntime.register(this.scene);

        this.mmdRuntime.unregister(this.scene);
        this.mmdRuntime.dispose(this.scene);
        this.mmdRuntime = wasmRuntime;
        this.mmdWasmInstance = wasmInstance;
        this.mmdRuntime.addAnimatable(this.mmdCamera);
        this.physicsController.useWasmRuntime(wasmRuntime);
        this.syncScenePhysicsSimulationState();
        this.applyPhysicsStateToAllModels();
    }

    private getMprUnavailableReason(): string | null {
        if (!import.meta.env.DEV) {
            return "MPR packaged build integration is pending";
        }
        if (typeof WebAssembly === "undefined") {
            return "WebAssembly is unavailable";
        }
        if (typeof SharedArrayBuffer === "undefined") {
            return "SharedArrayBuffer is unavailable";
        }
        if (!globalThis.crossOriginIsolated) {
            return "crossOriginIsolated is false";
        }
        return null;
    }

    private logPhysicsPerformanceSample(nowMs: number): void {
        if (!this.framePerformanceLogEnabled && !isDebugLogEnabled("performance")) return;

        this.physicsController.logPerformanceSample(nowMs, {
            runtimeMode: this.runtimeMode,
            engine: this.getEngineType(),
            fps: this.getFps(),
            modelCount: this.sceneModels.length,
            simulationActive: this.isPhysicsSimulationActive(),
        });
    }

    private logPhysicsChainDiagnostics(nowMs: number): void {
        if (!isDebugLogEnabled("physics")) return;
        if (nowMs < this.nextPhysicsChainDiagnosticsMs) return;
        this.nextPhysicsChainDiagnosticsMs = nowMs + 2000;

        for (const sceneModel of this.sceneModels) {
            this.physicsModelController.logPhysicsChainDistanceDiagnostics(
                sceneModel.model,
                sceneModel.info.name,
                sceneModel.rigidBodies,
                sceneModel.joints,
            );
        }
    }

    private recordFramePerformanceSection(section: FramePerformanceSection, durationMs: number): void {
        if (!this.framePerformanceLogEnabled) return;
        this.framePerformanceProfiler.record(section, durationMs);
    }

    private markFramePerformancePhase(section: FramePerformanceSection): void {
        if (!this.framePerformanceLogEnabled) return;
        this.framePerformancePhaseStartMs.set(section, performance.now());
    }

    private recordFramePerformancePhase(section: FramePerformanceSection): void {
        if (!this.framePerformanceLogEnabled) return;
        const startMs = this.framePerformancePhaseStartMs.get(section);
        if (startMs === undefined) return;
        this.framePerformancePhaseStartMs.delete(section);
        this.recordFramePerformanceSection(section, performance.now() - startMs);
    }

    private installScenePerformancePhaseObservers(): void {
        if (!this.framePerformanceLogEnabled) return;

        this.scene.onBeforeAnimationsObservable.add(() => this.markFramePerformancePhase("sceneAnimations"));
        this.scene.onAfterAnimationsObservable.add(() => this.recordFramePerformancePhase("sceneAnimations"));

        this.scene.onBeforeActiveMeshesEvaluationObservable.add(() => this.markFramePerformancePhase("activeMeshesEvaluation"));
        this.scene.onAfterActiveMeshesEvaluationObservable.add(() => this.recordFramePerformancePhase("activeMeshesEvaluation"));

        this.scene.onBeforeRenderTargetsRenderObservable.add(() => this.markFramePerformancePhase("renderTargetsRender"));
        this.scene.onAfterRenderTargetsRenderObservable.add(() => this.recordFramePerformancePhase("renderTargetsRender"));

        this.scene.onBeforeCameraRenderObservable.add(() => this.markFramePerformancePhase("cameraRender"));
        this.scene.onAfterCameraRenderObservable.add(() => this.recordFramePerformancePhase("cameraRender"));

        this.scene.onBeforeDrawPhaseObservable.add(() => this.markFramePerformancePhase("drawPhase"));
        this.scene.onAfterDrawPhaseObservable.add(() => this.recordFramePerformancePhase("drawPhase"));
    }

    private installMmdRuntimePerformanceHooks(runtime: RuntimeMmdRuntime): void {
        if (!this.framePerformanceLogEnabled || this.performanceHookedRuntimes.has(runtime)) return;

        const originalBeforePhysics = runtime.beforePhysics.bind(runtime);
        runtime.beforePhysics = (deltaTime: number): void => {
            this.framePerformanceProfiler.measure("mmdBeforePhysics", () => originalBeforePhysics(deltaTime));
        };

        const originalAfterPhysics = runtime.afterPhysics.bind(runtime);
        runtime.afterPhysics = (): void => {
            this.framePerformanceProfiler.measure("mmdAfterPhysics", () => originalAfterPhysics());
        };

        this.performanceHookedRuntimes.add(runtime);
    }

    private installRenderTargetPerformanceHook(
        renderTarget: RenderTargetTexture,
        section: FramePerformanceSection,
    ): void {
        if (!this.framePerformanceLogEnabled) return;

        renderTarget.onBeforeRenderObservable.add(() => this.markFramePerformancePhase(section));
        renderTarget.onAfterRenderObservable.add(() => this.recordFramePerformancePhase(section));
    }

    private logFramePerformanceSample(nowMs: number): void {
        if (!this.framePerformanceLogEnabled) return;
        if (nowMs < this.nextFramePerformanceLogMs) {
            return;
        }
        this.nextFramePerformanceLogMs = nowMs + MmdManager.FRAME_PERFORMANCE_LOG_INTERVAL_MS;
        logInfo("performance", "frame performance sample", this.createPerformanceSnapshot({
            kind: "summary",
            sections: this.framePerformanceProfiler.summarizeAndReset(),
        }));
    }

    public dumpPerformanceSnapshot(): Record<string, unknown> {
        const snapshot = this.createPerformanceSnapshot({
            kind: "manual",
            sections: this.framePerformanceProfiler.summarize(),
        });
        logInfo("performance", "manual performance snapshot", snapshot);
        return snapshot;
    }

    private createPerformanceSnapshot(options: {
        kind: "summary" | "manual";
        sections: Record<FramePerformanceSection, { samples: number; avgMs: number | null; maxMs: number | null }>;
    }): Record<string, unknown> {
        const renderTargets = this.getRenderTargetPerformanceSnapshot();
        return {
            kind: options.kind,
            logMode: this.framePerformanceLogMode,
            intervalMs: MmdManager.FRAME_PERFORMANCE_LOG_INTERVAL_MS,
            runtimeMode: this.runtimeMode,
            engine: this.getEngineType(),
            fps: this.getFps(),
            modelCount: this.sceneModels.length,
            isPlaying: this._isPlaying,
            physicsBackend: this.getPhysicsBackendLabel(),
            editor: this.getEditorPerformanceSnapshot(),
            sections: options.sections,
            sceneInstrumentation: this.getSceneInstrumentationSnapshot(),
            renderTargetDetails: this.getRenderTargetDetails(),
            renderTargets,
            frameGraphPostEffects: this.getFrameGraphPostEffectsPerformanceSnapshot(),
        };
    }

    private getFrameGraphPostEffectsPerformanceSnapshot(): Record<string, unknown> {
        const controllerSnapshot = this.frameGraphPostEffectsController?.getDiagnosticsSnapshot() ?? null;
        const resourcePlan = controllerSnapshot?.resourcePlan ?? null;
        const taskNames = controllerSnapshot
            ? Object.entries(controllerSnapshot.tasks)
                .filter(([, enabled]) => enabled)
                .map(([name]) => name)
            : [];
        const resourceNames = controllerSnapshot
            ? Object.entries(controllerSnapshot.resources)
                .filter(([, enabled]) => enabled)
                .map(([name]) => name)
            : [];
        return {
            backend: this.postEffectBackend,
            requestedBackend: this.requestedPostEffectBackend,
            active: this.postEffectBackend === "frameGraph" && this.frameGraphPostEffectsController !== null,
            ready: this.frameGraphPostEffectsController?.isReady() ?? false,
            executedFrameCount: this.getFrameGraphPostEffectsExecutedFrameCount(),
            stack: [...this.getFrameGraphPostEffectRuntimeOrder()],
            activeEffects: this.getActiveFrameGraphPostEffectIds(),
            resourcePlan: resourcePlan
                ? {
                    effectOrder: resourcePlan.effectOrder,
                    activeEffects: resourcePlan.activeEffects,
                    requirementKeys: resourcePlan.requirementKeys,
                    needsGeometryRenderer: resourcePlan.needsGeometryRenderer,
                    needsDepthRenderer: resourcePlan.needsDepthRenderer,
                    needsLuminousMask: resourcePlan.needsLuminousMask,
                }
                : null,
            resources: {
                sceneColor: this.frameGraphPostEffectsSceneColorTarget !== null,
                depthScene: this.depthRenderer !== null,
                luminousMask: this.frameGraphPostEffectsLuminousMaskTarget !== null,
                viewDepth: controllerSnapshot?.resources.viewDepth ?? false,
                viewNormal: controllerSnapshot?.resources.viewNormal ?? false,
                reflectivity: controllerSnapshot?.resources.reflectivity ?? false,
            },
            renderTargets: {
                sceneColor: MmdManager.getRenderTargetSizeLabel(this.frameGraphPostEffectsSceneColorTarget),
                luminousMask: MmdManager.getRenderTargetSizeLabel(this.frameGraphPostEffectsLuminousMaskTarget),
                luminousMaskScale: FRAME_GRAPH_LUMINOUS_MASK_EXPERIMENT_SCALE,
            },
            luminousMaskRenderedSubMeshes: this.getFrameGraphPostEffectsLuminousMaskRenderedSubMeshCount(),
            controller: controllerSnapshot
                ? {
                    active: controllerSnapshot.active,
                    ready: controllerSnapshot.ready,
                    executedFrameCount: controllerSnapshot.executedFrameCount,
                    taskNames,
                    resourceNames,
                    planRequirementKeys: resourcePlan?.requirementKeys ?? [],
                    connectedOrder: controllerSnapshot.connectedOrder,
                    luminousCoreKernel: controllerSnapshot.luminousBlur.coreKernel,
                    luminousHaloKernel: controllerSnapshot.luminousBlur.haloKernel,
                    luminousCoreDirectionScale: controllerSnapshot.luminousBlur.coreDirectionScale,
                    luminousHaloDirectionScale: controllerSnapshot.luminousBlur.haloDirectionScale,
                }
                : null,
        };
    }

    public dumpRenderDiagnostics(reason: string): Record<string, unknown> {
        try {
            const snapshot = this.createRenderDiagnosticsSnapshot(reason);
            if (reason.includes("model")) {
                logInfo("render", "render diagnostics", snapshot);
            } else {
                logDebugIfEnabled("postfx", "render", "render diagnostics", snapshot);
            }
            return snapshot;
        } catch (err) {
            const fallback = {
                reason,
                failed: true,
                error: toLogErrorData(err),
            };
            logWarn("render", "render diagnostics failed", fallback);
            return fallback;
        }
    }

    private createRenderDiagnosticsSnapshot(reason: string): Record<string, unknown> {
        const imageProcessing = this.scene.imageProcessingConfiguration;
        const colorToData = (value: unknown): Record<string, number> | null => {
            if (!value || typeof value !== "object") return null;
            const color = value as { r?: unknown; g?: unknown; b?: unknown; a?: unknown };
            const result: Record<string, number> = {};
            if (typeof color.r === "number") result.r = color.r;
            if (typeof color.g === "number") result.g = color.g;
            if (typeof color.b === "number") result.b = color.b;
            if (typeof color.a === "number") result.a = color.a;
            return Object.keys(result).length > 0 ? result : null;
        };
        const textureToData = (value: unknown): Record<string, unknown> | null => {
            if (!value || typeof value !== "object") return null;
            const texture = value as {
                name?: unknown;
                url?: unknown;
                isReady?: () => boolean;
                hasAlpha?: unknown;
                coordinatesIndex?: unknown;
                level?: unknown;
                metadata?: Record<string, unknown> | null;
                getSize?: () => { width?: number; height?: number };
            };
            let ready: boolean | null = null;
            try {
                ready = texture.isReady?.() ?? null;
            } catch {
                ready = false;
            }
            const size = texture.getSize?.();
            return {
                name: typeof texture.name === "string" ? texture.name : null,
                url: typeof texture.url === "string" ? texture.url : null,
                ready,
                hasAlpha: typeof texture.hasAlpha === "boolean" ? texture.hasAlpha : null,
                coordinatesIndex: typeof texture.coordinatesIndex === "number" ? texture.coordinatesIndex : null,
                level: typeof texture.level === "number" ? texture.level : null,
                size: size && typeof size.width === "number" && typeof size.height === "number"
                    ? { width: size.width, height: size.height }
                    : null,
                decodedDds: texture.metadata?.mmdModokiDecodedDdsFallback === true,
                decodedBmp: texture.metadata?.mmdModokiDecodedBmpAlphaFallback === true,
                whiteMattedAlpha: texture.metadata?.mmdModokiDecodedWhiteMattedAlpha ?? null,
            };
        };

        const materialSamples = this.sceneModels
            .find((sceneModel) => sceneModel.model === this.currentModel)
            ?.materials.slice(0, 8).map((entry) => {
                const material = entry.material as {
                    name?: unknown;
                    getClassName?: () => string;
                    diffuseColor?: unknown;
                    ambientColor?: unknown;
                    emissiveColor?: unknown;
                    specularColor?: unknown;
                    albedoColor?: unknown;
                    reflectivityColor?: unknown;
                    alpha?: unknown;
                    transparencyMode?: unknown;
                    alphaCutOff?: unknown;
                    forceDepthWrite?: unknown;
                    disableColorWrite?: unknown;
                    disableDepthWrite?: unknown;
                    useAlphaFromDiffuseTexture?: unknown;
                    useAlphaFromAlbedoTexture?: unknown;
                    diffuseTexture?: unknown;
                    albedoTexture?: unknown;
                    opacityTexture?: unknown;
                    specularTexture?: unknown;
                    reflectionTexture?: unknown;
                    disableLighting?: unknown;
                    useLogarithmicDepth?: unknown;
                    imageProcessingConfiguration?: unknown;
                    _pluginMaterial?: {
                        isMock?: unknown;
                        constructor?: { name?: unknown };
                    };
                };
                return {
                    key: entry.key,
                    name: typeof material.name === "string" ? material.name : entry.name,
                    className: material.getClassName?.() ?? null,
                    pluginName: typeof material._pluginMaterial?.constructor?.name === "string"
                        ? material._pluginMaterial.constructor.name
                        : null,
                    pluginIsMock: typeof material._pluginMaterial?.isMock === "boolean"
                        ? material._pluginMaterial.isMock
                        : null,
                    alpha: typeof material.alpha === "number" ? material.alpha : null,
                    transparencyMode: typeof material.transparencyMode === "number" ? material.transparencyMode : null,
                    alphaCutOff: typeof material.alphaCutOff === "number" ? material.alphaCutOff : null,
                    diffuseColor: colorToData(material.diffuseColor),
                    ambientColor: colorToData(material.ambientColor),
                    emissiveColor: colorToData(material.emissiveColor),
                    specularColor: colorToData(material.specularColor),
                    albedoColor: colorToData(material.albedoColor),
                    reflectivityColor: colorToData(material.reflectivityColor),
                    diffuseTexture: textureToData(material.diffuseTexture),
                    albedoTexture: textureToData(material.albedoTexture),
                    opacityTexture: textureToData(material.opacityTexture),
                    specularTexture: textureToData(material.specularTexture),
                    reflectionTexture: textureToData(material.reflectionTexture),
                    useAlphaFromDiffuseTexture: material.useAlphaFromDiffuseTexture,
                    useAlphaFromAlbedoTexture: material.useAlphaFromAlbedoTexture,
                    forceDepthWrite: material.forceDepthWrite,
                    disableColorWrite: material.disableColorWrite,
                    disableDepthWrite: material.disableDepthWrite,
                    disableLighting: material.disableLighting,
                    useLogarithmicDepth: material.useLogarithmicDepth,
                    hasOwnImageProcessingConfiguration: material.imageProcessingConfiguration !== undefined,
                };
            }) ?? [];

        const customRenderTargets = this.camera.customRenderTargets.map((target, index) => ({
            index,
            name: target.name,
            size: MmdManager.getRenderTargetSizeLabel(target),
            isFrameGraphSceneColor: target === this.frameGraphPostEffectsSceneColorTarget,
            isLuminousMask: target === this.frameGraphPostEffectsLuminousMaskTarget,
        }));

        return {
            reason,
            timelineTarget: this.timelineTarget,
            modelCount: this.sceneModels.length,
            currentModel: this.activeModelInfo?.name ?? null,
            engine: this.getEngineType(),
            postEffectBackend: this.postEffectBackend,
            requestedPostEffectBackend: this.requestedPostEffectBackend,
            shouldExecuteFrameGraphPostEffects: this.shouldExecuteFrameGraphPostEffects(),
            activeFrameGraphEffects: this.getActiveFrameGraphPostEffectIds(),
            frameGraphStack: this.getFrameGraphPostEffectRuntimeOrder(),
            sceneImageProcessing: {
                isEnabled: imageProcessing.isEnabled,
                applyByPostProcess: imageProcessing.applyByPostProcess,
                contrast: imageProcessing.contrast,
                exposure: imageProcessing.exposure,
                toneMappingEnabled: imageProcessing.toneMappingEnabled,
                toneMappingType: imageProcessing.toneMappingType,
                colorCurvesEnabled: imageProcessing.colorCurvesEnabled,
                vignetteEnabled: imageProcessing.vignetteEnabled,
                ditheringEnabled: imageProcessing.ditheringEnabled,
                ditheringIntensity: imageProcessing.ditheringIntensity,
            },
            postEffectValues: {
                contrast: this.postEffectContrastValue,
                gamma: this.postEffectGammaValue,
                exposure: this.postEffectExposureValue,
                toneMappingEnabled: this.postEffectToneMappingEnabledValue,
                toneMappingType: this.postEffectToneMappingTypeValue,
                colorCurvesEnabled: this.postEffectColorCurvesEnabledValue,
                colorCurvesSaturation: this.postEffectColorCurvesSaturationValue,
                lutEnabled: this.postEffectLutEnabledValue,
                bloomEnabled: this.postEffectBloomEnabledValue,
                luminousInStack: this.getFrameGraphPostEffectStackIds().includes("luminous"),
                luminousActive: this.isFrameGraphPostEffectActive("luminous"),
            },
            cameraCustomRenderTargets: customRenderTargets,
            frameGraphPostEffects: this.getFrameGraphPostEffectsPerformanceSnapshot(),
            materialSamples,
        };
    }

    private getEditorPerformanceSnapshot(): Record<string, unknown> {
        return {
            rigidBodyVisualizerEnabled: this.rigidBodyVisualizerEnabled,
            boneVisualizerTarget: this.boneVisualizerTarget !== null,
            boneGizmoActive: this.boneGizmoManager !== null,
            characterContactShadowEnabled: this.characterContactShadowEnabledValue,
            mirroringFloorEnabled: this.mirroringFloorEnabledValue,
            shadowEnabled: this.shadowEnabled,
            antialiasEnabled: this.antialiasEnabledValue,
        };
    }

    private getRenderTargetPerformanceSnapshot(): Record<string, unknown> {
        const customRenderTargets = this.camera?.customRenderTargets ?? [];
        const entries = customRenderTargets.map((target, index) => this.createTextureSnapshot(
            `camera.customRenderTargets[${index}]`,
            target,
            "cameraCustomRenderTarget",
        ));
        const depthMap = this.depthRenderer?.getDepthMap() ?? null;
        const ssaoDepthMap = this.ssaoDepthRenderer?.getDepthMap() ?? null;
        const shadowMap = this.shadowGenerator?.getShadowMap() ?? null;

        return {
            cameraCustomRenderTargetCount: customRenderTargets.length,
            cameraCustomRenderTargetNames: entries.map((entry) => entry?.name ?? null),
            cameraCustomRenderTargetSizes: entries.map((entry) => entry?.size ?? null),
            cameraCustomRenderTargets: entries,
            named: {
                frameGraphSceneColor: this.createTextureSnapshot(
                    "frameGraphPostEffectsSceneColor",
                    this.frameGraphPostEffectsSceneColorTarget,
                    "frameGraph",
                ),
                frameGraphLuminousMask: this.createTextureSnapshot(
                    "frameGraphPostEffectsLuminousMask",
                    this.frameGraphPostEffectsLuminousMaskTarget,
                    "frameGraph",
                ),
                dofDepth: this.createTextureSnapshot("dofDepth", depthMap, "depth"),
                ssaoDepth: this.createTextureSnapshot("ssaoDepth", ssaoDepthMap, "depth"),
                shadowMap: this.createTextureSnapshot("shadowMap", shadowMap, "shadow"),
                mirroringFloor: this.createTextureSnapshot("mirroringFloor", this.mirroringFloorTexture, "reflection"),
            },
        };
    }

    private getRenderTargetDetails(): Record<string, unknown>[] {
        const details: Record<string, unknown>[] = [];
        const customRenderTargets = this.camera?.customRenderTargets ?? [];
        for (let i = 0; i < customRenderTargets.length; i += 1) {
            details.push(this.createRenderTargetDetail(
                `camera.customRenderTargets[${i}]`,
                customRenderTargets[i],
                "cameraCustomRenderTarget",
            ));
        }

        if (this.frameGraphPostEffectsSceneColorTarget) {
            details.push(this.createRenderTargetDetail(
                "frameGraphPostEffectsSceneColor",
                this.frameGraphPostEffectsSceneColorTarget,
                "frameGraphSceneColor",
            ));
        }
        if (this.frameGraphPostEffectsLuminousMaskTarget) {
            details.push(this.createRenderTargetDetail(
                "frameGraphPostEffectsLuminousMask",
                this.frameGraphPostEffectsLuminousMaskTarget,
                "frameGraphLuminousMask",
            ));
        }

        const depthMap = this.depthRenderer?.getDepthMap();
        if (depthMap) {
            details.push(this.createRenderTargetDetail("dofDepth", depthMap, "depth"));
        }
        const ssaoDepthMap = this.ssaoDepthRenderer?.getDepthMap();
        if (ssaoDepthMap) {
            details.push(this.createRenderTargetDetail("ssaoDepth", ssaoDepthMap, "depth"));
        }
        const shadowMap = this.shadowGenerator?.getShadowMap();
        if (shadowMap) {
            details.push(this.createRenderTargetDetail("shadowMap", shadowMap, "shadow"));
        }
        if (this.mirroringFloorTexture) {
            details.push(this.createRenderTargetDetail("mirroringFloor", this.mirroringFloorTexture, "reflection"));
        }

        return details;
    }

    private createRenderTargetDetail(
        label: string,
        renderTarget: RenderTargetTexture,
        kind: string,
    ): Record<string, unknown> {
        const size = renderTarget.getSize();
        const renderList = renderTarget.renderList;
        return {
            label,
            name: renderTarget.name || label,
            kind,
            width: size.width,
            height: size.height,
            size: `${size.width}x${size.height}`,
            samples: renderTarget.samples,
            renderListMode: renderList === null ? "sceneActiveMeshes" : "customList",
            renderListLength: Array.isArray(renderList) ? renderList.length : null,
            hasCustomRenderList: typeof renderTarget.getCustomRenderList === "function",
            hasCustomRenderFunction: typeof renderTarget.customRenderFunction === "function",
            renderParticles: renderTarget.renderParticles,
            renderSprites: renderTarget.renderSprites,
            skipInitialClear: renderTarget.skipInitialClear,
            activeCamera: renderTarget.activeCamera?.name ?? null,
        };
    }

    private createTextureSnapshot(
        label: string,
        texture: BaseTexture | null | undefined,
        kind: string,
    ): Record<string, unknown> | null {
        if (!texture) return null;
        const size = texture.getSize();
        return {
            label,
            name: texture.name || label,
            kind,
            width: size.width,
            height: size.height,
            size: `${size.width}x${size.height}`,
            samples: texture instanceof RenderTargetTexture ? texture.samples : null,
        };
    }

    private static getRenderTargetSizeLabel(
        renderTarget: RenderTargetTexture | null,
    ): string | null {
        if (!renderTarget) return null;
        const size = renderTarget.getSize();
        return `${size.width}x${size.height}`;
    }

    private getSceneInstrumentationSnapshot(): Record<string, unknown> | null {
        const instrumentation = this.sceneInstrumentation;
        if (!instrumentation) return null;

        return {
            activeMeshes: this.scene.getActiveMeshes().length,
            totalVertices: this.scene.totalVerticesPerfCounter.current,
            activeMeshesEvaluationTime: MmdManager.summarizePerfCounter(instrumentation.activeMeshesEvaluationTimeCounter),
            animationsTime: MmdManager.summarizePerfCounter(instrumentation.animationsTimeCounter),
            physicsTime: MmdManager.summarizePerfCounter(instrumentation.physicsTimeCounter),
            renderTargetsRenderTime: MmdManager.summarizePerfCounter(instrumentation.renderTargetsRenderTimeCounter),
            renderTime: MmdManager.summarizePerfCounter(instrumentation.renderTimeCounter),
            cameraRenderTime: MmdManager.summarizePerfCounter(instrumentation.cameraRenderTimeCounter),
            particlesRenderTime: MmdManager.summarizePerfCounter(instrumentation.particlesRenderTimeCounter),
            spritesRenderTime: MmdManager.summarizePerfCounter(instrumentation.spritesRenderTimeCounter),
            frameTime: MmdManager.summarizePerfCounter(instrumentation.frameTimeCounter),
            drawCalls: MmdManager.summarizePerfCounter(instrumentation.drawCallsCounter),
        };
    }

    private maybeLogRenderStabilityDiagnostics(): void {
        if (!isDebugLogEnabled("renderStability")) return;
        const nowMs = performance.now();
        if (nowMs < this.nextRenderStabilityDiagnosticMs) return;
        this.nextRenderStabilityDiagnosticMs = nowMs + 1000;

        try {
            logDebugIfEnabled("renderStability", "render", "render stability diagnostics", this.createRenderStabilityDiagnostics());
        } catch (err) {
            logWarn("render", "render stability diagnostics failed", toLogErrorData(err));
        }
    }

    private createRenderStabilityDiagnostics(): Record<string, unknown> {
        const sceneMeshes = this.scene.meshes.filter((mesh): mesh is Mesh => mesh instanceof Mesh);
        const accessoryMeshes = ((this as unknown as { getAccessoryMeshes?: () => unknown[] }).getAccessoryMeshes?.() ?? [])
            .filter((mesh): mesh is Mesh => mesh instanceof Mesh);
        const currentSceneModel = this.sceneModels.find((sceneModel) => sceneModel.model === this.currentModel) ?? null;
        const modelMeshes = currentSceneModel
            ? [currentSceneModel.mesh, ...currentSceneModel.mesh.getChildMeshes()]
                .filter((mesh): mesh is Mesh => mesh instanceof Mesh && !mesh.isDisposed())
            : [];
        const activeMeshes = this.scene.getActiveMeshes();
        const activeMeshSet = new Set<unknown>(Array.from({ length: activeMeshes.length }, (_, index) => activeMeshes.data[index]));
        const cameraForward = this.camera.getForwardRay(1).direction;

        const sceneMeshSamples = sceneMeshes
            .filter((mesh) => !mesh.isDisposed())
            .map((mesh) => this.createRenderStabilityMeshSample(mesh, activeMeshSet, cameraForward))
            .sort((a, b) => {
                const aScore = (typeof a.sizeMax === "number" ? a.sizeMax : 0) + (a.active === false ? 1000 : 0);
                const bScore = (typeof b.sizeMax === "number" ? b.sizeMax : 0) + (b.active === false ? 1000 : 0);
                return bScore - aScore;
            })
            .slice(0, 48);

        const accessoryMeshSamples = accessoryMeshes
            .filter((mesh) => !mesh.isDisposed())
            .map((mesh) => this.createRenderStabilityMeshSample(mesh, activeMeshSet, cameraForward))
            .slice(0, 24);

        return {
            frame: this.currentFrame,
            mode: this.timelineTarget,
            camera: {
                position: MmdManager.vectorToRoundedLabel(this.camera.position),
                target: MmdManager.vectorToRoundedLabel(this.camera.target),
                radius: this.camera.radius,
                minZ: this.camera.minZ,
                maxZ: this.camera.maxZ,
                fovDeg: (this.camera.fov * 180) / Math.PI,
            },
            scene: {
                meshCount: this.scene.meshes.length,
                activeMeshCount: activeMeshes.length,
                accessoryMeshCount: accessoryMeshes.length,
            },
            appMeshes: [
                this.ground ? this.createRenderStabilityMeshSample(this.ground, activeMeshSet, cameraForward) : null,
                this.mirroringFloor ? this.createRenderStabilityMeshSample(this.mirroringFloor, activeMeshSet, cameraForward) : null,
                this.skydome ? this.createRenderStabilityMeshSample(this.skydome, activeMeshSet, cameraForward) : null,
            ].filter(Boolean),
            modelMeshes: modelMeshes
                .map((mesh) => this.createRenderStabilityMeshSample(mesh, activeMeshSet, cameraForward))
                .slice(0, 32),
            sceneMeshes: sceneMeshSamples,
            accessoryMeshes: accessoryMeshSamples,
        };
    }

    private createRenderStabilityMeshSample(
        mesh: Mesh,
        activeMeshSet: ReadonlySet<unknown>,
        cameraForward: Vector3,
    ): Record<string, unknown> {
        mesh.computeWorldMatrix(true);
        const boundingBox = mesh.getBoundingInfo().boundingBox;
        const center = boundingBox.centerWorld;
        const size = boundingBox.extendSizeWorld.scale(2);
        const cameraToCenter = center.subtract(this.camera.position);
        const forwardDistance = Vector3.Dot(cameraToCenter, cameraForward);
        const material = mesh.material as Material | null;
        const materialLike = material as (Material & {
            alpha?: unknown;
        }) | null;
        const subMesh = mesh.subMeshes?.[0] ?? null;
        const sizeMax = Math.max(size.x, size.y, size.z);
        const sizeMin = Math.min(size.x, size.y, size.z);
        const sizeMid = size.x + size.y + size.z - sizeMax - sizeMin;
        const materialReady = readExistingSubMeshEffectReadiness(subMesh);

        return {
            name: mesh.name,
            enabled: mesh.isEnabled(),
            visible: mesh.isVisible,
            visibility: mesh.visibility,
            active: activeMeshSet.has(mesh),
            layerMask: mesh.layerMask,
            cameraLayerMask: this.camera.layerMask,
            layerMaskMatchesCamera: (mesh.layerMask & this.camera.layerMask) !== 0,
            alwaysSelectAsActiveMesh: mesh.alwaysSelectAsActiveMesh,
            doNotSyncBoundingInfo: mesh.doNotSyncBoundingInfo,
            receiveShadows: mesh.receiveShadows,
            renderingGroupId: mesh.renderingGroupId,
            alphaIndex: mesh.alphaIndex,
            vertices: mesh.getTotalVertices(),
            indices: mesh.getTotalIndices(),
            center: MmdManager.vectorToRoundedLabel(center),
            size: MmdManager.vectorToRoundedLabel(size),
            sizeMax: Number(sizeMax.toFixed(3)),
            sizeMid: Number(sizeMid.toFixed(3)),
            sizeMin: Number(sizeMin.toFixed(3)),
            cameraDistance: Number(Vector3.Distance(this.camera.position, center).toFixed(3)),
            forwardDistance: Number(forwardDistance.toFixed(3)),
            nearClipRisk: forwardDistance < this.camera.minZ + Math.max(0.1, Math.min(size.x, size.y, size.z) * 0.5),
            materialName: material?.name ?? null,
            materialClassName: material?.getClassName() ?? null,
            materialAlpha: materialLike?.alpha ?? null,
            materialReady,
            zOffset: material?.zOffset ?? null,
            zOffsetUnits: material?.zOffsetUnits ?? null,
            disableDepthWrite: material?.disableDepthWrite ?? null,
            needDepthPrePass: material?.needDepthPrePass ?? null,
            backFaceCulling: material ? (material as Material & { backFaceCulling?: unknown }).backFaceCulling : null,
            useLogarithmicDepth: material ? (material as Material & { useLogarithmicDepth?: unknown }).useLogarithmicDepth : null,
            hasPositionData: mesh.isVerticesDataPresent("position"),
            hasNormalData: mesh.isVerticesDataPresent("normal"),
            hasUvData: mesh.isVerticesDataPresent("uv"),
            hasColorData: mesh.isVerticesDataPresent("color"),
        };
    }

    private static vectorToRoundedLabel(value: Vector3): string {
        return `${value.x.toFixed(3)},${value.y.toFixed(3)},${value.z.toFixed(3)}`;
    }

    private applyPhysicsStateToModel(model: RuntimeModel, reason = "direct", resetPose = false): void {
        const sceneModel = this.sceneModels.find((entry) => entry.model === model);
        this.physicsModelController.applyPhysicsStateToModel(model, {
            resetPose,
            joints: sceneModel?.joints,
        });
        if (sceneModel) {
            this.physicsModelController.logPhysicsStateApplication(
                model,
                sceneModel.info.name,
                sceneModel.rigidBodies,
                reason,
            );
        }
    }

    private syncCpuSkinnedMorphSourceBuffers(model: RuntimeModel): void {
        const meshes = PhysicsModelController.collectMeshesForCpuMorphSync(model);

        for (const mesh of meshes) {
            const morphTargetManager = mesh.morphTargetManager;
            if (!morphTargetManager) continue;
            if (mesh.computeBonesUsingShaders) continue;
            if (!mesh.useBones || mesh.numBoneInfluencers <= 0 || !mesh.skeleton) continue;

            const meshInternal = mesh as unknown as {
                _internalMeshDataInfo?: {
                    _sourcePositions?: Float32Array | null;
                    _sourceNormals?: Float32Array | null;
                    _mmdMorphCpuBasePositions?: Float32Array | null;
                    _mmdMorphCpuBaseNormals?: Float32Array | null;
                };
                geometry?: { _softwareSkinningFrameId?: number };
                setPositionsForCPUSkinning?: () => Float32Array | null | undefined;
                setNormalsForCPUSkinning?: () => Float32Array | null | undefined;
            };
            const internalData = meshInternal._internalMeshDataInfo;
            if (!internalData) continue;

            if (morphTargetManager.hasPositions) {
                const sourcePositions = internalData._sourcePositions
                    ?? meshInternal.setPositionsForCPUSkinning?.()
                    ?? null;
                if (sourcePositions) {
                    if (!internalData._mmdMorphCpuBasePositions || internalData._mmdMorphCpuBasePositions.length !== sourcePositions.length) {
                        internalData._mmdMorphCpuBasePositions = new Float32Array(sourcePositions);
                    }
                    const morphedPositions = mesh.getPositionData(
                        false,
                        true,
                        new Float32Array(internalData._mmdMorphCpuBasePositions),
                    );
                    if (morphedPositions && morphedPositions.length === sourcePositions.length) {
                        sourcePositions.set(morphedPositions);
                    }
                }
            }

            if (morphTargetManager.hasNormals) {
                const sourceNormals = internalData._sourceNormals
                    ?? meshInternal.setNormalsForCPUSkinning?.()
                    ?? null;
                if (sourceNormals) {
                    if (!internalData._mmdMorphCpuBaseNormals || internalData._mmdMorphCpuBaseNormals.length !== sourceNormals.length) {
                        internalData._mmdMorphCpuBaseNormals = new Float32Array(sourceNormals);
                    }
                    const morphedNormals = mesh.getNormalsData(false, true);
                    if (morphedNormals && morphedNormals.length === sourceNormals.length) {
                        sourceNormals.set(morphedNormals);
                    }
                }
            }

            if (meshInternal.geometry) {
                meshInternal.geometry._softwareSkinningFrameId = -1;
            }
        }
    }

    private normalizeRuntimeBoneEvaluationOrder(model: RuntimeModel): void {
        const sceneModel = this.sceneModels.find((entry) => entry.model === model);
        this.physicsModelController.normalizeRuntimeBoneEvaluationOrder(model, {
            physicsBoneNames: sceneModel?.info.physicsBoneNames,
        });
    }

    private applyPhysicsStateToAllModels(resetPose = false): void {
        for (const sceneModel of this.sceneModels) {
            this.applyPhysicsStateToModel(sceneModel.model, "all-models", resetPose);
        }
    }

    private applyMmdMaterialCompatibilityFixes(material: MmdManagerMaterialLike | null | undefined): boolean {
        if (!material || typeof material !== "object") {
            return false;
        }
        let materialChanged = false;
        const materialName = typeof material.name === "string" ? material.name : "";

        // Some loaders leave opaque materials at alpha=0, but restoring alpha on
        // texture-driven transparent materials can break face/eyelash draw order.
        const diffuseTextureHasAlpha = this.textureHasAlphaForMmdMaterial(material.diffuseTexture);
        const albedoTextureHasAlpha = this.textureHasAlphaForMmdMaterial(material.albedoTexture);
        const hasDecodedDdsFallbackTexture = Boolean(material.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback)
            || Boolean(material.albedoTexture?.metadata?.mmdModokiDecodedDdsFallback);
        const hasOpaqueDecodedDdsFallbackTexture = (material.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback === true && !diffuseTextureHasAlpha)
            || (material.albedoTexture?.metadata?.mmdModokiDecodedDdsFallback === true && !albedoTextureHasAlpha);
        const hasOpacityTexture = Boolean(material.opacityTexture);
        const usesTextureAlpha = Boolean(material.useAlphaFromDiffuseTexture || material.useAlphaFromAlbedoTexture);
        const isTransparencyModeEnabled = typeof material.transparencyMode === "number" && material.transparencyMode !== 0;
        const shouldUseOpaqueTextureAlphaFallback = this.shouldUseOpaqueTextureAlphaFallback(materialName, material);

        // babylon-mmd already evaluates PMX transparency using actual texture
        // contents. Keep that result intact here so we do not accidentally force
        // opaque PNG textures into the transparent queue.
        const hasTransparentTexturePath = diffuseTextureHasAlpha || albedoTextureHasAlpha || hasOpacityTexture || usesTextureAlpha || isTransparencyModeEnabled;

        if (material.alpha === 0) {
            if (hasDecodedDdsFallbackTexture || (!hasTransparentTexturePath && !isTransparencyModeEnabled && (material.diffuseTexture || material.albedoTexture))) {
                material.alpha = 1;
                materialChanged = true;
            }
        }
        if (hasOpaqueDecodedDdsFallbackTexture) {
            if (material.alpha !== 1) {
                material.alpha = 1;
                materialChanged = true;
            }
            if (material.useAlphaFromDiffuseTexture !== false) {
                material.useAlphaFromDiffuseTexture = false;
                materialChanged = true;
            }
            if (material.useAlphaFromAlbedoTexture !== false) {
                material.useAlphaFromAlbedoTexture = false;
                materialChanged = true;
            }
            if ("transparencyMode" in material) {
                if (material.transparencyMode !== Material.MATERIAL_OPAQUE) {
                    material.transparencyMode = Material.MATERIAL_OPAQUE;
                    materialChanged = true;
                }
            }
        }
        const shouldUseDecodedDdsAlpha = hasDecodedDdsFallbackTexture
            && (diffuseTextureHasAlpha || albedoTextureHasAlpha)
            && this.shouldUseDecodedDdsTextureAlphaForMaterial(materialName);
        if (shouldUseDecodedDdsAlpha) {
            if (material.alpha !== 1) {
                material.alpha = 1;
                materialChanged = true;
            }
            if (material.diffuseTexture && material.useAlphaFromDiffuseTexture !== true) {
                material.useAlphaFromDiffuseTexture = true;
                materialChanged = true;
            }
            if (material.albedoTexture && material.useAlphaFromAlbedoTexture !== true) {
                material.useAlphaFromAlbedoTexture = true;
                materialChanged = true;
            }
            if ("alphaCutOff" in material && Number(material.alphaCutOff) !== 0.02) {
                material.alphaCutOff = 0.02;
                materialChanged = true;
            }
            if ("transparencyMode" in material && material.transparencyMode !== Material.MATERIAL_ALPHATESTANDBLEND) {
                material.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
                materialChanged = true;
            }
        }
        if (shouldUseOpaqueTextureAlphaFallback) {
            if (material.alpha !== 1) {
                material.alpha = 1;
                materialChanged = true;
            }
            if (material.diffuseTexture && material.useAlphaFromDiffuseTexture !== true) {
                material.useAlphaFromDiffuseTexture = true;
                materialChanged = true;
            }
            if (material.albedoTexture && material.useAlphaFromAlbedoTexture !== true) {
                material.useAlphaFromAlbedoTexture = true;
                materialChanged = true;
            }
            if ("alphaCutOff" in material && Number(material.alphaCutOff) !== 0.02) {
                material.alphaCutOff = 0.02;
                materialChanged = true;
            }
            if ("transparencyMode" in material && material.transparencyMode !== Material.MATERIAL_ALPHATESTANDBLEND) {
                material.transparencyMode = Material.MATERIAL_ALPHATESTANDBLEND;
                materialChanged = true;
            }
            if ("forceDepthWrite" in material && material.forceDepthWrite !== true) {
                material.forceDepthWrite = true;
                materialChanged = true;
            }
            logInfo("asset", "opaque alpha texture material fallback applied", {
                materialName,
                texture: this.getMaterialTextureAlphaSearchText(material),
                transparencyMode: material.transparencyMode,
                useAlphaFromDiffuseTexture: material.useAlphaFromDiffuseTexture ?? null,
                useAlphaFromAlbedoTexture: material.useAlphaFromAlbedoTexture ?? null,
                alphaCutOff: material.alphaCutOff ?? null,
                forceDepthWrite: material.forceDepthWrite ?? null,
            });
        }
        if (this.shouldDisableDepthWriteForAlphaOverlayMaterial(materialName, material)) {
            const alphaRange = this.getDecodedTextureAlphaRangeForMaterial(material);
            if (material.alpha !== 1) {
                material.alpha = 1;
                materialChanged = true;
            }
            if (material.diffuseTexture && material.useAlphaFromDiffuseTexture !== true) {
                material.useAlphaFromDiffuseTexture = true;
                materialChanged = true;
            }
            if (material.albedoTexture && material.useAlphaFromAlbedoTexture !== true) {
                material.useAlphaFromAlbedoTexture = true;
                materialChanged = true;
            }
            if ("alphaCutOff" in material && Number(material.alphaCutOff) !== 0.02) {
                material.alphaCutOff = 0.02;
                materialChanged = true;
            }
            if ("transparencyMode" in material && material.transparencyMode !== Material.MATERIAL_ALPHABLEND) {
                material.transparencyMode = Material.MATERIAL_ALPHABLEND;
                materialChanged = true;
            }
            if ("forceDepthWrite" in material && material.forceDepthWrite !== false) {
                material.forceDepthWrite = false;
                materialChanged = true;
            }
            logInfo("asset", "alpha overlay depth-write patch applied", {
                materialName,
                texture: this.getMaterialTextureAlphaSearchText(material),
                alphaRange,
                transparencyMode: material.transparencyMode,
                useAlphaFromDiffuseTexture: material.useAlphaFromDiffuseTexture ?? null,
                useAlphaFromAlbedoTexture: material.useAlphaFromAlbedoTexture ?? null,
                alphaCutOff: material.alphaCutOff ?? null,
                forceDepthWrite: material.forceDepthWrite ?? null,
            });
        }
        if (hasDecodedDdsFallbackTexture && material.backFaceCulling !== false) {
            material.backFaceCulling = false;
            materialChanged = true;
        }

        // Preserve the loader/runtime depth setup for transparent materials.
        // The forced zOffset helped some face-layer cases, but it breaks normal
        // half-transparent rendering and sphere-material ordering on other models.
        if (material.zOffset !== 0) {
            material.zOffset = 0;
            materialChanged = true;
        }
        if (material.zOffsetUnits !== 0) {
            material.zOffsetUnits = 0;
            materialChanged = true;
        }

        // Avoid forcing logarithmic depth on PMX materials globally. It helps
        // some close-up precision cases, but large low-poly stages/backgrounds
        // can lose broad polygons around shallow camera angles on WebGPU.
        if ("useLogarithmicDepth" in material) {
            if (material.useLogarithmicDepth !== false) {
                material.useLogarithmicDepth = false;
                materialChanged = true;
            }
        }

        if (materialChanged || hasDecodedDdsFallbackTexture) {
            this.markMaterialShaderDirty(material);
        }

        // Preserve the loader's culling decision. Forcing double-sided rendering on
        // every PMX material tends to reveal inner mouth/face polygons on some models.
        return hasTransparentTexturePath;
    }

    private shouldUseOpaqueTextureAlphaFallback(materialName: string, material: MmdManagerMaterialLike): boolean {
        const hasAlphaTexture = this.textureHasAlphaForMmdMaterial(material.diffuseTexture)
            || this.textureHasAlphaForMmdMaterial(material.albedoTexture);
        if (!hasAlphaTexture) return false;
        if (material.useAlphaFromDiffuseTexture === true || material.useAlphaFromAlbedoTexture === true) return false;
        if (!this.isOpaqueMaterialTransparencyMode(material.transparencyMode)) return false;

        const searchText = `${materialName} ${this.getMaterialTextureAlphaSearchText(material)}`.toLowerCase();
        if (this.isLikelyMmdFaceOrHairAlphaMaterial(searchText)) return true;

        const hasDecodedDdsFallbackTexture = material.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback === true
            || material.albedoTexture?.metadata?.mmdModokiDecodedDdsFallback === true;
        return hasDecodedDdsFallbackTexture && (
            searchText.includes("face")
            || searchText.includes("hair")
            || searchText.includes("eye")
            || searchText.includes("lash")
            || searchText.includes("hs")
        );
    }

    private shouldDisableDepthWriteForAlphaOverlayMaterial(materialName: string, material: MmdManagerMaterialLike): boolean {
        const hasAlphaTexture = this.textureHasAlphaForMmdMaterial(material.diffuseTexture)
            || this.textureHasAlphaForMmdMaterial(material.albedoTexture);
        if (!hasAlphaTexture) return false;

        const searchText = `${materialName} ${this.getMaterialTextureAlphaSearchText(material)}`.toLowerCase();
        if (this.isLikelyMmdAlphaOverlayMaterial(searchText)) return true;
        if (this.isDecodedWhiteMattedAlphaTextureForMaterial(material)) return true;

        const alphaRange = this.getDecodedTextureAlphaRangeForMaterial(material);
        if (!alphaRange) return false;

        return alphaRange.maxAlpha <= 220;
    }

    private isDecodedWhiteMattedAlphaTextureForMaterial(material: MmdManagerMaterialLike): boolean {
        return this.isDecodedWhiteMattedAlphaTexture(material.diffuseTexture)
            || this.isDecodedWhiteMattedAlphaTexture(material.albedoTexture);
    }

    private isDecodedWhiteMattedAlphaTexture(texture: MmdManagerMaterialLike["diffuseTexture"]): boolean {
        return texture?.metadata?.mmdModokiDecodedWhiteMattedAlpha === true;
    }

    private isLikelyMmdAlphaOverlayMaterial(searchText: string): boolean {
        return searchText.includes("eye_hi")
            || searchText.includes("hairshadow")
            || searchText.includes("shadow")
            || searchText.includes("highlight")
            || searchText.includes("lash")
            || searchText.includes("eyelash")
            || searchText.includes("hs+")
            || searchText.includes("アイシャドウ")
            || searchText.includes("頬紅")
            || searchText.includes("口紅")
            || searchText.includes("ハイライト")
            || searchText.includes("まつげ")
            || searchText.includes("睫");
    }

    private getDecodedTextureAlphaRangeForMaterial(material: MmdManagerMaterialLike): { minAlpha: number; maxAlpha: number } | null {
        return this.getDecodedTextureAlphaRange(material.diffuseTexture)
            ?? this.getDecodedTextureAlphaRange(material.albedoTexture);
    }

    private getDecodedTextureAlphaRange(texture: MmdManagerMaterialLike["diffuseTexture"]): { minAlpha: number; maxAlpha: number } | null {
        const metadata = texture?.metadata;
        if (!metadata) return null;

        const minAlpha = Number(metadata.mmdModokiDecodedTextureMinAlpha);
        const maxAlpha = Number(metadata.mmdModokiDecodedTextureMaxAlpha);
        if (!Number.isFinite(minAlpha) || !Number.isFinite(maxAlpha)) return null;

        return { minAlpha, maxAlpha };
    }

    private textureHasAlphaForMmdMaterial(texture: MmdManagerMaterialLike["diffuseTexture"]): boolean {
        if (!texture) return false;
        const metadata = texture.metadata;
        if (metadata?.mmdModokiDecodedDdsFallback === true) {
            return metadata.mmdModokiDecodedDdsHasAlpha === true;
        }
        return texture.hasAlpha === true;
    }

    private isOpaqueMaterialTransparencyMode(transparencyMode: unknown): boolean {
        return transparencyMode === Material.MATERIAL_OPAQUE
            || transparencyMode === 0
            || transparencyMode === null
            || transparencyMode === undefined;
    }

    private isLikelyMmdFaceOrHairAlphaMaterial(searchText: string): boolean {
        return searchText.includes("face")
            || searchText.includes("eye")
            || searchText.includes("hair")
            || searchText.includes("lash")
            || searchText.includes("eyelash")
            || searchText.includes("eye_hi")
            || searchText.includes("hs")
            || searchText.includes("顔")
            || searchText.includes("目")
            || searchText.includes("髪")
            || searchText.includes("前髪")
            || searchText.includes("後髪")
            || searchText.includes("睫")
            || searchText.includes("まつげ")
            || searchText.includes("猫耳");
    }

    private getMaterialTextureAlphaSearchText(material: MmdManagerMaterialLike): string {
        const captured = material.metadata?.[PMX_MATERIAL_DIAGNOSTIC_METADATA_KEY];
        const capturedTexturePath = captured && typeof captured === "object"
            ? (captured as Record<string, unknown>).texturePath
            : null;
        return [
            this.texturePathToSearchText(capturedTexturePath),
            typeof material.diffuseTexture?.name === "string" ? material.diffuseTexture.name : "",
            typeof material.albedoTexture?.name === "string" ? material.albedoTexture.name : "",
        ].join(" ");
    }

    private texturePathToSearchText(texturePath: unknown): string {
        if (typeof texturePath === "string") return texturePath;
        if (!texturePath || typeof texturePath !== "object") return "";
        const record = texturePath as Record<string, unknown>;
        return `${String(record.fileName ?? "")}${String(record.extension ?? "")}`;
    }

    private shouldUseDecodedDdsTextureAlphaForMaterial(materialName: string): boolean {
        const normalized = materialName.toLowerCase();
        return normalized.includes("eye_hi")
            || normalized.includes("hair")
            || materialName.includes("髪")
            || materialName.includes("ドリル")
            || materialName.includes("HS");
    }

    private buildPmxMaterialFlagMap(metadata: {
        materials?: readonly unknown[];
        materialsMetadata?: readonly { flag: number }[];
    }): WeakMap<object, number> {
        const materialFlagMap = new WeakMap<object, number>();
        const materials = Array.isArray(metadata.materials) ? metadata.materials : [];
        const materialsMetadata = Array.isArray(metadata.materialsMetadata) ? metadata.materialsMetadata : [];
        const count = Math.min(materials.length, materialsMetadata.length);

        for (let index = 0; index < count; index += 1) {
            const material = materials[index];
            const materialMetadata = materialsMetadata[index];
            if (!material || typeof material !== "object" || !materialMetadata) continue;
            materialFlagMap.set(material as object, Number(materialMetadata.flag) || 0);
        }

        return materialFlagMap;
    }

    private resolvePmxShadowFlagsForMaterial(
        material: unknown,
        materialFlagMap: WeakMap<object, number>,
        forceReceiveShadow = false,
    ): { castsShadow: boolean; receivesShadow: boolean } {
        if (!material || typeof material !== "object") {
            return { castsShadow: true, receivesShadow: true };
        }

        const subMaterials = Array.isArray((material as { subMaterials?: unknown[] }).subMaterials)
            ? (material as { subMaterials: unknown[] }).subMaterials
            : [material];

        const modelSubMaterials = subMaterials.filter((subMaterial): subMaterial is MmdManagerMaterialLike =>
            Boolean(subMaterial) && typeof subMaterial === "object",
        );
        if (
            modelSubMaterials.length > 0
            && modelSubMaterials.every((subMaterial) => this.shouldTreatAsAlphaOverlayShadowlessMaterial(subMaterial))
        ) {
            return { castsShadow: false, receivesShadow: false };
        }

        let castsShadow = false;
        // Toon-oriented PMX models often disable self-shadow receiving on face
        // materials. Keep that authoring choice in MMD mode, but PBR needs the
        // Babylon shadow map to reach opaque model surfaces. Alpha overlays were
        // already excluded above and remain shadowless.
        let receivesShadow = forceReceiveShadow;
        let sawMappedMaterial = false;

        for (const subMaterial of modelSubMaterials) {
            const materialFlag = materialFlagMap.get(subMaterial as object);
            if (materialFlag === undefined) {
                castsShadow = true;
                receivesShadow = true;
                continue;
            }

            sawMappedMaterial = true;
            castsShadow ||= (materialFlag & PMX_MATERIAL_FLAG_ENABLED_DRAW_SHADOW) !== 0;
            receivesShadow ||= (materialFlag & PMX_MATERIAL_FLAG_ENABLED_RECEIVE_SHADOW) !== 0;
        }

        if (!sawMappedMaterial) {
            return { castsShadow: true, receivesShadow: true };
        }

        return { castsShadow, receivesShadow };
    }

    private shouldTreatAsAlphaOverlayShadowlessMaterial(material: MmdManagerMaterialLike): boolean {
        const materialName = typeof material.name === "string" ? material.name : "";
        return this.shouldDisableDepthWriteForAlphaOverlayMaterial(materialName, material);
    }

    private getSkeletonBoneTextureSize(skeleton: Skeleton): { width: number; height: number; elementCount: number } {
        const requiredElementCount = 4 * (skeleton.bones.length + 1);
        let width = requiredElementCount;
        let height = 1;
        if (skeleton.isUsingTextureForMatrices) {
            const maxTextureSize = this.engine.getCaps().maxTextureSize & ~3;
            if (maxTextureSize > 0 && maxTextureSize < width) {
                width = maxTextureSize;
                height = Math.ceil(requiredElementCount / maxTextureSize);
            }
        }
        return {
            width,
            height,
            elementCount: width * height * 4,
        };
    }

    private applyGpuBoneTextureStorageForLargeSkeletons(
        modelLabel: string,
        meshes: readonly Mesh[],
        skeletons: readonly Skeleton[],
    ): void {
        const maxTextureSize = this.engine.getCaps().maxTextureSize;
        if (!Number.isFinite(maxTextureSize) || maxTextureSize <= 0) {
            return;
        }

        const largeSkeletons = skeletons.filter((skeleton) => {
            const requiredOneRowWidth = Math.max(1, (skeleton.bones.length + 1) * 4);
            return requiredOneRowWidth > maxTextureSize;
        });
        if (largeSkeletons.length === 0) {
            return;
        }

        let affectedMeshCount = 0;
        let maxBones = 0;
        let maxBoneTextureWidth = 1;
        let maxBoneTextureHeight = 1;

        const largeSkeletonSet = new Set(largeSkeletons);
        for (const skeleton of largeSkeletons) {
            skeleton.useTextureToStoreBoneMatrices = true;
            maxBones = Math.max(maxBones, skeleton.bones.length);
            const textureSize = this.getSkeletonBoneTextureSize(skeleton);
            maxBoneTextureWidth = Math.max(maxBoneTextureWidth, textureSize.width);
            maxBoneTextureHeight = Math.max(maxBoneTextureHeight, textureSize.height);
        }

        for (const mesh of meshes) {
            const skeleton = mesh.skeleton;
            if (!skeleton || !largeSkeletonSet.has(skeleton)) {
                continue;
            }
            if (!mesh.useBones || mesh.numBoneInfluencers <= 0) {
                continue;
            }

            mesh.computeBonesUsingShaders = true;
            affectedMeshCount += 1;
        }

        console.info(`[PMX] GPU bone texture storage enabled for large skeleton. ${modelLabel}: ${maxBones} bones uses ${maxBoneTextureWidth}x${maxBoneTextureHeight} bone texture.`, {
            model: modelLabel,
            skeletonCount: largeSkeletons.length,
            affectedMeshCount,
            maxBones,
            maxBoneTextureWidth,
            maxBoneTextureHeight,
            maxTextureSize,
            engine: this.getEngineType(),
        });
        this.addRuntimeDiagnostic(`GPU bone texture: ${modelLabel} (${maxBones} bones, ${maxBoneTextureWidth}x${maxBoneTextureHeight})`);
    }

    private applyCpuSkinningFallbackForWebGpuSdefMeshes(
        modelLabel: string,
        meshes: readonly Mesh[],
    ): void {
        if (!this.isWebGpuEngine()) {
            return;
        }
        if (!this.webGpuSdefCpuFallbackEnabled) {
            return;
        }

        let affectedMeshCount = 0;
        let positionMorphMeshCount = 0;
        const positionMorphMeshes: Array<{
            mesh: string;
            material: string[];
            morphTargetCount: number;
        }> = [];
        for (const mesh of meshes) {
            if (!mesh.useBones || mesh.numBoneInfluencers <= 0) {
                continue;
            }
            if (!mesh.skeleton) {
                continue;
            }
            if (!mesh.isVerticesDataPresent("matricesSdefC")) {
                continue;
            }
            if (mesh.morphTargetManager?.hasPositions) {
                positionMorphMeshCount += 1;
                const material = mesh.material as { name?: string; subMaterials?: Array<{ name?: string } | null> } | null;
                const materialNames = Array.isArray(material?.subMaterials)
                    ? material.subMaterials
                        .map((subMaterial) => (typeof subMaterial?.name === "string" && subMaterial.name.length > 0) ? subMaterial.name : null)
                        .filter((name): name is string => name !== null)
                    : ((typeof material?.name === "string" && material.name.length > 0) ? [material.name] : []);
                positionMorphMeshes.push({
                    mesh: mesh.name || "(unnamed mesh)",
                    material: materialNames,
                    morphTargetCount: mesh.morphTargetManager?.numTargets ?? 0,
                });
            }

            mesh.computeBonesUsingShaders = false;
            affectedMeshCount += 1;
        }

        if (affectedMeshCount === 0 && positionMorphMeshCount === 0) {
            return;
        }

        console.warn(`[PMX] CPU skinning fallback evaluated for WebGPU SDEF meshes. ${modelLabel}: ${affectedMeshCount} fallback mesh(es), ${positionMorphMeshCount} position-morph mesh(es) forced to CPU.`, {
            model: modelLabel,
            affectedMeshCount,
            positionMorphMeshCount,
            positionMorphMeshes,
            engine: this.getEngineType(),
        });
        for (const positionMorphMesh of positionMorphMeshes) {
            console.warn(`[PMX] Position-morph mesh forced to CPU: ${JSON.stringify({
                model: modelLabel,
                mesh: positionMorphMesh.mesh,
                material: positionMorphMesh.material,
                morphTargetCount: positionMorphMesh.morphTargetCount,
            })}`);
        }
        this.addRuntimeDiagnostic(`CPU skinning fallback for WebGPU SDEF: ${modelLabel} (${affectedMeshCount} fallback, ${positionMorphMeshCount} morph-forced)`);
    }

    private suspendSceneRendering(): void {
        this.suspendSceneRenderCount += 1;
    }

    private resumeSceneRendering(): void {
        if (this.suspendSceneRenderCount > 0) {
            this.suspendSceneRenderCount -= 1;
        }
    }

    async loadPMX(
        filePath: string,
        materialPipeline: MmdMaterialPipelinePreset = this.mmdMaterialPipelinePresetValue,
    ): Promise<ModelInfo | null> {
        return await loadPMXImpl(this, filePath, materialPipeline);
    }

    private shouldActivateAsCurrent(info: ModelInfo): boolean {
        void info;
        // Prefer the most recently loaded PMX/PMD as the active model so
        // the info panel and editing target follow the user's latest import.
        return true;
    }

    private applyModelEdgeToAllModels(): void {
        for (const sceneModel of this.sceneModels) {
            const meshes = [sceneModel.mesh, ...sceneModel.mesh.getChildMeshes()];
            this.applyModelEdgeToMeshes(meshes as Mesh[]);
        }
    }

    private collectSceneModelMaterials(meshes: Mesh[]): SceneModelMaterialEntry[] {
        const materialMap = new Map<object, SceneModelMaterialEntry>();
        let materialIndex = 0;

        const registerMaterial = (material: MmdManagerMaterialLike | null | undefined, fallbackName: string): void => {
            if (!material || typeof material !== "object") return;
            if (materialMap.has(material as object)) return;

            const materialName = typeof material.name === "string" && material.name.trim().length > 0
                ? material.name
                : fallbackName;
            const key = String(materialIndex) + ":" + materialName;
            materialIndex += 1;

            materialMap.set(material as object, {
                key,
                name: materialName,
                material,
            });

            ensureMaterialShaderDefaultsImpl(this, material);
            if (!this.materialShaderPresetByMaterial.has(material as object)) {
                this.materialShaderPresetByMaterial.set(
                    material as object,
                    MmdManager.DEFAULT_WGSL_MATERIAL_SHADER_PRESET,
                );
            }
        };

        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;

            if (Array.isArray(material.subMaterials)) {
                for (let subIndex = 0; subIndex < material.subMaterials.length; subIndex += 1) {
                    const subMaterial = material.subMaterials[subIndex];
                    registerMaterial(subMaterial, (mesh.name || "mesh") + "#" + String(subIndex + 1));
                }
            } else {
                registerMaterial(material, mesh.name || ("material_" + String(materialIndex)));
            }
        }

        return Array.from(materialMap.values());
    }

    applyToonShadowInfluenceToAllModels(): void {
        return applyToonShadowInfluenceToAllModelsImpl(this);
    }

    private applyModelEdgeToMeshes(meshes: Mesh[]): void {
        const scale = this.modelEdgeWidthValue;
        const materials = new Set<MmdManagerMaterialLike>();

        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;
            if (Array.isArray(material.subMaterials)) {
                for (const sub of material.subMaterials) {
                    if (sub) materials.add(sub);
                }
            } else {
                materials.add(material);
            }
        }

        for (const mat of materials) {
            if (!("renderOutline" in mat) || !("outlineWidth" in mat)) continue;

            let defaults = this.modelEdgeMaterialDefaults.get(mat as object);
            if (!defaults) {
                defaults = {
                    enabled: Boolean(mat.renderOutline),
                    width: Number(mat.outlineWidth) || 0,
                    alpha: Number(mat.outlineAlpha ?? 1),
                    colorR: Number(mat.outlineColor?.r ?? 0),
                    colorG: Number(mat.outlineColor?.g ?? 0),
                    colorB: Number(mat.outlineColor?.b ?? 0),
                };
                this.modelEdgeMaterialDefaults.set(mat as object, defaults);
            }

            if (!this.isMaterialVisible(mat)) {
                mat.renderOutline = false;
                mat.outlineWidth = 0;
                if ("outlineAlpha" in mat) {
                    mat.outlineAlpha = 0;
                }
                continue;
            }

            const enabled = defaults.enabled && scale > 0;
            mat.renderOutline = enabled;
            mat.outlineWidth = enabled ? defaults.width * scale : 0;
            if ("outlineAlpha" in mat) {
                mat.outlineAlpha = defaults.alpha;
            }
            if ("outlineColor" in mat && mat.outlineColor?.set) {
                const color = this.modelEdgeColorOverrideEnabledValue
                    ? this.modelEdgeColorValue
                    : { r: defaults.colorR, g: defaults.colorG, b: defaults.colorB };
                mat.outlineColor.set(color.r, color.g, color.b);
            }
        }
    }

    applyToonShadowInfluenceToMeshes(meshes: Mesh[]): void {
        return applyToonShadowInfluenceToMeshesImpl(this, meshes);
    }
    private applyCelShadingToMeshes(meshes: Mesh[]): void {
        const materials = new Set<MmdManagerMaterialLike>();

        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;
            if (Array.isArray(material.subMaterials)) {
                for (const sub of material.subMaterials) {
                    if (sub) materials.add(sub);
                }
            } else {
                materials.add(material);
            }
        }

        for (const mat of materials) {
            if (!("toonTexture" in mat)) continue;
            const toonTexture = mat.toonTexture as Texture | null | undefined;
            if (toonTexture) {
                toonTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
                toonTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
                toonTexture.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
            }
            if ("ignoreDiffuseWhenToonTextureIsNull" in mat) {
                mat.ignoreDiffuseWhenToonTextureIsNull = true;
            }
        }

        this.applyToonShadowInfluenceToMeshes(meshes);
    }

    private applyAnisotropicFilteringToMeshes(meshes: Mesh[]): void {
        const maxAnisotropy = Math.min(16, this.engine.getCaps().maxAnisotropy ?? 1);
        if (maxAnisotropy <= 1) {
            return;
        }

        const textures = new Set<{ anisotropicFilteringLevel?: number }>();
        const textureKeys = [
            "diffuseTexture",
            "albedoTexture",
            "opacityTexture",
            "bumpTexture",
            "normalTexture",
            "emissiveTexture",
            "ambientTexture",
            "specularTexture",
            "reflectionTexture",
            "refractionTexture",
            "lightmapTexture",
            "metallicTexture",
            "microSurfaceTexture",
            "toonTexture",
        ] as const;

        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;

            const materials = Array.isArray(material.subMaterials) ? material.subMaterials : [material];
            for (const subMaterial of materials) {
                if (!subMaterial || typeof subMaterial !== "object") continue;
                for (const key of textureKeys) {
                    const texture = (subMaterial as Record<string, unknown>)[key] as { anisotropicFilteringLevel?: number } | undefined;
                    if (texture && typeof texture === "object" && "anisotropicFilteringLevel" in texture) {
                        textures.add(texture);
                    }
                }
            }
        }

        for (const texture of textures) {
            texture.anisotropicFilteringLevel = maxAnisotropy;
        }
    }

    private applyAlphaTextureDebugToMeshes(modelLabel: string, meshes: readonly Mesh[]): boolean {
        const enabled = MmdManager.readBooleanLocalStorage(MmdManager.ALPHA_TEXTURE_DEBUG_STORAGE_KEY, false);
        if (!enabled) return false;

        const materials = new Set<MmdManagerMaterialLike>();
        for (const mesh of meshes) {
            const material = mesh.material as MmdManagerMaterialLike | null;
            if (!material) continue;

            const candidates = Array.isArray(material.subMaterials)
                ? material.subMaterials
                : [material];
            for (const candidate of candidates) {
                if (!candidate || typeof candidate !== "object") continue;
                if (
                    !this.textureHasAlphaForMmdMaterial(candidate.diffuseTexture)
                    && !this.textureHasAlphaForMmdMaterial(candidate.albedoTexture)
                ) {
                    continue;
                }
                materials.add(candidate);
            }
        }

        const applied = applyWgslAlphaTextureDebugToMaterialsImpl(this, materials);
        if (!applied) {
            logWarn("asset", "alpha texture debug view found no target materials", {
                modelLabel,
                storageKey: MmdManager.ALPHA_TEXTURE_DEBUG_STORAGE_KEY,
                meshCount: meshes.length,
                candidateMaterialCount: materials.size,
            });
            return false;
        }

        logWarn("asset", "alpha texture debug view applied to model materials", {
            modelLabel,
            storageKey: MmdManager.ALPHA_TEXTURE_DEBUG_STORAGE_KEY,
            affectedMaterialCount: materials.size,
            materials: Array.from(materials).map((material) => ({
                name: typeof material.name === "string" ? material.name : "(unnamed material)",
                texture: this.getMaterialTextureAlphaSearchText(material),
                diffuseHasAlpha: this.textureHasAlphaForMmdMaterial(material.diffuseTexture),
                albedoHasAlpha: this.textureHasAlphaForMmdMaterial(material.albedoTexture),
                decodedBmp: Boolean(material.diffuseTexture?.metadata?.mmdModokiDecodedBmpAlphaFallback)
                    || Boolean(material.albedoTexture?.metadata?.mmdModokiDecodedBmpAlphaFallback),
                decodedDds: Boolean(material.diffuseTexture?.metadata?.mmdModokiDecodedDdsFallback)
                    || Boolean(material.albedoTexture?.metadata?.mmdModokiDecodedDdsFallback),
            })),
        });
        this.addRuntimeDiagnostic(`Alpha texture debug view: ${modelLabel} (${materials.size} material(s))`);
        return true;
    }

    private applyDebugMaterialOverrideToMeshes(modelLabel: string, meshes: readonly Mesh[]): void {
        let enabled = false;
        try {
            enabled = globalThis.localStorage?.getItem(MmdManager.FORCE_MODEL_DEBUG_MATERIAL_STORAGE_KEY) === "1";
        } catch {
            enabled = false;
        }
        if (!enabled) return;

        const material = new StandardMaterial(`debug-visible-${modelLabel}`, this.scene);
        material.diffuseColor = new Color3(1, 0.12, 0.72);
        material.emissiveColor = new Color3(0.85, 0.08, 0.48);
        material.specularColor = new Color3(0, 0, 0);
        material.disableLighting = true;
        material.backFaceCulling = false;
        material.alpha = 1;
        material.transparencyMode = Material.MATERIAL_OPAQUE;
        material.forceDepthWrite = true;

        const renderingGroupId = 2;
        const previousAutoClearDepthStencil = this.scene.getAutoClearDepthStencilSetup(renderingGroupId);
        this.scene.setRenderingAutoClearDepthStencil(renderingGroupId, true, true, true);

        let affectedMeshCount = 0;
        for (const mesh of meshes) {
            if ((mesh.getTotalVertices?.() ?? 0) <= 0) continue;
            mesh.material = material;
            mesh.isVisible = true;
            mesh.visibility = 1;
            mesh.renderingGroupId = renderingGroupId;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.setEnabled(true);
            mesh.computeWorldMatrix(true);
            mesh.refreshBoundingInfo();
            affectedMeshCount += 1;
        }

        logWarn("asset", "debug material override applied to model meshes", {
            modelLabel,
            affectedMeshCount,
            storageKey: MmdManager.FORCE_MODEL_DEBUG_MATERIAL_STORAGE_KEY,
            autoTargeted: false,
            renderingGroupId,
            previousAutoClearDepthStencil,
            nextAutoClearDepthStencil: this.scene.getAutoClearDepthStencilSetup(renderingGroupId),
        });
    }

    async loadVMD(filePath: string): Promise<MotionInfo | null> {
        return loadVMDImpl(this, filePath);
    }

    async loadVPD(filePath: string): Promise<MotionInfo | null> {
        return loadVPDImpl(this, filePath);
    }

    async loadCameraVMD(filePath: string): Promise<MotionInfo | null> {
        return loadCameraVMDImpl(this, filePath);
    }

    async loadMP3(filePath: string): Promise<boolean> {
        return loadMP3Impl(this, filePath);
    }

    private getAudioMimeType(fileName: string): string {
        const ext = fileName.split(".").pop()?.toLowerCase();
        switch (ext) {
            case "wav":
            case "wave":
                return "audio/wav";
            case "ogg":
                return "audio/ogg";
            case "mp3":
            default:
                return "audio/mpeg";
        }
    }

    play(): void {
        if (!this.currentModel) return;
        this._isPlaying = true;
        this.manualPlaybackWithoutAudio = false;
        this.refreshActiveRuntimeAnimationHandles();
        this.mmdRuntime.seekAnimation(this._currentFrame, true);
        this.syncBackgroundVideoFrame(true);
        if (!this.getPhysicsEnabled()) {
            this.applyPhysicsStateToAllModels();
        }
        this.syncScenePhysicsSimulationState();
        this.physicsController.syncBulletEvaluationTypeForPlayback(true);
        this.playRuntimeAnimation();
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
    }

    private playRuntimeAnimation(): void {
        void this.mmdRuntime.playAnimation().catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
            logWarn("renderer", "runtime play failed", toLogErrorData(error));
        });
    }

    pause(): void {
        this._isPlaying = false;
        this.manualPlaybackWithoutAudio = false;
        this.physicsController.syncBulletEvaluationTypeForPlayback(false);
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.syncScenePhysicsSimulationState();
        this.mmdRuntime.pauseAnimation();
        this.syncBackgroundVideoFrame(true);
    }

    stop(): void {
        this._isPlaying = false;
        this.manualPlaybackWithoutAudio = false;
        this.manualPlaybackFrameCursor = 0;
        this.physicsController.syncBulletEvaluationTypeForPlayback(false);
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.syncScenePhysicsSimulationState();
        this.mmdRuntime.pauseAnimation();
        this.refreshActiveRuntimeAnimationHandles();
        this.mmdRuntime.seekAnimation(0, true);
        this.syncViewportCameraFromMmdCameraAfterSeek();
        this.applyPhysicsStateToAllModels();
        this._currentFrame = 0;
        this.syncBackgroundVideoFrame(true);
        this.onFrameUpdate?.(0, this._totalFrames);
    }

    seekTo(frame: number): void {
        const targetFrame = Math.max(0, Math.floor(frame));
        this.physicsController.syncBulletEvaluationTypeForSeek();
        if (targetFrame > this._totalFrames) {
            this._totalFrames = targetFrame;
        }
        this._currentFrame = targetFrame;
        this.mmdRuntime.seekAnimation(this._currentFrame, true);
        this.syncViewportCameraFromMmdCameraAfterSeek();
        if (!this._isPlaying && this.getPhysicsEnabled()) {
            this.applyPhysicsStateToAllModels();
        }
        if (this.manualPlaybackWithoutAudio) {
            this.manualPlaybackFrameCursor = this._currentFrame;
        }
        if (this._isPlaying) {
            this.physicsController.syncBulletEvaluationTypeForPlayback(true);
        }
        this.syncBackgroundVideoFrame(true);
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    seekToBoundary(frame: number): void {
        const wasPlaying = this._isPlaying;
        if (wasPlaying) {
            this.pause();
        }

        this.resetBoneGizmoInteraction();
        this.seekTo(frame);
        this.stabilizePhysicsAfterHardSeek();
        this.updateBoneGizmoTarget();

        if (wasPlaying) {
            this.play();
        }
    }

    public refreshActiveRuntimeAnimationHandles(): void {
        if (this.cameraSourceAnimation) {
            if (this.cameraAnimationHandle !== null) {
                this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
                this.cameraAnimationHandle = null;
            }

            const handle = this.mmdCamera.createRuntimeAnimation(
                this.cameraSourceAnimation as unknown as IMmdBindableCameraAnimation,
            );
            this.mmdCamera.setRuntimeAnimation(handle);
            this.cameraAnimationHandle = handle;
        }

        if (!this.currentModel) return;
        const animation = this.modelSourceAnimationsByModel.get(this.currentModel);
        if (!animation) return;

        const existingHandles = Array.from(this.currentModel.runtimeAnimations.keys());
        for (const handle of existingHandles) {
            this.currentModel.destroyRuntimeAnimation(handle);
        }

        const handle = this.createModelRuntimeAnimation(this.currentModel, animation);
        this.currentModel.setRuntimeAnimation(handle);
    }

    private createModelRuntimeAnimation(model: RuntimeModel, animation: MmdAnimation): MmdRuntimeAnimationHandle {
        const retargetingMap = this.editorModelAnimations.has(animation)
            ? this.createEditorAnimationRetargetingMap(model)
            : undefined;
        if (this.runtimeMode === "wasm" && this.mmdWasmInstance) {
            return model.createRuntimeAnimation(
                new MmdWasmAnimation(animation, this.mmdWasmInstance, this.scene),
                retargetingMap,
            );
        }
        return model.createRuntimeAnimation(animation, retargetingMap);
    }

    private resolveEditorBoneTrackKind(track: Pick<KeyframeTrack, "name" | "category">): EditorBoneTrackKind {
        return resolveBoneTrackKind(
            track.name,
            track.category === "root" ? "movableBone" : "bone",
            this.activeModelInfo,
        );
    }

    private rotationDegreesToQuaternionBlock(xDeg: number, yDeg: number, zDeg: number): [number, number, number, number] {
        const degToRad = Math.PI / 180;
        const rotation = Quaternion.RotationYawPitchRoll(yDeg * degToRad, xDeg * degToRad, zDeg * degToRad);
        return [rotation.x, rotation.y, rotation.z, rotation.w];
    }

    private createDefaultInterpolationBlock(): [number, number, number, number] {
        return [20, 107, 20, 107];
    }

    private createDefaultPositionInterpolationBlock(): [
        number, number, number, number,
        number, number, number, number,
        number, number, number, number,
    ] {
        return [
            ...this.createDefaultInterpolationBlock(),
            ...this.createDefaultInterpolationBlock(),
            ...this.createDefaultInterpolationBlock(),
        ];
    }

    private createEditorAnimationRetargetingMap(model: RuntimeModel): Record<string, string> | undefined {
        const runtimeBones = model.runtimeBones as readonly EditorRuntimeBone[] | undefined;
        if (!runtimeBones) return undefined;

        const retargetingMap: Record<string, string> = {};
        let hasAlias = false;
        for (const runtimeBone of runtimeBones) {
            const runtimeName = runtimeBone.name;
            const linkedName = runtimeBone.linkedBone?.name;
            if (!runtimeName || !linkedName || runtimeName === linkedName) continue;
            retargetingMap[linkedName] = runtimeName;
            hasAlias = true;
        }
        return hasAlias ? retargetingMap : undefined;
    }

    private ensureRuntimeDurationCoversEditorAnimation(animation: MmdAnimation): boolean {
        const requiredDuration = Math.max(0, animation.endFrame);
        if (this.mmdRuntime.animationFrameTimeDuration >= requiredDuration) {
            return false;
        }

        const runtimeInternal = this.mmdRuntime as RuntimeMmdRuntime & {
            _onAnimationDurationChanged?: (newAnimationFrameTimeDuration: number) => void;
        };
        runtimeInternal._onAnimationDurationChanged?.(requiredDuration);
        if (this.mmdRuntime.animationFrameTimeDuration >= requiredDuration) {
            return true;
        }

        logWarn("animation", "editor animation duration did not propagate to runtime", {
            requiredDuration,
            runtimeDuration: this.mmdRuntime.animationFrameTimeDuration,
            animationStartFrame: animation.startFrame,
            animationEndFrame: animation.endFrame,
        });
        return false;
    }

    private logEditorAnimationRegistrationDiagnostics(
        model: RuntimeModel,
        animation: MmdAnimation,
        handle: MmdRuntimeAnimationHandle,
        track: Pick<KeyframeTrack, "name" | "category">,
        frame: number,
    ): void {
        const runtimeAnimation = model.runtimeAnimations.get(handle) as {
            boneBindIndexMap?: ArrayLike<EditorRuntimeBone | null>;
            movableBoneBindIndexMap?: ArrayLike<EditorRuntimeBone | null>;
            _boneBindIndexMap?: { array?: ArrayLike<number> };
            _movableBoneBindIndexMap?: { array?: ArrayLike<number> };
        } | undefined;
        const boneTrack = animation.boneTracks.find((candidate) => candidate.name === track.name) ?? null;
        const movableBoneTrack = animation.movableBoneTracks.find((candidate) => candidate.name === track.name) ?? null;
        const boneBindIndex = boneTrack
            ? this.readRuntimeAnimationBindIndex(runtimeAnimation, "bone", animation.boneTracks.indexOf(boneTrack))
            : null;
        const movableBoneBindIndex = movableBoneTrack
            ? this.readRuntimeAnimationBindIndex(
                runtimeAnimation,
                "movableBone",
                animation.movableBoneTracks.indexOf(movableBoneTrack),
            )
            : null;
        const runtimeFrame = this.mmdRuntime.currentFrameTime;
        const runtimeDuration = this.mmdRuntime.animationFrameTimeDuration;

        const data = {
            track: track.name,
            category: track.category,
            frame,
            runtimeFrame,
            runtimeDuration,
            animationStartFrame: animation.startFrame,
            animationEndFrame: animation.endFrame,
            boneFrames: boneTrack ? Array.from(boneTrack.frameNumbers) : null,
            movableBoneFrames: movableBoneTrack ? Array.from(movableBoneTrack.frameNumbers) : null,
            boneBindIndex,
            movableBoneBindIndex,
        };
        if (runtimeFrame !== frame || runtimeDuration < frame || boneBindIndex === -1 || movableBoneBindIndex === -1) {
            logWarn("animation", "editor bone keyframe runtime diagnostic detected a suspicious state", data);
            return;
        }
        logInfo("animation", "editor bone keyframe runtime diagnostic", data);
    }

    private readRuntimeAnimationBindIndex(
        runtimeAnimation: {
            boneBindIndexMap?: ArrayLike<EditorRuntimeBone | null>;
            movableBoneBindIndexMap?: ArrayLike<EditorRuntimeBone | null>;
            _boneBindIndexMap?: { array?: ArrayLike<number> };
            _movableBoneBindIndexMap?: { array?: ArrayLike<number> };
        } | undefined,
        kind: EditorBoneTrackKind,
        index: number,
    ): number | null {
        if (!runtimeAnimation || index < 0) return null;
        if (kind === "bone") {
            const wasmIndex = runtimeAnimation._boneBindIndexMap?.array?.[index];
            if (typeof wasmIndex === "number") return wasmIndex;
            const classicBone = runtimeAnimation.boneBindIndexMap?.[index];
            return classicBone ? index : classicBone === null ? -1 : null;
        }
        const wasmIndex = runtimeAnimation._movableBoneBindIndexMap?.array?.[index];
        if (typeof wasmIndex === "number") return wasmIndex;
        const classicBone = runtimeAnimation.movableBoneBindIndexMap?.[index];
        return classicBone ? index : classicBone === null ? -1 : null;
    }

    private stabilizePhysicsAfterHardSeek(): void {
        if (!this.getPhysicsEnabled()) return;

        // Reinitialize rigid bodies from current animation pose to avoid explosive inertia after large jumps.
        this.applyPhysicsStateToAllModels();
        this.mmdRuntime.seekAnimation(this._currentFrame, true);
    }

    setPlaybackSpeed(speed: number): void {
        this._playbackSpeed = speed;
        this.mmdRuntime.timeScale = speed;
    }

    get isPlaying(): boolean {
        return this._isPlaying;
    }

    get currentFrame(): number {
        return this._currentFrame;
    }

    getAudioSourcePath(): string | null {
        return this.audioSourcePath;
    }

    get totalFrames(): number {
        return this._totalFrames;
    }

    private isPackedProjectArray(value: unknown): value is ProjectPackedArray {
        if (!value || typeof value !== "object") return false;
        const packed = value as Partial<ProjectPackedArray>;
        if (typeof packed.data !== "string") return false;
        if (typeof packed.length !== "number" || !Number.isFinite(packed.length) || packed.length < 0) return false;
        return packed.encoding === "u8-b64" || packed.encoding === "f32-b64" || packed.encoding === "u32-delta-varint-b64";
    }

    private encodeUint8ToBase64(bytes: Uint8Array): string {
        if (bytes.length === 0) return "";
        const chunkSize = 0x8000;
        const parts: string[] = [];
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            let binary = "";
            for (let j = 0; j < chunk.length; j += 1) {
                binary += String.fromCharCode(chunk[j]);
            }
            parts.push(binary);
        }
        return btoa(parts.join(""));
    }

    private decodeBase64ToUint8(value: string): Uint8Array {
        if (value.length === 0) return new Uint8Array(0);
        try {
            const binary = atob(value);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) {
                bytes[i] = binary.charCodeAt(i) & 0xff;
            }
            return bytes;
        } catch {
            return new Uint8Array(0);
        }
    }

    private getProjectArrayLength(source: ProjectNumberArray | null | undefined): number {
        if (Array.isArray(source)) return source.length;
        if (!this.isPackedProjectArray(source)) return 0;
        return Math.max(0, Math.floor(source.length));
    }

    private packUint8Array(source: Uint8Array): ProjectNumberArray {
        return {
            encoding: "u8-b64",
            length: source.length,
            data: this.encodeUint8ToBase64(source),
        };
    }

    private packFloat32Array(source: Float32Array): ProjectNumberArray {
        const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
        return {
            encoding: "f32-b64",
            length: source.length,
            data: this.encodeUint8ToBase64(bytes),
        };
    }

    private packFrameNumbers(source: Uint32Array): ProjectNumberArray {
        if (source.length === 0) {
            return {
                encoding: "u32-delta-varint-b64",
                length: 0,
                data: "",
            };
        }

        const encoded: number[] = [];
        let previous = 0;
        for (let i = 0; i < source.length; i += 1) {
            const current = source[i];
            if (i > 0 && current < previous) {
                // Fallback for unexpected unsorted input.
                return Array.from(source);
            }
            let delta = i === 0 ? current : current - previous;
            previous = current;

            while (delta >= 0x80) {
                encoded.push((delta & 0x7f) | 0x80);
                delta = Math.floor(delta / 128);
            }
            encoded.push(delta & 0x7f);
        }

        return {
            encoding: "u32-delta-varint-b64",
            length: source.length,
            data: this.encodeUint8ToBase64(Uint8Array.from(encoded)),
        };
    }

    private copyProjectArrayToFloat32(source: ProjectNumberArray | null | undefined, destination: Float32Array): void {
        if (Array.isArray(source)) {
            const count = Math.min(source.length, destination.length);
            for (let i = 0; i < count; i += 1) {
                const value = source[i];
                destination[i] = Number.isFinite(value) ? value : 0;
            }
            return;
        }
        if (!this.isPackedProjectArray(source) || source.encoding !== "f32-b64") return;

        const bytes = this.decodeBase64ToUint8(source.data);
        const available = Math.floor(bytes.length / 4);
        const count = Math.min(destination.length, this.getProjectArrayLength(source), available);
        const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let i = 0; i < count; i += 1) {
            destination[i] = dataView.getFloat32(i * 4, true);
        }
    }

    private copyProjectArrayToUint8(source: ProjectNumberArray | null | undefined, destination: Uint8Array): void {
        if (Array.isArray(source)) {
            const count = Math.min(source.length, destination.length);
            for (let i = 0; i < count; i += 1) {
                const value = source[i];
                const normalized = Number.isFinite(value) ? Math.round(value) : 0;
                destination[i] = Math.max(0, Math.min(255, normalized));
            }
            return;
        }
        if (!this.isPackedProjectArray(source) || source.encoding !== "u8-b64") return;

        const bytes = this.decodeBase64ToUint8(source.data);
        const count = Math.min(destination.length, this.getProjectArrayLength(source), bytes.length);
        for (let i = 0; i < count; i += 1) {
            destination[i] = bytes[i];
        }
    }

    private copyProjectArrayToUint32(source: ProjectNumberArray | null | undefined, destination: Uint32Array): void {
        if (Array.isArray(source)) {
            const count = Math.min(source.length, destination.length);
            for (let i = 0; i < count; i += 1) {
                const value = source[i];
                destination[i] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
            }
            return;
        }
        if (!this.isPackedProjectArray(source) || source.encoding !== "u32-delta-varint-b64") return;

        const bytes = this.decodeBase64ToUint8(source.data);
        const targetCount = Math.min(destination.length, this.getProjectArrayLength(source));
        let byteOffset = 0;
        let previous = 0;

        for (let i = 0; i < targetCount; i += 1) {
            let delta = 0;
            let base = 1;
            let completed = false;
            while (byteOffset < bytes.length) {
                const byteValue = bytes[byteOffset++];
                delta += (byteValue & 0x7f) * base;
                if ((byteValue & 0x80) === 0) {
                    completed = true;
                    break;
                }
                base *= 128;
            }
            if (!completed) break;

            const frame = i === 0 ? delta : previous + delta;
            const normalized = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
            destination[i] = normalized;
            previous = normalized;
        }
    }

    private clearProjectForImport(): void {
        this.pause();
        this.clearExternalEnvironmentLightingSource();
        this.frameGraphPostEffectStackIdsValue = [];
        this.frameGraphPostEffectStackEnabledValue.clear();
        this.frameGraphPostEffectStackInitializedValue = false;
        (this as unknown as { clearAccessories?: () => void }).clearAccessories?.();
        this.clearBackgroundMedia();

        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }
        this.hasCameraMotion = false;
        this.cameraKeyframeFrames = EMPTY_KEYFRAME_FRAMES;
        this.cameraMotionPath = null;
        this.cameraSourceAnimation = null;

        if (this.audioPlayer) {
            void this.mmdRuntime.setAudioPlayer(null);
            this.audioPlayer.dispose();
            this.audioPlayer = null;
        }
        if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
            this.audioBlobUrl = null;
        }
        this.audioSourcePath = null;

        for (const entry of this.sceneModels) {
            this.removeGlobalIlluminationSceneModel(entry);
            try {
                this.mmdRuntime.destroyMmdModel(entry.model as never);
            } catch {
                // no-op
            }
            this.modelKeyframeTracksByModel.delete(entry.model);
            this.modelSourceAnimationsByModel.delete(entry.model);
            this.modelMotionImportsByModel.delete(entry.model);
            this.disposeContactShadowForModel(entry);
            entry.mesh.dispose();
        }

        this.sceneModels = [];
        this.syncLuminousGlowLayer();
        this.currentMesh = null;
        this.currentModel = null;
        this.activeModelInfo = null;
        this.timelineTarget = "camera";

        this._isPlaying = false;
        this.manualPlaybackWithoutAudio = false;
        this.manualPlaybackFrameCursor = 0;
        this._currentFrame = 0;
        this._totalFrames = 300;
        this.mmdRuntime.pauseAnimation();
        this.mmdRuntime.seekAnimation(0, true);

        this.refreshBoneVisualizerTarget();
        this.refreshRigidBodyVisualizerTarget();
        this.updateBoneGizmoTarget();
        this.emitMergedKeyframeTracks();
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    private isProjectFileV1(value: unknown): value is MmdModokiProjectFileV1 {
        if (!value || typeof value !== "object") return false;
        const maybeProject = value as Partial<MmdModokiProjectFileV1>;
        return maybeProject.format === "mmd_modoki_project" && maybeProject.version === 1;
    }
    public exportProjectState(): MmdModokiProjectFileV1 {
        return exportProjectStateImpl(this);
    }

    public async importProjectState(
        data: unknown,
        options: { forExport?: boolean } = {},
    ): Promise<{ loadedModels: number; warnings: string[] }> {
        return importProjectStateImpl(this, data, options);
    }

    /** Current render FPS (rounded) */
    getFps(): number {
        return Math.round(this.engine.getFps());
    }

    private isWebGpuEngine(): boolean {
        return this.engine instanceof WebGPUEngine;
    }

    private isPowerOfTwo(value: number): boolean {
        return value > 0 && (value & (value - 1)) === 0;
    }

    private isBrowserInspectableImageTexturePath(path: string): boolean {
        const normalizedPath = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? path.toLowerCase();
        return normalizedPath.endsWith(".bmp")
            || normalizedPath.endsWith(".png")
            || normalizedPath.endsWith(".jpg")
            || normalizedPath.endsWith(".jpeg")
            || normalizedPath.endsWith(".gif")
            || normalizedPath.endsWith(".webp");
    }

    private fileUrlToLocalPath(url: string): string | null {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return null;
        }
        if (parsed.protocol !== "file:") return null;
        let pathname = decodeURIComponent(parsed.pathname);
        if (/^\/[A-Za-z]:\//.test(pathname)) {
            pathname = pathname.slice(1);
            return pathname.replace(/\//g, "\\");
        }
        return pathname;
    }

    private async localFileExistsForUrl(url: string): Promise<boolean | null> {
        const localPath = this.fileUrlToLocalPath(url);
        if (!localPath) return null;
        return await window.electronAPI.fileExists(localPath);
    }

    private async inspectImageDimensionsFromUrl(url: string): Promise<{ width: number; height: number } | null> {
        const exists = await this.localFileExistsForUrl(url);
        if (exists === false) return null;

        return await new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                resolve({
                    width: image.naturalWidth || image.width,
                    height: image.naturalHeight || image.height,
                });
            };
            image.onerror = () => resolve(null);
            image.src = url;
        });
    }

    private async inspectImageDimensionsFromBuffer(arrayBufferOrBlob: ArrayBuffer | Blob): Promise<{ width: number; height: number } | null> {
        const blob = arrayBufferOrBlob instanceof Blob ? arrayBufferOrBlob : new Blob([arrayBufferOrBlob]);

        if (typeof createImageBitmap === "function") {
            try {
                const bitmap = await createImageBitmap(blob);
                try {
                    return { width: bitmap.width, height: bitmap.height };
                } finally {
                    bitmap.close();
                }
            } catch {
                // Fallback to a regular image element below.
            }
        }

        const objectUrl = URL.createObjectURL(blob);
        try {
            return await this.inspectImageDimensionsFromUrl(objectUrl);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }

    private async shouldGenerateMipmapsForWebGpuTextureUrl(url: string): Promise<boolean> {
        const cacheKey = `url:${url}`;
        const cached = this.webGpuTextureMipmapDecisionCache.get(cacheKey);
        if (cached) {
            return await cached;
        }

        const promise = (async () => {
            const dimensions = await this.inspectImageDimensionsFromUrl(url);
            if (!dimensions) {
                return false;
            }
            return this.isPowerOfTwo(dimensions.width) && this.isPowerOfTwo(dimensions.height);
        })();
        this.webGpuTextureMipmapDecisionCache.set(cacheKey, promise);
        return await promise;
    }

    private async shouldGenerateMipmapsForWebGpuTextureBuffer(key: string, arrayBufferOrBlob: ArrayBuffer | Blob): Promise<boolean> {
        const cacheKey = `buffer:${key}`;
        const cached = this.webGpuTextureMipmapDecisionCache.get(cacheKey);
        if (cached) {
            return await cached;
        }

        const promise = (async () => {
            const dimensions = await this.inspectImageDimensionsFromBuffer(arrayBufferOrBlob);
            if (!dimensions) {
                return false;
            }
            return this.isPowerOfTwo(dimensions.width) && this.isPowerOfTwo(dimensions.height);
        })();
        this.webGpuTextureMipmapDecisionCache.set(cacheKey, promise);
        return await promise;
    }

    private supportsS3tcCompressedTextures(): boolean {
        return Boolean(this.engine.getCaps().s3tc);
    }

    private shouldSkipDdsTextureUrlForWebGpu(textureUrl: string): boolean {
        return isDdsTexturePath(textureUrl) && !this.supportsS3tcCompressedTextures();
    }

    private shouldTryBmpAlphaFallbackTextureUrl(textureUrl: string): boolean {
        return isBmpTexturePath(textureUrl);
    }

    private async loadArrayBufferFromUrl(url: string): Promise<ArrayBuffer> {
        const localPath = this.fileUrlToLocalPath(url);
        if (localPath) {
            const buffer = await window.electronAPI.readBinaryFile(localPath);
            if (!buffer) throw new Error("file read failed");
            return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        }

        return await new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("GET", url, true);
            request.responseType = "arraybuffer";
            request.onload = () => {
                if (request.status === 0 || (request.status >= 200 && request.status < 300)) {
                    resolve(request.response as ArrayBuffer);
                } else {
                    reject(new Error(`${request.status} ${request.statusText}`));
                }
            };
            request.onerror = () => reject(new Error("request failed"));
            request.send();
        });
    }

    private addTextureToAssetContainer(texture: Texture, assetContainer: unknown): void {
        const maybeContainer = assetContainer as { textures?: unknown[] } | null | undefined;
        if (Array.isArray(maybeContainer?.textures) && !maybeContainer.textures.includes(texture)) {
            maybeContainer.textures.push(texture);
        }
    }

    private async createWebGpuDdsFallbackTexture(
        textureName: string,
        arrayBufferOrBlob: ArrayBuffer | Blob,
        scene: unknown,
        assetContainer: unknown,
        options: { invertY?: boolean; samplingMode?: number },
    ): Promise<Texture | null> {
        const invertY = options.invertY ?? true;
        const cacheKey = `${textureName}|${invertY}|${options.samplingMode ?? Texture.TRILINEAR_SAMPLINGMODE}`;
        const cached = this.webGpuTextureFallbackCache.get(cacheKey);
        if (cached) {
            const texture = await cached;
            if (texture) this.addTextureToAssetContainer(texture, assetContainer);
            return texture;
        }

        const arrayBuffer = arrayBufferOrBlob instanceof Blob ? await arrayBufferOrBlob.arrayBuffer() : arrayBufferOrBlob;
        if (!shouldSkipDdsTextureForWebGpu(arrayBuffer, this.supportsS3tcCompressedTextures())) {
            return null;
        }

        const promise = Promise.resolve().then(() => {
            const decoded = decodeDdsTextureToRgba(arrayBuffer);
            if (!decoded) {
                logWarn("asset", "compressed DDS texture decode failed", { textureName });
                return null;
            }

            const texture = RawTexture.CreateRGBATexture(
                decoded.rgba,
                decoded.width,
                decoded.height,
                scene as Scene,
                false,
                invertY,
                options.samplingMode ?? Texture.TRILINEAR_SAMPLINGMODE,
            );
            texture.name = textureName;
            texture.hasAlpha = decoded.hasAlpha;
            texture.metadata = {
                ...(texture.metadata as Record<string, unknown> | null ?? {}),
                mmdModokiDecodedDdsFallback: true,
                mmdModokiDecodedDdsHasAlpha: decoded.hasAlpha,
                mmdModokiDecodedTextureMinAlpha: decoded.minAlpha,
                mmdModokiDecodedTextureMaxAlpha: decoded.maxAlpha,
            };
            texture.wrapU = Texture.CLAMP_ADDRESSMODE;
            texture.wrapV = Texture.CLAMP_ADDRESSMODE;
            texture.onDisposeObservable.addOnce(() => {
                this.webGpuTextureFallbackCache.delete(cacheKey);
            });

            logWarn("asset", "compressed DDS texture decoded on CPU for WebGPU", {
                textureName,
                width: decoded.width,
                height: decoded.height,
                fourCc: decoded.fourCc ?? undefined,
                hasAlpha: decoded.hasAlpha,
                minAlpha: decoded.minAlpha,
                maxAlpha: decoded.maxAlpha,
                invertY,
                wrap: "clamp",
            });
            return texture;
        });
        this.webGpuTextureFallbackCache.set(cacheKey, promise);

        const texture = await promise;
        if (texture) this.addTextureToAssetContainer(texture, assetContainer);
        return texture;
    }

    private async createWebGpuBmpAlphaFallbackTexture(
        textureName: string,
        arrayBufferOrBlob: ArrayBuffer | Blob,
        scene: unknown,
        assetContainer: unknown,
        options: { invertY?: boolean; samplingMode?: number },
    ): Promise<Texture | null> {
        const invertY = options.invertY ?? true;
        const cacheKey = `${textureName}|${invertY}|${options.samplingMode ?? Texture.TRILINEAR_SAMPLINGMODE}`;
        const cached = this.webGpuTextureFallbackCache.get(cacheKey);
        if (cached) {
            const texture = await cached;
            if (texture) this.addTextureToAssetContainer(texture, assetContainer);
            return texture;
        }

        const arrayBuffer = arrayBufferOrBlob instanceof Blob ? await arrayBufferOrBlob.arrayBuffer() : arrayBufferOrBlob;
        const decoded = decodeBmpTextureToRgba(arrayBuffer);
        if (!decoded?.hasAlpha) {
            return null;
        }

        const promise = Promise.resolve().then(() => {
            const texture = RawTexture.CreateRGBATexture(
                decoded.rgba,
                decoded.width,
                decoded.height,
                scene as Scene,
                false,
                invertY,
                options.samplingMode ?? Texture.TRILINEAR_SAMPLINGMODE,
            );
            texture.name = textureName;
            texture.hasAlpha = true;
            texture.metadata = {
                ...(texture.metadata as Record<string, unknown> | null ?? {}),
                mmdModokiDecodedBmpAlphaFallback: true,
                mmdModokiDecodedBmpHasAlpha: true,
                mmdModokiDecodedTextureMinAlpha: decoded.minAlpha,
                mmdModokiDecodedTextureMaxAlpha: decoded.maxAlpha,
                mmdModokiDecodedTransparentPixelRatio: decoded.transparentPixelRatio,
                mmdModokiDecodedLowAlphaPixelRatio: decoded.lowAlphaPixelRatio,
                mmdModokiDecodedWhiteMattedAlpha: decoded.whiteMattedAlpha,
            };
            texture.wrapU = Texture.CLAMP_ADDRESSMODE;
            texture.wrapV = Texture.CLAMP_ADDRESSMODE;
            texture.onDisposeObservable.addOnce(() => {
                this.webGpuTextureFallbackCache.delete(cacheKey);
            });

            logWarn("asset", "32-bit BMP texture decoded on CPU for WebGPU alpha", {
                textureName,
                width: decoded.width,
                height: decoded.height,
                minAlpha: decoded.minAlpha,
                maxAlpha: decoded.maxAlpha,
                transparentPixelRatio: decoded.transparentPixelRatio,
                lowAlphaPixelRatio: decoded.lowAlphaPixelRatio,
                whiteMattedAlpha: decoded.whiteMattedAlpha,
                invertY,
                wrap: "clamp",
            });
            return texture;
        });
        this.webGpuTextureFallbackCache.set(cacheKey, promise);

        const texture = await promise;
        if (texture) this.addTextureToAssetContainer(texture, assetContainer);
        return texture;
    }

    public configureMmdTextureLoaderForWebGpuForBuilder(builder: object): void {
        if (!this.isWebGpuEngine()) {
            return;
        }

        type TextureLoaderOptions = {
            noMipmap?: boolean;
            invertY?: boolean;
            samplingMode?: number;
        };
        const textureLoader = ((builder as { [key: string]: unknown })._textureLoader as {
            loadTextureAsync?: (
                uniqueId: unknown,
                rootUrl: string,
                relativeTexturePathOrIndex: string | number,
                scene: unknown,
                assetContainer: unknown,
                options: TextureLoaderOptions,
            ) => Promise<unknown>;
            loadTextureFromBufferAsync?: (
                uniqueId: unknown,
                textureName: string,
                arrayBufferOrBlob: ArrayBuffer | Blob,
                scene: unknown,
                assetContainer: unknown,
                options: TextureLoaderOptions,
                applyPathNormalization?: boolean,
            ) => Promise<unknown>;
        } | undefined);
        if (!textureLoader || this.webGpuConfiguredMmdTextureLoaders.has(textureLoader)) {
            return;
        }
        this.webGpuConfiguredMmdTextureLoaders.add(textureLoader);

        const originalLoadTextureAsync = textureLoader.loadTextureAsync?.bind(textureLoader);
        if (originalLoadTextureAsync) {
            textureLoader.loadTextureAsync = (async (uniqueId, rootUrl, relativeTexturePathOrIndex, scene, assetContainer, options) => {
                const textureOptions = { ...options };
                if (typeof relativeTexturePathOrIndex === "string") {
                    const textureUrl = PathNormalize(rootUrl + relativeTexturePathOrIndex);
                    if (this.shouldSkipDdsTextureUrlForWebGpu(textureUrl)) {
                        try {
                            const arrayBuffer = await this.loadArrayBufferFromUrl(textureUrl);
                            return await this.createWebGpuDdsFallbackTexture(textureUrl, arrayBuffer, scene, assetContainer, textureOptions);
                        } catch (err) {
                            logWarn("asset", "DDS texture fallback load failed", {
                                textureUrl,
                                ...toLogErrorData(err),
                            });
                            return null;
                        }
                    }
                    if (this.shouldTryBmpAlphaFallbackTextureUrl(textureUrl)) {
                        try {
                            const arrayBuffer = await this.loadArrayBufferFromUrl(textureUrl);
                            const bmpAlphaTexture = await this.createWebGpuBmpAlphaFallbackTexture(
                                textureUrl,
                                arrayBuffer,
                                scene,
                                assetContainer,
                                textureOptions,
                            );
                            if (bmpAlphaTexture) {
                                return bmpAlphaTexture;
                            }
                        } catch (err) {
                            logWarn("asset", "BMP alpha texture fallback load failed", {
                                textureUrl,
                                ...toLogErrorData(err),
                            });
                        }
                    }
                }
                if (!textureOptions.noMipmap) {
                    if (typeof relativeTexturePathOrIndex === "number") {
                        textureOptions.noMipmap = true;
                    } else {
                        const textureUrl = PathNormalize(rootUrl + relativeTexturePathOrIndex);
                        const dimensions = await this.inspectImageDimensionsFromUrl(textureUrl);
                        if (!dimensions && this.isBrowserInspectableImageTexturePath(textureUrl)) {
                            logWarn("asset", "texture file missing or unreadable; skipped for model load", {
                                textureUrl,
                            });
                            return null;
                        }
                        textureOptions.noMipmap = !dimensions
                            || !(this.isPowerOfTwo(dimensions.width) && this.isPowerOfTwo(dimensions.height));
                    }
                }

                return await originalLoadTextureAsync(
                    uniqueId,
                    rootUrl,
                    relativeTexturePathOrIndex,
                    scene,
                    assetContainer,
                    textureOptions,
                );
            }) as typeof textureLoader.loadTextureAsync;
        }

        const originalLoadTextureFromBufferAsync = textureLoader.loadTextureFromBufferAsync?.bind(textureLoader);
        if (originalLoadTextureFromBufferAsync) {
            textureLoader.loadTextureFromBufferAsync = (async (uniqueId, textureName, arrayBufferOrBlob, scene, assetContainer, options, applyPathNormalization = true) => {
                const textureOptions = { ...options };
                const ddsFallbackTexture = await this.createWebGpuDdsFallbackTexture(
                    textureName,
                    arrayBufferOrBlob,
                    scene,
                    assetContainer,
                    textureOptions,
                );
                if (ddsFallbackTexture) {
                    return ddsFallbackTexture;
                }
                if (this.shouldTryBmpAlphaFallbackTextureUrl(textureName)) {
                    const bmpAlphaTexture = await this.createWebGpuBmpAlphaFallbackTexture(
                        textureName,
                        arrayBufferOrBlob,
                        scene,
                        assetContainer,
                        textureOptions,
                    );
                    if (bmpAlphaTexture) {
                        return bmpAlphaTexture;
                    }
                }
                if (!textureOptions.noMipmap) {
                    const cacheKey = applyPathNormalization ? PathNormalize(textureName) : textureName;
                    textureOptions.noMipmap = !(await this.shouldGenerateMipmapsForWebGpuTextureBuffer(cacheKey, arrayBufferOrBlob));
                }

                return await originalLoadTextureFromBufferAsync(
                    uniqueId,
                    textureName,
                    arrayBufferOrBlob,
                    scene,
                    assetContainer,
                    textureOptions,
                    applyPathNormalization,
                );
            }) as typeof textureLoader.loadTextureFromBufferAsync;
        }
    }

    private configureWebGpuRawTextureUploadForNonPOT(): void {
        if (!this.isWebGpuEngine()) {
            return;
        }

        const engine = this.engine as WebGPUEngine & {
            _uploadDataToTextureDirectly?: (...args: unknown[]) => unknown;
        };
        const originalUploadDataToTextureDirectly = engine._uploadDataToTextureDirectly?.bind(engine);
        if (!originalUploadDataToTextureDirectly) {
            return;
        }

        engine._uploadDataToTextureDirectly = ((
            texture,
            imageData,
            faceIndex = 0,
            lod = 0,
            babylonInternalFormat,
            useTextureWidthAndHeight = false,
        ) => {
            if (!useTextureWidthAndHeight) {
                const textureWidth = typeof texture?.width === "number" ? texture.width : 0;
                const textureHeight = typeof texture?.height === "number" ? texture.height : 0;
                if (textureWidth > 0 && textureHeight > 0 && (!this.isPowerOfTwo(textureWidth) || !this.isPowerOfTwo(textureHeight))) {
                    useTextureWidthAndHeight = true;
                }
            }

            return originalUploadDataToTextureDirectly(
                texture,
                imageData,
                faceIndex,
                lod,
                babylonInternalFormat,
                useTextureWidthAndHeight,
            );
        }) as typeof engine._uploadDataToTextureDirectly;
    }

    private hasPrePassRendererSupport(): boolean {
        if (this.isWebGpuEngine()) {
            // WebGPU compatibility mode in Babylon 8.45.3 can expose prepass APIs
            // while MRT allocation still fails at runtime. Keep prepass off.
            return false;
        }
        const hasEnableFn = typeof (this.scene as Scene & { enablePrePassRenderer?: () => unknown }).enablePrePassRenderer === "function";
        const hasMrtFn = typeof (this.engine as Engine & { createMultipleRenderTarget?: unknown }).createMultipleRenderTarget === "function";
        return hasEnableFn && hasMrtFn;
    }

    private hasActivePbrMmdLikeScattering(): boolean {
        return this.scene.materials.some((material) => {
            const subSurface = (material as Material & {
                subSurface?: { isScatteringEnabled?: boolean };
            }).subSurface;
            return subSurface?.isScatteringEnabled === true;
        });
    }

    private disablePrePassRendererIfSupported(): void {
        // Babylon screen-space SSS owns the same PrePassRenderer as SSR/DoF.
        // Keep it alive while any loaded PBR MMD Like material is scattering.
        if (this.hasActivePbrMmdLikeScattering()) {
            return;
        }
        const sceneWithPrePass = this.scene as Scene & { disablePrePassRenderer?: () => void };
        if (typeof sceneWithPrePass.disablePrePassRenderer === "function") {
            sceneWithPrePass.disablePrePassRenderer();
        }
    }

    private initializePostEffectBackend(): void {
        if (this.requestedPostEffectBackend !== "frameGraph") {
            this.postEffectBackend = "classic";
            return;
        }

        const ssgiRequested = this.isFrameGraphPostEffectActive("ssgi");
        const ssgiSupported = this.isWebGpuEngine() && this.engine.getCaps().supportComputeShaders;
        if (
            ssgiRequested
            && !ssgiSupported
            && !this.frameGraphPostEffectsSsgiUnsupportedWarningEmitted
        ) {
            this.frameGraphPostEffectsSsgiUnsupportedWarningEmitted = true;
            const message = "GI (experimental) requires WebGPU compute shaders and is disabled on this renderer.";
            logWarn("render", "frame graph SSGI disabled on unsupported renderer", {
                engine: this.getEngineType(),
                requested: true,
                supportComputeShaders: this.engine.getCaps().supportComputeShaders,
            });
            this.addRuntimeDiagnostic(message);
        }

        const controller = new FrameGraphPostEffectsController((warning) => {
            if (this.frameGraphPostEffectsController !== controller) {
                logDebugIfEnabled("postfx", "render", "ignored stale Frame Graph build warning", {
                    reason: warning.reason,
                    message: warning.message,
                });
                return;
            }
            logWarn("render", "frame graph post effect backend requested but not active", {
                storageKey: POST_EFFECT_BACKEND_STORAGE_KEY,
                fallback: "classic",
                reason: warning.reason,
                message: warning.message,
                stack: warning.stack,
            });
            this.addRuntimeDiagnostic(warning.message);
            this.disposeFrameGraphPostEffectsSceneColorTarget();
            this.disposeFrameGraphPostEffectsLuminousMaskTarget();
            this.postEffectBackend = "classic";
        }, (info) => {
            if (this.frameGraphPostEffectsController !== controller) {
                return;
            }
            if (info.event === "ssgi-ready") {
                logInfo("render", "frame graph SSGI task active", {
                    ...info.details,
                    storageKey: POST_EFFECT_BACKEND_STORAGE_KEY,
                });
            }
            logDebugIfEnabled("postfx", "render", "frame graph post effect backend", {
                event: info.event,
                storageKey: POST_EFFECT_BACKEND_STORAGE_KEY,
            });
            if (info.event === "ready" && this.frameGraphPostEffectsRebuildPending) {
                this.scheduleFrameGraphPostEffectsBackendRebuild();
            }
        }, () => this.getFrameGraphPostEffectsSettings());
        this.frameGraphPostEffectsController = controller;

        const settings = this.getFrameGraphPostEffectsSettings();
        const resourcePlan = buildFrameGraphResourcePlan(settings, this.getFrameGraphPostEffectRuntimeOrder());
        if (resourcePlan.needsDepthRenderer) {
            this.configureDofDepthRenderer();
        } else {
            this.disposeDofDepthRenderer();
        }
        const sourceTexture = this.createFrameGraphPostEffectsSceneColorTarget();
        const luminousMaskTexture = resourcePlan.needsLuminousMask
            ? this.createFrameGraphPostEffectsLuminousMaskTarget()
            : null;
        const depthTexture = resourcePlan.needsDepthRenderer
            ? this.depthRenderer?.getDepthMap().getInternalTexture() ?? null
            : null;
        const activated = controller.activate(
            this.scene,
            sourceTexture?.getInternalTexture() ?? null,
            depthTexture,
            this.camera,
            this.getFrameGraphPostEffectRuntimeOrder(),
            luminousMaskTexture?.getInternalTexture() ?? null,
            this.exportRenderSurface?.getInternalTexture() ?? null,
        );
        if (!activated) {
            this.disposeFrameGraphPostEffectsSceneColorTarget();
            this.disposeFrameGraphPostEffectsLuminousMaskTarget();
        }
        this.postEffectBackend = activated ? "frameGraph" : "classic";
        this.applyImageProcessingSettings();
        if (activated) {
            logDebugIfEnabled("postfx", "render", "frame graph post effect performance snapshot", {
                storageKey: MmdManager.FRAME_PERFORMANCE_LOG_STORAGE_KEY,
                snapshot: this.getFrameGraphPostEffectsPerformanceSnapshot(),
            });
        }
    }

    private isFrameGraphImageProcessingTaskNeeded(): boolean {
        const epsilon = 1e-4;
        return this.postEffectToneMappingEnabledValue
            || this.postEffectDitheringEnabledValue
            || this.postEffectColorCurvesEnabledValue
            || Math.abs(this.postEffectExposureValue - 1) > epsilon;
    }

    private getFrameGraphPostEffectsSettings(): FrameGraphPostEffectsSettings {
        this.updateEditorDofFocusAndFStop();
        return {
            contrast: this.postEffectContrastValue,
            gammaPower: this.postEffectGammaValue,
            imageProcessingEnabled: this.isFrameGraphImageProcessingTaskNeeded(),
            dofEnabled: this.isFrameGraphPostEffectActive("dof"),
            dofBlurLevel: this.dofBlurLevelValue,
            dofFocusDistanceMm: this.dofFocusDistanceMmValue,
            dofEffectiveFStop: this.dofFStopValue,
            dofLensSize: this.dofLensSizeValue,
            dofFocalLength: this.dofFocalLengthValue,
            luminousEnabled: this.isFrameGraphPostEffectActive("luminous"),
            luminousIntensity: this.postEffectGlowIntensityValue,
            luminousThreshold: this.postEffectGlowThresholdValue,
            luminousRadius: this.postEffectGlowKernelValue,
            luminousGlareCount: this.postEffectGlowGlareCountValue,
            luminousGlareLength: this.postEffectGlowGlareLengthValue,
            luminousGlareAngle: this.postEffectGlowGlareAngleValue,
            luminousGlarePower: this.postEffectGlowGlarePowerValue,
            bloomEnabled: this.isFrameGraphPostEffectActive("bloom"),
            bloomWeight: this.postEffectBloomWeightValue,
            bloomThreshold: this.postEffectBloomThresholdValue,
            bloomKernel: this.postEffectBloomKernelValue,
            bloomColor: this.getPostEffectBloomColor(),
            vignetteEnabled: this.isFrameGraphPostEffectActive("vignette"),
            vignetteWeight: this.postEffectVignetteWeightValue,
            edgeBlurStrength: this.isFrameGraphPostEffectActive("edgeBlur") ? this.dofLensEdgeBlurValue : 0,
            lensDistortionEnabled: this.isFrameGraphPostEffectActive("distortion"),
            lensDistortion: this.isFrameGraphPostEffectActive("distortion") ? this.dofLensDistortionValue : 0,
            chromaticAberration: this.isFrameGraphPostEffectActive("chromatic") ? this.postEffectChromaticAberrationValue : 0,
            grainIntensity: this.isFrameGraphPostEffectActive("grain") ? this.postEffectGrainIntensityValue : 0,
            sharpenEdge: this.isFrameGraphPostEffectActive("sharpen") ? this.postEffectSharpenEdgeValue : 0,
            ssaoEnabled: this.isFrameGraphPostEffectActive("ssao"),
            ssaoStrength: this.postEffectSsaoStrengthValue,
            ssaoRadius: this.postEffectSsaoRadiusValue,
            ssaoShadowColor: { r: 0.5, g: 0.5, b: 0.5 },
            ssaoToonInfluence: 1,
            offsetShadowEnabled: this.isFrameGraphPostEffectActive("offsetShadow"),
            offsetShadowStrength: this.postEffectOffsetShadowStrengthValue,
            offsetShadowOffsetX: this.postEffectOffsetShadowOffsetXValue,
            offsetShadowOffsetY: this.postEffectOffsetShadowOffsetYValue,
            offsetShadowDepthBias: this.postEffectOffsetShadowDepthBiasValue,
            offsetShadowMaxDepth: this.postEffectOffsetShadowMaxDepthValue,
            offsetShadowDepthScale: this.postEffectOffsetShadowDepthScaleValue,
            offsetShadowThickness: this.postEffectOffsetShadowThicknessValue,
            offsetShadowSoftness: this.postEffectOffsetShadowSoftnessValue,
            offsetShadowNormalInfluence: this.postEffectOffsetShadowNormalInfluenceValue,
            offsetShadowColor: this.getPostEffectOffsetShadowColor(),
            offsetShadowDebugView: this.postEffectOffsetShadowDebugViewValue,
            offsetHighlightEnabled: this.isFrameGraphPostEffectActive("offsetHighlight"),
            offsetHighlightStrength: this.postEffectOffsetHighlightStrengthValue,
            offsetHighlightOffsetX: this.postEffectOffsetHighlightOffsetXValue,
            offsetHighlightOffsetY: this.postEffectOffsetHighlightOffsetYValue,
            offsetHighlightDepthThreshold: this.postEffectOffsetHighlightDepthThresholdValue,
            offsetHighlightNormalThreshold: this.postEffectOffsetHighlightNormalThresholdValue,
            offsetHighlightThickness: this.postEffectOffsetHighlightThicknessValue,
            offsetHighlightSoftness: this.postEffectOffsetHighlightSoftnessValue,
            offsetHighlightDepthScale: this.postEffectOffsetHighlightDepthScaleValue,
            offsetHighlightColor: this.getPostEffectOffsetHighlightColor(),
            offsetHighlightDebugView: this.postEffectOffsetHighlightDebugViewValue,
            ssrEnabled: this.isFrameGraphPostEffectActive("ssr"),
            ssrStrength: this.postEffectSsrStrengthValue,
            ssrStep: this.postEffectSsrStepValue,
            ssgiEnabled: this.isFrameGraphPostEffectActive("ssgi")
                && this.isWebGpuEngine()
                && this.engine.getCaps().supportComputeShaders,
            ssgiStrength: this.postEffectSsgiStrengthValue,
            ssgiSampleRadius: this.postEffectSsgiSampleRadiusValue,
            ssgiBlendMode: "softLight",
            lutEnabled: this.isFrameGraphPostEffectActive("lut") && isLutSourceReadyImpl(this),
            lutIntensity: this.postEffectLutIntensityValue,
            lutRuntimeText: this.getFrameGraphPostEffectLutRuntimeText(),
            lutTextureKey: this.getFrameGraphPostEffectLutTextureKey(),
            motionBlurEnabled: this.isFrameGraphPostEffectActive("motionBlur"),
            motionBlurStrength: this.postEffectMotionBlurStrengthValue,
            motionBlurSamples: this.postEffectMotionBlurSamplesValue,
            antialiasEnabled: this.antialiasEnabledValue,
        };
    }

    private disposeDofDepthRenderer(): void {
        if (!this.depthRenderer) {
            return;
        }
        this.depthRenderer.dispose();
        this.depthRenderer = null;
        MmdManager.toonContactAoDepthRenderer = null;
    }

    private getFrameGraphPostEffectLutRuntimeText(): string | null {
        if (!this.isFrameGraphPostEffectActive("lut") || !isLutSourceReadyImpl(this)) {
            return null;
        }
        if (this.postEffectLutSourceModeValue === "builtin") {
            return MmdManager.POST_EFFECT_LUT_TEXT_BY_ID[this.postEffectLutPresetValue] ?? null;
        }
        return this.postEffectLutExternalTextValue;
    }

    private getFrameGraphPostEffectLutTextureKey(): string | null {
        if (!this.isFrameGraphPostEffectActive("lut") || !isLutSourceReadyImpl(this)) {
            return null;
        }
        if (this.postEffectLutSourceModeValue === "builtin") {
            return `builtin:${this.postEffectLutPresetValue}`;
        }
        return [
            "external",
            this.postEffectLutSourceModeValue,
            this.postEffectLutExternalPathValue ?? "",
            this.postEffectLutExternalSourceFormatValue ?? "",
            String(this.postEffectLutExternalRevision),
        ].join(":");
    }

    private createFrameGraphPostEffectsSceneColorTarget(): RenderTargetTexture | null {
        if (!this.camera) {
            return null;
        }
        this.disposeFrameGraphPostEffectsSceneColorTarget();
        const size = this.getFrameGraphPostEffectsRenderTargetSize();

        const renderTarget = new RenderTargetTexture(
            "frameGraphPostEffectsSceneColor",
            size,
            this.scene,
            {
                generateMipMaps: false,
                doNotChangeAspectRatio: true,
                generateDepthBuffer: true,
                generateStencilBuffer: true,
                samples: 1,
            },
        );
        renderTarget.activeCamera = this.camera;
        // Keep the render list unset so ObjectRenderer can reuse the scene's
        // active-mesh evaluation. A custom list can skip per-pass light binding
        // data for WebGPU MMD materials and produce "Light*" draw-context
        // warnings or an unlit scene-color texture.
        renderTarget.renderList = null;
        renderTarget.getCustomRenderList = null;
        renderTarget.renderParticles = true;
        renderTarget.renderSprites = true;
        renderTarget.skipInitialClear = false;
        this.installRenderTargetPerformanceHook(renderTarget, "frameGraphSceneColorRenderTarget");
        this.frameGraphPostEffectsSceneColorTarget = renderTarget;
        this.syncFrameGraphRenderTargetState();
        return renderTarget;
    }

    private createFrameGraphPostEffectsLuminousMaskTarget(): RenderTargetTexture | null {
        if (!this.camera) {
            return null;
        }
        this.disposeFrameGraphPostEffectsLuminousMaskTarget();
        const sourceSize = this.getFrameGraphPostEffectsRenderTargetSize();
        const size = {
            width: Math.max(1, Math.round(sourceSize.width * FRAME_GRAPH_LUMINOUS_MASK_EXPERIMENT_SCALE)),
            height: Math.max(1, Math.round(sourceSize.height * FRAME_GRAPH_LUMINOUS_MASK_EXPERIMENT_SCALE)),
        };

        const renderTarget = new RenderTargetTexture(
            "frameGraphPostEffectsLuminousMask",
            size,
            this.scene,
            {
                generateMipMaps: false,
                doNotChangeAspectRatio: true,
                generateDepthBuffer: true,
                generateStencilBuffer: false,
                samples: 1,
            },
        );
        renderTarget.updateSamplingMode(Texture.BILINEAR_SAMPLINGMODE);
        renderTarget.activeCamera = this.camera;
        renderTarget.renderList = [];
        renderTarget.getCustomRenderList = () => this.scene.meshes;
        renderTarget.renderParticles = false;
        renderTarget.renderSprites = false;
        renderTarget.skipInitialClear = false;
        renderTarget.clearColor = new Color4(0, 0, 0, 1);
        renderTarget.onBeforeRenderObservable.add(() => {
            this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount = 0;
        });
        renderTarget.onAfterRenderObservable.add(() => {
            this.reportFrameGraphLuminousMaskDiagnostics();
        });
        this.installRenderTargetPerformanceHook(renderTarget, "frameGraphLuminousMaskRenderTarget");
        renderTarget.customRenderFunction = (
            opaqueSubMeshes,
            alphaTestSubMeshes,
            transparentSubMeshes,
            _depthOnlySubMeshes,
            beforeTransparents,
        ) => {
            this.renderFrameGraphLuminousMaskSubMeshes(opaqueSubMeshes, false);
            this.renderFrameGraphLuminousMaskSubMeshes(alphaTestSubMeshes, false);
            beforeTransparents?.();
            const previousAlphaMode = this.engine.getAlphaMode();
            this.renderFrameGraphLuminousMaskSubMeshes(transparentSubMeshes, true);
            this.engine.setAlphaMode(previousAlphaMode);
        };
        this.camera.customRenderTargets.push(renderTarget);
        this.frameGraphPostEffectsLuminousMaskTarget = renderTarget;
        return renderTarget;
    }

    private renderFrameGraphLuminousMaskSubMeshes(
        subMeshes: SmartArray<SubMesh>,
        enableAlphaMode: boolean,
    ): void {
        for (let i = 0; i < subMeshes.length; i++) {
            const subMesh = subMeshes.data[i];
            if (!subMesh) {
                continue;
            }
            const material = subMesh.getMaterial() as MmdManagerMaterialLike | null;
            if (!material || this.isMaterialVisible(material) === false) {
                continue;
            }
            const renderingMesh = subMesh.getRenderingMesh();
            const maskState = getFrameGraphLuminousMaskMaterialStateImpl(this, renderingMesh, material);
            if (!maskState) {
                continue;
            }
            const replacementMesh = subMesh.getReplacementMesh();
            const renderPassId = this.frameGraphPostEffectsLuminousMaskTarget?.renderPassId;
            const maskMaterial = this.configureFrameGraphLuminousMaskMaterial(
                maskState.color,
                maskState.alpha,
                maskState.texture,
            );
            if (renderPassId === undefined || !maskMaterial) {
                continue;
            }
            const previousRenderPassMaterial = renderingMesh.getMaterialForRenderPass(renderPassId);
            const previousReplacementRenderPassMaterial = replacementMesh?.getMaterialForRenderPass(renderPassId);
            renderingMesh.setMaterialForRenderPass(renderPassId, maskMaterial);
            replacementMesh?.setMaterialForRenderPass(renderPassId, maskMaterial);
            try {
                renderingMesh.render(subMesh, enableAlphaMode, replacementMesh || undefined);
                this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount += 1;
            } finally {
                renderingMesh.setMaterialForRenderPass(renderPassId, previousRenderPassMaterial);
                replacementMesh?.setMaterialForRenderPass(renderPassId, previousReplacementRenderPassMaterial);
            }
        }
    }

    private reportFrameGraphLuminousMaskDiagnostics(): void {
        if (this.postEffectBackend !== "frameGraph" || !this.isFrameGraphPostEffectActive("luminous")) {
            return;
        }
        const renderedCount = this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount;
        if (renderedCount > 0) {
            this.frameGraphPostEffectsLuminousMaskZeroWarningEmitted = false;
            return;
        }
        if (this.sceneModels.length === 0 || this.frameGraphPostEffectsLuminousMaskZeroWarningEmitted) {
            return;
        }
        this.frameGraphPostEffectsLuminousMaskZeroWarningEmitted = true;
        const message = "FrameGraph Luminous is enabled, but no AutoLuminous material submeshes were rendered into the luminous mask.";
        logWarn("render", "frame graph luminous mask has no AutoLuminous submeshes", {
            modelCount: this.sceneModels.length,
            stack: [...this.getFrameGraphPostEffectStackIds()],
        });
        this.addRuntimeDiagnostic(message);
    }

    private configureFrameGraphLuminousMaskMaterial(
        color: Color3,
        alpha: number,
        texture: Texture | null,
    ): StandardMaterial | null {
        const material = this.ensureFrameGraphLuminousMaskMaterial();
        if (!material) {
            return null;
        }
        const clampedAlpha = Math.max(0, Math.min(1, alpha));
        material.diffuseColor.copyFrom(color);
        material.ambientColor.copyFrom(color);
        material.emissiveColor.copyFrom(color);
        material.alpha = clampedAlpha;
        material.diffuseTexture = texture;
        material.emissiveTexture = texture;
        material.opacityTexture = null;
        material.useAlphaFromDiffuseTexture = Boolean(texture?.hasAlpha);
        material.transparencyMode = texture?.hasAlpha || clampedAlpha < 0.999
            ? Material.MATERIAL_ALPHABLEND
            : Material.MATERIAL_OPAQUE;
        material.markAsDirty(Material.AllDirtyFlag);
        return material;
    }

    private ensureFrameGraphLuminousMaskMaterial(): StandardMaterial | null {
        if (this.frameGraphPostEffectsLuminousMaskMaterial) {
            return this.frameGraphPostEffectsLuminousMaskMaterial;
        }
        const material = new StandardMaterial("frameGraphPostEffectsLuminousMaskMaterial", this.scene);
        material.disableLighting = true;
        material.backFaceCulling = false;
        material.specularColor = Color3.Black();
        material.emissiveColor = Color3.White();
        material.diffuseColor = Color3.White();
        material.ambientColor = Color3.White();
        material.forceDepthWrite = true;
        this.frameGraphPostEffectsLuminousMaskMaterial = material;
        return material;
    }

    private getFrameGraphPostEffectsRenderTargetSize(): { width: number; height: number } {
        return {
            width: Math.max(1, this.engine.getRenderWidth()),
            height: Math.max(1, this.engine.getRenderHeight()),
        };
    }

    private refreshFrameGraphPostEffectsBackendAfterResize(): void {
        if (this.postEffectBackend !== "frameGraph" || !this.frameGraphPostEffectsController) {
            return;
        }
        this.disposeFrameGraphPostEffectsController();
        this.initializePostEffectBackend();
    }

    private disposeFrameGraphPostEffectsSceneColorTarget(): void {
        if (!this.frameGraphPostEffectsSceneColorTarget) {
            this.frameGraphPostEffectsSceneColorPrePassActivationPass?.dispose();
            this.frameGraphPostEffectsSceneColorPrePassActivationPass = null;
            return;
        }
        const index = this.camera?.customRenderTargets.indexOf(this.frameGraphPostEffectsSceneColorTarget) ?? -1;
        if (index >= 0) {
            this.camera?.customRenderTargets.splice(index, 1);
        }
        this.frameGraphPostEffectsSceneColorTarget.dispose();
        this.frameGraphPostEffectsSceneColorTarget = null;
        // RenderTargetTexture.dispose() owns and disposes attached post-processes.
        this.frameGraphPostEffectsSceneColorPrePassActivationPass = null;
    }

    private disposeFrameGraphPostEffectsLuminousMaskTarget(): void {
        if (!this.frameGraphPostEffectsLuminousMaskTarget) {
            return;
        }
        const index = this.camera?.customRenderTargets.indexOf(this.frameGraphPostEffectsLuminousMaskTarget) ?? -1;
        if (index >= 0) {
            this.camera?.customRenderTargets.splice(index, 1);
        }
        this.frameGraphPostEffectsLuminousMaskTarget.dispose();
        this.frameGraphPostEffectsLuminousMaskTarget = null;
        this.frameGraphPostEffectsLuminousMaskMaterial?.dispose();
        this.frameGraphPostEffectsLuminousMaskMaterial = null;
        this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount = 0;
        this.frameGraphPostEffectsLuminousMaskZeroWarningEmitted = false;
    }

    private executePostEffectBackend(): void {
        if (this.postEffectBackend !== "frameGraph") {
            return;
        }
        if (!this.shouldExecuteFrameGraphPostEffects()) {
            return;
        }
        this.frameGraphPostEffectsController?.execute();
        if (this.frameGraphPostEffectsController && !this.frameGraphPostEffectsController.isActive()) {
            this.shutdownPostEffectBackend();
        }
    }

    private shouldExecuteFrameGraphPostEffects(): boolean {
        return this.getActiveFrameGraphPostEffectIds().length > 0
            || this.isFrameGraphImageProcessingTaskNeeded();
    }

    private syncFrameGraphRenderTargetState(): void {
        const sceneColorTarget = this.frameGraphPostEffectsSceneColorTarget;
        const customRenderTargets = this.camera?.customRenderTargets;
        if (!sceneColorTarget || !customRenderTargets) {
            return;
        }
        const index = customRenderTargets.indexOf(sceneColorTarget);
        const shouldRenderSceneColorTarget = this.postEffectBackend === "frameGraph"
            && this.shouldExecuteFrameGraphPostEffects();
        const subSurfacePolicy = resolveSubSurfaceFrameGraphPolicy(
            shouldRenderSceneColorTarget,
            this.hasActivePbrMmdLikeScattering(),
            this.postEffectBackend === "frameGraph",
            this.isImageProcessingEffectsEnabled(),
        );
        this.syncFrameGraphSceneColorPrePassActivationPass(
            subSurfacePolicy.sceneColorPrePassActivationPassRequired,
        );
        this.syncSubSurfaceCompositionColorSpace(
            subSurfacePolicy.compositionUsesLocalGamma,
        );
        sceneColorTarget.useCameraPostProcesses = subSurfacePolicy.sceneColorUseCameraPostProcesses;
        const subSurfaceConfiguration = this.scene.subSurfaceConfiguration;
        if (subSurfaceConfiguration) {
            // SSS itself is inserted into the PrePass chain automatically.
            // Final image processing belongs to the selected application
            // output path, not to an extra SSS-owned full-screen pass.
            subSurfaceConfiguration.needsImageProcessing =
                subSurfacePolicy.configurationNeedsImageProcessing;
        }
        if (shouldRenderSceneColorTarget) {
            if (index < 0) {
                customRenderTargets.push(sceneColorTarget);
            }
            return;
        }
        if (index >= 0) {
            customRenderTargets.splice(index, 1);
        }
    }

    private syncFrameGraphSceneColorPrePassActivationPass(shouldAttach: boolean): void {
        const renderTarget = this.frameGraphPostEffectsSceneColorTarget;
        const currentPass = this.frameGraphPostEffectsSceneColorPrePassActivationPass;
        if (!renderTarget) {
            currentPass?.dispose();
            this.frameGraphPostEffectsSceneColorPrePassActivationPass = null;
            return;
        }
        if (shouldAttach) {
            if (currentPass) {
                return;
            }
            const activationPass = new PassPostProcess(
                "frameGraphSceneColorPrePassActivation",
                1,
                null,
                Texture.BILINEAR_SAMPLINGMODE,
                this.engine,
            );
            // Babylon.js 9.x does not enable an RTT-specific PrePassRenderTarget
            // when PrePass is requested only by a material. Opting this no-op
            // pass into PrePass makes the SSS composition run before Frame Graph
            // imports the scene-color texture. Keep the ordinary PassPostProcess
            // class name so the existing display-space output policy is unchanged.
            activationPass.setPrePassRenderer = () => true;
            renderTarget.addPostProcess(activationPass);
            this.frameGraphPostEffectsSceneColorPrePassActivationPass = activationPass;
            this.scene.prePassRenderer?.markAsDirty();
            return;
        }
        if (!currentPass) {
            return;
        }
        renderTarget.removePostProcess(currentPass);
        currentPass.dispose();
        this.frameGraphPostEffectsSceneColorPrePassActivationPass = null;
        this.scene.prePassRenderer?.markAsDirty();
    }

    private syncSubSurfaceCompositionColorSpace(usesLocalGamma: boolean): void {
        const postProcess = this.scene.subSurfaceConfiguration?.postProcess;
        if (!postProcess) {
            this.subSurfaceCompositionUsesLocalGamma = null;
            return;
        }
        if (this.subSurfaceCompositionUsesLocalGamma === usesLocalGamma) {
            return;
        }
        this.subSurfaceCompositionUsesLocalGamma = usesLocalGamma;
        postProcess.updateEffect(buildSubSurfaceCompositionDefines(
            usesLocalGamma,
            PBR_SKIN_SSS_DEBUG_VISUALIZATION,
        ));
    }

    private tryRecoverFrameGraphRenderTargetFailure(err: unknown): boolean {
        if (this.postEffectBackend !== "frameGraph" || !this.frameGraphPostEffectsController) {
            return false;
        }
        if (!this.isFrameGraphRenderTargetFailure(err)) {
            return false;
        }

        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        logWarn("render", "Frame Graph render target failed during scene render; falling back to classic post effects", {
            message,
            stack,
        });
        this.addRuntimeDiagnostic(`Frame Graph post effects disabled after render target failure: ${message}`);
        this.shutdownPostEffectBackend();
        return true;
    }

    private isFrameGraphRenderTargetFailure(err: unknown): boolean {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack ?? "" : "";
        const details = `${message}\n${stack}`;
        return details.includes("generateMipMapsMultiFramebuffer")
            || details.includes("MultiRenderTarget")
            || details.includes("_renderRenderTarget");
    }

    private renderBoneGizmoUtilityLayerAfterPostEffects(): void {
        if (this.postEffectBackend !== "frameGraph") {
            return;
        }
        const utilityLayer = this.boneGizmoManager?.utilityLayer as { render?: () => void } | undefined;
        utilityLayer?.render?.();
    }

    private disposeFrameGraphPostEffectsController(): void {
        if (!this.frameGraphPostEffectsController) {
            return;
        }
        this.frameGraphPostEffectsController.dispose();
        this.frameGraphPostEffectsController = null;
        this.disposeFrameGraphPostEffectsSceneColorTarget();
        this.disposeFrameGraphPostEffectsLuminousMaskTarget();
    }

    private shutdownPostEffectBackend(): void {
        if (this.postEffectBackend === "frameGraph") {
            // Future Frame Graph backends should detach before classic post
            // effects are disposed.
        }
        this.postEffectBackend = "classic";
        const subSurfaceConfiguration = this.scene.subSurfaceConfiguration;
        if (subSurfaceConfiguration) {
            subSurfaceConfiguration.needsImageProcessing =
                resolveSubSurfaceFrameGraphPolicy(
                    false,
                    this.hasActivePbrMmdLikeScattering(),
                    false,
                    this.isImageProcessingEffectsEnabled(),
                ).configurationNeedsImageProcessing;
        }
        this.disposeFrameGraphPostEffectsController();
    }

    getPostEffectBackend(): PostEffectBackend {
        return this.postEffectBackend;
    }

    getFrameGraphPostEffectsExecutedFrameCount(): number {
        return this.frameGraphPostEffectsController?.getExecutedFrameCount() ?? 0;
    }

    getFrameGraphPostEffectsLuminousMaskRenderedSubMeshCount(): number {
        return this.frameGraphPostEffectsLuminousMaskRenderedSubMeshCount;
    }

    public getFrameGraphPostEffectStackIds(): readonly FrameGraphPostEffectId[] {
        return normalizeFrameGraphPostEffectIds(
            this.frameGraphPostEffectStackIdsValue,
            this.frameGraphPostEffectStackInitializedValue
                ? []
                : this.getParameterActiveFrameGraphPostEffectIds(),
        );
    }

    public setFrameGraphPostEffectStackIds(ids: readonly FrameGraphPostEffectId[]): void {
        const normalized = normalizeFrameGraphPostEffectIds(ids);
        this.frameGraphPostEffectStackInitializedValue = true;
        if (this.areFrameGraphPostEffectIdsEqual(this.frameGraphPostEffectStackIdsValue, normalized)) {
            return;
        }
        const normalizedSet = new Set(normalized);
        for (const id of normalized) {
            if (!this.frameGraphPostEffectStackEnabledValue.has(id)) {
                this.frameGraphPostEffectStackEnabledValue.set(id, true);
            }
        }
        for (const id of Array.from(this.frameGraphPostEffectStackEnabledValue.keys())) {
            if (!normalizedSet.has(id)) {
                this.frameGraphPostEffectStackEnabledValue.delete(id);
            }
        }
        this.frameGraphPostEffectStackIdsValue = normalized;
        this.refreshFrameGraphPostEffectsBackendForOrderChange();
    }

    public setFrameGraphPostEffectStackEntries(entries: readonly FrameGraphPostEffectStackEntry[]): void {
        const normalized = normalizeFrameGraphPostEffectIds(entries.map((entry) => entry.id));
        this.frameGraphPostEffectStackInitializedValue = true;
        const enabledById = new Map<FrameGraphPostEffectId, boolean>();
        for (const entry of entries) {
            if (normalized.includes(entry.id) && !enabledById.has(entry.id)) {
                enabledById.set(entry.id, entry.enabled);
            }
        }
        const idsChanged = !this.areFrameGraphPostEffectIdsEqual(this.frameGraphPostEffectStackIdsValue, normalized);
        let enabledChanged = idsChanged || this.frameGraphPostEffectStackEnabledValue.size !== enabledById.size;
        if (!enabledChanged) {
            for (const id of normalized) {
                if (this.frameGraphPostEffectStackEnabledValue.get(id) !== enabledById.get(id)) {
                    enabledChanged = true;
                    break;
                }
            }
        }
        if (!enabledChanged) {
            return;
        }
        this.frameGraphPostEffectStackIdsValue = normalized;
        this.frameGraphPostEffectStackEnabledValue = enabledById;
        this.refreshFrameGraphPostEffectsBackendForOrderChange();
    }

    public getFrameGraphPostEffectStackEntries(): FrameGraphPostEffectStackEntry[] {
        return this.getFrameGraphPostEffectStackIds().map((id) => ({
            id,
            enabled: this.isFrameGraphPostEffectStackEnabled(id),
        }));
    }

    public getFrameGraphPostEffectRuntimeOrder(): readonly FrameGraphPostEffectId[] {
        return normalizeFrameGraphPostEffectIds(this.getFrameGraphPostEffectStackIds());
    }

    public isFrameGraphPostEffectActive(id: FrameGraphPostEffectId): boolean {
        return this.getFrameGraphPostEffectStackIds().includes(id)
            && this.isFrameGraphPostEffectStackEnabled(id);
    }

    public setFrameGraphPostEffectStackEntryEnabled(id: FrameGraphPostEffectId, enabled: boolean): void {
        const next = Boolean(enabled);
        if (id === "ssao" && next && this.modelEdgeWidthValue > 0.0001) {
            this.modelEdgeWidthValue = 0;
            this.applyModelEdgeToAllModels();
        }
        if (!this.getFrameGraphPostEffectStackIds().includes(id)) {
            this.setFrameGraphPostEffectStackIds(addFrameGraphPostEffectId(this.getFrameGraphPostEffectStackIds(), id));
        }
        if (this.isFrameGraphPostEffectStackEnabled(id) === next) {
            return;
        }
        this.frameGraphPostEffectStackEnabledValue.set(id, next);
        this.refreshFrameGraphPostEffectsBackendForStackStateChange();
    }

    private isFrameGraphPostEffectStackEnabled(id: FrameGraphPostEffectId): boolean {
        return this.frameGraphPostEffectStackEnabledValue.get(id)
            ?? this.isFrameGraphPostEffectParameterActive(id);
    }

    private isFrameGraphPostEffectParameterActive(id: FrameGraphPostEffectId): boolean {
        switch (id) {
            case "ssr":
                return this.postEffectSsrEnabledValue;
            case "ssgi":
                return false;
            case "ssao":
                return this.postEffectSsaoEnabledValue;
            case "offsetShadow":
                return this.postEffectOffsetShadowEnabledValue;
            case "offsetHighlight":
                return this.postEffectOffsetHighlightEnabledValue;
            case "dof":
                return this.dofEnabledValue;
            case "luminous":
                return this.postEffectGlowEnabledValue;
            case "bloom":
                return this.postEffectBloomEnabledValue;
            case "lut":
                return this.postEffectLutEnabledValue;
            case "motionBlur":
                return this.postEffectMotionBlurEnabledValue;
            case "sharpen":
                return this.postEffectSharpenEdgeValue > 0.000001;
            case "grain":
                return this.postEffectGrainIntensityValue > 0.000001;
            case "chromatic":
                return this.postEffectChromaticAberrationValue > 0.000001;
            case "vignette":
                return this.postEffectVignetteEnabledValue;
            case "edgeBlur":
                return this.dofLensEdgeBlurValue > 0.000001;
            case "distortion":
                return Math.abs(this.dofLensDistortionValue) > 0.000001
                    || Math.abs(this.dofLensDistortionInfluenceValue) > 0.000001;
        }
    }

    private getParameterActiveFrameGraphPostEffectIds(): FrameGraphPostEffectId[] {
        return FRAME_GRAPH_POST_EFFECT_IDS.filter((id) => this.isFrameGraphPostEffectParameterActive(id));
    }

    private getActiveFrameGraphPostEffectIds(): FrameGraphPostEffectId[] {
        return FRAME_GRAPH_POST_EFFECT_IDS.filter((id) => this.isFrameGraphPostEffectActive(id));
    }

    private areFrameGraphPostEffectIdsEqual(
        a: readonly FrameGraphPostEffectId[],
        b: readonly FrameGraphPostEffectId[],
    ): boolean {
        return a.length === b.length && a.every((id, index) => id === b[index]);
    }

    private refreshFrameGraphPostEffectsBackendForOrderChange(): void {
        if (this.postEffectBackend !== "frameGraph" || !this.frameGraphPostEffectsController) {
            return;
        }
        this.frameGraphPostEffectsRebuildPending = true;
        this.scheduleFrameGraphPostEffectsBackendRebuild();
    }

    private scheduleFrameGraphPostEffectsBackendRebuild(): void {
        if (this.frameGraphPostEffectsRebuildScheduled) {
            return;
        }
        this.frameGraphPostEffectsRebuildScheduled = true;
        requestAnimationFrame(() => {
            this.frameGraphPostEffectsRebuildScheduled = false;
            if (!this.frameGraphPostEffectsRebuildPending) {
                return;
            }
            const controller = this.frameGraphPostEffectsController;
            if (this.postEffectBackend !== "frameGraph" || !controller) {
                this.frameGraphPostEffectsRebuildPending = false;
                return;
            }
            if (!controller.isReady()) {
                return;
            }

            // FrameGraph texture dependencies are immutable after build.
            // Coalesce rapid order/state changes and rebuild once from the
            // latest stack after the current asynchronous build is ready.
            this.frameGraphPostEffectsRebuildPending = false;
            this.disposeFrameGraphPostEffectsController();
            this.initializePostEffectBackend();
        });
    }

    public refreshFrameGraphPostEffectsBackendForStackStateChange(): void {
        this.refreshFrameGraphPostEffectsBackendForOrderChange();
    }

    public reloadFrameGraphPostEffectsBackend(): boolean {
        if (this.requestedPostEffectBackend !== "frameGraph") {
            return false;
        }
        this.frameGraphPostEffectsRebuildPending = false;
        this.shutdownPostEffectBackend();
        this.initializePostEffectBackend();
        return this.postEffectBackend === "frameGraph"
            && this.frameGraphPostEffectsController !== null;
    }

    private refreshFrameGraphPostEffectsBackendForResourcePlanChange(): boolean {
        if (this.postEffectBackend !== "frameGraph" || !this.frameGraphPostEffectsController) {
            return false;
        }
        this.disposeFrameGraphPostEffectsController();
        this.initializePostEffectBackend();
        return this.postEffectBackend === "frameGraph";
    }

    private getPostProcessShaderLanguage(): ShaderLanguage {
        return this.isWebGpuEngine() ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;
    }

    /** Engine type string: "WebGL2", "WebGL1", or "WebGPU" */
    getEngineType(): string {
        if (this.isWebGpuEngine()) return "WebGPU";
        return (this.engine as Engine).webGLVersion >= 2 ? "WebGL2" : "WebGL1";
    }

    consumeRuntimeDiagnosticSummary(): string | null {
        const diagnostics = [...this.runtimeDiagnostics];
        this.runtimeDiagnostics.clear();
        if (diagnostics.length === 0) {
            return null;
        }
        if (diagnostics.length === 1) {
            return diagnostics[0];
        }
        const preview = diagnostics.slice(0, 2).join(" / ");
        const suffix = diagnostics.length > 2 ? ` (+${diagnostics.length - 2} more)` : "";
        return `Rendering warnings: ${preview}${suffix}`;
    }

    /** High-level shader/runtime label shown beside the engine badge. */
    getShaderRuntimeLabel(): "WGSL-first" | "WGSL-custom" | "GLSL" {
        if (!this.isWebGpuEngine()) {
            return "GLSL";
        }

        for (const entry of this.sceneModels) {
            for (const materialEntry of entry.materials) {
                if (getExternalWgslToonShaderPathForMaterialImpl(this, materialEntry.material)) {
                    return "WGSL-custom";
                }
                if (getWgslMaterialShaderPresetForMaterialImpl(this, materialEntry.material) !== MmdManager.DEFAULT_WGSL_MATERIAL_SHADER_PRESET) {
                    return "WGSL-custom";
                }
            }
        }

        return "WGSL-first";
    }

    getPhysicsBackendLabel(): PhysicsBackendLabel {
        return this.physicsController.getBackendLabel();
    }

    getPhysicsEvaluationTypeLabel(): PhysicsEvaluationTypeLabel {
        return this.physicsController.getEvaluationTypeLabel();
    }

    private addRuntimeDiagnostic(message: string): void {
        this.runtimeDiagnostics.add(message);
    }

    async capturePngRgbaData(
        precisionOrOptions: number | { precision?: number; width?: number; height?: number } = 1
    ): Promise<{ width: number; height: number; rgbaData: Uint8Array } | null> {
        try {
            const options = typeof precisionOrOptions === "number"
                ? { precision: precisionOrOptions }
                : (precisionOrOptions ?? {});
            const clampedPrecision = Math.max(0.25, Math.min(4, options.precision ?? 1));
            const requestedWidth = options.width;
            const requestedHeight = options.height;
            const width = typeof requestedWidth === "number" && Number.isFinite(requestedWidth)
                ? Math.max(320, Math.min(8192, Math.floor(requestedWidth)))
                : Math.max(320, Math.min(8192, Math.floor(this.engine.getRenderWidth(true) * clampedPrecision)));
            const height = typeof requestedHeight === "number" && Number.isFinite(requestedHeight)
                ? Math.max(180, Math.min(8192, Math.floor(requestedHeight)))
                : Math.max(180, Math.min(8192, Math.floor(this.engine.getRenderHeight(true) * clampedPrecision)));

            this.prepareExportRenderSurface(width, height);
            const postEffectReady = await this.waitForPostEffectBackendReadyForCapture();
            if (!postEffectReady) {
                throw new Error("Post effects were not ready for PNG capture");
            }
            this.renderOnceForCapture(0);
            const renderedFrame = await this.readExportRenderFrameAsync();
            return {
                width: renderedFrame.width,
                height: renderedFrame.height,
                rgbaData: renderedFrame.pixels,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to capture PNG RGBA:", message);
            this.onError?.(`PNG RGBA capture error: ${message}`);
            return null;
        } finally {
            this.releaseExportRenderSurface();
        }
    }
    get volume(): number {
        return this.audioPlayer?.volume ?? 1;
    }
    set volume(value: number) {
        if (this.audioPlayer) {
            this.audioPlayer.volume = Math.max(0, Math.min(1, value));
        }
    }

    /** Whether audio is muted (playing silently) */
    get muted(): boolean {
        return this.audioPlayer?.muted ?? false;
    }
    async toggleMute(): Promise<void> {
        if (!this.audioPlayer) return;
        if (this.audioPlayer.muted) {
            await this.audioPlayer.unmute();
        } else {
            this.audioPlayer.mute();
        }
    }

    /** Post-process contrast (0.0=flat, 1.0=neutral, up to 3.0 for stronger effect) */
    get postEffectContrast(): number {
        return this.postEffectContrastValue;
    }
    set postEffectContrast(v: number) {
        this.postEffectContrastValue = Math.max(0, Math.min(3, v));
    }

    /** Gamma power for mid-tone correction (1.0 = neutral). */
    get postEffectGamma(): number {
        return this.postEffectGammaValue;
    }
    set postEffectGamma(v: number) {
        this.postEffectGammaValue = Math.max(0.25, Math.min(4, v));
    }

    /** Image-processing exposure scale (1.0 = neutral). */
    get postEffectExposure(): number {
        return this.postEffectExposureValue;
    }
    set postEffectExposure(v: number) {
        this.postEffectExposureValue = Math.max(0, Math.min(8, v));
        this.applyImageProcessingSettings();
    }

    /** Image-processing tone mapping enabled state. */
    get postEffectToneMappingEnabled(): boolean {
        return this.postEffectToneMappingEnabledValue;
    }
    set postEffectToneMappingEnabled(v: boolean) {
        this.postEffectToneMappingEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** Image-processing tone mapping operator type. */
    get postEffectToneMappingType(): number {
        return this.postEffectToneMappingTypeValue;
    }
    set postEffectToneMappingType(v: number) {
        const normalized = Math.floor(v);
        const allowed = new Set<number>([
            ImageProcessingConfiguration.TONEMAPPING_STANDARD,
            ImageProcessingConfiguration.TONEMAPPING_ACES,
            ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
        ]);
        this.postEffectToneMappingTypeValue = allowed.has(normalized)
            ? normalized
            : ImageProcessingConfiguration.TONEMAPPING_STANDARD;
        this.applyImageProcessingSettings();
    }

    /** Image-processing dithering enabled state. */
    get postEffectDitheringEnabled(): boolean {
        return this.postEffectDitheringEnabledValue;
    }
    set postEffectDitheringEnabled(v: boolean) {
        this.postEffectDitheringEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** Image-processing dithering intensity (0.0..1.0). */
    get postEffectDitheringIntensity(): number {
        return this.postEffectDitheringIntensityValue;
    }
    set postEffectDitheringIntensity(v: number) {
        this.postEffectDitheringIntensityValue = Math.max(0, Math.min(1, v));
        this.applyImageProcessingSettings();
    }

    /** Image-processing vignette enabled state. */
    get postEffectVignetteEnabled(): boolean {
        return this.postEffectVignetteEnabledValue;
    }
    set postEffectVignetteEnabled(v: boolean) {
        this.postEffectVignetteEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** Image-processing vignette weight (0.0..4.0). */
    get postEffectVignetteWeight(): number {
        return this.postEffectVignetteWeightValue;
    }
    set postEffectVignetteWeight(v: number) {
        this.postEffectVignetteWeightValue = Math.max(0, Math.min(4, v));
        this.applyImageProcessingSettings();
    }

    /** Default pipeline bloom enabled state for grouped bloom controls. */
    get postEffectBloomEnabled(): boolean {
        return this.postEffectBloomEnabledValue;
    }
    set postEffectBloomEnabled(v: boolean) {
        this.postEffectBloomEnabledValue = Boolean(v);
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline bloom weight (0.0..2.0, 0 = OFF). */
    get postEffectBloomWeight(): number {
        return this.postEffectBloomWeightValue;
    }
    set postEffectBloomWeight(v: number) {
        this.postEffectBloomWeightValue = Math.max(0, Math.min(2, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline bloom threshold (0.0..2.0). */
    get postEffectBloomThreshold(): number {
        return this.postEffectBloomThresholdValue;
    }
    set postEffectBloomThreshold(v: number) {
        this.postEffectBloomThresholdValue = Math.max(0, Math.min(2, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline bloom kernel (1..256). */
    get postEffectBloomKernel(): number {
        return this.postEffectBloomKernelValue;
    }
    set postEffectBloomKernel(v: number) {
        this.postEffectBloomKernelValue = Math.max(1, Math.min(256, Math.round(v)));
        this.applyDefaultPipelinePostProcessSettings();
    }

    getPostEffectBloomColor(): { r: number; g: number; b: number } {
        return {
            r: this.postEffectBloomColorValue.r,
            g: this.postEffectBloomColorValue.g,
            b: this.postEffectBloomColorValue.b,
        };
    }

    setPostEffectBloomColor(r: number, g: number, b: number): void {
        this.postEffectBloomColorValue = new Color3(
            Math.max(0, Math.min(1, Number.isFinite(r) ? r : 1)),
            Math.max(0, Math.min(1, Number.isFinite(g) ? g : 0.48)),
            Math.max(0, Math.min(1, Number.isFinite(b) ? b : 0.16)),
        );
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline chromatic aberration amount (0..200, 0 = OFF). */
    get postEffectChromaticAberration(): number {
        return this.postEffectChromaticAberrationValue;
    }
    set postEffectChromaticAberration(v: number) {
        this.postEffectChromaticAberrationValue = Math.max(0, Math.min(200, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline grain intensity (0..100, 0 = OFF). */
    get postEffectGrainIntensity(): number {
        return this.postEffectGrainIntensityValue;
    }
    set postEffectGrainIntensity(v: number) {
        this.postEffectGrainIntensityValue = Math.max(0, Math.min(100, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Default pipeline sharpen edge amount (0.0..4.0, 0 = OFF). */
    get postEffectSharpenEdge(): number {
        return this.postEffectSharpenEdgeValue;
    }
    set postEffectSharpenEdge(v: number) {
        this.postEffectSharpenEdgeValue = Math.max(0, Math.min(4, v));
        this.applyDefaultPipelinePostProcessSettings();
    }
    /** SSAO2 enabled state. */
    get postEffectSsaoEnabled(): boolean {
        return this.postEffectSsaoEnabledValue;
    }
    set postEffectSsaoEnabled(v: boolean) {
        this.postEffectSsaoEnabledValue = Boolean(v);
        if (this.postEffectSsaoEnabledValue && this.modelEdgeWidthValue > 0.0001) {
            this.modelEdgeWidthValue = 0;
            this.applyModelEdgeToAllModels();
        }
        this.applySsaoSettings();
    }
    /** SSAO2 intensity (0.0..1.0). */
    get postEffectSsaoStrength(): number {
        return this.postEffectSsaoStrengthValue;
    }
    set postEffectSsaoStrength(v: number) {
        this.postEffectSsaoStrengthValue = Math.max(0, Math.min(1, v));
        this.applySsaoSettings();
    }
    /** SSAO2 sampling radius (0.01..5.0). */
    get postEffectSsaoRadius(): number {
        return this.postEffectSsaoRadiusValue;
    }
    set postEffectSsaoRadius(v: number) {
        this.postEffectSsaoRadiusValue = Math.max(0.01, Math.min(5, v));
        this.applySsaoSettings();
    }

    /** SSAO fade-out end distance in meters (4..200). */
    get postEffectSsaoFadeEnd(): number {
        return this.postEffectSsaoFadeEndValue;
    }
    set postEffectSsaoFadeEnd(v: number) {
        this.postEffectSsaoFadeEndValue = Math.max(4, Math.min(200, v));
        this.applySsaoSettings();
    }

    /** SSAO debug view state. */
    get postEffectSsaoDebugView(): boolean {
        return this.postEffectSsaoDebugViewValue;
    }
    set postEffectSsaoDebugView(v: boolean) {
        this.postEffectSsaoDebugViewValue = Boolean(v);
        this.applySsaoSettings();
    }

    get postEffectOffsetShadowEnabled(): boolean {
        return this.postEffectOffsetShadowEnabledValue;
    }
    set postEffectOffsetShadowEnabled(v: boolean) {
        this.postEffectOffsetShadowEnabledValue = Boolean(v);
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowStrength(): number {
        return this.postEffectOffsetShadowStrengthValue;
    }
    set postEffectOffsetShadowStrength(v: number) {
        this.postEffectOffsetShadowStrengthValue = Math.max(0, Math.min(2, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowOffsetX(): number {
        return this.postEffectOffsetShadowOffsetXValue;
    }
    set postEffectOffsetShadowOffsetX(v: number) {
        this.postEffectOffsetShadowOffsetXValue = Math.max(-64, Math.min(64, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowOffsetY(): number {
        return this.postEffectOffsetShadowOffsetYValue;
    }
    set postEffectOffsetShadowOffsetY(v: number) {
        this.postEffectOffsetShadowOffsetYValue = Math.max(-64, Math.min(64, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowDepthBias(): number {
        return this.postEffectOffsetShadowDepthBiasValue;
    }
    set postEffectOffsetShadowDepthBias(v: number) {
        this.postEffectOffsetShadowDepthBiasValue = Math.max(0, Math.min(1, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowMaxDepth(): number {
        return this.postEffectOffsetShadowMaxDepthValue;
    }
    set postEffectOffsetShadowMaxDepth(v: number) {
        this.postEffectOffsetShadowMaxDepthValue = Math.max(0.001, Math.min(4, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowDepthScale(): number {
        return this.postEffectOffsetShadowDepthScaleValue;
    }
    set postEffectOffsetShadowDepthScale(v: number) {
        this.postEffectOffsetShadowDepthScaleValue = Math.max(0, Math.min(1, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowThickness(): number {
        return this.postEffectOffsetShadowThicknessValue;
    }
    set postEffectOffsetShadowThickness(v: number) {
        this.postEffectOffsetShadowThicknessValue = Math.max(0.0001, Math.min(1, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowSoftness(): number {
        return this.postEffectOffsetShadowSoftnessValue;
    }
    set postEffectOffsetShadowSoftness(v: number) {
        this.postEffectOffsetShadowSoftnessValue = Math.max(0, Math.min(12, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowNormalInfluence(): number {
        return this.postEffectOffsetShadowNormalInfluenceValue;
    }
    set postEffectOffsetShadowNormalInfluence(v: number) {
        this.postEffectOffsetShadowNormalInfluenceValue = Math.max(0, Math.min(1, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetShadowDebugView(): boolean {
        return this.postEffectOffsetShadowDebugViewValue;
    }
    set postEffectOffsetShadowDebugView(v: boolean) {
        this.postEffectOffsetShadowDebugViewValue = Boolean(v);
        this.applyDefaultPipelinePostProcessSettings();
    }

    getPostEffectOffsetShadowColor(): { r: number; g: number; b: number } {
        return {
            r: this.postEffectOffsetShadowColorValue.r,
            g: this.postEffectOffsetShadowColorValue.g,
            b: this.postEffectOffsetShadowColorValue.b,
        };
    }

    setPostEffectOffsetShadowColor(r: number, g: number, b: number): void {
        this.postEffectOffsetShadowColorValue = new Color3(
            Math.max(0, Math.min(1, Number.isFinite(r) ? r : 0.29)),
            Math.max(0, Math.min(1, Number.isFinite(g) ? g : 0.21)),
            Math.max(0, Math.min(1, Number.isFinite(b) ? b : 0.16)),
        );
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightEnabled(): boolean {
        return this.postEffectOffsetHighlightEnabledValue;
    }
    set postEffectOffsetHighlightEnabled(v: boolean) {
        this.postEffectOffsetHighlightEnabledValue = Boolean(v);
        this.refreshFrameGraphPostEffectsBackendForResourcePlanChange();
    }

    get postEffectOffsetHighlightStrength(): number {
        return this.postEffectOffsetHighlightStrengthValue;
    }
    set postEffectOffsetHighlightStrength(v: number) {
        this.postEffectOffsetHighlightStrengthValue = Math.max(0, Math.min(2, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightOffsetX(): number {
        return this.postEffectOffsetHighlightOffsetXValue;
    }
    set postEffectOffsetHighlightOffsetX(v: number) {
        this.postEffectOffsetHighlightOffsetXValue = Math.max(-256, Math.min(256, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightOffsetY(): number {
        return this.postEffectOffsetHighlightOffsetYValue;
    }
    set postEffectOffsetHighlightOffsetY(v: number) {
        this.postEffectOffsetHighlightOffsetYValue = Math.max(-256, Math.min(256, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightDepthThreshold(): number {
        return this.postEffectOffsetHighlightDepthThresholdValue;
    }
    set postEffectOffsetHighlightDepthThreshold(v: number) {
        this.postEffectOffsetHighlightDepthThresholdValue = Math.max(0, Math.min(1, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightNormalThreshold(): number {
        return this.postEffectOffsetHighlightNormalThresholdValue;
    }
    set postEffectOffsetHighlightNormalThreshold(v: number) {
        this.postEffectOffsetHighlightNormalThresholdValue = Math.max(0, Math.min(1, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightThickness(): number {
        return this.postEffectOffsetHighlightThicknessValue;
    }
    set postEffectOffsetHighlightThickness(v: number) {
        this.postEffectOffsetHighlightThicknessValue = Math.max(0.0001, Math.min(3, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightSoftness(): number {
        return this.postEffectOffsetHighlightSoftnessValue;
    }
    set postEffectOffsetHighlightSoftness(v: number) {
        this.postEffectOffsetHighlightSoftnessValue = Math.max(0, Math.min(12, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightDepthScale(): number {
        return this.postEffectOffsetHighlightDepthScaleValue;
    }
    set postEffectOffsetHighlightDepthScale(v: number) {
        this.postEffectOffsetHighlightDepthScaleValue = Math.max(0, Math.min(1, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    get postEffectOffsetHighlightDebugView(): boolean {
        return this.postEffectOffsetHighlightDebugViewValue;
    }
    set postEffectOffsetHighlightDebugView(v: boolean) {
        this.postEffectOffsetHighlightDebugViewValue = Boolean(v);
        this.applyDefaultPipelinePostProcessSettings();
    }

    getPostEffectOffsetHighlightColor(): { r: number; g: number; b: number } {
        return {
            r: this.postEffectOffsetHighlightColorValue.r,
            g: this.postEffectOffsetHighlightColorValue.g,
            b: this.postEffectOffsetHighlightColorValue.b,
        };
    }

    setPostEffectOffsetHighlightColor(r: number, g: number, b: number): void {
        this.postEffectOffsetHighlightColorValue = new Color3(
            Math.max(0, Math.min(1, Number.isFinite(r) ? r : 1)),
            Math.max(0, Math.min(1, Number.isFinite(g) ? g : 1)),
            Math.max(0, Math.min(1, Number.isFinite(b) ? b : 1)),
        );
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Color curves enabled state. */
    get postEffectColorCurvesEnabled(): boolean {
        return this.postEffectColorCurvesEnabledValue;
    }
    set postEffectColorCurvesEnabled(v: boolean) {
        this.postEffectColorCurvesEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** Color curves hue (0..360). */
    get postEffectColorCurvesHue(): number {
        return this.postEffectColorCurvesHueValue;
    }
    set postEffectColorCurvesHue(v: number) {
        this.postEffectColorCurvesHueValue = Math.max(0, Math.min(360, v));
        this.applyImageProcessingSettings();
    }

    /** Color curves density (-100..100). */
    get postEffectColorCurvesDensity(): number {
        return this.postEffectColorCurvesDensityValue;
    }
    set postEffectColorCurvesDensity(v: number) {
        this.postEffectColorCurvesDensityValue = Math.max(-100, Math.min(100, v));
        this.applyImageProcessingSettings();
    }

    /** Color curves saturation (-100..100). */
    get postEffectColorCurvesSaturation(): number {
        return this.postEffectColorCurvesSaturationValue;
    }
    set postEffectColorCurvesSaturation(v: number) {
        this.postEffectColorCurvesSaturationValue = Math.max(-100, Math.min(100, v));
        this.applyImageProcessingSettings();
    }

    /** Color curves exposure (-100..100). */
    get postEffectColorCurvesExposure(): number {
        return this.postEffectColorCurvesExposureValue;
    }
    set postEffectColorCurvesExposure(v: number) {
        this.postEffectColorCurvesExposureValue = Math.max(-100, Math.min(100, v));
        this.applyImageProcessingSettings();
    }

    /** LuminousGlow enabled state. */
    get postEffectGlowEnabled(): boolean {
        return this.postEffectGlowEnabledValue;
    }
    set postEffectGlowEnabled(v: boolean) {
        const next = Boolean(v);
        const changed = this.postEffectGlowEnabledValue !== next;
        this.postEffectGlowEnabledValue = next;
        if (changed && this.refreshFrameGraphPostEffectsBackendForResourcePlanChange()) {
            return;
        }
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** LuminousGlow intensity (0..4). */
    get postEffectGlowIntensity(): number {
        return this.postEffectGlowIntensityValue;
    }
    set postEffectGlowIntensity(v: number) {
        this.postEffectGlowIntensityValue = Math.max(0, Math.min(4, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** LuminousGlow threshold (0..1.5). */
    get postEffectGlowThreshold(): number {
        return this.postEffectGlowThresholdValue;
    }
    set postEffectGlowThreshold(v: number) {
        this.postEffectGlowThresholdValue = Math.max(0, Math.min(1.5, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** LuminousGlow kernel size (1..256). */
    get postEffectGlowKernel(): number {
        return this.postEffectGlowKernelValue;
    }
    set postEffectGlowKernel(v: number) {
        this.postEffectGlowKernelValue = Math.max(1, Math.min(256, Math.round(v)));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Luminous glare ray count (0..12). */
    get postEffectGlowGlareCount(): number {
        return this.postEffectGlowGlareCountValue;
    }
    set postEffectGlowGlareCount(v: number) {
        this.postEffectGlowGlareCountValue = Math.max(0, Math.min(12, Math.round(v)));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Luminous glare ray length in pixels (0..256). */
    get postEffectGlowGlareLength(): number {
        return this.postEffectGlowGlareLengthValue;
    }
    set postEffectGlowGlareLength(v: number) {
        this.postEffectGlowGlareLengthValue = Math.max(0, Math.min(256, Math.round(v)));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Luminous glare base angle in degrees. */
    get postEffectGlowGlareAngle(): number {
        return this.postEffectGlowGlareAngleValue;
    }
    set postEffectGlowGlareAngle(v: number) {
        const value = Number(v);
        this.postEffectGlowGlareAngleValue = Number.isFinite(value)
            ? Math.max(-180, Math.min(180, value))
            : 0;
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** Luminous glare intensity multiplier (0..4). */
    get postEffectGlowGlarePower(): number {
        return this.postEffectGlowGlarePowerValue;
    }
    set postEffectGlowGlarePower(v: number) {
        this.postEffectGlowGlarePowerValue = Math.max(0, Math.min(4, v));
        this.applyDefaultPipelinePostProcessSettings();
    }

    /** LUT enabled state. */
    get postEffectLutEnabled(): boolean {
        return this.postEffectLutEnabledValue;
    }
    set postEffectLutEnabled(v: boolean) {
        this.postEffectLutEnabledValue = Boolean(v);
        this.applyImageProcessingSettings();
    }

    /** LUT intensity (0..2). */
    get postEffectLutIntensity(): number {
        return this.postEffectLutIntensityValue;
    }
    set postEffectLutIntensity(v: number) {
        this.postEffectLutIntensityValue = Math.max(0, Math.min(2, v));
        this.applyImageProcessingSettings();
    }

    /** LUT preset id. */
    get postEffectLutPreset(): string {
        return this.postEffectLutPresetValue;
    }
    set postEffectLutPreset(v: string) {
        const normalized = typeof v === "string" ? v.trim().toLowerCase() : "anime-soft";
        this.postEffectLutPresetValue = MmdManager.POST_EFFECT_LUT_PRESETS.some((preset) => preset.id === normalized)
            ? normalized
            : "anime-soft";
        this.applyImageProcessingSettings();
    }

    /** LUT source mode. */
    get postEffectLutSourceMode(): PostEffectLutSourceMode {
        return this.postEffectLutSourceModeValue;
    }
    set postEffectLutSourceMode(v: PostEffectLutSourceMode) {
        const normalized = typeof v === "string" ? v.trim().toLowerCase() : "builtin";
        this.postEffectLutSourceModeValue = normalized === "external-absolute" || normalized === "project-relative"
            ? normalized
            : "builtin";
        this.applyImageProcessingSettings();
    }

    /** External LUT source path. */
    get postEffectLutExternalPath(): string | null {
        return this.postEffectLutExternalPathValue;
    }

    /** Set external LUT source path/text. */
    public setPostEffectExternalLut(path: string | null, text: string | null, sourceFormat: "3dl" | "cube" | null = null): void {
        setPostEffectExternalLutImpl(this, path, text, sourceFormat);
    }

    /** Motion blur enabled state. */
    get postEffectMotionBlurEnabled(): boolean {
        return getPostEffectMotionBlurEnabledImpl(this);
    }
    set postEffectMotionBlurEnabled(v: boolean) {
        setPostEffectMotionBlurEnabledImpl(this, v);
    }

    /** Motion blur strength (0..10). */
    get postEffectMotionBlurStrength(): number {
        return getPostEffectMotionBlurStrengthImpl(this);
    }
    set postEffectMotionBlurStrength(v: number) {
        setPostEffectMotionBlurStrengthImpl(this, v);
    }

    /** Motion blur sample count (8..64). */
    get postEffectMotionBlurSamples(): number {
        return getPostEffectMotionBlurSamplesImpl(this);
    }
    set postEffectMotionBlurSamples(v: number) {
        setPostEffectMotionBlurSamplesImpl(this, v);
    }

    /** SSR enabled state. */
    get postEffectSsrEnabled(): boolean {
        return getPostEffectSsrEnabledImpl(this);
    }
    set postEffectSsrEnabled(v: boolean) {
        setPostEffectSsrEnabledImpl(this, v);
    }

    /** SSR reflection strength (0..2). */
    get postEffectSsrStrength(): number {
        return getPostEffectSsrStrengthImpl(this);
    }
    set postEffectSsrStrength(v: number) {
        setPostEffectSsrStrengthImpl(this, v);
    }

    /** SSR step size (1..8). */
    get postEffectSsrStep(): number {
        return getPostEffectSsrStepImpl(this);
    }
    set postEffectSsrStep(v: number) {
        setPostEffectSsrStepImpl(this, v);
    }

    /** Single-frame SSGI contribution strength (0..1). */
    get postEffectSsgiStrength(): number {
        return this.postEffectSsgiStrengthValue;
    }
    set postEffectSsgiStrength(v: number) {
        const value = Number(v);
        this.postEffectSsgiStrengthValue = Number.isFinite(value)
            ? Math.max(0, Math.min(1, value))
            : 0.3;
    }

    /** Single-frame SSGI sample radius in full-resolution pixels (1..256). */
    get postEffectSsgiSampleRadius(): number {
        return this.postEffectSsgiSampleRadiusValue;
    }
    set postEffectSsgiSampleRadius(v: number) {
        const value = Number(v);
        this.postEffectSsgiSampleRadiusValue = Number.isFinite(value)
            ? Math.max(1, Math.min(256, value))
            : 64;
    }

    /** Single-frame SSGI composite is fixed to Soft Light. */
    get postEffectSsgiBlendMode(): SsgiBlendMode {
        return "softLight";
    }
    set postEffectSsgiBlendMode(_v: SsgiBlendMode) {
        // Retain the project-host property while older saved mode values are ignored.
    }

    /** Volumetric light enabled state. */
    get postEffectVlsEnabled(): boolean {
        return getPostEffectVlsEnabledImpl(this);
    }
    set postEffectVlsEnabled(v: boolean) {
        setPostEffectVlsEnabledImpl(this, v);
    }

    /** Volumetric light exposure (0..2). */
    get postEffectVlsExposure(): number {
        return getPostEffectVlsExposureImpl(this);
    }
    set postEffectVlsExposure(v: number) {
        setPostEffectVlsExposureImpl(this, v);
    }

    /** Volumetric light decay (0..1). */
    get postEffectVlsDecay(): number {
        return getPostEffectVlsDecayImpl(this);
    }
    set postEffectVlsDecay(v: number) {
        setPostEffectVlsDecayImpl(this, v);
    }

    /** Volumetric light weight (0..1). */
    get postEffectVlsWeight(): number {
        return getPostEffectVlsWeightImpl(this);
    }
    set postEffectVlsWeight(v: number) {
        setPostEffectVlsWeightImpl(this, v);
    }

    /** Volumetric light density (0..2). */
    get postEffectVlsDensity(): number {
        return getPostEffectVlsDensityImpl(this);
    }
    set postEffectVlsDensity(v: number) {
        setPostEffectVlsDensityImpl(this, v);
    }

    /** Fog enabled state. */
    get postEffectFogEnabled(): boolean {
        return getPostEffectFogEnabledImpl(this);
    }
    set postEffectFogEnabled(v: boolean) {
        setPostEffectFogEnabledImpl(this, v);
    }

    /** Fog mode is fixed to Exp2. */
    get postEffectFogMode(): number {
        return getPostEffectFogModeImpl(this);
    }
    set postEffectFogMode(_v: number) {
        setPostEffectFogModeImpl(this, _v);
    }

    /** Fog start distance for linear mode. */
    get postEffectFogStart(): number {
        return getPostEffectFogStartImpl(this);
    }
    set postEffectFogStart(v: number) {
        setPostEffectFogStartImpl(this, v);
    }

    /** Fog end distance for linear mode. */
    get postEffectFogEnd(): number {
        return getPostEffectFogEndImpl(this);
    }
    set postEffectFogEnd(v: number) {
        setPostEffectFogEndImpl(this, v);
    }

    /** Fog density for exponential modes. */
    get postEffectFogDensity(): number {
        return getPostEffectFogDensityImpl(this);
    }
    set postEffectFogDensity(v: number) {
        setPostEffectFogDensityImpl(this, v);
    }

    get postEffectFogOpacity(): number {
        return getPostEffectFogOpacityImpl(this);
    }
    set postEffectFogOpacity(v: number) {
        setPostEffectFogOpacityImpl(this, v);
    }

    getPostEffectFogColor(): { r: number; g: number; b: number } {
        return getPostEffectFogColorImpl(this);
    }

    setPostEffectFogColor(r: number, g: number, b: number): void {
        setPostEffectFogColorImpl(this, r, g, b);
    }
    /** Post-process anti-aliasing enabled state. */
    get antialiasEnabled(): boolean {
        return getAntialiasEnabledImpl(this);
    }
    set antialiasEnabled(v: boolean) {
        setAntialiasEnabledImpl(this, v);
    }

    /** Editor-style depth of field enabled state. */
    get dofEnabled(): boolean {
        return getDofEnabledImpl(this);
    }
    set dofEnabled(v: boolean) {
        setDofEnabledImpl(this, v);
    }

    /** Editor-style depth of field blur quality (0=Low, 1=Medium, 2=High). */
    get dofBlurLevel(): number {
        return getDofBlurLevelImpl(this);
    }
    set dofBlurLevel(v: number) {
        setDofBlurLevelImpl(this, v);
    }

    /** DoF focus distance in scene units/1000 (mm). */
    get dofFocusDistanceMm(): number {
        return getDofFocusDistanceMmImpl(this);
    }
    set dofFocusDistanceMm(v: number) {
        setDofFocusDistanceMmImpl(this, v);
    }

    /** Whether focus distance follows camera target each frame. */
    get dofAutoFocusEnabled(): boolean {
        return getDofAutoFocusEnabledImpl(this);
    }
    /** In-focus radius used by auto-focus mode (meters). */
    get dofAutoFocusRangeMeters(): number {
        return getDofAutoFocusRangeMetersImpl(this);
    }
    /** Signed auto-focus offset from camera target in mm. Positive moves nearer, negative moves farther. */
    get dofAutoFocusNearOffsetMm(): number {
        return getDofAutoFocusNearOffsetMmImpl(this);
    }
    set dofAutoFocusNearOffsetMm(v: number) {
        setDofAutoFocusNearOffsetMmImpl(this, v);
    }
    /** Foreground blur suppression scale for auto-focus near side. */
    get dofNearSuppressionScale(): number {
        return getDofNearSuppressionScaleImpl(this);
    }
    set dofNearSuppressionScale(v: number) {
        setDofNearSuppressionScaleImpl(this, v);
    }
    /** Current effective F-stop after auto-focus compensation. */
    get dofEffectiveFStop(): number {
        return getDofEffectiveFStopImpl(this);
    }

    /** DoF F-stop. Smaller value means stronger blur. */
    get dofFStop(): number {
        return getDofFStopImpl(this);
    }
    set dofFStop(v: number) {
        setDofFStopImpl(this, v);
    }



    /** Whether lens-blur highlights are enabled. */
    get dofLensBlurEnabled(): boolean {
        return getDofLensBlurEnabledImpl(this);
    }
    set dofLensBlurEnabled(v: boolean) {
        setDofLensBlurEnabledImpl(this, v);
    }

    /** Additional lens-blur strength for bright highlights (0.0..1.0). */
    get dofLensBlurStrength(): number {
        return getDofLensBlurStrengthImpl(this);
    }
    set dofLensBlurStrength(v: number) {
        setDofLensBlurStrengthImpl(this, v);
    }

    /** Lens edge blur strength (0.0..3.0). */
    get dofLensEdgeBlur(): number {
        return getDofLensEdgeBlurImpl(this);
    }
    set dofLensEdgeBlur(v: number) {
        setDofLensEdgeBlurImpl(this, v);
    }

    /** Lens distortion strength (-1.0..1.0). */
    get dofLensDistortion(): number {
        return getDofLensDistortionImpl(this);
    }
    set dofLensDistortion(v: number) {
        setDofLensDistortionImpl(this, v);
    }
    get dofLensDistortionLinkedToCameraFov(): boolean {
        return getDofLensDistortionLinkedToCameraFovImpl(this);
    }
    /** Distortion influence scale for FoV-linked distortion (0.0..1.0). */
    get dofLensDistortionInfluence(): number {
        return getDofLensDistortionInfluenceImpl(this);
    }
    set dofLensDistortionInfluence(v: number) {
        setDofLensDistortionInfluenceImpl(this, v);
    }
    /** DoF lens size in scene units/1000 (mm). */
    get dofLensSize(): number {
        return getDofLensSizeImpl(this);
    }
    set dofLensSize(v: number) {
        setDofLensSizeImpl(this, v);
    }

    /** DoF focal length in scene units/1000 (mm). */
    get dofFocalLength(): number {
        return getDofFocalLengthImpl(this);
    }
    set dofFocalLength(v: number) {
        setDofFocalLengthImpl(this, v);
    }
    /** Whether camera-distance-linked DoF focal length mapping is inverted. */
    get dofFocalLengthDistanceInverted(): boolean {
        return getDofFocalLengthDistanceInvertedImpl(this);
    }
    set dofFocalLengthDistanceInverted(v: boolean) {
        setDofFocalLengthDistanceInvertedImpl(this, v);
    }
    /** Whether DoF focal length is linked to camera FoV. */
    /** @deprecated Use dofFocalLengthLinkedToCameraFov. */
    get dofFocalLengthLinkedToCameraDistance(): boolean {
        return getDofFocalLengthLinkedToCameraDistanceImpl(this);
    }
    get dofFocalLengthLinkedToCameraFov(): boolean {
        return getDofFocalLengthLinkedToCameraFovImpl(this);
    }
    /** Far background depth-of-field strength (0.0..1.0). */
    get postEffectFarDofStrength(): number {
        return getPostEffectFarDofStrengthImpl(this);
    }
    set postEffectFarDofStrength(v: number) {
        setPostEffectFarDofStrengthImpl(this, v);
    }

    /** Model outline scale. 1.0 keeps PMX edge color/visibility/width as-is. */
    get modelEdgeWidth(): number {
        return this.modelEdgeWidthValue;
    }
    set modelEdgeWidth(v: number) {
        this.modelEdgeWidthValue = Math.max(0, Math.min(2, v));
        if (this.modelEdgeWidthValue > 0.0001 && this.isFrameGraphPostEffectActive("ssao")) {
            this.frameGraphPostEffectStackEnabledValue.set("ssao", false);
            this.refreshFrameGraphPostEffectsBackendForStackStateChange();
        }
        this.applyModelEdgeToAllModels();
    }

    get modelEdgeColorOverrideEnabled(): boolean {
        return this.modelEdgeColorOverrideEnabledValue;
    }
    set modelEdgeColorOverrideEnabled(enabled: boolean) {
        this.modelEdgeColorOverrideEnabledValue = Boolean(enabled);
        this.applyModelEdgeToAllModels();
    }

    getModelEdgeColor(): { r: number; g: number; b: number } {
        return { ...this.modelEdgeColorValue };
    }

    setModelEdgeColor(r: number, g: number, b: number): void {
        this.modelEdgeColorValue = {
            r: Math.max(0, Math.min(1, Number.isFinite(r) ? r : 0)),
            g: Math.max(0, Math.min(1, Number.isFinite(g) ? g : 0)),
            b: Math.max(0, Math.min(1, Number.isFinite(b) ? b : 0)),
        };
        this.applyModelEdgeToAllModels();
    }

    /** Light color temperature in Kelvin (1000..20000). */
    get lightColorTemperature(): number {
        return this.lightColorTemperatureKelvin;
    }
    set lightColorTemperature(kelvin: number) {
        this.lightColorTemperatureKelvin = Math.max(1000, Math.min(20000, Math.round(kelvin)));
        this.applyLightColorTemperature();
    }

    get lightIntensity(): number { return this.dirLight.intensity; }
    set lightIntensity(v: number) {
        setLightIntensityImpl(this, v);
        // In PBR, HDRI remains visible in shadowed areas. Reapply its effective
        // level so the existing illuminance slider behaves as a master light
        // control instead of changing only the directional key light.
        this.applyCurrentEnvironmentLightingIntensity();
    }

    getLightColor(): { r: number; g: number; b: number } {
        return getLightColorImpl(this);
    }

    setLightColor(r: number, g: number, b: number): void {
        return setLightColorImpl(this, r, g, b);
    }

    get lightFlatStrength(): number {
        return this.lightFlatStrengthValue;
    }

    set lightFlatStrength(v: number) {
        this.lightFlatStrengthValue = Math.max(0, Math.min(0.1, v));
        this.applyToonShadowInfluenceToAllModels();
    }

    get lightFlatColorInfluence(): number {
        return this.lightFlatColorInfluenceValue;
    }

    set lightFlatColorInfluence(v: number) {
        this.lightFlatColorInfluenceValue = this.clampColor01(v);
        MmdManager.toonFlatLightColorInfluence = this.lightFlatColorInfluenceValue;
        this.applyToonShadowInfluenceToAllModels();
    }

    getShadowColor(): { r: number; g: number; b: number } {
        return getShadowColorImpl(this);
    }

    setShadowColor(r: number, g: number, b: number): void {
        return setShadowColorImpl(this, r, g, b);
    }

    get ambientIntensity(): number { return this.hemiLight.intensity; }
    set ambientIntensity(v: number) { this.hemiLight.intensity = Math.max(0, Math.min(2, v)); }

    get toonShadowInfluence(): number {
        return this.toonShadowInfluenceValue;
    }

    set toonShadowInfluence(v: number) {
        this.toonShadowInfluenceValue = this.clampColor01(v);
        this.applyToonShadowInfluenceToAllModels();
    }

    /** Babylon shadow darkness is a visibility floor: 0.0 keeps the darkest shadow, 1.0 removes darkening. */
    get shadowDarkness(): number { return this.shadowDarknessValue; }
    set shadowDarkness(v: number) {
        this.shadowDarknessValue = Math.max(0, Math.min(1, v));
        if (this.shadowEnabled) {
            this.shadowGenerator.darkness = this.shadowDarknessValue;
        }
    }

    get shadowFrustumSize(): number { return this.shadowFrustumSizeValue; }
    set shadowFrustumSize(v: number) {
        this.shadowFrustumSizeValue = this.clampShadowFrustumSize(v);
        this.applyShadowFrustumSize();
        if (this.dirLight) {
            const direction = this.getSerializedLightDirection();
            this.setLightDirection(direction.x, direction.y, direction.z);
        }
    }

    get shadowMaxZ(): number {
        return getShadowMaxZImpl(this);
    }
    set shadowMaxZ(v: number) {
        setShadowMaxZImpl(this, v);
    }

    get shadowBias(): number {
        return getShadowBiasImpl(this);
    }
    set shadowBias(v: number) {
        setShadowBiasImpl(this, v);
    }

    get shadowNormalBias(): number {
        return getShadowNormalBiasImpl(this);
    }
    set shadowNormalBias(v: number) {
        setShadowNormalBiasImpl(this, v);
    }

    get shadowFilteringQuality(): number {
        return this.shadowFilteringQualityValue;
    }
    set shadowFilteringQuality(v: number) {
        const fallback = ShadowGenerator.QUALITY_HIGH;
        const rounded = Math.round(Number.isFinite(v) ? v : fallback);
        this.shadowFilteringQualityValue = Math.max(ShadowGenerator.QUALITY_HIGH, Math.min(ShadowGenerator.QUALITY_LOW, rounded));
        if (this.shadowGenerator) {
            this.shadowGenerator.filteringQuality = this.shadowGenerator instanceof CascadedShadowGenerator
                ? ShadowGenerator.QUALITY_HIGH
                : this.shadowFilteringQualityValue;
            this.engine.releaseEffects();
        }
    }

    get shadowBlurKernel(): number {
        return getShadowBlurKernelImpl(this);
    }
    set shadowBlurKernel(v: number) {
        setShadowBlurKernelImpl(this, v);
    }

    get shadowBlurScale(): number {
        return getShadowBlurScaleImpl(this);
    }
    set shadowBlurScale(v: number) {
        setShadowBlurScaleImpl(this, v);
    }

    get shadowBlurBoxOffset(): number {
        return getShadowBlurBoxOffsetImpl(this);
    }
    set shadowBlurBoxOffset(v: number) {
        setShadowBlurBoxOffsetImpl(this, v);
    }

    get shadowPenumbraEnabled(): boolean {
        return getShadowPenumbraEnabledImpl(this);
    }
    set shadowPenumbraEnabled(v: boolean) {
        setShadowPenumbraEnabledImpl(this, v);
    }

    get shadowPenumbraSize(): number {
        return getShadowPenumbraSizeImpl(this);
    }
    set shadowPenumbraSize(v: number) {
        setShadowPenumbraSizeImpl(this, v);
    }

    get transparentShadowEnabled(): boolean {
        return getTransparentShadowEnabledImpl(this);
    }
    set transparentShadowEnabled(v: boolean) {
        setTransparentShadowEnabledImpl(this, v);
    }

    get softTransparentShadowEnabled(): boolean {
        return this.softTransparentShadowEnabledValue;
    }
    set softTransparentShadowEnabled(v: boolean) {
        this.softTransparentShadowEnabledValue = Boolean(v);
        setTransparentShadowEnabledImpl(this, this.transparentShadowEnabledValue);
    }

    get iblShadowsEnabled(): boolean {
        return this.iblShadowsEnabledValue;
    }
    set iblShadowsEnabled(v: boolean) {
        this.setIblShadowsEnabled(v);
    }

    getShadowEnabled(): boolean {
        return getShadowEnabledImpl(this);
    }
    setShadowEnabled(enabled: boolean): void {
        setShadowEnabledImpl(this, enabled);
        this.applyShadowCasterStateToAllModels();
    }

    /** Shadow edge softness for contact hardening (0.005..0.12) */
    get shadowEdgeSoftness(): number {
        return this.getEffectiveShadowEdgeSoftness();
    }
    set shadowEdgeSoftness(v: number) {
        const clamped = this.clampShadowEdgeSoftness(v);
        this.selfShadowEdgeSoftnessValue = clamped;
        this.occlusionShadowEdgeSoftnessValue = clamped;
        this.applyShadowEdgeSoftness();
    }

    get selfShadowEdgeSoftness(): number {
        return this.selfShadowEdgeSoftnessValue;
    }
    set selfShadowEdgeSoftness(v: number) {
        this.selfShadowEdgeSoftnessValue = this.clampShadowEdgeSoftness(v);
        this.applyShadowEdgeSoftness();
    }

    get occlusionShadowEdgeSoftness(): number {
        return this.occlusionShadowEdgeSoftnessValue;
    }
    set occlusionShadowEdgeSoftness(v: number) {
        this.occlusionShadowEdgeSoftnessValue = this.clampShadowEdgeSoftness(v);
        this.applyShadowEdgeSoftness();
    }

    private clampShadowEdgeSoftness(v: number): number {
        return Math.max(0.005, Math.min(0.12, v));
    }

    private clampShadowFrustumSize(v: number): number {
        return Math.max(120, Math.min(30000, v));
    }

    private getEffectiveShadowEdgeSoftness(): number {
        return (this.selfShadowEdgeSoftnessValue + this.occlusionShadowEdgeSoftnessValue) * 0.5;
    }

    applyShadowFrustumSize(): void {
        return applyShadowFrustumSizeImpl(this);
    }

    applyShadowEdgeSoftness(): void {
        return applyShadowEdgeSoftnessImpl(this);
    }

    /** Set directional light direction from editor XYZ vector. */
    setLightDirection(x: number, y: number, z: number): void {
        return setLightDirectionImpl(this, x, y, z);
    }

    /** Current normalized directional light vector. */
    getLightDirection(): Vector3 {
        return getLightDirectionImpl(this);
    }

    /** Current editor light vector before normalization. */
    getSerializedLightDirection(): Vector3 {
        return getSerializedLightDirectionImpl(this);
    }

    applyLightColorTemperature(): void {
        return applyLightColorTemperatureImpl(this);
    }

    private clampColor01(v: number): number {
        if (!Number.isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
    }

    private clampLightColorScale(v: number): number {
        if (!Number.isFinite(v)) return 1;
        return Math.max(0, Math.min(2, v));
    }

    private kelvinToColor(kelvin: number): Color3 {
        const temp = Math.max(10, Math.min(200, kelvin / 100));
        let red: number;
        let green: number;
        let blue: number;

        if (temp <= 66) {
            red = 255;
            green = 99.4708025861 * Math.log(temp) - 161.1195681661;
            blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
        } else {
            red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
            green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
            blue = 255;
        }

        const clamp01 = (v: number) => Math.max(0, Math.min(1, v / 255));
        return new Color3(clamp01(red), clamp01(green), clamp01(blue));
    }

    private initializeDofPipeline(): void {
        try {
            if (this.postEffectBackend === "frameGraph") {
                this.disposeClassicDofPipelineResources();
                this.postEffectFarDofStrengthValue = 0;
                return;
            }
            this.setupEditorDofPipeline();
            if (this.farDofEnabled) {
                this.setupFarDofPostProcess();
            } else {
                this.postEffectFarDofStrengthValue = 0;
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`DoF pipeline initialization failed on ${this.getEngineType()}. DoF features were disabled. Reason: ${message}`);
            this.addRuntimeDiagnostic(`DoF disabled on ${this.getEngineType()}.`);

            this.dofEnabledValue = false;
            this.postEffectFarDofStrengthValue = 0;

            if (this.dofPostProcess) {
                this.dofPostProcess.dispose(this.camera);
                this.dofPostProcess = null;
            }
            if (this.finalAntialiasPostProcess) {
                this.finalAntialiasPostProcess.dispose(this.camera);
                this.finalAntialiasPostProcess = null;
            }
            if (this.finalLensDistortionPostProcess) {
                this.finalLensDistortionPostProcess.dispose(this.camera);
                this.finalLensDistortionPostProcess = null;
            }
            if (this.lensRenderingPipeline) {
                this.lensRenderingPipeline.dispose(false);
                this.lensRenderingPipeline = null;
            }
            if (this.ssaoRenderingPipeline) {
                this.ssaoRenderingPipeline.dispose(true);
                this.ssaoRenderingPipeline = null;
            }
            if (this.ssaoPostProcess) {
                this.ssaoPostProcess.dispose(this.camera);
                this.ssaoPostProcess = null;
            }
            if (this.ssrRenderingPipeline) {
                this.ssrRenderingPipeline.dispose(false);
                this.ssrRenderingPipeline = null;
            }
            this.disablePrePassRendererIfSupported();
            if (this.motionBlurPostProcess) {
                this.motionBlurPostProcess.dispose(this.camera);
                this.motionBlurPostProcess = null;
            }
            if (this.standaloneBloomEffect) {
                this.standaloneBloomEffect.disposeEffects(this.camera);
                this.standaloneBloomEffect = null;
            }
            if (this.luminousGlowLayer) {
                this.luminousGlowLayer.dispose();
                this.luminousGlowLayer = null;
            }
            if (this.luminousGlowCoreLayer) {
                this.luminousGlowCoreLayer.dispose();
                this.luminousGlowCoreLayer = null;
            }
            if (this.standaloneLensBlurPostProcess) {
                this.standaloneLensBlurPostProcess.dispose(this.camera);
                this.standaloneLensBlurPostProcess = null;
            }
            if (this.standaloneEdgeBlurPostProcess) {
                this.standaloneEdgeBlurPostProcess.dispose(this.camera);
                this.standaloneEdgeBlurPostProcess = null;
            }
            if (this.volumetricLightPostProcess) {
                this.volumetricLightPostProcess.dispose(this.camera);
                this.volumetricLightPostProcess = null;
            }
            if (this.originFogPostProcess) {
                this.originFogPostProcess.dispose(this.camera);
                this.originFogPostProcess = null;
            }
            if (this.defaultRenderingPipeline) {
                this.defaultRenderingPipeline.dispose();
                this.defaultRenderingPipeline = null;
            }
            if (this.depthRenderer) {
                this.depthRenderer.dispose();
                this.depthRenderer = null;
                MmdManager.toonContactAoDepthRenderer = null;
            }
            if (this.ssaoDepthRenderer) {
                this.disposeSsaoDepthRenderer();
            }
            if (MmdManager.toonContactAoFallbackTexture) {
                MmdManager.toonContactAoFallbackTexture.dispose();
                MmdManager.toonContactAoFallbackTexture = null;
            }
        }
    }

    private disposeClassicDofPipelineResources(): void {
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.dispose();
            this.defaultRenderingPipeline = null;
        }
        if (this.dofPostProcess) {
            this.dofPostProcess.dispose(this.camera);
            this.dofPostProcess = null;
        }
        if (this.finalAntialiasPostProcess) {
            this.finalAntialiasPostProcess.dispose(this.camera);
            this.finalAntialiasPostProcess = null;
        }
        if (this.finalLensDistortionPostProcess) {
            this.finalLensDistortionPostProcess.dispose(this.camera);
            this.finalLensDistortionPostProcess = null;
        }
        if (this.lensRenderingPipeline) {
            this.lensRenderingPipeline.dispose(false);
            this.lensRenderingPipeline = null;
        }
        if (this.standaloneLensBlurPostProcess) {
            this.standaloneLensBlurPostProcess.dispose(this.camera);
            this.standaloneLensBlurPostProcess = null;
        }
        if (this.standaloneEdgeBlurPostProcess) {
            this.standaloneEdgeBlurPostProcess.dispose(this.camera);
            this.standaloneEdgeBlurPostProcess = null;
        }
    }

    private setupColorCorrectionPostProcess(): void {
        if (this.postEffectBackend === "frameGraph") {
            return;
        }
        const shaderKey = "mmdColorCorrectionFragmentShader";
        if (!Effect.ShadersStore[shaderKey]) {
            Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform float contrast;
                uniform float gammaPower;

                void main(void) {
                    vec4 color = texture2D(textureSampler, vUV);
                    vec3 contrasted = ((color.rgb - vec3(0.5)) * contrast) + vec3(0.5);
                    vec3 corrected = pow(max(contrasted, vec3(0.0)), vec3(gammaPower));
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
                    var contrasted: vec3f = ((color.rgb - vec3f(0.5)) * uniforms.contrast) + vec3f(0.5);
                    let safeGamma: f32 = max(uniforms.gammaPower, 0.0001);
                    let corrected: vec3f = pow(max(contrasted, vec3f(0.0)), vec3f(safeGamma));
                    fragmentOutputs.color = vec4f(corrected, color.a);
                }
            `;
        }

        this.colorCorrectionPostProcess = new PostProcess(
            "colorCorrection",
            "mmdColorCorrection",
            {
                uniforms: ["contrast", "gammaPower"],
                size: 1.0,
                camera: this.camera,
                samplingMode: Texture.BILINEAR_SAMPLINGMODE,
                engine: this.engine,
                reusable: false,
                shaderLanguage: this.getPostProcessShaderLanguage(),
            },
        );
        this.colorCorrectionPostProcess.onApplyObservable.add((effect) => {
            effect.setFloat("contrast", this.postEffectContrastValue);
            effect.setFloat("gammaPower", this.postEffectGammaValue);
        });
    }

    private setupEditorDofPipeline(): void {
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.dispose();
            this.defaultRenderingPipeline = null;
        }
        if (this.lensRenderingPipeline) {
            this.lensRenderingPipeline.dispose(false);
            this.lensRenderingPipeline = null;
        }
        if (this.ssaoRenderingPipeline) {
            this.ssaoRenderingPipeline.dispose(true);
            this.ssaoRenderingPipeline = null;
        }
        if (this.ssaoPostProcess) {
            this.ssaoPostProcess.dispose(this.camera);
            this.ssaoPostProcess = null;
        }
        if (this.ssrRenderingPipeline) {
            this.ssrRenderingPipeline.dispose(false);
            this.ssrRenderingPipeline = null;
        }
        this.disablePrePassRendererIfSupported();
        if (this.motionBlurPostProcess) {
            this.motionBlurPostProcess.dispose(this.camera);
            this.motionBlurPostProcess = null;
        }
        if (this.standaloneBloomEffect) {
            this.standaloneBloomEffect.disposeEffects(this.camera);
            this.standaloneBloomEffect = null;
        }
        if (this.luminousGlowLayer) {
            this.luminousGlowLayer.dispose();
            this.luminousGlowLayer = null;
        }
        if (this.luminousGlowCoreLayer) {
            this.luminousGlowCoreLayer.dispose();
            this.luminousGlowCoreLayer = null;
        }
        if (this.standaloneLensBlurPostProcess) {
            this.standaloneLensBlurPostProcess.dispose(this.camera);
            this.standaloneLensBlurPostProcess = null;
        }
        if (this.standaloneEdgeBlurPostProcess) {
            this.standaloneEdgeBlurPostProcess.dispose(this.camera);
            this.standaloneEdgeBlurPostProcess = null;
        }
        if (this.volumetricLightPostProcess) {
            this.volumetricLightPostProcess.dispose(this.camera);
            this.volumetricLightPostProcess = null;
        }
        if (this.originFogPostProcess) {
            this.originFogPostProcess.dispose(this.camera);
            this.originFogPostProcess = null;
        }

        this.defaultRenderingPipeline = new DefaultRenderingPipeline(
            "DefaultRenderingPipeline",
            false,
            this.scene,
            [this.camera]
        );

        this.defaultRenderingPipeline.samples = 4;
        this.defaultRenderingPipeline.fxaaEnabled = false;
        this.defaultRenderingPipeline.glowLayerEnabled = false;
        this.applyImageProcessingSettings();
        this.applyDefaultPipelinePostProcessSettings();
        this.applySsaoSettings();
        this.applySsrSettings();
        this.applyFogSettings();

        this.configureDofDepthRenderer();
        this.setupOriginFogPostProcess();
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
        }
        this.setupLensHighlightsPipeline();
        this.defaultRenderingPipeline.depthOfFieldBlurLevel = this.dofBlurLevelValue;
        this.applyEditorDofSettings();
        this.setupFinalLensDistortionPostProcess();
        this.applyAntialiasSettings();
        this.applyVolumetricLightSettings();
        this.applyMotionBlurSettings();
        this.enforceFinalPostProcessOrder();
    }

        private isImageProcessingEffectsEnabled(): boolean {
        return isImageProcessingEffectsEnabledImpl(this);
    }

        private applyImageProcessingSettings(): void {
        return applyImageProcessingSettingsImpl(this);
    }

        private isLutSourceReady(): boolean {
        return isLutSourceReadyImpl(this);
    }

        private applyLutSettings(): void {
        return applyLutSettingsImpl(this);
    }

        private getOrCreateLutPresetBlobUrl(presetId: string): string {
        return getOrCreateLutPresetBlobUrlImpl(this, presetId);
    }

        private getOrCreateExternalLutBlobUrl(): string {
        return getOrCreateExternalLutBlobUrlImpl(this);
    }

        private applyDefaultPipelinePostProcessSettings(): void {
        return applyDefaultPipelinePostProcessSettingsImpl(this);
    }

        private syncShaderContactAoState(): void {
        return syncShaderContactAoStateImpl(this);
    }

        private applySsaoSettings(): void {
        return applySsaoSettingsImpl(this);
    }

        private ensureSsaoFallbackPostProcess(initialDepthMap?: Texture | null): void {
        return ensureSsaoFallbackPostProcessImpl(this, initialDepthMap);
    }

        private shouldUseToonTintedSsaoComposite(): boolean {
        return shouldUseToonTintedSsaoCompositeImpl(this);
    }

        private getSsaoPostProcessScale(): number {
        return getSsaoPostProcessScaleImpl(this);
    }

        private applySsrSettings(): void {
        return applySsrSettingsImpl(this);
    }

        private applyMotionBlurSettings(): void {
        return applyMotionBlurSettingsImpl(this);
    }

    

        private applyVolumetricLightSettings(): void {
        return applyVolumetricLightSettingsImpl(this);
    }

        private ensureSimpleSsaoShader(): void {
        return ensureSimpleSsaoShaderImpl();
    }
    private ensureSimpleMotionBlurShader(): void {
        const shaderKey = "mmdSimpleMotionBlurFragmentShader";
        if (!Effect.ShadersStore[shaderKey]) {
            Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform vec2 blurDirection;
                uniform float blurAmount;

                vec4 sampleClamped(vec2 uv) {
                    return texture2D(textureSampler, clamp(uv, vec2(0.0), vec2(1.0)));
                }

                void main(void) {
                    float dirLen = length(blurDirection);
                    if (blurAmount < 0.00001 || dirLen < 0.00001) {
                        gl_FragColor = texture2D(textureSampler, vUV);
                        return;
                    }

                    vec2 dir = normalize(blurDirection) * blurAmount;
                    vec4 color = sampleClamped(vUV) * 0.28;
                    color += sampleClamped(vUV + dir * 0.25) * 0.18;
                    color += sampleClamped(vUV - dir * 0.25) * 0.18;
                    color += sampleClamped(vUV + dir * 0.5) * 0.14;
                    color += sampleClamped(vUV - dir * 0.5) * 0.14;
                    color += sampleClamped(vUV + dir * 0.9) * 0.04;
                    color += sampleClamped(vUV - dir * 0.9) * 0.04;
                    gl_FragColor = color;
                }
            `;
        }

        if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
            ShaderStore.ShadersStoreWGSL[shaderKey] = `
                varying vUV: vec2f;
                var textureSamplerSampler: sampler;
                var textureSampler: texture_2d<f32>;
                uniform blurDirection: vec2f;
                uniform blurAmount: f32;

                fn sampleClamped(uv: vec2f) -> vec4f {
                    let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
                    return textureSample(textureSampler, textureSamplerSampler, clampedUv);
                }

                #define CUSTOM_FRAGMENT_DEFINITIONS
                @fragment
                fn main(input: FragmentInputs)->FragmentOutputs {
                    let dirLen = length(uniforms.blurDirection);
                    if (uniforms.blurAmount < 0.00001 || dirLen < 0.00001) {
                        fragmentOutputs.color = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                        return fragmentOutputs;
                    }

                    let dir = normalize(uniforms.blurDirection) * uniforms.blurAmount;
                    var color = sampleClamped(input.vUV) * 0.28;
                    color += sampleClamped(input.vUV + dir * 0.25) * 0.18;
                    color += sampleClamped(input.vUV - dir * 0.25) * 0.18;
                    color += sampleClamped(input.vUV + dir * 0.5) * 0.14;
                    color += sampleClamped(input.vUV - dir * 0.5) * 0.14;
                    color += sampleClamped(input.vUV + dir * 0.9) * 0.04;
                    color += sampleClamped(input.vUV - dir * 0.9) * 0.04;
                    fragmentOutputs.color = color;
                }
            `;
        }
    }

        private updateSimpleMotionBlurState(deltaMs: number): void {
        return updateSimpleMotionBlurStateImpl(this, deltaMs);
    }
        private applyFogSettings(): void {
        return applyFogSettingsImpl(this);
    }

        private setupOriginFogPostProcess(): void {
        return setupOriginFogPostProcessImpl(this);
    }

        private setupFinalLensDistortionPostProcess(): void {
        return setupFinalLensDistortionPostProcessImpl(this);
    }

        private applyAntialiasSettings(): void {
        return applyAntialiasSettingsImpl(this);
    }

        private enforceFinalPostProcessOrder(): void {
        return enforceFinalPostProcessOrderImpl(this);
    }

    

        private setupLensHighlightsPipeline(): void {
        return setupLensHighlightsPipelineImpl(this);
    }
        private applyDofLensOpticsSettings(): void {
        return applyDofLensOpticsSettingsImpl(this);
    }
        private applyEditorDofSettings(): void {
        return applyEditorDofSettingsImpl(this);
    }
        private applyDofLensBlurSettings(): void {
        return applyDofLensBlurSettingsImpl(this);
    }
        private updateEditorDofFocusAndFStop(): void {
        return updateEditorDofFocusAndFStopImpl(this);
    }
        private updateDofLensDistortionFromCameraFov(): void {
        return updateDofLensDistortionFromCameraFovImpl(this);
    }
        private updateDofFocalLengthFromCameraFov(): void {
        return updateDofFocalLengthFromCameraFovImpl(this);
    }
        private computeAdjustedAutoMinFStop(baseFStop: number, autoMinFStop: number, focusDistanceMm: number): number {
        return computeAdjustedAutoMinFStopImpl(this, baseFStop, autoMinFStop, focusDistanceMm);
    }

        private computeAutoFocusMinFStop(focusDistanceMm: number): number {
        return computeAutoFocusMinFStopImpl(this, focusDistanceMm);
    }
        private configureDofDepthRenderer(): void {
        return configureDofDepthRendererImpl(this);
    }
        private configureSsaoDepthRenderer(): void {
        return configureSsaoDepthRendererImpl(this);
    }
        private disposeSsaoDepthRenderer(): void {
        return disposeSsaoDepthRendererImpl(this);
    }
    private setupFarDofPostProcess(): void {
        return setupFarDofPostProcessImpl(this);
    }

    private findSceneModelEntryByPath(modelPath: string): SceneModelEntry | null {
        for (const entry of this.sceneModels) {
            if (entry.info.path === modelPath) {
                return entry;
            }
        }
        return null;
    }

    private normalizeDofFocusBoneName(name: string): string {
        return name.trim().replace(/\s+/g, "").toLowerCase();
    }

    public getPreferredDofFocusBoneName(modelIndex: number): string | null {
        const modelEntry = this.sceneModels[modelIndex];
        if (!modelEntry) return null;
        return this.findPreferredDofFocusBoneName(modelEntry.info.boneNames);
    }

    private findPreferredDofFocusBoneName(boneNames: readonly string[]): string | null {
        if (!Array.isArray(boneNames) || boneNames.length === 0) {
            return null;
        }

        const normalizedToActual = new Map<string, string>();
        for (const boneName of boneNames) {
            if (typeof boneName !== "string") continue;
            const normalized = this.normalizeDofFocusBoneName(boneName);
            if (!normalizedToActual.has(normalized)) {
                normalizedToActual.set(normalized, boneName);
            }
        }

        for (const candidate of DOF_FOCUS_BONE_CANDIDATES) {
            const actual = normalizedToActual.get(this.normalizeDofFocusBoneName(candidate));
            if (actual) {
                return actual;
            }
        }

        return boneNames.find((name): name is string => typeof name === "string" && name.length > 0) ?? null;
    }

    private getRuntimeBoneByNameFromModel(model: RuntimeModel | null, boneName: string): EditorRuntimeBone | null {
        const runtimeBones = model?.runtimeBones;
        if (!runtimeBones) return null;

        for (const runtimeBone of runtimeBones as readonly EditorRuntimeBone[]) {
            if (runtimeBone.name === boneName) {
                return runtimeBone;
            }
        }

        return null;
    }

    private getDofFocusTargetPosition(): Vector3 | null {
        const modelPath = this.dofFocusTargetModelPathValue;
        if (!modelPath) {
            return this.camera.target.clone();
        }

        const entry = this.findSceneModelEntryByPath(modelPath);
        if (!entry) {
            return this.camera.target.clone();
        }

        const boneName = this.dofFocusTargetBoneNameValue;
        if (boneName) {
            const runtimeBone = this.getRuntimeBoneByNameFromModel(entry.model, boneName);
            if (runtimeBone) {
                const worldMatrix = Matrix.Identity();
                const worldPosition = Vector3.Zero();
                runtimeBone.getWorldMatrixToRef(worldMatrix);
                worldMatrix.getTranslationToRef(worldPosition);
                return worldPosition;
            }
        }

        return entry.mesh.getBoundingInfo().boundingBox.centerWorld.clone();
    }

    private getDofAutoFocusDistanceMm(): number {
        const focusTarget = this.getDofFocusTargetPosition() ?? this.camera.target;
        const distance = Vector3.Distance(this.camera.globalPosition, focusTarget);
        return Math.max(this.camera.minZ, distance) * 1000;
    }

    private getCameraFocusDistanceMm(): number {
        const distance = Vector3.Distance(this.camera.globalPosition, this.camera.target);
        return Math.max(this.camera.minZ, distance) * 1000;
    }
    getMorphWeight(morphName: string): number {
        const modelMorph = this.currentModel?.morph;
        if (!modelMorph) return 0;
        try {
            return modelMorph.getMorphWeight(morphName);
        } catch { /* ignore */ }
        return 0;
    }
    getMorphWeightByIndex(morphIndex: number): number {
        const modelMorph = this.currentModel?.morph;
        if (!modelMorph) return 0;
        if (!Number.isInteger(morphIndex) || morphIndex < 0) return 0;
        try {
            return modelMorph.getMorphWeightFromIndex(morphIndex);
        } catch { /* ignore */ }
        return 0;
    }
    setMorphWeight(morphName: string, weight: number): void {
        const modelMorph = this.currentModel?.morph;
        if (!modelMorph) return;
        const clampedWeight = Math.max(0, Math.min(1, weight));
        try {
            modelMorph.setMorphWeight(morphName, clampedWeight);
            this.refreshCurrentModelAfterMorphEdit();
        } catch { /* ignore */ }
    }
    setMorphWeightByIndex(morphIndex: number, weight: number): void {
        const modelMorph = this.currentModel?.morph;
        if (!modelMorph) return;
        if (!Number.isInteger(morphIndex) || morphIndex < 0) return;
        const clampedWeight = Math.max(0, Math.min(1, weight));
        try {
            modelMorph.setMorphWeightFromIndex(morphIndex, clampedWeight);
            this.refreshCurrentModelAfterMorphEdit();
        } catch { /* ignore */ }
    }

    private refreshCurrentModelAfterMorphEdit(): void {
        this.luminousGlowMorphRevision += 1;
        this.recomputeCurrentModelPoseAfterManualEdit();
        this.currentMesh?.computeWorldMatrix(true);
        this.currentMesh?.metadata?.skeleton?.computeAbsoluteMatrices(true);
        this.boneVisualizerTarget?.mesh?.computeWorldMatrix(true);
        this.boneVisualizerTarget?.skeleton?.computeAbsoluteMatrices(true);
    }

    private getRuntimeBoneByName(boneName: string): EditorRuntimeBone | null {
        const runtimeBones = this.currentModel?.runtimeBones;
        if (!runtimeBones) return null;

        for (const runtimeBone of runtimeBones as readonly EditorRuntimeBone[]) {
            if (runtimeBone.name === boneName) {
                return runtimeBone;
            }
        }

        return null;
    }

    private syncExportRenderSurfaceTarget(): void {
        const surface = this.exportRenderSurface;
        if (!surface) {
            return;
        }
        const frameGraphWritesSurface = this.postEffectBackend === "frameGraph"
            && this.shouldExecuteFrameGraphPostEffects();
        this.camera.outputRenderTarget = frameGraphWritesSurface
            ? null
            : surface.renderTarget;
    }

    private applyModelExternalParentsBeforeRender(): void {
        const appliedModelIndices = new Set<number>();
        const applyingModelIndices = new Set<number>();

        const applyModel = (modelIndex: number): void => {
            if (appliedModelIndices.has(modelIndex) || applyingModelIndices.has(modelIndex)) return;
            const childEntry = this.sceneModels[modelIndex];
            const state = childEntry?.externalParent;
            if (!childEntry || !state) {
                appliedModelIndices.add(modelIndex);
                return;
            }

            const parentModelIndex = this.sceneModels.findIndex((entry) => entry.info.path === state.parentModelPath);
            if (parentModelIndex < 0 || parentModelIndex === modelIndex) {
                appliedModelIndices.add(modelIndex);
                return;
            }

            applyingModelIndices.add(modelIndex);
            applyModel(parentModelIndex);

            const parentBone = this.getRuntimeBoneByNameFromModel(
                this.sceneModels[parentModelIndex].model,
                state.parentBoneName,
            );
            const childBone = this.getRuntimeBoneByNameFromModel(childEntry.model, state.childBoneName);
            if (parentBone && childBone) {
                parentBone.getWorldMatrixToRef(this.modelExternalParentMatrix);
                const stack: EditorRuntimeBone[] = [childBone];
                while (stack.length > 0) {
                    const runtimeBone = stack.pop();
                    if (!runtimeBone) continue;
                    runtimeBone.getWorldMatrixToRef(this.modelExternalParentBoneMatrix);
                    this.modelExternalParentBoneMatrix.multiplyToRef(
                        this.modelExternalParentMatrix,
                        this.modelExternalParentBoneMatrix,
                    );
                    this.modelExternalParentBoneMatrix.copyToArray(runtimeBone.worldMatrix);
                    for (const child of runtimeBone.childBones as readonly EditorRuntimeBone[]) {
                        stack.push(child);
                    }
                }
                childEntry.mesh.metadata?.skeleton?._markAsDirty?.();
            }

            applyingModelIndices.delete(modelIndex);
            appliedModelIndices.add(modelIndex);
        };

        for (let modelIndex = 0; modelIndex < this.sceneModels.length; modelIndex += 1) {
            applyModel(modelIndex);
        }
    }

    private applyModelExternalParentKeyframesAtFrame(frame: number): void {
        for (const entry of this.sceneModels) {
            if (entry.externalParentKeyframes.length === 0) continue;
            const selected = selectModelExternalParentKeyframeAtFrame(entry.externalParentKeyframes, frame);
            if (!selected?.parentModelPath || !selected.parentBoneName) {
                entry.externalParent = null;
                continue;
            }
            const parentEntry = this.sceneModels.find((candidate) => candidate.info.path === selected.parentModelPath);
            const childBone = this.getRuntimeBoneByNameFromModel(entry.model, selected.childBoneName);
            const parentBone = parentEntry
                ? this.getRuntimeBoneByNameFromModel(parentEntry.model, selected.parentBoneName)
                : null;
            entry.externalParent = childBone && parentBone
                ? {
                    childBoneName: selected.childBoneName,
                    parentModelPath: selected.parentModelPath,
                    parentBoneName: selected.parentBoneName,
                }
                : null;
        }
    }

    getBoneTransform(boneName: string): { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } } | null {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return null;

        const linkedBone = runtimeBone.linkedBone as
            | (TransformNode & {
                getRestMatrix?: () => Matrix;
                rotationQuaternion?: Quaternion | null;
            })
            | undefined;

        if (linkedBone) {
            const worldMatrix = Matrix.Identity();
            const localMatrix = Matrix.Identity();
            const parentWorldMatrix = Matrix.Identity();
            const parentWorldInverseMatrix = Matrix.Identity();
            const localScaling = Vector3.Zero();
            const localRotation = Quaternion.Identity();
            const localPosition = Vector3.Zero();
            const restPosition = Vector3.Zero();

            runtimeBone.getWorldMatrixToRef(worldMatrix);

            if (runtimeBone.parentBone) {
                runtimeBone.parentBone.getWorldMatrixToRef(parentWorldMatrix);
                parentWorldMatrix.invertToRef(parentWorldInverseMatrix);
                worldMatrix.multiplyToRef(parentWorldInverseMatrix, localMatrix);
            } else {
                localMatrix.copyFrom(worldMatrix);
            }

            localMatrix.decompose(localScaling, localRotation, localPosition);
            linkedBone.getRestMatrix?.().getTranslationToRef(restPosition);

            const rotationEuler = localRotation.toEulerAngles();
            const radToDeg = 180 / Math.PI;
            const snapshot = {
                position: {
                    x: localPosition.x - restPosition.x,
                    y: localPosition.y - restPosition.y,
                    z: localPosition.z - restPosition.z,
                },
                rotation: {
                    x: rotationEuler.x * radToDeg,
                    y: rotationEuler.y * radToDeg,
                    z: rotationEuler.z * radToDeg,
                },
            };
            return snapshot;
        }

        const positionOffset = new Vector3();
        runtimeBone.getAnimationPositionOffsetToRef?.(positionOffset);
        const rotationQuaternion = typeof runtimeBone.getAnimatedRotationToRef === "function"
            ? runtimeBone.getAnimatedRotationToRef(Quaternion.Identity())
            : Quaternion.Identity();
        const rotationEuler = rotationQuaternion.toEulerAngles();
        const radToDeg = 180 / Math.PI;

        const snapshot = {
            position: {
                x: positionOffset.x,
                y: positionOffset.y,
                z: positionOffset.z,
            },
            rotation: {
                x: rotationEuler.x * radToDeg,
                y: rotationEuler.y * radToDeg,
                z: rotationEuler.z * radToDeg,
            },
        };
        return snapshot;
    }

    getAnimatedBoneTransform(boneName: string): { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } } | null {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return null;

        if (
            typeof runtimeBone.getAnimationPositionOffsetToRef !== "function" ||
            typeof runtimeBone.getAnimatedRotationToRef !== "function"
        ) {
            return this.getBoneTransform(boneName);
        }

        const positionOffset = new Vector3();
        runtimeBone.getAnimationPositionOffsetToRef(positionOffset);
        const rotationQuaternion = runtimeBone.getAnimatedRotationToRef(Quaternion.Identity());
        const rotationEuler = rotationQuaternion.toEulerAngles();
        const radToDeg = 180 / Math.PI;
        const snapshot = {
            position: {
                x: positionOffset.x,
                y: positionOffset.y,
                z: positionOffset.z,
            },
            rotation: {
                x: rotationEuler.x * radToDeg,
                y: rotationEuler.y * radToDeg,
                z: rotationEuler.z * radToDeg,
            },
        };
        return snapshot;
    }

    setBoneTranslation(boneName: string, x: number, y: number, z: number, notifyEdited = true): void {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return;

        const restMatrix = runtimeBone.linkedBone.getRestMatrix();
        const restX = restMatrix.m[12];
        const restY = restMatrix.m[13];
        const restZ = restMatrix.m[14];

        runtimeBone.linkedBone.position = new Vector3(restX + x, restY + y, restZ + z);
        this.invalidateBoneVisualizerPose(runtimeBone, notifyEdited);
    }

    setBoneRotation(boneName: string, xDeg: number, yDeg: number, zDeg: number, notifyEdited = true): void {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return;

        const xRad = (xDeg * Math.PI) / 180;
        const yRad = (yDeg * Math.PI) / 180;
        const zRad = (zDeg * Math.PI) / 180;
        const rotation = Quaternion.RotationYawPitchRoll(yRad, xRad, zRad);

        runtimeBone.linkedBone.setRotationQuaternion(rotation, Space.LOCAL);
        this.invalidateBoneVisualizerPose(runtimeBone, notifyEdited);
    }

    private recomputeCurrentModelPoseAfterManualEdit(): void {
        const currentModel = this.currentModel;
        if (!currentModel) return;
        PhysicsModelController.beforeAndAfterPhysics(currentModel);
    }

    private invalidateBoneVisualizerPose(runtimeBone: EditorRuntimeBone, notifyEdited = true): void {
        const linkedBone = runtimeBone.linkedBone;
        const linkedBoneInternal = linkedBone as unknown as {
            markAsDirty?: () => void;
            getSkeleton?: () => Skeleton;
        };
        linkedBoneInternal.markAsDirty?.();
        this.recomputeCurrentModelPoseAfterManualEdit();
        linkedBoneInternal.getSkeleton?.()?.computeAbsoluteMatrices(true);
        this.boneVisualizerTarget?.skeleton?.computeAbsoluteMatrices(true);
        if (notifyEdited) {
            this.onBoneTransformEdited?.(runtimeBone.name);
        }
    }
    getCameraPosition(): { x: number; y: number; z: number } {
        const pos = this.camera.position;
        return { x: pos.x, y: pos.y, z: pos.z };
    }

    getCameraTarget(): { x: number; y: number; z: number } {
        const target = this.camera.target;
        return { x: target.x, y: target.y, z: target.z };
    }

    setCameraPosition(x: number, y: number, z: number): void {
        if (this.cameraExternalParentModelIndex !== null) {
            this.mmdCamera.target.set(x, y, z);
            this.mmdCamera.distance = 0;
            this.syncViewportCameraFromMmdCamera(true);
            return;
        }
        this.camera.setPosition(new Vector3(x, y, z));
        this.applyCameraRotationFromEuler();
        this.syncMmdCameraFromViewportCamera();
    }

    getCameraRotation(): { x: number; y: number; z: number } {
        return {
            x: this.cameraRotationEulerDeg.x,
            y: this.cameraRotationEulerDeg.y,
            z: this.cameraRotationEulerDeg.z,
        };
    }

    setCameraRotation(xDeg: number, yDeg: number, zDeg: number): void {
        this.cameraRotationEulerDeg.set(
            xDeg,
            this.normalizeCameraAngleDeg(yDeg),
            this.normalizeCameraAngleDeg(zDeg),
        );
        if (this.cameraExternalParentModelIndex !== null) {
            this.applyExternalParentCameraRotationFromEuler();
            return;
        }
        this.applyCameraRotationFromEuler();
        this.syncMmdCameraFromViewportCamera();
    }

    setCameraTarget(x: number, y: number, z: number): void {
        if (this.cameraExternalParentModelIndex !== null) {
            this.mmdCamera.target.set(x, y, z);
            this.mmdCamera.distance = 0;
            this.mmdCamera.updatePosition();
            this.syncViewportCameraFromMmdCamera(true);
            return;
        }
        this.camera.target = new Vector3(x, y, z);
        this.syncCameraRotationFromCurrentView({ preserveRoll: true });
        this.clearCameraInertialOffsets();
        this.syncMmdCameraFromViewportCamera();
    }

    getCameraFov(): number {
        return (this.camera.fov * 180) / Math.PI;
    }

    getCameraDistance(): number {
        if (this.cameraExternalParentModelIndex !== null) return 0;
        return Math.max(this.camera.minZ, Vector3.Distance(this.camera.position, this.camera.target));
    }

    getCameraKeyframePose(): {
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
        distance: number;
        fov: number;
    } {
        if (this.cameraExternalParentModelIndex === null) {
            return {
                position: this.getCameraPosition(),
                rotation: this.getCameraRotation(),
                target: this.getCameraTarget(),
                distance: this.getCameraDistance(),
                fov: this.getCameraFov(),
            };
        }

        this.mmdCamera.updatePosition();
        return {
            position: {
                x: this.mmdCamera.position.x,
                y: this.mmdCamera.position.y,
                z: this.mmdCamera.position.z,
            },
            rotation: {
                x: (this.mmdCamera.rotation.x * 180) / Math.PI,
                y: this.normalizeCameraAngleDeg((this.mmdCamera.rotation.y * 180) / Math.PI),
                z: this.normalizeCameraAngleDeg((this.mmdCamera.rotation.z * 180) / Math.PI),
            },
            target: {
                x: this.mmdCamera.target.x,
                y: this.mmdCamera.target.y,
                z: this.mmdCamera.target.z,
            },
            distance: 0,
            fov: (this.mmdCamera.fov * 180) / Math.PI,
        };
    }

    getCameraExternalParent(): { modelIndex: number | null; boneName: string | null } | null {
        if (this.cameraExternalParentModelIndex === null) return null;
        return {
            modelIndex: this.cameraExternalParentModelIndex,
            boneName: this.cameraExternalParentBoneName,
        };
    }

    getCameraExternalParentPayload(): { modelPath: string | null; boneName: string | null } {
        return {
            modelPath: this.cameraExternalParentModelPath,
            boneName: this.cameraExternalParentBoneName,
        };
    }

    readCameraExternalParentKeyframe(frame: number): { modelPath: string | null; boneName: string | null } | null {
        const normalized = Math.max(0, Math.floor(frame));
        const entry = this.cameraExternalParentKeyframes.find((item) => item.frame === normalized);
        if (!entry) return null;
        return {
            modelPath: entry.modelPath,
            boneName: entry.boneName,
        };
    }

    upsertCameraExternalParentKeyframe(
        frame: number,
        payload: { modelPath: string | null; boneName: string | null },
    ): boolean {
        this.cameraExternalParentKeyframes = upsertCameraExternalParentKeyframe(
            this.cameraExternalParentKeyframes,
            frame,
            payload,
        );
        this.applyCameraExternalParentKeyframeAtFrame(this._currentFrame);
        return true;
    }

    removeCameraExternalParentKeyframes(frames: readonly number[]): boolean {
        const before = this.cameraExternalParentKeyframes.length;
        this.cameraExternalParentKeyframes = removeCameraExternalParentKeyframes(
            this.cameraExternalParentKeyframes,
            frames,
        );
        if (this.cameraExternalParentKeyframes.length !== before) {
            if (this.cameraExternalParentKeyframes.length === 0) {
                this.setCameraExternalParentState(null, null);
            } else {
                this.applyCameraExternalParentKeyframeAtFrame(this._currentFrame);
            }
        }
        return true;
    }

    moveCameraExternalParentKeyframe(fromFrame: number, toFrame: number): boolean {
        this.cameraExternalParentKeyframes = moveCameraExternalParentKeyframe(
            this.cameraExternalParentKeyframes,
            fromFrame,
            toFrame,
        );
        this.applyCameraExternalParentKeyframeAtFrame(this._currentFrame);
        return true;
    }

    getCameraExternalParentKeyframes(): ProjectSerializedCameraExternalParentTrack | null {
        if (this.cameraExternalParentKeyframes.length === 0) return null;
        return {
            frameNumbers: this.packFrameNumbers(new Uint32Array(this.cameraExternalParentKeyframes.map((entry) => entry.frame))),
            modelPaths: this.cameraExternalParentKeyframes.map((entry) => entry.modelPath),
            boneNames: this.cameraExternalParentKeyframes.map((entry) => entry.boneName),
        };
    }

    setCameraExternalParentKeyframes(track: ProjectSerializedCameraExternalParentTrack | null | undefined): boolean {
        if (!track) {
            this.cameraExternalParentKeyframes = [];
            this.setCameraExternalParentState(null, null);
            return true;
        }
        const frameCount = Array.isArray(track.modelPaths) ? track.modelPaths.length : 0;
        const frames = new Uint32Array(frameCount);
        this.copyProjectArrayToUint32(track.frameNumbers, frames);
        let entries: CameraExternalParentKeyframe[] = [];
        for (let i = 0; i < frames.length; i += 1) {
            const frame = Math.max(0, Math.floor(Number(frames[i] ?? 0)));
            entries = upsertCameraExternalParentKeyframe(entries, frame, {
                modelPath: track.modelPaths?.[i] ?? null,
                boneName: track.boneNames?.[i] ?? null,
            });
        }
        this.cameraExternalParentKeyframes = entries;
        this.applyCameraExternalParentKeyframeAtFrame(this._currentFrame);
        return true;
    }

    getCameraProjectState(): ProjectCameraState {
        this.mmdCamera.updatePosition();
        return {
            position: {
                x: this.mmdCamera.position.x,
                y: this.mmdCamera.position.y,
                z: this.mmdCamera.position.z,
            },
            target: {
                x: this.mmdCamera.target.x,
                y: this.mmdCamera.target.y,
                z: this.mmdCamera.target.z,
            },
            rotation: {
                x: (this.mmdCamera.rotation.x * 180) / Math.PI,
                y: this.normalizeCameraAngleDeg((this.mmdCamera.rotation.y * 180) / Math.PI),
                z: this.normalizeCameraAngleDeg((this.mmdCamera.rotation.z * 180) / Math.PI),
            },
            fov: (this.mmdCamera.fov * 180) / Math.PI,
            distance: Math.abs(this.mmdCamera.distance),
            externalParent: (() => {
                const parent = this.getCameraExternalParent();
                if (typeof parent?.modelIndex !== "number" || parent.modelIndex < 0) return null;
                return {
                    modelPath: this.sceneModels[parent.modelIndex]?.info.path ?? null,
                    boneName: parent.boneName ?? null,
                };
            })(),
        };
    }

    setCameraExternalParent(modelIndex: number | null, boneName: string | null): boolean {
        if (modelIndex === null) {
            this.syncCameraRotationFromCurrentView();
            this.syncMmdCameraFromViewportCamera(true);
            this.cameraExternalParentModelIndex = null;
            this.cameraExternalParentModelPath = null;
            this.cameraExternalParentBoneName = null;
            this.syncViewportCameraFromMmdCamera(true);
            return true;
        }

        if (!Number.isInteger(modelIndex) || modelIndex < 0 || modelIndex >= this.sceneModels.length) {
            return false;
        }

        const normalizedBoneName = typeof boneName === "string" && boneName.length > 0 ? boneName : null;
        if (normalizedBoneName && !this.getRuntimeBoneByNameFromModel(this.sceneModels[modelIndex].model, normalizedBoneName)) {
            return false;
        }

        this.resetMmdCameraForExternalParent();
        this.cameraExternalParentModelIndex = modelIndex;
        this.cameraExternalParentModelPath = this.sceneModels[modelIndex].info.path;
        this.cameraExternalParentBoneName = normalizedBoneName;
        this.syncViewportCameraFromMmdCamera(true);
        return true;
    }

    getPerspectiveEnabled(): boolean {
        return this.camera.mode !== Camera.ORTHOGRAPHIC_CAMERA;
    }

    setPerspectiveEnabled(enabled: boolean): void {
        const nextMode = enabled ? Camera.PERSPECTIVE_CAMERA : Camera.ORTHOGRAPHIC_CAMERA;
        if (this.camera.mode === nextMode) return;
        this.camera.mode = nextMode;
        this.updateOrthographicCameraBounds();
    }

    setCameraDistance(distance: number): void {
        if (this.cameraExternalParentModelIndex !== null) {
            this.mmdCamera.distance = 0;
            this.syncViewportCameraFromMmdCamera(true);
            return;
        }
        const min = Math.max(0.1, this.camera.lowerRadiusLimit ?? this.camera.minZ);
        const max = this.camera.upperRadiusLimit ?? Number.POSITIVE_INFINITY;
        this.camera.radius = Math.max(min, Math.min(max, distance));
        this.syncCameraRotationFromCurrentView({ preserveRoll: true });
        this.clearCameraInertialOffsets();
        this.syncMmdCameraFromViewportCamera();
        this.updateOrthographicCameraBounds();
        this.updateEditorDofFocusAndFStop();
    }

    setCameraFov(degrees: number): void {
        if (this.cameraExternalParentModelIndex !== null) {
            this.mmdCamera.fov = (degrees * Math.PI) / 180;
            this.syncViewportCameraFromMmdCamera(true);
            this.updateEditorDofFocusAndFStop();
            return;
        }
        this.camera.fov = (degrees * Math.PI) / 180;
        this.syncMmdCameraFromViewportCamera();
        this.updateOrthographicCameraBounds();
        this.updateEditorDofFocusAndFStop();
    }

    panCameraByViewportDelta(deltaX: number, deltaY: number): void {
        this.applyCameraMouseDrag("pan", deltaX, deltaY);
    }

    applyCameraTrackPose(
        target: { x: number; y: number; z: number },
        rotationDeg: { x: number; y: number; z: number },
        distance: number,
        fovDeg?: number,
    ): void {
        this.mmdCamera.target.set(target.x, target.y, target.z);
        this.mmdCamera.rotation.set(
            (rotationDeg.x * Math.PI) / 180,
            (rotationDeg.y * Math.PI) / 180,
            (rotationDeg.z * Math.PI) / 180,
        );
        this.mmdCamera.distance = this.cameraExternalParentModelIndex !== null ? 0 : -Math.abs(distance);
        if (typeof fovDeg === "number") {
            this.mmdCamera.fov = (fovDeg * Math.PI) / 180;
        }
        this.syncViewportCameraFromMmdCamera();
        this.updateOrthographicCameraBounds();
    }

    applyCameraAnimation(animation: MmdAnimation, sourcePath: string | null): void {
        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }

        this.cameraAnimationHandle = this.mmdCamera.createRuntimeAnimation(
            animation as unknown as IMmdBindableCameraAnimation,
        );
        this.mmdCamera.setRuntimeAnimation(this.cameraAnimationHandle);
        this.hasCameraMotion = true;
        this.cameraMotionPath = sourcePath;
        this.cameraSourceAnimation = animation;
        this.cameraKeyframeFrames = new Uint32Array(animation.cameraTrack.frameNumbers);
        this.emitMergedKeyframeTracks();
    }

    setCameraView(view: "left" | "front" | "right" | "top" | "back" | "bottom"): void {
        const distance = Math.max(5, this.getCameraDistance());
        const fovDeg = (this.camera.fov * 180) / Math.PI;
        let rotationDeg = { x: 0, y: 0, z: 0 };
        switch (view) {
            case "left":
                rotationDeg = { x: 0, y: -90, z: 0 };
                break;
            case "right":
                rotationDeg = { x: 0, y: 90, z: 0 };
                break;
            case "back":
                rotationDeg = { x: 0, y: 180, z: 0 };
                break;
            case "top":
                rotationDeg = { x: -90, y: 0, z: 0 };
                break;
            case "bottom":
                rotationDeg = { x: 90, y: 0, z: 0 };
                break;
            case "front":
            default:
                rotationDeg = { x: 0, y: 0, z: 0 };
                break;
        }

        this.applyCameraTrackPose({ x: 0, y: 10, z: 0 }, rotationDeg, distance, fovDeg);
    }

    private updateOrthographicCameraBounds(): void {
        if (!this.camera || this.camera.mode !== Camera.ORTHOGRAPHIC_CAMERA) return;

        const width = Math.max(1, this.renderingCanvas.clientWidth || this.engine.getRenderWidth(true) || 1);
        const height = Math.max(1, this.renderingCanvas.clientHeight || this.engine.getRenderHeight(true) || 1);
        const aspect = width / height;
        const distance = Math.max(0.1, this.getCameraDistance());
        const verticalSize = Math.max(0.1, 2 * distance * Math.tan(Math.max(0.01, this.camera.fov) * 0.5));
        const horizontalSize = verticalSize * aspect;

        this.camera.orthoLeft = -horizontalSize * 0.5;
        this.camera.orthoRight = horizontalSize * 0.5;
        this.camera.orthoTop = verticalSize * 0.5;
        this.camera.orthoBottom = -verticalSize * 0.5;
    }

    private syncMmdCameraFromViewportCamera(force = false): void {
        if (!force && !this.shouldSyncViewportCameraToMmdCamera()) {
            return;
        }

        this.mmdCamera.target.copyFrom(this.camera.target);
        this.mmdCamera.position = this.camera.position.clone();
        this.mmdCamera.rotation.z = (this.cameraRotationEulerDeg.z * Math.PI) / 180;
        this.mmdCamera.fov = this.camera.fov;
        this.recordViewportCameraSyncState();
    }

    private resetMmdCameraForExternalParent(): void {
        this.mmdCamera.target.set(0, 0, 0);
        this.mmdCamera.rotation.set(0, 0, 0);
        this.mmdCamera.distance = 0;
        this.mmdCamera.fov = this.camera.fov;
        this.mmdCamera.updatePosition();
        this.cameraRotationEulerDeg.set(0, 0, 0);
    }

    private syncViewportCameraFromMmdCamera(skipExternalParentKeyframe = false): void {
        if (!skipExternalParentKeyframe) {
            this.applyCameraExternalParentKeyframeAtFrame(this._currentFrame);
        }
        const externalParentActive = this.cameraExternalParentModelIndex !== null;
        if (externalParentActive) {
            if (this.cameraLowerRadiusLimitBeforeExternalParent === undefined) {
                this.cameraLowerRadiusLimitBeforeExternalParent = this.camera.lowerRadiusLimit;
            }
            this.camera.lowerRadiusLimit = 0.000001;
            this.mmdCamera.distance = 0;
        } else if (this.cameraLowerRadiusLimitBeforeExternalParent !== undefined) {
            this.camera.lowerRadiusLimit = this.cameraLowerRadiusLimitBeforeExternalParent;
            this.cameraLowerRadiusLimitBeforeExternalParent = undefined;
        }
        // MmdCamera is not the active scene camera, so keep its position up to date explicitly.
        this.mmdCamera.updatePosition();
        const rotationMatrix = Matrix.RotationYawPitchRoll(
            -this.mmdCamera.rotation.y,
            -this.mmdCamera.rotation.x,
            -this.mmdCamera.rotation.z,
        );
        const rotatedUp = Vector3.TransformNormal(this.mmdCamera.upVector, rotationMatrix).normalize();
        Vector3.TransformNormalFromFloatsToRef(
            0,
            0,
            1,
            rotationMatrix,
            this.cameraExternalParentForward,
        ).normalize();
        if (externalParentActive) {
            // MMD uses the external-parent origin as the camera orbit pivot. The
            // editable camera XYZ is an offset from that pivot, rotated by the local
            // camera rotation even though the editable distance remains zero.
            Vector3.TransformCoordinatesToRef(
                this.mmdCamera.target,
                rotationMatrix,
                this.cameraExternalParentPosition,
            );
            // The viewport look-at follows XY movement so middle-button dragging is
            // a translation. Only the orbit calculation keeps the parent origin as
            // its center when local camera rotation changes.
            this.cameraExternalParentTarget
                .copyFrom(this.cameraExternalParentForward)
                .addInPlace(this.cameraExternalParentPosition);
        } else {
            this.cameraExternalParentPosition.copyFrom(this.mmdCamera.position);
            this.cameraExternalParentTarget.copyFrom(this.mmdCamera.target);
        }
        this.cameraExternalParentUp.copyFrom(rotatedUp);
        this.applyCameraExternalParentToViewportVectors();
        this.camera.upVector = this.cameraExternalParentUp.clone();
        this.camera.setPosition(this.cameraExternalParentPosition);
        this.camera.setTarget(this.cameraExternalParentTarget);
        this.camera.fov = this.mmdCamera.fov;
        this.cameraRotationEulerDeg.set(
            (this.mmdCamera.rotation.x * 180) / Math.PI,
            this.normalizeCameraAngleDeg((this.mmdCamera.rotation.y * 180) / Math.PI),
            this.normalizeCameraAngleDeg((this.mmdCamera.rotation.z * 180) / Math.PI),
        );
        this.recordViewportCameraSyncState();
        this.updateDofFocalLengthFromCameraFov();
        this.updateOrthographicCameraBounds();
    }

    private syncCameraExternalParentedViewport(): void {
        if (this.shouldApplyCameraMotionToViewport()) return;
        if (this.cameraExternalParentKeyframes.length > 0) {
            this.applyCameraExternalParentKeyframeAtFrame(this._currentFrame);
        }
        if (this.cameraExternalParentModelIndex === null) return;
        this.syncViewportCameraFromMmdCamera(true);
    }

    private applyCameraExternalParentKeyframeAtFrame(frame: number): void {
        if (this.cameraExternalParentKeyframes.length === 0) return;
        const selected = selectCameraExternalParentKeyframeAtFrame(this.cameraExternalParentKeyframes, frame);

        if (!selected) {
            this.setCameraExternalParentState(null, null);
            return;
        }

        this.setCameraExternalParentState(selected.modelPath, selected.boneName);
    }

    private setCameraExternalParentState(modelPath: string | null, boneName: string | null): void {
        const normalized = normalizeCameraExternalParentPayload({ modelPath, boneName });
        if (!normalized.modelPath) {
            this.cameraExternalParentModelIndex = null;
            this.cameraExternalParentModelPath = null;
            this.cameraExternalParentBoneName = null;
            return;
        }

        const modelIndex = this.sceneModels.findIndex((entry) => entry.info.path === normalized.modelPath);
        if (modelIndex < 0) {
            this.cameraExternalParentModelIndex = null;
            this.cameraExternalParentModelPath = normalized.modelPath;
            this.cameraExternalParentBoneName = normalized.boneName;
            return;
        }

        const normalizedBoneName = normalized.boneName ?? null;
        if (
            normalizedBoneName
            && !this.getRuntimeBoneByNameFromModel(this.sceneModels[modelIndex].model, normalizedBoneName)
        ) {
            this.cameraExternalParentModelIndex = null;
            this.cameraExternalParentModelPath = normalized.modelPath;
            this.cameraExternalParentBoneName = normalizedBoneName;
            return;
        }
        this.cameraExternalParentModelIndex = modelIndex;
        this.cameraExternalParentModelPath = normalized.modelPath;
        this.cameraExternalParentBoneName = normalizedBoneName;
    }

    private applyCameraExternalParentToViewportVectors(): void {
        if (!this.getCameraExternalParentMatrixToRef(this.cameraExternalParentMatrix)) return;

        transformCameraExternalParentVectorsToRef(
            this.cameraExternalParentMatrix,
            this.cameraExternalParentPosition,
            this.cameraExternalParentTarget,
            this.cameraExternalParentUp,
        );
    }

    private getCameraExternalParentMatrixToRef(result: Matrix): boolean {
        if (this.cameraExternalParentModelIndex === null) return false;
        return this.getCameraExternalParentMatrixForSelectionToRef(
            this.cameraExternalParentModelIndex,
            this.cameraExternalParentBoneName,
            result,
        );
    }

    private getCameraExternalParentMatrixForSelectionToRef(
        modelIndex: number,
        boneName: string | null,
        result: Matrix,
    ): boolean {
        const modelEntry = this.sceneModels[modelIndex];
        if (!modelEntry) {
            if (modelIndex === this.cameraExternalParentModelIndex) {
                this.cameraExternalParentModelIndex = null;
                this.cameraExternalParentBoneName = null;
            }
            return false;
        }

        if (!boneName) {
            result.copyFrom(modelEntry.mesh.computeWorldMatrix(true));
            return true;
        }

        const runtimeBone = this.getRuntimeBoneByNameFromModel(modelEntry.model, boneName);
        if (!runtimeBone) {
            if (modelIndex === this.cameraExternalParentModelIndex) {
                this.cameraExternalParentModelIndex = null;
                this.cameraExternalParentBoneName = null;
            }
            return false;
        }

        runtimeBone.getWorldMatrixToRef(result);
        return true;
    }

    private recordViewportCameraSyncState(): void {
        this.lastViewportCameraSyncState = {
            position: this.camera.position.clone(),
            target: this.camera.target.clone(),
            radius: this.camera.radius,
            fov: this.camera.fov,
        };
    }

    private hasViewportCameraChangedSinceLastSync(): boolean {
        const previous = this.lastViewportCameraSyncState;
        if (!previous) return true;
        const epsilon = 1e-4;
        return Vector3.DistanceSquared(previous.position, this.camera.position) > epsilon
            || Vector3.DistanceSquared(previous.target, this.camera.target) > epsilon
            || Math.abs(previous.radius - this.camera.radius) > epsilon
            || Math.abs(previous.fov - this.camera.fov) > epsilon;
    }

    private syncViewportCameraDrivenStateFromNativeInputs(): void {
        if (!this.shouldSyncViewportCameraToMmdCamera()) {
            this.recordViewportCameraSyncState();
            return;
        }
        if (this.cameraExternalParentModelIndex !== null) {
            this.recordViewportCameraSyncState();
            return;
        }
        if (!this.hasViewportCameraChangedSinceLastSync()) return;

        this.syncCameraRotationFromCurrentView({ preserveRoll: true });
        this.clearCameraInertialOffsets();
        this.syncMmdCameraFromViewportCamera(true);
        this.updateDofFocalLengthFromCameraFov();
        this.onCameraTransformEdited?.();
    }

    private applyCameraRotationFromEuler(): void {
        const xRad = (this.cameraRotationEulerDeg.x * Math.PI) / 180;
        const yRad = (this.cameraRotationEulerDeg.y * Math.PI) / 180;
        const zRad = (this.cameraRotationEulerDeg.z * Math.PI) / 180;
        const rot = Matrix.RotationYawPitchRoll(-yRad, -xRad, -zRad);
        const forwardOffset = Vector3.TransformNormal(new Vector3(0, 0, 1), rot).normalize();
        const up = Vector3.TransformNormal(new Vector3(0, 1, 0), rot).normalize();
        const distance = Math.max(this.camera.radius, this.camera.lowerRadiusLimit ?? 2);
        const target = this.camera.position.add(forwardOffset.scale(distance));

        this.camera.upVector = up;
        this.camera.target = target;
    }

    private applyCameraOrbitRotationFromEuler(): void {
        const xRad = (this.cameraRotationEulerDeg.x * Math.PI) / 180;
        const yRad = (this.cameraRotationEulerDeg.y * Math.PI) / 180;
        const zRad = (this.cameraRotationEulerDeg.z * Math.PI) / 180;
        const rot = Matrix.RotationYawPitchRoll(-yRad, -xRad, -zRad);
        const forwardOffset = Vector3.TransformNormal(new Vector3(0, 0, 1), rot).normalize();
        const up = Vector3.TransformNormal(new Vector3(0, 1, 0), rot).normalize();
        const distance = Math.max(this.getCameraDistance(), this.camera.lowerRadiusLimit ?? 2);
        const target = this.camera.target.clone();

        this.camera.upVector = up;
        this.camera.setPosition(target.subtract(forwardOffset.scale(distance)));
        this.camera.setTarget(target);
    }

    private clampCameraRotationPitch(): void {
        const lower = this.camera.lowerBetaLimit;
        const upper = this.camera.upperBetaLimit;
        let minPitch = -89.9;
        let maxPitch = 89.9;
        if (lower !== null && lower !== undefined) {
            minPitch = (lower * 180) / Math.PI - 90;
        }
        if (upper !== null && upper !== undefined) {
            maxPitch = (upper * 180) / Math.PI - 90;
        }
        this.cameraRotationEulerDeg.x = Math.max(minPitch, Math.min(maxPitch, this.cameraRotationEulerDeg.x));
    }

    private syncCameraRotationFromCurrentView(options: { preserveRoll?: boolean } = {}): void {
        const toPosition = this.camera.position.subtract(this.camera.target);
        if (toPosition.lengthSquared() < 1e-8) return;

        const previousRollDeg = this.cameraRotationEulerDeg.z;
        toPosition.normalize();
        this.cameraRotationEulerDeg.x = (Math.asin(-toPosition.y) * 180) / Math.PI;
        this.cameraRotationEulerDeg.y = (Math.atan2(toPosition.x, -toPosition.z) * 180) / Math.PI;
        if (options.preserveRoll) {
            this.cameraRotationEulerDeg.z = previousRollDeg;
            return;
        }
        const xRad = (this.cameraRotationEulerDeg.x * Math.PI) / 180;
        const yRad = (this.cameraRotationEulerDeg.y * Math.PI) / 180;
        const baseRotation = Matrix.RotationYawPitchRoll(-yRad, -xRad, 0);
        const baseRight = Vector3.TransformNormal(new Vector3(1, 0, 0), baseRotation).normalize();
        const baseUp = Vector3.TransformNormal(new Vector3(0, 1, 0), baseRotation).normalize();
        const currentUp = this.camera.upVector.clone();
        if (currentUp.lengthSquared() > 1e-8) {
            currentUp.normalize();
            const rollRad = Math.atan2(Vector3.Dot(currentUp, baseRight), Vector3.Dot(currentUp, baseUp));
            if (Number.isFinite(rollRad)) {
                this.cameraRotationEulerDeg.z = (rollRad * 180) / Math.PI;
            }
        }
    }

    private clearCameraInertialOffsets(): void {
        this.camera.inertialAlphaOffset = 0;
        this.camera.inertialBetaOffset = 0;
        this.camera.inertialRadiusOffset = 0;
        this.camera.inertialPanningX = 0;
        this.camera.inertialPanningY = 0;
    }

    private normalizeCameraAngleDeg(value: number): number {
        if (!Number.isFinite(value)) return 0;
        const normalized = ((value + 180) % 360 + 360) % 360 - 180;
        return Object.is(normalized, -0) ? 0 : normalized;
    }

    private getOrCreateModelTrackFrameMap(model: RuntimeModel): Map<string, Uint32Array> {
        return getOrCreateModelTrackFrameMapImpl(this, model);
    }

    private createFrameIndexMap(frames: Uint32Array): Map<number, number> {
        const indexMap = new Map<number, number>();
        for (let i = 0; i < frames.length; i += 1) {
            indexMap.set(frames[i], i);
        }
        return indexMap;
    }

    private copyFloatFrameBlock(
        source: Float32Array,
        sourceFrameIndex: number,
        stride: number,
        destination: Float32Array,
        destinationFrameIndex: number,
    ): void {
        const sourceOffset = sourceFrameIndex * stride;
        const destinationOffset = destinationFrameIndex * stride;
        destination.set(source.subarray(sourceOffset, sourceOffset + stride), destinationOffset);
    }

    private copyUint8FrameBlock(
        source: Uint8Array,
        sourceFrameIndex: number,
        stride: number,
        destination: Uint8Array,
        destinationFrameIndex: number,
    ): void {
        const sourceOffset = sourceFrameIndex * stride;
        const destinationOffset = destinationFrameIndex * stride;
        destination.set(source.subarray(sourceOffset, sourceOffset + stride), destinationOffset);
    }

    private createOffsetModelAnimation(animation: MmdAnimation, frameOffset: number): MmdAnimation {
        return createOffsetModelAnimationImpl(animation, frameOffset);
    }

    private mergeModelAnimations(baseAnimation: MmdAnimation, overlayAnimation: MmdAnimation): MmdAnimation {
        return mergeModelAnimationsImpl(baseAnimation, overlayAnimation);
    }

    private mergePropertyTrack(
        baseTrack: MmdPropertyAnimationTrack,
        overlayTrack: MmdPropertyAnimationTrack,
    ): MmdPropertyAnimationTrack {
        if (overlayTrack.frameNumbers.length === 0) {
            return baseTrack;
        }
        if (baseTrack.frameNumbers.length === 0) {
            return overlayTrack;
        }

        const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
        const mergedIkBoneNames = [...baseTrack.ikBoneNames];
        for (const ikBoneName of overlayTrack.ikBoneNames) {
            if (!mergedIkBoneNames.includes(ikBoneName)) {
                mergedIkBoneNames.push(ikBoneName);
            }
        }

        const mergedTrack = new MmdPropertyAnimationTrack(mergedFrames.length, mergedIkBoneNames);
        mergedTrack.frameNumbers.set(mergedFrames);

        const baseIndexMap = this.createFrameIndexMap(baseTrack.frameNumbers);
        const overlayIndexMap = this.createFrameIndexMap(overlayTrack.frameNumbers);
        const baseIkIndexByName = new Map<string, number>();
        const overlayIkIndexByName = new Map<string, number>();

        for (let i = 0; i < baseTrack.ikBoneNames.length; i += 1) {
            baseIkIndexByName.set(baseTrack.ikBoneNames[i], i);
        }
        for (let i = 0; i < overlayTrack.ikBoneNames.length; i += 1) {
            overlayIkIndexByName.set(overlayTrack.ikBoneNames[i], i);
        }

        for (let i = 0; i < mergedFrames.length; i += 1) {
            const frame = mergedFrames[i];
            const overlayIndex = overlayIndexMap.get(frame);
            const baseIndex = baseIndexMap.get(frame);
            const preferredVisible = overlayIndex !== undefined
                ? overlayTrack.visibles[overlayIndex]
                : (baseIndex !== undefined ? baseTrack.visibles[baseIndex] : 0);
            mergedTrack.visibles[i] = preferredVisible;

            for (let ikIndex = 0; ikIndex < mergedIkBoneNames.length; ikIndex += 1) {
                const ikBoneName = mergedIkBoneNames[ikIndex];
                const overlayIkIndex = overlayIkIndexByName.get(ikBoneName);
                if (overlayIndex !== undefined && overlayIkIndex !== undefined) {
                    mergedTrack.getIkState(ikIndex)[i] = overlayTrack.getIkState(overlayIkIndex)[overlayIndex];
                    continue;
                }

                const baseIkIndex = baseIkIndexByName.get(ikBoneName);
                if (baseIndex !== undefined && baseIkIndex !== undefined) {
                    mergedTrack.getIkState(ikIndex)[i] = baseTrack.getIkState(baseIkIndex)[baseIndex];
                }
            }
        }

        return mergedTrack;
    }

    private mergeMovableBoneTrackArrays(
        baseTracks: readonly MmdMovableBoneAnimationTrack[],
        overlayTracks: readonly MmdMovableBoneAnimationTrack[],
    ): MmdMovableBoneAnimationTrack[] {
        const overlayByName = new Map<string, MmdMovableBoneAnimationTrack>();
        for (const track of overlayTracks) {
            overlayByName.set(track.name, track);
        }

        const mergedTracks: MmdMovableBoneAnimationTrack[] = [];
        const mergedNames = new Set<string>();

        for (const baseTrack of baseTracks) {
            const overlayTrack = overlayByName.get(baseTrack.name);
            if (!overlayTrack) {
                mergedTracks.push(baseTrack);
                continue;
            }
            mergedNames.add(baseTrack.name);
            mergedTracks.push(this.mergeMovableBoneTrack(baseTrack, overlayTrack));
        }

        for (const overlayTrack of overlayTracks) {
            if (mergedNames.has(overlayTrack.name)) continue;
            mergedTracks.push(overlayTrack);
        }

        return mergedTracks;
    }

    private mergeBoneTrackArrays(
        baseTracks: readonly MmdBoneAnimationTrack[],
        overlayTracks: readonly MmdBoneAnimationTrack[],
    ): MmdBoneAnimationTrack[] {
        const overlayByName = new Map<string, MmdBoneAnimationTrack>();
        for (const track of overlayTracks) {
            overlayByName.set(track.name, track);
        }

        const mergedTracks: MmdBoneAnimationTrack[] = [];
        const mergedNames = new Set<string>();

        for (const baseTrack of baseTracks) {
            const overlayTrack = overlayByName.get(baseTrack.name);
            if (!overlayTrack) {
                mergedTracks.push(baseTrack);
                continue;
            }
            mergedNames.add(baseTrack.name);
            mergedTracks.push(this.mergeBoneTrack(baseTrack, overlayTrack));
        }

        for (const overlayTrack of overlayTracks) {
            if (mergedNames.has(overlayTrack.name)) continue;
            mergedTracks.push(overlayTrack);
        }

        return mergedTracks;
    }

    private mergeMorphTrackArrays(
        baseTracks: readonly MmdMorphAnimationTrack[],
        overlayTracks: readonly MmdMorphAnimationTrack[],
    ): MmdMorphAnimationTrack[] {
        const overlayByName = new Map<string, MmdMorphAnimationTrack>();
        for (const track of overlayTracks) {
            overlayByName.set(track.name, track);
        }

        const mergedTracks: MmdMorphAnimationTrack[] = [];
        const mergedNames = new Set<string>();

        for (const baseTrack of baseTracks) {
            const overlayTrack = overlayByName.get(baseTrack.name);
            if (!overlayTrack) {
                mergedTracks.push(baseTrack);
                continue;
            }
            mergedNames.add(baseTrack.name);
            mergedTracks.push(this.mergeMorphTrack(baseTrack, overlayTrack));
        }

        for (const overlayTrack of overlayTracks) {
            if (mergedNames.has(overlayTrack.name)) continue;
            mergedTracks.push(overlayTrack);
        }

        return mergedTracks;
    }

    private mergeMovableBoneTrack(
        baseTrack: MmdMovableBoneAnimationTrack,
        overlayTrack: MmdMovableBoneAnimationTrack,
    ): MmdMovableBoneAnimationTrack {
        const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
        const mergedTrack = new MmdMovableBoneAnimationTrack(baseTrack.name, mergedFrames.length);
        mergedTrack.frameNumbers.set(mergedFrames);

        const baseIndexMap = this.createFrameIndexMap(baseTrack.frameNumbers);
        const overlayIndexMap = this.createFrameIndexMap(overlayTrack.frameNumbers);

        for (let i = 0; i < mergedFrames.length; i += 1) {
            const frame = mergedFrames[i];
            const overlayIndex = overlayIndexMap.get(frame);
            if (overlayIndex !== undefined) {
                this.copyFloatFrameBlock(overlayTrack.positions, overlayIndex, 3, mergedTrack.positions, i);
                this.copyUint8FrameBlock(overlayTrack.positionInterpolations, overlayIndex, 12, mergedTrack.positionInterpolations, i);
                this.copyFloatFrameBlock(overlayTrack.rotations, overlayIndex, 4, mergedTrack.rotations, i);
                this.copyUint8FrameBlock(overlayTrack.rotationInterpolations, overlayIndex, 4, mergedTrack.rotationInterpolations, i);
                this.copyUint8FrameBlock(overlayTrack.physicsToggles, overlayIndex, 1, mergedTrack.physicsToggles, i);
                continue;
            }

            const baseIndex = baseIndexMap.get(frame);
            if (baseIndex === undefined) continue;
            this.copyFloatFrameBlock(baseTrack.positions, baseIndex, 3, mergedTrack.positions, i);
            this.copyUint8FrameBlock(baseTrack.positionInterpolations, baseIndex, 12, mergedTrack.positionInterpolations, i);
            this.copyFloatFrameBlock(baseTrack.rotations, baseIndex, 4, mergedTrack.rotations, i);
            this.copyUint8FrameBlock(baseTrack.rotationInterpolations, baseIndex, 4, mergedTrack.rotationInterpolations, i);
            this.copyUint8FrameBlock(baseTrack.physicsToggles, baseIndex, 1, mergedTrack.physicsToggles, i);
        }

        return mergedTrack;
    }

    private mergeBoneTrack(
        baseTrack: MmdBoneAnimationTrack,
        overlayTrack: MmdBoneAnimationTrack,
    ): MmdBoneAnimationTrack {
        const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
        const mergedTrack = new MmdBoneAnimationTrack(baseTrack.name, mergedFrames.length);
        mergedTrack.frameNumbers.set(mergedFrames);

        const baseIndexMap = this.createFrameIndexMap(baseTrack.frameNumbers);
        const overlayIndexMap = this.createFrameIndexMap(overlayTrack.frameNumbers);

        for (let i = 0; i < mergedFrames.length; i += 1) {
            const frame = mergedFrames[i];
            const overlayIndex = overlayIndexMap.get(frame);
            if (overlayIndex !== undefined) {
                this.copyFloatFrameBlock(overlayTrack.rotations, overlayIndex, 4, mergedTrack.rotations, i);
                this.copyUint8FrameBlock(overlayTrack.rotationInterpolations, overlayIndex, 4, mergedTrack.rotationInterpolations, i);
                this.copyUint8FrameBlock(overlayTrack.physicsToggles, overlayIndex, 1, mergedTrack.physicsToggles, i);
                continue;
            }

            const baseIndex = baseIndexMap.get(frame);
            if (baseIndex === undefined) continue;
            this.copyFloatFrameBlock(baseTrack.rotations, baseIndex, 4, mergedTrack.rotations, i);
            this.copyUint8FrameBlock(baseTrack.rotationInterpolations, baseIndex, 4, mergedTrack.rotationInterpolations, i);
            this.copyUint8FrameBlock(baseTrack.physicsToggles, baseIndex, 1, mergedTrack.physicsToggles, i);
        }

        return mergedTrack;
    }

    private mergeMorphTrack(
        baseTrack: MmdMorphAnimationTrack,
        overlayTrack: MmdMorphAnimationTrack,
    ): MmdMorphAnimationTrack {
        const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
        const mergedTrack = new MmdMorphAnimationTrack(baseTrack.name, mergedFrames.length);
        mergedTrack.frameNumbers.set(mergedFrames);

        const baseIndexMap = this.createFrameIndexMap(baseTrack.frameNumbers);
        const overlayIndexMap = this.createFrameIndexMap(overlayTrack.frameNumbers);

        for (let i = 0; i < mergedFrames.length; i += 1) {
            const frame = mergedFrames[i];
            const overlayIndex = overlayIndexMap.get(frame);
            if (overlayIndex !== undefined) {
                mergedTrack.weights[i] = overlayTrack.weights[overlayIndex];
                continue;
            }

            const baseIndex = baseIndexMap.get(frame);
            if (baseIndex === undefined) continue;
            mergedTrack.weights[i] = baseTrack.weights[baseIndex];
        }

        return mergedTrack;
    }
    private buildModelTrackFrameMapFromAnimation(animation: MmdAnimation, frameOffset = 0): Map<string, Uint32Array> {
        return buildModelTrackFrameMapFromAnimationImpl(this, animation, frameOffset);
    }

    private getActiveModelTimelineTracks(): KeyframeTrack[] {
        return getActiveModelTimelineTracksImpl(this);
    }
    private createCameraChannelTracks(frames: Uint32Array): KeyframeTrack[] {
        const cameraFrames = frames.length > 0 ? frames : EMPTY_KEYFRAME_FRAMES;
        return [
            { name: "Camera", category: "camera", frames: cameraFrames },
        ];
    }

    private getCameraTimelineTracks(): KeyframeTrack[] {
        return getCameraTimelineTracksImpl(this);
    }

    private getRegisteredKeyframeStats(): { hasAnyKeyframe: boolean; maxFrame: number } {
        return getRegisteredKeyframeStatsImpl(this);
    }

    private refreshTotalFramesFromContent(): void {
        refreshTotalFramesFromContentImpl(this);
    }

    private emitMergedKeyframeTracks(): void {
        emitMergedKeyframeTracksImpl(this);
    }

    private advanceManualPlaybackWithoutAudio(deltaMs: number): boolean {
        if (!this._isPlaying || !this.manualPlaybackWithoutAudio) return false;

        const deltaFrames = (deltaMs / (1000 / 30)) * this._playbackSpeed;
        this.manualPlaybackFrameCursor = Math.min(this._totalFrames, this.manualPlaybackFrameCursor + deltaFrames);
        const nextFrame = Math.floor(this.manualPlaybackFrameCursor);
        if (nextFrame !== this._currentFrame) {
            this._currentFrame = nextFrame;
            this.mmdRuntime.seekAnimation(this._currentFrame, true);
            this.syncViewportCameraFromMmdCameraAfterSeek();
        }
        return true;
    }

    private syncViewportCameraFromMmdCameraAfterSeek(): void {
        if (!this.hasActiveCameraAnimation()) return;
        if (!this._isPlaying && this.timelineTarget !== "camera") return;
        this.syncViewportCameraFromMmdCamera();
    }

    resize(): void {
        this.resizeToCanvasClientSize();
    }

    public setAutoRenderEnabled(enabled: boolean): void {
        this.autoRenderEnabled = Boolean(enabled);
        const now = performance.now();
        this.lastRenderTimestampMs = now;
        this.nextRenderDueTimestampMs = now;
    }

    public isPostEffectBackendReadyForCapture(): boolean {
        if (this.postEffectBackend !== "frameGraph" || !this.shouldExecuteFrameGraphPostEffects()) {
            return true;
        }
        return this.frameGraphPostEffectsController?.isReady() === true;
    }

    public async waitForPostEffectBackendReadyForCapture(timeoutMs = 8_000): Promise<boolean> {
        if (this.isPostEffectBackendReadyForCapture()) {
            return true;
        }

        const startedAt = performance.now();
        const timeout = Math.max(1, timeoutMs);
        while (performance.now() - startedAt < timeout) {
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
            });
            if (this.isPostEffectBackendReadyForCapture()) {
                return true;
            }
        }
        return this.isPostEffectBackendReadyForCapture();
    }

    public prepareExportRenderSurface(
        width: number,
        height: number,
    ): ExportRenderSurfaceDiagnostics {
        const normalizedWidth = Math.max(1, Math.floor(width));
        const normalizedHeight = Math.max(1, Math.floor(height));
        const currentSurface = this.exportRenderSurface;
        if (
            currentSurface
            && currentSurface.width === normalizedWidth
            && currentSurface.height === normalizedHeight
        ) {
            this.syncExportRenderSurfaceTarget();
            return currentSurface.getDiagnostics();
        }

        const rebuildFrameGraph = this.frameGraphPostEffectsController !== null;
        if (rebuildFrameGraph) {
            this.disposeFrameGraphPostEffectsController();
        }
        if (this.camera.outputRenderTarget === currentSurface?.renderTarget) {
            this.camera.outputRenderTarget = null;
        }
        currentSurface?.dispose();

        this.exportRenderSurface = new ExportRenderSurface(
            this.scene,
            this.camera,
            normalizedWidth,
            normalizedHeight,
        );
        if (rebuildFrameGraph) {
            this.initializePostEffectBackend();
        }
        this.syncExportRenderSurfaceTarget();
        const diagnostics = this.exportRenderSurface.getDiagnostics();
        logInfo("performance", "export render surface prepared", {
            ...diagnostics,
            engine: this.getEngineType(),
            postEffectBackend: this.postEffectBackend,
        });
        return diagnostics;
    }

    public async readExportRenderFrameAsync(): Promise<RenderedExportFrame> {
        const surface = this.exportRenderSurface;
        if (!surface) {
            throw new Error("Export render surface is not prepared");
        }
        return await surface.readFrameAsync("opaque");
    }

    public releaseExportRenderSurface(): void {
        const surface = this.exportRenderSurface;
        if (!surface) {
            return;
        }

        const rebuildFrameGraph = this.frameGraphPostEffectsController !== null;
        if (rebuildFrameGraph) {
            this.disposeFrameGraphPostEffectsController();
        }
        if (this.camera.outputRenderTarget === surface.renderTarget) {
            this.camera.outputRenderTarget = null;
        }
        surface.dispose();
        this.exportRenderSurface = null;
        if (rebuildFrameGraph) {
            this.initializePostEffectBackend();
        }
        logInfo("performance", "export render surface released", {
            engine: this.getEngineType(),
            postEffectBackend: this.postEffectBackend,
        });
    }

    public getExportRenderSurfaceDiagnostics(): ExportRenderSurfaceDiagnostics | null {
        return this.exportRenderSurface?.getDiagnostics() ?? null;
    }

    public renderOnce(deltaMs = 1000 / 30): void {
        const clampedDeltaMs = Math.max(0, Math.min(100, deltaMs));
        const now = performance.now();
        this.lastRenderTimestampMs = now;
        this.nextRenderDueTimestampMs = now;
        const engineWithDelta = this.engine as typeof this.engine & { _deltaTime?: number };
        engineWithDelta._deltaTime = clampedDeltaMs;
        const advancedManualPlayback = this.advanceManualPlaybackWithoutAudio(clampedDeltaMs);

        this.updateSimpleMotionBlurState(clampedDeltaMs);
        this.syncBackgroundVideoFrame();
        this.scene.render();
        if (!this._isPlaying) return;

        if (advancedManualPlayback) {
            this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
            return;
        }

        const runtimeFrame = Math.floor(this.mmdRuntime.currentFrameTime);
        this._currentFrame = Math.min(runtimeFrame, this._totalFrames);
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    public renderOnceForCapture(deltaMs = 1000 / 30): void {
        const clampedDeltaMs = Math.max(0, Math.min(100, deltaMs));
        const now = performance.now();
        this.lastRenderTimestampMs = now;
        this.nextRenderDueTimestampMs = now;
        const engineWithDelta = this.engine as typeof this.engine & { _deltaTime?: number };
        engineWithDelta._deltaTime = clampedDeltaMs;
        const advancedManualPlayback = this.advanceManualPlaybackWithoutAudio(clampedDeltaMs);

        this.syncExportRenderSurfaceTarget();
        this.syncFrameGraphRenderTargetState();
        this.updateSimpleMotionBlurState(clampedDeltaMs);
        this.syncBackgroundVideoFrame();
        try {
            this.scene.render();
        } catch (err: unknown) {
            if (this.tryRecoverFrameGraphRenderTargetFailure(err)) {
                return;
            }
            throw err;
        }
        this.executePostEffectBackend();
        if (!this._isPlaying) return;

        if (advancedManualPlayback) {
            this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
            return;
        }

        const runtimeFrame = Math.floor(this.mmdRuntime.currentFrameTime);
        this._currentFrame = Math.min(runtimeFrame, this._totalFrames);
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    public getRenderFpsLimit(): number {
        return this.renderFpsLimit;
    }

    public setRenderFpsLimit(limit: number): number {
        this.renderFpsLimit = MmdManager.normalizeRenderFpsLimit(limit);
        MmdManager.writeNumberLocalStorage(MmdManager.RENDER_FPS_LIMIT_STORAGE_KEY, this.renderFpsLimit);
        const now = performance.now();
        this.lastRenderTimestampMs = now;
        this.nextRenderDueTimestampMs = now;
        return this.renderFpsLimit;
    }

    private static normalizeRenderFpsLimit(limit: number): number {
        if (!Number.isFinite(limit)) return 60;
        const rounded = Math.floor(limit);
        if (rounded <= 0) return 0;
        if (rounded <= 30) return 30;
        return 60;
    }

    dispose(): void {
        this.disposeWebGpuValidationMonitor?.();
        this.disposeWebGpuValidationMonitor = null;
        this.renderingCanvas.removeEventListener("pointerdown", this.onCanvasPointerDown);
        this.renderingCanvas.removeEventListener("pointermove", this.onCanvasPointerMove);
        this.renderingCanvas.removeEventListener("pointerup", this.onCanvasPointerUp);
        this.renderingCanvas.removeEventListener("pointercancel", this.onCanvasPointerCancel);
        this.renderingCanvas.removeEventListener("pointerleave", this.onCanvasPointerCancel);
        this.renderingCanvas.removeEventListener("mousedown", this.onCanvasMouseDown);
        this.renderingCanvas.removeEventListener("auxclick", this.onCanvasAuxClick);
        this.renderingCanvas.removeEventListener("contextmenu", this.onCanvasContextMenu);
        this.renderingCanvas.removeEventListener("wheel", this.onCanvasWheel);
        this.disposeBoneGizmoSystem();
        window.removeEventListener("resize", this.onWindowResize);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
            this.audioBlobUrl = null;
        }
        if (this.audioPlayer) {
            void this.mmdRuntime.setAudioPlayer(null);
            this.audioPlayer.dispose();
            this.audioPlayer = null;
        }
        for (const sceneModel of this.sceneModels) {
            try {
                this.mmdRuntime.destroyMmdModel(sceneModel.model as never);
            } catch {
                // no-op
            }
            this.disposeContactShadowForModel(sceneModel);
            sceneModel.mesh.dispose();
        }
        this.sceneModels = [];
        this.disposeBoneVisualizer();
        this.disposeRigidBodyVisualizer();
        if (this.boneOverlayCanvas) {
            this.boneOverlayCanvas.remove();
            this.boneOverlayCanvas = null;
            this.boneOverlayCtx = null;
        }
        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }
        this.mmdRuntime.removeAnimatable(this.mmdCamera);
        this.mmdCamera.dispose();
        this.mmdRuntime.dispose(this.scene);
        this.physicsController.dispose();
        this.sceneInstrumentation?.dispose();
        this.sceneInstrumentation = null;
        this.shutdownPostEffectBackend();
        if (this.camera.outputRenderTarget === this.exportRenderSurface?.renderTarget) {
            this.camera.outputRenderTarget = null;
        }
        this.exportRenderSurface?.dispose();
        this.exportRenderSurface = null;
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.dispose();
            this.defaultRenderingPipeline = null;
        }
        if (this.lensRenderingPipeline) {
            this.lensRenderingPipeline.dispose(false);
            this.lensRenderingPipeline = null;
        }
        if (this.ssaoRenderingPipeline) {
            this.ssaoRenderingPipeline.dispose(true);
            this.ssaoRenderingPipeline = null;
        }
        if (this.ssaoPostProcess) {
            this.ssaoPostProcess.dispose(this.camera);
            this.ssaoPostProcess = null;
        }
        if (this.ssrRenderingPipeline) {
            this.ssrRenderingPipeline.dispose(false);
            this.ssrRenderingPipeline = null;
        }
        this.disablePrePassRendererIfSupported();
        if (this.motionBlurPostProcess) {
            this.motionBlurPostProcess.dispose(this.camera);
            this.motionBlurPostProcess = null;
        }
        if (this.standaloneBloomEffect) {
            this.standaloneBloomEffect.disposeEffects(this.camera);
            this.standaloneBloomEffect = null;
        }
        if (this.luminousGlowLayer) {
            this.luminousGlowLayer.dispose();
            this.luminousGlowLayer = null;
        }
        if (this.luminousGlowCoreLayer) {
            this.luminousGlowCoreLayer.dispose();
            this.luminousGlowCoreLayer = null;
        }
        if (this.standaloneLensBlurPostProcess) {
            this.standaloneLensBlurPostProcess.dispose(this.camera);
            this.standaloneLensBlurPostProcess = null;
        }
        if (this.standaloneEdgeBlurPostProcess) {
            this.standaloneEdgeBlurPostProcess.dispose(this.camera);
            this.standaloneEdgeBlurPostProcess = null;
        }
        if (this.volumetricLightPostProcess) {
            this.volumetricLightPostProcess.dispose(this.camera);
            this.volumetricLightPostProcess = null;
        }
        if (this.originFogPostProcess) {
            this.originFogPostProcess.dispose(this.camera);
            this.originFogPostProcess = null;
        }
        if (this.postEffectLutTexture) {
            this.postEffectLutTexture.dispose();
            this.postEffectLutTexture = null;
            this.postEffectLutTextureKey = null;
        }

        for (const blobUrl of this.postEffectLutPresetBlobUrlById.values()) {
            URL.revokeObjectURL(blobUrl);
        }
        this.postEffectLutPresetBlobUrlById.clear();
        if (this.postEffectLutExternalBlobUrl) {
            URL.revokeObjectURL(this.postEffectLutExternalBlobUrl);
            this.postEffectLutExternalBlobUrl = null;
        }
        if (this.colorCorrectionPostProcess) {
            this.colorCorrectionPostProcess.dispose(this.camera);
            this.colorCorrectionPostProcess = null;
        }
        if (this.standaloneLensBlurPostProcess) {
            this.standaloneLensBlurPostProcess.dispose(this.camera);
            this.standaloneLensBlurPostProcess = null;
        }
        if (this.standaloneEdgeBlurPostProcess) {
            this.standaloneEdgeBlurPostProcess.dispose(this.camera);
            this.standaloneEdgeBlurPostProcess = null;
        }
        if (this.finalLensDistortionPostProcess) {
            this.finalLensDistortionPostProcess.dispose(this.camera);
            this.finalLensDistortionPostProcess = null;
        }
        if (this.finalAntialiasPostProcess) {
            this.finalAntialiasPostProcess.dispose(this.camera);
            this.finalAntialiasPostProcess = null;
        }
        if (this.dofPostProcess) {
            this.dofPostProcess.dispose(this.camera);
            this.dofPostProcess = null;
        }
        if (this.depthRenderer) {
            this.depthRenderer.dispose();
            this.depthRenderer = null;
            MmdManager.toonContactAoDepthRenderer = null;
        }
        if (this.ssaoDepthRenderer) {
            this.disposeSsaoDepthRenderer();
        }
        if (MmdManager.toonContactAoFallbackTexture) {
            MmdManager.toonContactAoFallbackTexture.dispose();
            MmdManager.toonContactAoFallbackTexture = null;
        }
        if (this.iblShadowsPipeline) {
            this.iblShadowsPipeline.dispose();
            this.iblShadowsPipeline = null;
        }
        if (this.iblFallbackEnvironmentTexture) {
            if (this.scene.environmentTexture === this.iblFallbackEnvironmentTexture) {
                this.scene.environmentTexture = null;
            }
            this.iblFallbackEnvironmentTexture.dispose();
            this.iblFallbackEnvironmentTexture = null;
        }
        this.environmentLightingSuppressedTexture = null;
        this.environmentLightingLoadGeneration += 1;
        if (this.externalEnvironmentTexture) {
            if (this.scene.environmentTexture === this.externalEnvironmentTexture) {
                this.scene.environmentTexture = null;
            }
            this.externalEnvironmentTexture.dispose();
            this.externalEnvironmentTexture = null;
        }
        this.environmentLightingSourcePathValue = null;
        if (this.bundledEnvironmentTexture) {
            if (this.scene.environmentTexture === this.bundledEnvironmentTexture) {
                this.scene.environmentTexture = null;
            }
            this.bundledEnvironmentTexture.dispose();
            this.bundledEnvironmentTexture = null;
        }
        if (this.iblWebGpuCdfFallbackTexture) {
            this.iblWebGpuCdfFallbackTexture.dispose();
            this.iblWebGpuCdfFallbackTexture = null;
        }
        this.iblWebGpuSuppressedEnvironmentTexture = null;
        if (this.contactShadowMaterial) {
            this.contactShadowMaterial.dispose();
            this.contactShadowMaterial = null;
        }
        if (this.contactShadowTexture) {
            this.contactShadowTexture.dispose();
            this.contactShadowTexture = null;
        }
        if (this.contactShadowBlobTexture) {
            this.contactShadowBlobTexture.dispose();
            this.contactShadowBlobTexture = null;
        }
        if (this.skydomeMaterial) this.skydomeMaterial.reflectionTexture = null;
        this.environmentSkyboxTexture?.dispose();
        this.environmentSkyboxTexture = null;
        if (this.skydomeGradientTexture) {
            this.skydomeGradientTexture.dispose();
            this.skydomeGradientTexture = null;
        }
        if (this.skydomeMaterial) {
            this.skydomeMaterial.dispose();
            this.skydomeMaterial = null;
        }
        if (this.skydome) {
            this.skydome.dispose();
            this.skydome = null;
        }
        this.disposeMirroringFloorResources();
        this.clearBackgroundMedia();
        this.globalIlluminationController?.dispose();
        this.scene.dispose();
        this.engine.dispose();
    }

    private resizeToCanvasClientSize(): void {
        const width = Math.max(1, Math.floor(this.renderingCanvas.clientWidth));
        const height = Math.max(1, Math.floor(this.renderingCanvas.clientHeight));
        if (width === 0 || height === 0) return;

        this.resizeBoneOverlayCanvas();

        // Babylon's picking path applies hardwareScalingLevel to pointer coordinates,
        // so the drawing buffer must stay in scaled render pixels, not raw CSS pixels.
        const hardwareScalingLevel = Math.max(0.0001, this.engine.getHardwareScalingLevel());
        const renderWidth = Math.max(1, Math.round(width / hardwareScalingLevel));
        const renderHeight = Math.max(1, Math.round(height / hardwareScalingLevel));
        if (this.engine.getRenderWidth() !== renderWidth || this.engine.getRenderHeight() !== renderHeight) {
            this.engine.setSize(renderWidth, renderHeight);
            this.resizeGlobalIllumination();
            if (this.depthRenderer) {
                const depthMap = this.depthRenderer.getDepthMap();
                depthMap.resize({ width: renderWidth, height: renderHeight });
                if (this.defaultRenderingPipeline) {
                    this.defaultRenderingPipeline.depthOfField.depthTexture = depthMap;
                }
            }
            if (this.ssaoDepthRenderer) {
                this.disposeSsaoDepthRenderer();
                if (this.postEffectSsaoEnabledValue) {
                    this.configureSsaoDepthRenderer();
                    MmdManager.toonContactAoDepthRenderer = this.isWebGpuEngine() && this.postEffectSsaoEnabledValue
                        ? this.ssaoDepthRenderer
                        : null;
                }
            }
            if (this.ssaoPostProcess && this.postEffectSsaoEnabledValue) {
                this.ssaoPostProcess.dispose(this.camera);
                this.ssaoPostProcess = null;
                this.ensureSsaoFallbackPostProcess();
                this.enforceFinalPostProcessOrder();
            }
            this.refreshFrameGraphPostEffectsBackendAfterResize();
        }
        this.updateOrthographicCameraBounds();
    }

    private resizeGlobalIllumination(): void {
        this.globalIlluminationController?.resize();
    }
}

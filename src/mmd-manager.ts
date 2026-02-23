import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebGPUTintWASM } from "@babylonjs/core/Engines/WebGPU/webgpuTintWASM";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { CreateScreenshotUsingRenderTargetAsync } from "@babylonjs/core/Misc/screenshotTools";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { LensRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/lensRenderingPipeline";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
import { GizmoManager } from "@babylonjs/core/Gizmos/gizmoManager";
import type { DepthRenderer } from "@babylonjs/core/Rendering/depthRenderer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type {
    BoneControlInfo,
    MmdModokiProjectFileV1,
    ModelInfo,
    MotionInfo,
    ProjectMotionImport,
    ProjectKeyframeBundle,
    ProjectNumberArray,
    ProjectPackedArray,
    ProjectSerializedBoneTrack,
    ProjectSerializedCameraTrack,
    ProjectSerializedModelAnimation,
    ProjectSerializedMorphTrack,
    ProjectSerializedMovableBoneTrack,
    ProjectSerializedPropertyTrack,
    KeyframeTrack,
    TrackCategory,
} from "./types";
import type { IMmdRuntimeBone } from "babylon-mmd/esm/Runtime/IMmdRuntimeBone";

type EditorRuntimeBone = IMmdRuntimeBone & {
    getAnimationPositionOffsetToRef(target: Vector3): Vector3;
    getAnimatedRotationToRef(target: Quaternion): Quaternion;
};

/** È¨ØÅEÆ„ÉªÅEÆÈóïÔΩµË≠èÔΩ¥ÁπùÔΩªÈ´´ÅE∞Ë≠¥ÅEß„ÉªÅE∫ËõüÔΩ•ÁπùÔΩªÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE®È¨ÆÅEØ„ÉªÅE∑ÁπùÔΩª„ÉªÅEªÈ¨ÆÅEÆË´õÔΩ∂„ÉªÅEΩ„ÉªÅE£ÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEΩÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE∫È¨ÆÅE´„ÉªÅE∞È´ÆÂÖ∑ÅEΩÅEªÁπùÔΩª„ÉªÅEΩÁπùÔΩª„ÉªÅE∂È¨©Âπ¢ÅEΩÅE¢Èö¥Ë∂£ÅEΩÅE¢ÁπùÔΩª„ÉªÅEΩÁπùÔΩª„ÉªÅEªÈ¨ØÅE©Ëü∑ÅE¢„ÉªÅEΩ„ÉªÅE¢È´´ÅE¥ÈõúÔΩ£„ÉªÅEΩ„ÉªÅE¢ÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEΩÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEºÈ¨ØÅE©Ëü∑ÅE¢„ÉªÅEΩ„ÉªÅE¢È´´ÅE¥ÈõúÔΩ£„ÉªÅEΩ„ÉªÅE¢ÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEΩÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE≥È¨©Âπ¢ÅEΩÅE¢Èö¥Ë∂£ÅEΩÅE¢ÁπùÔΩª„ÉªÅEΩÁπùÔΩª„ÉªÅEªÈ¨©Âπ¢ÅEΩÅE¢Èö¥Ë∂£ÅEΩÅE¢ÁπùÔΩª„ÉªÅEΩÁπùÔΩª„ÉªÅEªMDÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE∂È´¥Èõ£ÅEΩÅE£ÈôãÊªÇÔΩΩÅE°ÁπùÔΩª„ÉªÅE∂Èö≤Â∏∑ÅEøÅE´ÁπùÔΩªÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE∫È¨ÆÅEØËÆìÂ•ÅEΩΩÅEªÈòÆÂê∂„ÉªÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEΩÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE™È©õÔΩ¢Ë≠éÔΩ¢„ÉªÅEΩ„ÉªÅEªÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE®È¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE¥ÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE¨È©õÔΩ¢Ë≠éÔΩ¢„ÉªÅEΩ„ÉªÅEªÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEºÈ¨©Âπ¢ÅEΩÅE¢Èö¥Ë∂£ÅEΩÅE¢ÁπùÔΩª„ÉªÅEΩÁπùÔΩª„ÉªÅEªÈ¨ÆÅEØË≠éÔΩ¢„ÉªÅEΩ„ÉªÅE≤ÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE®ÈÉ¢Êô¢ÅEΩÅEªÈô∑ÅEøË¨îÔΩ∂Ë≤ÇÂ§ÇÔΩπÊô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEπÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEßÈ©õÔΩ¢Ë≠éÔΩ¢„ÉªÅEΩ„ÉªÅEªÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅEπÈ¨ØÅE©Ëü∑ÅE¢„ÉªÅEΩ„ÉªÅE¢È´´ÅE¥Ë¨´ÅEæ„ÉªÅEΩ„ÉªÅE¥È©õÔΩ¢Ë≠éÔΩ¢„ÉªÅEΩ„ÉªÅEª*/
const SEMI_STANDARD_BONES = new Set<string>();
const EMPTY_KEYFRAME_FRAMES = new Uint32Array(0);
const TRACK_KEY_SEPARATOR = "\u001f";
const PMX_BONE_FLAG_VISIBLE = 0x0008;
const PMX_BONE_FLAG_ROTATABLE = 0x0002;
const PMX_BONE_FLAG_MOVABLE = 0x0004;
const PMX_RIGID_BODY_MODE_FOLLOW_BONE = 0;

function classifyBone(name: string): TrackCategory {
    if (name === "È´ØÅE∑ÈóåÔΩ®„ÉªÅEΩ„ÉªÅE®È©çÔΩµ„ÉªÅE∫ÁπùÔΩª„ÉªÅE¶È©çÔΩµ„ÉªÅE∫ÁπùÔΩª„ÉªÅEÆÈ¨ÆÅE´Ëõπ„ÉªÅEΩÅEΩ„ÉªÅE™") return "root";
    if (SEMI_STANDARD_BONES.has(name)) return "semi-standard";
    return "bone";
}


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

function hasFrameNumber(frames: Uint32Array, frame: number): boolean {
    let lo = 0;
    let hi = frames.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (frames[mid] < frame) lo = mid + 1;
        else hi = mid;
    }
    return lo < frames.length && frames[lo] === frame;
}

function addFrameNumber(frames: Uint32Array, frame: number): Uint32Array {
    if (frames.length === 0) return new Uint32Array([frame]);

    let lo = 0;
    let hi = frames.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (frames[mid] < frame) lo = mid + 1;
        else hi = mid;
    }

    if (lo < frames.length && frames[lo] === frame) {
        return frames;
    }

    const next = new Uint32Array(frames.length + 1);
    if (lo > 0) next.set(frames.subarray(0, lo), 0);
    next[lo] = frame;
    if (lo < frames.length) next.set(frames.subarray(lo), lo + 1);
    return next;
}

function removeFrameNumber(frames: Uint32Array, frame: number): Uint32Array {
    if (frames.length === 0) return frames;

    let lo = 0;
    let hi = frames.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (frames[mid] < frame) lo = mid + 1;
        else hi = mid;
    }
    if (lo >= frames.length || frames[lo] !== frame) {
        return frames;
    }
    if (frames.length === 1) return EMPTY_KEYFRAME_FRAMES;

    const next = new Uint32Array(frames.length - 1);
    if (lo > 0) next.set(frames.subarray(0, lo), 0);
    if (lo < frames.length - 1) next.set(frames.subarray(lo + 1), lo);
    return next;
}

function moveFrameNumber(frames: Uint32Array, fromFrame: number, toFrame: number): Uint32Array {
    if (fromFrame === toFrame) return frames;
    const removed = removeFrameNumber(frames, fromFrame);
    if (removed === frames) return frames;
    return addFrameNumber(removed, toFrame);
}

function createTrackKey(category: TrackCategory, name: string): string {
    return `${category}${TRACK_KEY_SEPARATOR}${name}`;
}

function parseTrackKey(key: string): { category: TrackCategory; name: string } | null {
    const separatorIndex = key.indexOf(TRACK_KEY_SEPARATOR);
    if (separatorIndex <= 0) return null;
    const category = key.slice(0, separatorIndex) as TrackCategory;
    const name = key.slice(separatorIndex + TRACK_KEY_SEPARATOR.length);
    if (!name) return null;
    return { category, name };
}

// Side effects - register loaders
import "babylon-mmd/esm/Loader/pmxLoader";
import "babylon-mmd/esm/Loader/pmdLoader";
import "babylon-mmd/esm/Loader/mmdOutlineRenderer";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeModelAnimation";
import "babylon-mmd/esm/Runtime/Animation/mmdRuntimeCameraAnimation";
import "@babylonjs/core/Materials/Textures/Loaders/tgaTextureLoader";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.dynamicTexture";
import "@babylonjs/core/ShadersWGSL/postprocess.vertex";
import "@babylonjs/core/ShadersWGSL/imageProcessing.fragment";
import "@babylonjs/core/ShadersWGSL/fxaa.vertex";
import "@babylonjs/core/ShadersWGSL/fxaa.fragment";
import "@babylonjs/core/ShadersWGSL/circleOfConfusion.fragment";
import "@babylonjs/core/ShadersWGSL/depthOfFieldMerge.fragment";
import "@babylonjs/core/ShadersWGSL/kernelBlur.vertex";
import "@babylonjs/core/ShadersWGSL/kernelBlur.fragment";

import { MmdRuntime } from "babylon-mmd/esm/Runtime/mmdRuntime";
import { MmdCamera } from "babylon-mmd/esm/Runtime/mmdCamera";
import { VmdLoader } from "babylon-mmd/esm/Loader/vmdLoader";
import { VpdLoader } from "babylon-mmd/esm/Loader/vpdLoader";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdBoneAnimationTrack, MmdCameraAnimationTrack, MmdMorphAnimationTrack, MmdMovableBoneAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import { MmdStandardMaterialProxy } from "babylon-mmd/esm/Runtime/mmdStandardMaterialProxy";
import { MmdStandardMaterialBuilder } from "babylon-mmd/esm/Loader/mmdStandardMaterialBuilder";
import { MmdModelLoader } from "babylon-mmd/esm/Loader/mmdModelLoader";
import { SdefInjector } from "babylon-mmd/esm/Loader/sdefInjector";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";
import { MmdAmmoJSPlugin } from "babylon-mmd/esm/Runtime/Physics/mmdAmmoJSPlugin";
import { MmdAmmoPhysics } from "babylon-mmd/esm/Runtime/Physics/mmdAmmoPhysics";
import Ammo from "babylon-mmd/esm/Runtime/Physics/External/ammo.wasm";
// eslint-disable-next-line import/no-unresolved
import ammoWasmBinaryUrl from "babylon-mmd/esm/Runtime/Physics/External/ammo.wasm.wasm?url";
// eslint-disable-next-line import/no-unresolved
import glslangJsUrl from "@babylonjs/core/assets/glslang/glslang.js?url";
// eslint-disable-next-line import/no-unresolved
import glslangWasmUrl from "@babylonjs/core/assets/glslang/glslang.wasm?url";
// eslint-disable-next-line import/no-unresolved
import twgslJsUrl from "@babylonjs/core/assets/twgsl/twgsl.js?url";
// eslint-disable-next-line import/no-unresolved
import twgslWasmUrl from "@babylonjs/core/assets/twgsl/twgsl.wasm?url";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";

import type { MmdMesh } from "babylon-mmd/esm/Runtime/mmdMesh";
import type { MmdModel } from "babylon-mmd/esm/Runtime/mmdModel";
import type { MmdRuntimeAnimationHandle } from "babylon-mmd/esm/Runtime/mmdRuntimeAnimationHandle";

export class MmdManager {
    private static readonly RENDER_ENGINE_OPTIONS = {
        preserveDrawingBuffer: false,
        stencil: true,
        antialias: false,
        alpha: false,
        premultipliedAlpha: false,
        desynchronized: false,
        powerPreference: "high-performance" as const,
    };

    private readonly renderingCanvas: HTMLCanvasElement;
    private engine: Engine | WebGPUEngine;
    private scene: Scene;
    private camera: ArcRotateCamera;
    private mmdCamera: MmdCamera;
    private mmdRuntime: MmdRuntime;
    private vmdLoader: VmdLoader;
    private vpdLoader: VpdLoader;
    private currentMesh: MmdMesh | null = null;
    private currentModel: MmdModel | null = null;
    private activeModelInfo: ModelInfo | null = null;
    private sceneModels: { mesh: MmdMesh; model: MmdModel; info: ModelInfo }[] = [];
    private _isPlaying = false;
    private _currentFrame = 0;
    private _totalFrames = 300;
    private _playbackSpeed = 1;
    private manualPlaybackWithoutAudio = false;
    private manualPlaybackFrameCursor = 0;
    private lastRenderTimestampMs = performance.now();
    private ground: Mesh | null = null;
    private skydome: Mesh | null = null;
    private audioPlayer: StreamAudioPlayer | null = null;
    private audioBlobUrl: string | null = null;
    // Lighting references
    private dirLight!: DirectionalLight;
    private hemiLight!: HemisphericLight;
    private shadowGenerator!: ShadowGenerator;
    private cameraRotationEulerDeg = new Vector3(0, 0, 0);
    private cameraAnimationHandle: MmdRuntimeAnimationHandle | null = null;
    private hasCameraMotion = false;
    private readonly modelKeyframeTracksByModel = new WeakMap<MmdModel, Map<string, Uint32Array>>();
    private readonly modelSourceAnimationsByModel = new WeakMap<MmdModel, MmdAnimation>();
    private cameraSourceAnimation: MmdAnimation | null = null;
    private readonly modelMotionImportsByModel = new WeakMap<MmdModel, ProjectMotionImport[]>();
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
    private boneVisualizerPickPoints: { boneName: string; x: number; y: number }[] = [];
    private bonePickPointerDown: { pointerId: number; clientX: number; clientY: number } | null = null;
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
    private physicsPlugin: MmdAmmoJSPlugin | null = null;
    private physicsRuntime: MmdAmmoPhysics | null = null;
    private physicsInitializationPromise: Promise<boolean>;
    private physicsAvailable = false;
    private physicsEnabled = true;
    private physicsGravityAcceleration = 98;
    private physicsGravityDirection = new Vector3(0, -100, 0);
    private shadowEnabled = true;
    private shadowDarknessValue = 0.45;
    private selfShadowEdgeSoftnessValue = 0.035;
    private occlusionShadowEdgeSoftnessValue = 0.035;
    private lightColorTemperatureKelvin = 6500;
    private postEffectContrastValue = 1;
    private postEffectGammaValue = 1;
    private antialiasEnabledValue = true;
    private postEffectFarDofStrengthValue = 0;
    private readonly farDofEnabled = false;
    private readonly farDofFocusSharpRadiusMm = 1000;
    private modelEdgeWidthValue = 0;
    private readonly modelEdgeMaterialDefaults = new WeakMap<object, { enabled: boolean; width: number; alpha: number; colorR: number; colorG: number; colorB: number }>();
    private colorCorrectionPostProcess: PostProcess | null = null;
    private finalAntialiasPostProcess: FxaaPostProcess | null = null;
    private finalLensDistortionPostProcess: PostProcess | null = null;
    private dofPostProcess: PostProcess | null = null;
    private depthRenderer: DepthRenderer | null = null;
    private defaultRenderingPipeline: DefaultRenderingPipeline | null = null;
    private lensRenderingPipeline: LensRenderingPipeline | null = null;
    private dofEnabledValue = false;
    private dofBlurLevelValue = DepthOfFieldEffectBlurLevel.Medium;
    private dofFocusDistanceMmValue = 55000;
    private dofFStopValue = 2.8;
    private dofEffectiveFStopValue = 2.8;
    private dofLensBlurStrengthValue = 0;
    private dofLensBlurEnabledValue = true;
    private dofLensEdgeBlurValue = 0;
    private dofLensDistortionValue = 0;
    private readonly dofLensDistortionFollowsCameraFov = true;
    private readonly dofLensDistortionNeutralFovDeg = 30;
    private readonly dofLensDistortionMinTeleFovDeg = 10;
    private readonly dofLensDistortionMaxWideFovDeg = 120;
    private dofLensDistortionInfluenceValue = 0;
    private readonly dofLensHighlightsBaseGain = 0.8;
    private readonly dofLensHighlightsGainRange = 6.2;
    private readonly dofLensHighlightsBaseThreshold = 0.92;
    private readonly dofLensHighlightsThresholdRange = 0.87;
    private dofLensSizeValue = 30;
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
    private resizeObserver: ResizeObserver | null = null;
    private readonly onWindowResize = () => {
        this.resize();
    };
    private readonly onCanvasPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        this.bonePickPointerDown = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
        };
    };
    private readonly onCanvasPointerUp = (event: PointerEvent) => {
        if (event.button !== 0) return;

        const pointerDown = this.bonePickPointerDown;
        this.bonePickPointerDown = null;
        if (!pointerDown || pointerDown.pointerId !== event.pointerId) return;

        const movedDistance = Math.hypot(event.clientX - pointerDown.clientX, event.clientY - pointerDown.clientY);
        if (movedDistance > 6) return;

        this.tryPickBoneVisualizerAtClientPosition(event.clientX, event.clientY);
    };
    private readonly onCanvasPointerCancel = () => {
        this.bonePickPointerDown = null;
    };

    // Callbacks
    public onFrameUpdate: ((frame: number, total: number) => void) | null = null;
    public onModelLoaded: ((info: ModelInfo) => void) | null = null;
    public onSceneModelLoaded: ((info: ModelInfo, totalCount: number, active: boolean) => void) | null = null;
    public onMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onCameraMotionLoaded: ((info: MotionInfo) => void) | null = null;
    public onKeyframesLoaded: ((tracks: KeyframeTrack[]) => void) | null = null;
    public onError: ((message: string) => void) | null = null;
    public onAudioLoaded: ((name: string) => void) | null = null;
    public onPhysicsStateChanged: ((enabled: boolean, available: boolean) => void) | null = null;
    public onBoneVisualizerBonePicked: ((boneName: string) => void) | null = null;

    public getLoadedModels(): { index: number; name: string; path: string; active: boolean }[] {
        return this.sceneModels.map((entry, index) => ({
            index,
            name: entry.info.name,
            path: entry.info.path,
            active: entry.model === this.currentModel,
        }));
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

    private setModelMotionImports(model: MmdModel, imports: ProjectMotionImport[]): void {
        this.modelMotionImportsByModel.set(model, imports.map((item) => ({ ...item })));
    }

    private appendModelMotionImport(model: MmdModel, value: ProjectMotionImport): void {
        const current = this.modelMotionImportsByModel.get(model) ?? [];
        current.push({ ...value });
        this.modelMotionImportsByModel.set(model, current);
    }

    private normalizePathForCompare(value: string): string {
        return value.replace(/\\/g, "/").toLowerCase();
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

        this.currentMesh.setEnabled(visible);
        this.currentMesh.isVisible = visible;

        for (const childMesh of this.currentMesh.getChildMeshes()) {
            childMesh.setEnabled(visible);
            childMesh.isVisible = visible;
        }

        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
        return visible;
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

        try {
            this.mmdRuntime.destroyMmdModel(removed.model);
        } catch {
            // no-op
        }

        this.modelKeyframeTracksByModel.delete(removed.model);
        this.modelSourceAnimationsByModel.delete(removed.model);
        this.modelMotionImportsByModel.delete(removed.model);
        removed.mesh.dispose();
        this.sceneModels.splice(removeIndex, 1);

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
        this.updateBoneGizmoTarget();
        this.onModelLoaded?.(target.info);
        this.emitMergedKeyframeTracks();
        return true;
    }

    public setTimelineTarget(target: "model" | "camera"): void {
        this.timelineTarget = target;
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.emitMergedKeyframeTracks();
    }

    public getTimelineTarget(): "model" | "camera" {
        return this.timelineTarget;
    }

    public setBoneVisualizerSelectedBone(boneName: string | null): void {
        this.boneVisualizerSelectedBoneName = boneName && boneName.length > 0 ? boneName : null;
        this.updateBoneGizmoTarget();
    }

    private getActiveBoneControlInfo(boneName: string): BoneControlInfo | undefined {
        return this.activeModelInfo?.boneControlInfos?.find((info) => info.name === boneName);
    }

    private updateBoneGizmoTarget(): void {
        const gizmoManager = this.boneGizmoManager;
        const proxyNode = this.boneGizmoProxyNode;
        if (!gizmoManager || !proxyNode) return;

        if (this.timelineTarget !== "model" || this._isPlaying || !this.getActiveModelVisibility()) {
            this.disableBoneGizmo();
            return;
        }

        const boneName = this.boneVisualizerSelectedBoneName;
        if (!boneName) {
            this.disableBoneGizmo();
            return;
        }

        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) {
            this.disableBoneGizmo();
            return;
        }

        const controlInfo = this.getActiveBoneControlInfo(boneName);
        const movable = controlInfo?.movable ?? true;
        const rotatable = controlInfo?.rotatable ?? true;

        if (!movable && !rotatable) {
            this.disableBoneGizmo();
            return;
        }

        this.syncBoneGizmoProxyToRuntimeBone(runtimeBone);

        gizmoManager.scaleGizmoEnabled = false;
        gizmoManager.boundingBoxGizmoEnabled = false;
        gizmoManager.positionGizmoEnabled = movable;
        gizmoManager.rotationGizmoEnabled = rotatable;
        proxyNode.setEnabled(true);
        gizmoManager.attachToNode(proxyNode);

        this.boneGizmoRuntimeBone = runtimeBone;
        this.invalidateBoneVisualizerPose(runtimeBone);
    }

    private disableBoneGizmo(): void {
        const gizmoManager = this.boneGizmoManager;
        if (gizmoManager) {
            gizmoManager.attachToNode(null);
            gizmoManager.positionGizmoEnabled = false;
            gizmoManager.rotationGizmoEnabled = false;
        }

        this.boneGizmoRuntimeBone = null;
        this.boneGizmoProxyNode?.setEnabled(false);
    }

    private syncBoneGizmoProxyToRuntimeBone(runtimeBone: EditorRuntimeBone): void {
        const proxyNode = this.boneGizmoProxyNode;
        if (!proxyNode) return;

        runtimeBone.getWorldMatrixToRef(this.boneGizmoTempMatrix);
        this.boneGizmoTempMatrix.decompose(
            this.boneGizmoTempScale,
            this.boneGizmoTempRotation,
            this.boneGizmoTempPosition
        );

        const useMeshWorldMatrix = this.boneVisualizerTarget?.runtimeUseMeshWorldMatrix === true && this.currentMesh !== null;
        if (useMeshWorldMatrix && this.currentMesh) {
            const meshWorldMatrix = this.currentMesh.computeWorldMatrix(true);
            Vector3.TransformCoordinatesToRef(this.boneGizmoTempPosition, meshWorldMatrix, this.boneGizmoTempPosition2);
            meshWorldMatrix.decompose(
                this.boneGizmoTempScale2,
                this.boneGizmoTempRotation2,
                this.boneGizmoTempPosition3
            );
            this.boneGizmoTempRotation2.multiplyToRef(
                this.boneGizmoTempRotation,
                this.boneGizmoTempRotation
            );
            proxyNode.position.copyFrom(this.boneGizmoTempPosition2);
        } else {
            proxyNode.position.copyFrom(this.boneGizmoTempPosition);
        }

        if (!proxyNode.rotationQuaternion) {
            proxyNode.rotationQuaternion = Quaternion.Identity();
        }
        proxyNode.rotationQuaternion.copyFrom(this.boneGizmoTempRotation);
    }

    private applyBoneGizmoProxyToRuntimeBone(runtimeBone: EditorRuntimeBone): void {
        const proxyNode = this.boneGizmoProxyNode;
        if (!proxyNode) return;

        const controlInfo = this.getActiveBoneControlInfo(runtimeBone.name);
        const movable = controlInfo?.movable ?? true;
        const rotatable = controlInfo?.rotatable ?? true;
        if (!movable && !rotatable) return;

        proxyNode.computeWorldMatrix(true);
        proxyNode.getWorldMatrix().decompose(
            this.boneGizmoTempScale,
            this.boneGizmoTempRotation,
            this.boneGizmoTempPosition
        );

        const useMeshWorldMatrix = this.boneVisualizerTarget?.runtimeUseMeshWorldMatrix === true && this.currentMesh !== null;
        if (useMeshWorldMatrix && this.currentMesh) {
            const meshWorldMatrix = this.currentMesh.computeWorldMatrix(true);
            meshWorldMatrix.invertToRef(this.boneGizmoTempMatrix2);
            Vector3.TransformCoordinatesToRef(this.boneGizmoTempPosition, this.boneGizmoTempMatrix2, this.boneGizmoTempPosition2);

            meshWorldMatrix.decompose(
                this.boneGizmoTempScale2,
                this.boneGizmoTempRotation2,
                this.boneGizmoTempPosition3
            );
            Quaternion.InverseToRef(this.boneGizmoTempRotation2, this.boneGizmoTempRotation2);
            this.boneGizmoTempRotation2.multiplyToRef(
                this.boneGizmoTempRotation,
                this.boneGizmoTempRotation
            );
        } else {
            this.boneGizmoTempPosition2.copyFrom(this.boneGizmoTempPosition);
        }

        let localPositionX = this.boneGizmoTempPosition2.x;
        let localPositionY = this.boneGizmoTempPosition2.y;
        let localPositionZ = this.boneGizmoTempPosition2.z;
        let localRotation = this.boneGizmoTempRotation;

        const parentBone = runtimeBone.parentBone as EditorRuntimeBone | null;
        if (parentBone) {
            parentBone.getWorldMatrixToRef(this.boneGizmoTempMatrix);
            this.boneGizmoTempMatrix.invertToRef(this.boneGizmoTempMatrix2);
            Vector3.TransformCoordinatesToRef(
                this.boneGizmoTempPosition2,
                this.boneGizmoTempMatrix2,
                this.boneGizmoTempPosition3
            );
            localPositionX = this.boneGizmoTempPosition3.x;
            localPositionY = this.boneGizmoTempPosition3.y;
            localPositionZ = this.boneGizmoTempPosition3.z;

            this.boneGizmoTempMatrix.decompose(
                this.boneGizmoTempScale2,
                this.boneGizmoTempRotation2,
                this.boneGizmoTempPosition3
            );
            Quaternion.InverseToRef(this.boneGizmoTempRotation2, this.boneGizmoTempRotation2);
            this.boneGizmoTempRotation2.multiplyToRef(this.boneGizmoTempRotation, this.boneGizmoTempRotation2);
            localRotation = this.boneGizmoTempRotation2;
        }

        if (movable && Number.isFinite(localPositionX) && Number.isFinite(localPositionY) && Number.isFinite(localPositionZ)) {
            runtimeBone.linkedBone.position.set(localPositionX, localPositionY, localPositionZ);
        }

        if (rotatable && Number.isFinite(localRotation.x) && Number.isFinite(localRotation.y) && Number.isFinite(localRotation.z) && Number.isFinite(localRotation.w)) {
            if (!runtimeBone.linkedBone.rotationQuaternion) {
                runtimeBone.linkedBone.rotationQuaternion = Quaternion.Identity();
            }
            localRotation.normalize();
            runtimeBone.linkedBone.rotationQuaternion.copyFrom(localRotation);
        }
    }
    private refreshBoneVisualizerTarget(): void {
        this.disposeBoneVisualizer();

        const sourceMesh = this.currentMesh;
        if (!sourceMesh) return;

        const visibleBoneNameSet = this.activeModelInfo
            ? new Set(this.activeModelInfo.boneNames)
            : null;
        const boneControlInfoByName = new Map<string, BoneControlInfo>(
            (this.activeModelInfo?.boneControlInfos ?? []).map((info) => [info.name, info] as const)
        );

        const runtimeBones = this.currentModel?.runtimeBones as readonly IMmdRuntimeBone[] | undefined;
        if (runtimeBones && runtimeBones.length > 0) {
            const runtimeBoneIndexMap = new Map(runtimeBones.map((bone, index) => [bone, index] as const));
            const runtimePairs: Array<[number, number]> = [];
            for (let i = 0; i < runtimeBones.length; ++i) {
                const childName = runtimeBones[i].name;
                if (visibleBoneNameSet && !visibleBoneNameSet.has(childName)) continue;

                const parent = runtimeBones[i].parentBone;
                if (!parent) continue;
                if (visibleBoneNameSet && !visibleBoneNameSet.has(parent.name)) continue;

                const parentIndex = runtimeBoneIndexMap.get(parent);
                if (parentIndex === undefined) continue;
                runtimePairs.push([i, parentIndex]);
            }

            if (runtimePairs.length > 0) {
                sourceMesh.computeWorldMatrix(true);
                const sampleLocal = new Vector3();
                const sampleWorld = new Vector3();
                runtimeBones[0].getWorldTranslationToRef(sampleLocal);
                Vector3.TransformCoordinatesToRef(sampleLocal, sourceMesh.getWorldMatrix(), sampleWorld);
                const meshWorld = sourceMesh.getAbsolutePosition();
                const rawDistance = Vector3.DistanceSquared(sampleLocal, meshWorld);
                const transformedDistance = Vector3.DistanceSquared(sampleWorld, meshWorld);
                const runtimeUseMeshWorldMatrix = transformedDistance <= rawDistance;

                console.log("[BoneViz] Overlay target:", {
                    mode: "runtime",
                    mesh: sourceMesh.name,
                    bones: runtimeBones.length,
                    visibleBones: visibleBoneNameSet?.size ?? runtimeBones.length,
                    pairs: runtimePairs.length,
                    runtimeUseMeshWorldMatrix,
                });

                this.boneVisualizerTarget = {
                    mesh: sourceMesh,
                    skeleton: sourceMesh.skeleton ?? null,
                    pairs: runtimePairs,
                    positionMesh: sourceMesh,
                    runtimeBones,
                    runtimeUseMeshWorldMatrix,
                    boneControlInfoByName,
                };
                this.ensureBoneOverlayCanvas();
                this.syncBoneVisualizerVisibility();
                return;
            }
        }

        const skeletonHost = (
            sourceMesh.skeleton
                ? sourceMesh
                : sourceMesh.getChildMeshes().find((child) => !!child.skeleton)
        ) as Mesh | undefined;
        const skeleton = skeletonHost?.skeleton;
        if (!skeletonHost || !skeleton || skeleton.bones.length === 0) return;

        const bones = skeleton.bones;
        const boneIndexMap = new Map(skeleton.bones.map((bone, index) => [bone, index] as const));
        const pairs: Array<[number, number]> = [];
        for (let i = 0; i < bones.length; ++i) {
            const childName = bones[i].name;
            if (visibleBoneNameSet && !visibleBoneNameSet.has(childName)) continue;

            const parent = bones[i].getParent();
            if (!parent) continue;
            if (visibleBoneNameSet && !visibleBoneNameSet.has(parent.name)) continue;

            const parentIndex = boneIndexMap.get(parent);
            if (parentIndex === undefined) continue;
            pairs.push([i, parentIndex]);
        }
        if (pairs.length === 0) return;

        skeleton.computeAbsoluteMatrices(true);

        const skeletonMeshes: Mesh[] = [];
        const pushMesh = (mesh: Mesh | null | undefined): void => {
            if (!mesh) return;
            if (mesh.skeleton !== skeleton) return;
            if (skeletonMeshes.includes(mesh)) return;
            skeletonMeshes.push(mesh);
        };

        pushMesh(sourceMesh);
        pushMesh(skeletonHost);
        for (const child of sourceMesh.getChildMeshes() as Mesh[]) {
            pushMesh(child);
        }

        let positionMesh = skeletonHost;
        let positionMeshVertices = -1;
        for (const candidate of skeletonMeshes) {
            const vertices = candidate.getTotalVertices?.() ?? 0;
            if (vertices > positionMeshVertices) {
                positionMeshVertices = vertices;
                positionMesh = candidate;
            }
        }

        console.log("[BoneViz] Overlay target:", {
            mode: "skeleton",
            mesh: skeletonHost.name,
            bones: bones.length,
            visibleBones: visibleBoneNameSet?.size ?? bones.length,
            pairs: pairs.length,
            positionMesh: positionMesh.name,
            positionMeshVertices,
            skeletonMeshes: skeletonMeshes.length,
        });

        this.boneVisualizerTarget = {
            mesh: skeletonHost,
            skeleton,
            pairs,
            positionMesh,
            runtimeBones: null,
            runtimeUseMeshWorldMatrix: false,
            boneControlInfoByName,
        };
        this.ensureBoneOverlayCanvas();
        this.syncBoneVisualizerVisibility();
    }

    private updateBoneVisualizer(): void {
        const target = this.boneVisualizerTarget;
        if (!target || !this.boneOverlayCanvas || !this.boneOverlayCtx) return;

        if (this._isPlaying || this.timelineTarget !== "model" || !this.getActiveModelVisibility()) {
            this.clearBoneOverlay();
            return;
        }

        const { mesh, skeleton, pairs, positionMesh, runtimeBones, runtimeUseMeshWorldMatrix, boneControlInfoByName } = target;
        const ctx = this.boneOverlayCtx;
        const width = this.boneOverlayCanvas.width / this.boneOverlayDpr;
        const height = this.boneOverlayCanvas.height / this.boneOverlayDpr;
        const viewport = this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight());
        const transformMatrix = this.scene.getTransformMatrix();
        const selectedBoneName = this.boneVisualizerSelectedBoneName;

        mesh.computeWorldMatrix(true);
        const meshWorldMatrix = mesh.getWorldMatrix();

        if (!runtimeBones || runtimeBones.length === 0) {
            if (!skeleton) {
                this.clearBoneOverlay();
                return;
            }
            positionMesh.computeWorldMatrix(true);
            skeleton.computeAbsoluteMatrices(true);
        }

        ctx.clearRect(0, 0, width, height);
        this.boneVisualizerPickPoints = [];

        if (runtimeBones && runtimeBones.length > 0) {
            const projectedPositions = new Map<number, { x: number; y: number }>();
            const segmentCommands: Array<{ fromX: number; fromY: number; toX: number; toY: number; selected: boolean; lineColor: string; lineWidth: number }> = [];

            for (const [childIndex, parentIndex] of pairs) {
                runtimeBones[childIndex].getWorldTranslationToRef(this.boneOverlayChildWorld);
                runtimeBones[parentIndex].getWorldTranslationToRef(this.boneOverlayParentWorld);

                if (runtimeUseMeshWorldMatrix) {
                    Vector3.TransformCoordinatesToRef(this.boneOverlayChildWorld, meshWorldMatrix, this.boneOverlayChildWorld);
                    Vector3.TransformCoordinatesToRef(this.boneOverlayParentWorld, meshWorldMatrix, this.boneOverlayParentWorld);
                }

                Vector3.ProjectToRef(this.boneOverlayChildWorld, this.boneOverlayIdentity, transformMatrix, viewport, this.boneOverlayChildScreen);
                Vector3.ProjectToRef(this.boneOverlayParentWorld, this.boneOverlayIdentity, transformMatrix, viewport, this.boneOverlayParentScreen);

                if (!Number.isFinite(this.boneOverlayChildScreen.x) || !Number.isFinite(this.boneOverlayChildScreen.y)) continue;
                if (!Number.isFinite(this.boneOverlayParentScreen.x) || !Number.isFinite(this.boneOverlayParentScreen.y)) continue;

                projectedPositions.set(childIndex, { x: this.boneOverlayChildScreen.x, y: this.boneOverlayChildScreen.y });
                projectedPositions.set(parentIndex, { x: this.boneOverlayParentScreen.x, y: this.boneOverlayParentScreen.y });                const parentName = runtimeBones[parentIndex].name;
                const selected = selectedBoneName === parentName;
                const style = this.resolveBoneVisualizerStyle(
                    boneControlInfoByName.get(parentName),
                    selected
                );

                segmentCommands.push({
                    fromX: this.boneOverlayParentScreen.x,
                    fromY: this.boneOverlayParentScreen.y,
                    toX: this.boneOverlayChildScreen.x,
                    toY: this.boneOverlayChildScreen.y,
                    selected,
                    lineColor: style.lineColor,
                    lineWidth: style.lineWidth,
                });
            }

            for (const command of segmentCommands) {
                if (command.selected) continue;
                this.drawBoneVisualizerSegment(
                    ctx,
                    { x: command.fromX, y: command.fromY },
                    { x: command.toX, y: command.toY },
                    command.lineColor,
                    command.lineWidth
                );
            }
            for (const command of segmentCommands) {
                if (!command.selected) continue;
                this.drawBoneVisualizerSegment(
                    ctx,
                    { x: command.fromX, y: command.fromY },
                    { x: command.toX, y: command.toY },
                    command.lineColor,
                    command.lineWidth
                );
            }

            const markerCommands: Array<{ boneName: string; x: number; y: number; selected: boolean; markerShape: "circle" | "square"; markerColor: string }> = [];
            for (const [boneIndex, projected] of projectedPositions) {
                const boneName = runtimeBones[boneIndex].name;
                const selected = selectedBoneName === boneName;
                const style = this.resolveBoneVisualizerStyle(boneControlInfoByName.get(boneName), selected);
                markerCommands.push({
                    boneName,
                    x: projected.x,
                    y: projected.y,
                    selected,
                    markerShape: style.markerShape,
                    markerColor: style.markerColor,
                });
            }

            for (const marker of markerCommands) {
                if (marker.selected) continue;
                this.drawBoneVisualizerMarker(ctx, marker.x, marker.y, marker.markerShape, marker.markerColor, false);
            }
            for (const marker of markerCommands) {
                if (!marker.selected) continue;
                this.drawBoneVisualizerMarker(ctx, marker.x, marker.y, marker.markerShape, marker.markerColor, true);
            }
            for (const marker of markerCommands) {
                this.boneVisualizerPickPoints.push({ boneName: marker.boneName, x: marker.x, y: marker.y });
            }
        } else if (skeleton) {
            const bones = skeleton.bones;
            const projectedPositions = new Map<number, { x: number; y: number }>();
            const segmentCommands: Array<{ fromX: number; fromY: number; toX: number; toY: number; selected: boolean; lineColor: string; lineWidth: number }> = [];

            for (const [childIndex, parentIndex] of pairs) {
                this.getBoneWorldPositionToRef(bones[childIndex], positionMesh, this.boneOverlayChildWorld);
                this.getBoneWorldPositionToRef(bones[parentIndex], positionMesh, this.boneOverlayParentWorld);

                Vector3.ProjectToRef(this.boneOverlayChildWorld, this.boneOverlayIdentity, transformMatrix, viewport, this.boneOverlayChildScreen);
                Vector3.ProjectToRef(this.boneOverlayParentWorld, this.boneOverlayIdentity, transformMatrix, viewport, this.boneOverlayParentScreen);

                if (!Number.isFinite(this.boneOverlayChildScreen.x) || !Number.isFinite(this.boneOverlayChildScreen.y)) continue;
                if (!Number.isFinite(this.boneOverlayParentScreen.x) || !Number.isFinite(this.boneOverlayParentScreen.y)) continue;

                projectedPositions.set(childIndex, { x: this.boneOverlayChildScreen.x, y: this.boneOverlayChildScreen.y });
                projectedPositions.set(parentIndex, { x: this.boneOverlayParentScreen.x, y: this.boneOverlayParentScreen.y });                const parentName = bones[parentIndex].name;
                const selected = selectedBoneName === parentName;
                const style = this.resolveBoneVisualizerStyle(
                    boneControlInfoByName.get(parentName),
                    selected
                );

                segmentCommands.push({
                    fromX: this.boneOverlayParentScreen.x,
                    fromY: this.boneOverlayParentScreen.y,
                    toX: this.boneOverlayChildScreen.x,
                    toY: this.boneOverlayChildScreen.y,
                    selected,
                    lineColor: style.lineColor,
                    lineWidth: style.lineWidth,
                });
            }

            for (const command of segmentCommands) {
                if (command.selected) continue;
                this.drawBoneVisualizerSegment(
                    ctx,
                    { x: command.fromX, y: command.fromY },
                    { x: command.toX, y: command.toY },
                    command.lineColor,
                    command.lineWidth
                );
            }
            for (const command of segmentCommands) {
                if (!command.selected) continue;
                this.drawBoneVisualizerSegment(
                    ctx,
                    { x: command.fromX, y: command.fromY },
                    { x: command.toX, y: command.toY },
                    command.lineColor,
                    command.lineWidth
                );
            }

            const markerCommands: Array<{ boneName: string; x: number; y: number; selected: boolean; markerShape: "circle" | "square"; markerColor: string }> = [];
            for (const [boneIndex, projected] of projectedPositions) {
                const boneName = bones[boneIndex].name;
                const selected = selectedBoneName === boneName;
                const style = this.resolveBoneVisualizerStyle(boneControlInfoByName.get(boneName), selected);
                markerCommands.push({
                    boneName,
                    x: projected.x,
                    y: projected.y,
                    selected,
                    markerShape: style.markerShape,
                    markerColor: style.markerColor,
                });
            }

            for (const marker of markerCommands) {
                if (marker.selected) continue;
                this.drawBoneVisualizerMarker(ctx, marker.x, marker.y, marker.markerShape, marker.markerColor, false);
            }
            for (const marker of markerCommands) {
                if (!marker.selected) continue;
                this.drawBoneVisualizerMarker(ctx, marker.x, marker.y, marker.markerShape, marker.markerColor, true);
            }
            for (const marker of markerCommands) {
                this.boneVisualizerPickPoints.push({ boneName: marker.boneName, x: marker.x, y: marker.y });
            }
        }
    }

    private tryPickBoneVisualizerAtClientPosition(clientX: number, clientY: number): void {
        if (this._isPlaying || this.timelineTarget !== "model" || !this.getActiveModelVisibility()) return;
        if (this.boneVisualizerTarget === null) return;
        if (this.boneVisualizerPickPoints.length === 0) return;

        const rect = this.renderingCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

        const pickRadius = 14;
        const pickRadiusSq = pickRadius * pickRadius;

        let pickedBoneName: string | null = null;
        let pickedDistanceSq = Number.POSITIVE_INFINITY;

        for (const point of this.boneVisualizerPickPoints) {
            const dx = point.x - x;
            const dy = point.y - y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq > pickRadiusSq) continue;
            if (distanceSq >= pickedDistanceSq) continue;

            pickedBoneName = point.boneName;
            pickedDistanceSq = distanceSq;
        }

        if (!pickedBoneName) return;

        this.setBoneVisualizerSelectedBone(pickedBoneName);
        this.onBoneVisualizerBonePicked?.(pickedBoneName);
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
        bone.getAbsolutePositionToRef(mesh, result);
        if (!Number.isFinite(result.x) || !Number.isFinite(result.y) || !Number.isFinite(result.z)) {
            bone.getPositionToRef(Space.WORLD, mesh, result);
        }
        if (!Number.isFinite(result.x) || !Number.isFinite(result.y) || !Number.isFinite(result.z)) {
            Vector3.TransformCoordinatesFromFloatsToRef(0, 0, 0, bone.getAbsoluteMatrix(), result);
            Vector3.TransformCoordinatesToRef(result, mesh.getWorldMatrix(), result);
        }
    }

    private syncBoneVisualizerVisibility(): void {
        if (!this.boneOverlayCanvas) return;

        const visible = this.timelineTarget === "model" && this.boneVisualizerTarget !== null && this.getActiveModelVisibility() && !this._isPlaying;
        this.boneOverlayCanvas.style.display = visible ? "block" : "none";
        if (!visible) {
            this.clearBoneOverlay();
        }
    }

    private clearBoneOverlay(): void {
        this.boneVisualizerPickPoints = [];
        if (!this.boneOverlayCanvas || !this.boneOverlayCtx) return;
        const width = this.boneOverlayCanvas.width / this.boneOverlayDpr;
        const height = this.boneOverlayCanvas.height / this.boneOverlayDpr;
        this.boneOverlayCtx.clearRect(0, 0, width, height);
    }

    private ensureBoneOverlayCanvas(): void {
        if (this.boneOverlayCanvas && this.boneOverlayCtx) return;

        const container = this.renderingCanvas.parentElement;
        if (!container) return;

        const overlay = document.createElement("canvas");
        overlay.id = "bone-overlay-canvas";
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "8";
        overlay.style.opacity = "0.5";

        const ctx = overlay.getContext("2d");
        if (!ctx) return;

        container.appendChild(overlay);
        this.boneOverlayCanvas = overlay;
        this.boneOverlayCtx = ctx;
        this.resizeBoneOverlayCanvas();
    }

    private resizeBoneOverlayCanvas(): void {
        if (!this.boneOverlayCanvas || !this.boneOverlayCtx) return;

        const width = Math.max(1, Math.floor(this.renderingCanvas.clientWidth));
        const height = Math.max(1, Math.floor(this.renderingCanvas.clientHeight));
        const dpr = Math.min(2, window.devicePixelRatio || 1);

        this.boneOverlayDpr = dpr;
        const targetWidth = Math.floor(width * dpr);
        const targetHeight = Math.floor(height * dpr);

        if (this.boneOverlayCanvas.width !== targetWidth || this.boneOverlayCanvas.height !== targetHeight) {
            this.boneOverlayCanvas.width = targetWidth;
            this.boneOverlayCanvas.height = targetHeight;
        }

        this.boneOverlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    private disposeBoneVisualizer(): void {
        this.boneVisualizerTarget = null;
        this.clearBoneOverlay();
    }

    public hasTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        const normalized = Math.max(0, Math.floor(frame));

        if (track.category === "camera") {
            return hasFrameNumber(this.cameraKeyframeFrames, normalized);
        }

        if (!this.currentModel) return false;
        const frameMap = this.getOrCreateModelTrackFrameMap(this.currentModel);
        const key = createTrackKey(track.category, track.name);
        const frames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
        return hasFrameNumber(frames, normalized);
    }

    public addTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        const normalized = Math.max(0, Math.floor(frame));

        if (track.category === "camera") {
            const nextFrames = addFrameNumber(this.cameraKeyframeFrames, normalized);
            if (nextFrames === this.cameraKeyframeFrames) return false;
            this.cameraKeyframeFrames = nextFrames;
            this.emitMergedKeyframeTracks();
            return true;
        }

        if (!this.currentModel) return false;
        const frameMap = this.getOrCreateModelTrackFrameMap(this.currentModel);
        const key = createTrackKey(track.category, track.name);
        const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
        const nextFrames = addFrameNumber(currentFrames, normalized);
        if (nextFrames === currentFrames) return false;
        frameMap.set(key, nextFrames);
        this.emitMergedKeyframeTracks();
        return true;
    }

    public removeTimelineKeyframe(track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
        const normalized = Math.max(0, Math.floor(frame));

        if (track.category === "camera") {
            const nextFrames = removeFrameNumber(this.cameraKeyframeFrames, normalized);
            if (nextFrames === this.cameraKeyframeFrames) return false;
            this.cameraKeyframeFrames = nextFrames;
            this.emitMergedKeyframeTracks();
            return true;
        }

        if (!this.currentModel) return false;
        const frameMap = this.getOrCreateModelTrackFrameMap(this.currentModel);
        const key = createTrackKey(track.category, track.name);
        const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
        const nextFrames = removeFrameNumber(currentFrames, normalized);
        if (nextFrames === currentFrames) return false;
        frameMap.set(key, nextFrames);
        this.emitMergedKeyframeTracks();
        return true;
    }

    public moveTimelineKeyframe(
        track: Pick<KeyframeTrack, "name" | "category">,
        fromFrame: number,
        toFrame: number,
    ): boolean {
        const normalizedFrom = Math.max(0, Math.floor(fromFrame));
        const normalizedTo = Math.max(0, Math.floor(toFrame));

        if (track.category === "camera") {
            const nextFrames = moveFrameNumber(this.cameraKeyframeFrames, normalizedFrom, normalizedTo);
            if (nextFrames === this.cameraKeyframeFrames) return false;
            this.cameraKeyframeFrames = nextFrames;
            this.emitMergedKeyframeTracks();
            return true;
        }

        if (!this.currentModel) return false;
        const frameMap = this.getOrCreateModelTrackFrameMap(this.currentModel);
        const key = createTrackKey(track.category, track.name);
        const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
        const nextFrames = moveFrameNumber(currentFrames, normalizedFrom, normalizedTo);
        if (nextFrames === currentFrames) return false;
        frameMap.set(key, nextFrames);
        this.emitMergedKeyframeTracks();
        return true;
    }

    public isGroundVisible(): boolean {
        return this.ground?.isEnabled() ?? false;
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

    public isSkydomeVisible(): boolean {
        return this.skydome?.isEnabled() ?? false;
    }

    public setSkydomeVisible(visible: boolean): void {
        if (!this.skydome) return;
        this.skydome.setEnabled(visible);
    }

    public toggleSkydomeVisible(): boolean {
        const next = !this.isSkydomeVisible();
        this.setSkydomeVisible(next);
        return next;
    }
    public isPhysicsAvailable(): boolean {
        return this.physicsAvailable;
    }

    public getPhysicsEnabled(): boolean {
        return this.physicsAvailable && this.physicsEnabled;
    }

    public setPhysicsEnabled(enabled: boolean): boolean {
        if (!this.physicsAvailable) {
            this.physicsEnabled = false;
            this.onPhysicsStateChanged?.(false, false);
            return false;
        }

        this.physicsEnabled = enabled;
        this.applyPhysicsStateToAllModels();
        this.onPhysicsStateChanged?.(this.physicsEnabled, true);
        return this.physicsEnabled;
    }

    public togglePhysicsEnabled(): boolean {
        return this.setPhysicsEnabled(!this.getPhysicsEnabled());
    }

    public getPhysicsGravityAcceleration(): number {
        return this.physicsGravityAcceleration;
    }

    public setPhysicsGravityAcceleration(value: number): void {
        this.physicsGravityAcceleration = Math.max(0, Math.min(200, value));
        this.applyPhysicsGravity();
    }

    public getPhysicsGravityDirection(): { x: number; y: number; z: number } {
        return {
            x: this.physicsGravityDirection.x,
            y: this.physicsGravityDirection.y,
            z: this.physicsGravityDirection.z,
        };
    }

    public setPhysicsGravityDirection(x: number, y: number, z: number): void {
        this.physicsGravityDirection.x = Math.max(-100, Math.min(100, x));
        this.physicsGravityDirection.y = Math.max(-100, Math.min(100, y));
        this.physicsGravityDirection.z = Math.max(-100, Math.min(100, z));
        this.applyPhysicsGravity();
    }

    static async create(canvas: HTMLCanvasElement): Promise<MmdManager> {
        const engine = await MmdManager.createPreferredEngine(canvas);
        return new MmdManager(canvas, engine);
    }

    private static createWebGlEngine(canvas: HTMLCanvasElement): Engine {
        return new Engine(canvas, false, MmdManager.RENDER_ENGINE_OPTIONS);
    }

    private static async createPreferredEngine(canvas: HTMLCanvasElement): Promise<Engine | WebGPUEngine> {
        try {
            const isWebGpuSupported = await WebGPUEngine.IsSupportedAsync;
            if (!isWebGpuSupported) {
                console.info("WebGPU unavailable. Falling back to WebGL2.");
                return MmdManager.createWebGlEngine(canvas);
            }

            WebGPUTintWASM.DisableUniformityAnalysis = true;
            const engine = await WebGPUEngine.CreateAsync(canvas, {
                ...MmdManager.RENDER_ENGINE_OPTIONS,
                glslangOptions: {
                    jsPath: glslangJsUrl,
                    wasmPath: glslangWasmUrl,
                },
                twgslOptions: {
                    jsPath: twgslJsUrl,
                    wasmPath: twgslWasmUrl,
                },
            });
            engine.compatibilityMode = true;
            console.info("Using WebGPU renderer.");
            return engine;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`WebGPU initialization failed. Falling back to WebGL2. Reason: ${message}`);
            return MmdManager.createWebGlEngine(canvas);
        }
    }

    constructor(canvas: HTMLCanvasElement, engine?: Engine | WebGPUEngine) {
        this.renderingCanvas = canvas;

        // Register default material builder explicitly (avoids Vite tree-shaking side-effect imports)
        if (MmdModelLoader.SharedMaterialBuilder === null) {
            MmdModelLoader.SharedMaterialBuilder = new MmdStandardMaterialBuilder();
        }

        // Create engine (WebGPU preferred path is handled by MmdManager.create)
        this.engine = engine ?? MmdManager.createWebGlEngine(canvas);
        this.resizeToCanvasClientSize();
        this.ensureBoneOverlayCanvas();

        // Create scene
        this.scene = new Scene(this.engine);
        this.scene.clearColor = new Color4(0.04, 0.04, 0.06, 1);
        this.scene.ambientColor = new Color3(0.5, 0.5, 0.5);
        this.scene.imageProcessingConfiguration.isEnabled = true;
        this.scene.imageProcessingConfiguration.applyByPostProcess = false;
        this.scene.imageProcessingConfiguration.contrast = 1;
        this.boneGizmoManager = new GizmoManager(this.scene, 1.8);
        this.boneGizmoManager.usePointerToAttachGizmos = false;
        this.boneGizmoManager.clearGizmoOnEmptyPointerEvent = false;
        this.boneGizmoManager.scaleGizmoEnabled = false;
        this.boneGizmoManager.boundingBoxGizmoEnabled = false;
        this.boneGizmoManager.positionGizmoEnabled = false;
        this.boneGizmoManager.rotationGizmoEnabled = false;
        this.boneGizmoProxyNode = new TransformNode("boneGizmoProxy", this.scene);
        this.boneGizmoProxyNode.rotationQuaternion = Quaternion.Identity();
        this.boneGizmoProxyNode.setEnabled(false);

        // SDEF support
        SdefInjector.OverrideEngineCreateEffect(this.engine);

        // Camera
        this.camera = new ArcRotateCamera(
            "camera",
            -Math.PI / 2,
            Math.PI / 2.2,
            30,
            new Vector3(0, 10, 0),
            this.scene
        );
        this.camera.lowerRadiusLimit = 2;
        this.camera.upperRadiusLimit = 100;
        this.camera.wheelDeltaPercentage = 0.01;
        this.camera.attachControl(canvas, true);
        canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
        canvas.addEventListener("pointerup", this.onCanvasPointerUp);
        canvas.addEventListener("pointercancel", this.onCanvasPointerCancel);
        this.syncCameraRotationFromCurrentView();
        this.updateDofFocalLengthFromCameraFov();
        const isWebGpuEngine = (this.engine as unknown as { webGLVersion?: number }).webGLVersion === undefined;
        if (isWebGpuEngine) {
            this.dofEnabledValue = false;
            this.farDofEnabled = false;
        } else {
            this.setupFarDofPostProcess();
            this.dofFocusDistanceMmValue = this.getCameraFocusDistanceMm();
            this.setupEditorDofPipeline();
        }
        this.setupColorCorrectionPostProcess();

        // Lights
        const hemiLight = this.hemiLight = new HemisphericLight(
            "hemiLight",
            new Vector3(0, 1, 0),
            this.scene
        );
        hemiLight.intensity = 0.0;
        hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
        hemiLight.groundColor = new Color3(0.15, 0.15, 0.2);

        const dirLight = this.dirLight = new DirectionalLight(
            "dirLight",
            new Vector3(0.5, -1, 1),
            this.scene
        );
        dirLight.intensity = 1.0;
        dirLight.position = new Vector3(-20, 30, -20);
        // Keep a wide fixed shadow frustum so shadows can cover the whole 80x80 ground.
        dirLight.shadowFrustumSize = 140;
        dirLight.shadowMinZ = 1;
        dirLight.shadowMaxZ = 300;
        dirLight.autoUpdateExtends = true;
        dirLight.autoCalcShadowZBounds = true;
        this.applyLightColorTemperature();

        // Shadow generator (high-quality profile, clamped by device capability)
        const maxTextureSize = this.engine.getCaps().maxTextureSize ?? 4096;
        const shadowMapSize = Math.min(8192, maxTextureSize);
        this.shadowGenerator = new ShadowGenerator(shadowMapSize, dirLight);
        this.shadowGenerator.usePercentageCloserFiltering = true;
        this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
        this.shadowGenerator.useContactHardeningShadow = true;
        this.applyShadowEdgeSoftness();
        this.shadowGenerator.bias = 0.00015;
        this.shadowGenerator.normalBias = 0.0006;
        this.shadowGenerator.frustumEdgeFalloff = 0.2;
        this.shadowGenerator.transparencyShadow = true;
        this.shadowGenerator.enableSoftTransparentShadow = true;
        this.shadowGenerator.useOpacityTextureForTransparentShadow = true;
        this.shadowGenerator.darkness = this.shadowDarknessValue;

        // Ground
        this.ground = CreateGround("ground", {
            width: 80,
            height: 80,
            subdivisions: 2,
            updatable: false,
        }, this.scene);

        const groundMat = new StandardMaterial("groundMat", this.scene);
        groundMat.diffuseColor = new Color3(1, 1, 1);
        groundMat.specularColor = new Color3(0, 0, 0);
        groundMat.alpha = 1.0;

        const gridTextureSize = 512;
        const gridCell = 64;
        const groundGridTexture = new DynamicTexture(
            "groundGridTexture",
            { width: gridTextureSize, height: gridTextureSize },
            this.scene,
            true
        );
        const gridCtx = groundGridTexture.getContext();
        for (let y = 0; y < gridTextureSize; y += gridCell) {
            for (let x = 0; x < gridTextureSize; x += gridCell) {
                const isEven = ((x / gridCell) + (y / gridCell)) % 2 === 0;
                gridCtx.fillStyle = isEven ? "#ececec" : "#e0e0e0";
                gridCtx.fillRect(x, y, gridCell, gridCell);
            }
        }
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

        this.skydome = CreateSphere("skydome", {
            diameter: 320,
            segments: 24,
            updatable: false,
        }, this.scene);
        const skydomeMat = new StandardMaterial("skydomeMat", this.scene);
        const skydomeColor = new Color3(0.6, 0.6, 0.6);
        skydomeMat.diffuseColor = skydomeColor;
        skydomeMat.emissiveColor = skydomeColor;
        skydomeMat.specularColor = new Color3(0, 0, 0);
        skydomeMat.disableLighting = true;
        skydomeMat.backFaceCulling = false;
        this.skydome.material = skydomeMat;
        this.skydome.infiniteDistance = true;
        this.skydome.isPickable = false;
        this.skydome.receiveShadows = false;
        // MMD Runtime (without physics for initial version)
        this.mmdRuntime = new MmdRuntime(this.scene);
        this.mmdRuntime.register(this.scene);
        this.physicsInitializationPromise = this.initializePhysics();

        // MMD camera runtime object (used for camera VMD evaluation)
        this.mmdCamera = new MmdCamera("mmdRuntimeCamera", this.camera.target.clone(), this.scene, false);
        this.syncMmdCameraFromViewportCamera();
        this.mmdRuntime.addAnimatable(this.mmdCamera);

        // VMD Loader
        this.vmdLoader = new VmdLoader(this.scene);
        this.vpdLoader = new VpdLoader(this.scene);

        this.scene.onBeforeRenderObservable.add(() => {
            if (this.hasCameraMotion) {
                this.syncViewportCameraFromMmdCamera();
            }
            const boneRuntime = this.boneGizmoRuntimeBone;
            const boneGizmoDragging = this.boneGizmoManager?.isDragging === true && boneRuntime !== null;
            if (boneGizmoDragging && boneRuntime) {
                if (this.physicsEnabledBeforeBoneGizmoDrag === null) {
                    const currentPhysicsState = this.getPhysicsEnabled();
                    this.physicsEnabledBeforeBoneGizmoDrag = currentPhysicsState;
                    if (currentPhysicsState) {
                        this.setPhysicsEnabled(false);
                    }
                }

                this.applyBoneGizmoProxyToRuntimeBone(boneRuntime);
                this.invalidateBoneVisualizerPose(boneRuntime);
            } else {
                if (this.physicsEnabledBeforeBoneGizmoDrag !== null) {
                    const resumePhysics = this.physicsEnabledBeforeBoneGizmoDrag;
                    this.physicsEnabledBeforeBoneGizmoDrag = null;
                    if (resumePhysics) {
                        this.setPhysicsEnabled(true);
                    }
                }

                if (boneRuntime) {
                    this.syncBoneGizmoProxyToRuntimeBone(boneRuntime);
                }
            }
            this.updateBoneVisualizer();
            this.updateEditorDofFocusAndFStop();
        });

        // Start render loop
        this.engine.runRenderLoop(() => {
            const nowMs = performance.now();
            const deltaMs = Math.max(0, Math.min(100, nowMs - this.lastRenderTimestampMs));
            this.lastRenderTimestampMs = nowMs;

            this.scene.render();
            if (!this._isPlaying) return;

            if (this.manualPlaybackWithoutAudio) {
                const deltaFrames = (deltaMs / (1000 / 30)) * this._playbackSpeed;
                this.manualPlaybackFrameCursor = Math.min(this._totalFrames, this.manualPlaybackFrameCursor + deltaFrames);
                const nextFrame = Math.floor(this.manualPlaybackFrameCursor);
                if (nextFrame !== this._currentFrame) {
                    this._currentFrame = nextFrame;
                    this.mmdRuntime.seekAnimation(this._currentFrame, true);
                }
                this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
                return;
            }

            const runtimeFrame = Math.floor(this.mmdRuntime.currentFrameTime);
            this._currentFrame = Math.min(runtimeFrame, this._totalFrames);
            this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
        });

        // Handle resize
        window.addEventListener("resize", this.onWindowResize);

        this.resizeObserver = new ResizeObserver(() => {
            this.resizeToCanvasClientSize();
        });
        this.resizeObserver.observe(canvas.parentElement ?? canvas);
    }

    private async initializePhysics(): Promise<boolean> {
        try {
            const wasmResponse = await fetch(ammoWasmBinaryUrl);
            if (!wasmResponse.ok) {
                throw new Error(`Failed to fetch ammo wasm binary: ${wasmResponse.status} ${wasmResponse.statusText}`);
            }
            const wasmBinary = new Uint8Array(await wasmResponse.arrayBuffer());
            const ammoInstance = await Ammo({ wasmBinary });
            const plugin = new MmdAmmoJSPlugin(true, ammoInstance);
            plugin.setMaxSteps(120);
            plugin.setFixedTimeStep(1 / 120);
            this.scene.enablePhysics(new Vector3(0, -this.physicsGravityAcceleration, 0), plugin);

            this.physicsPlugin = plugin;
            this.physicsRuntime = new MmdAmmoPhysics(this.scene);
            (this.mmdRuntime as unknown as { _physics: MmdAmmoPhysics | null })._physics = this.physicsRuntime;
            this.physicsAvailable = true;
            this.applyPhysicsGravity();

            this.applyPhysicsStateToAllModels();
            this.onPhysicsStateChanged?.(this.physicsEnabled, true);
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn("Physics initialization failed:", message);
            this.physicsAvailable = false;
            this.physicsEnabled = false;
            this.onPhysicsStateChanged?.(false, false);
            this.onError?.(`Physics init warning: ${message}`);
            return false;
        }
    }

    private applyPhysicsStateToModel(model: MmdModel): void {
        if (model.rigidBodyStates.length === 0) return;

        model.rigidBodyStates.fill(this.getPhysicsEnabled() ? 1 : 0);
        if (this.getPhysicsEnabled()) {
            this.mmdRuntime.initializeMmdModelPhysics(model);
        }
    }

    private applyPhysicsStateToAllModels(): void {
        for (const sceneModel of this.sceneModels) {
            this.applyPhysicsStateToModel(sceneModel.model);
        }
    }

    private applyPhysicsGravity(): void {
        const physicsEngine = this.scene.getPhysicsEngine();
        if (!physicsEngine) return;

        const direction = this.physicsGravityDirection.clone();
        if (direction.lengthSquared() < 1e-6) {
            direction.set(0, -1, 0);
        } else {
            direction.normalize();
        }
        const gravity = direction.scale(this.physicsGravityAcceleration);
        physicsEngine.setGravity(gravity);
    }

    async loadPMX(filePath: string): Promise<ModelInfo | null> {
        try {
            await this.physicsInitializationPromise;

            // Get directory and filename from path
            const pathParts = filePath.replace(/\\/g, '/');
            const lastSlash = pathParts.lastIndexOf('/');
            const dir = pathParts.substring(0, lastSlash + 1);
            const fileName = pathParts.substring(lastSlash + 1);

            // Use file:// protocol for local files (webSecurity disabled in main process)
            const fileUrl = `file:///${dir}`;

            console.log("[PMX] Loading:", fileName, "from:", fileUrl);

            // Use ImportMeshAsync with explicit materialBuilder via pluginOptions.
            // PmxLoader uses createPlugin(options) to create a new instance per load,
            // passing options["mmdmodel"] as the loader options.
            const result = await ImportMeshAsync(
                fileName,
                this.scene,
                {
                    rootUrl: fileUrl,
                    pluginOptions: {
                        mmdmodel: {
                            materialBuilder: MmdModelLoader.SharedMaterialBuilder,
                            preserveSerializationData: true,
                        },
                    },
                }
            );

            console.log("[PMX] ImportMeshAsync result:", {
                meshCount: result.meshes.length,
                skeletonCount: result.skeletons.length,
                meshNames: result.meshes.map(m => m.name),
            });

            // The first mesh is the root mesh (MmdMesh)
            const mmdMesh = result.meshes[0] as MmdMesh;

            // Enable root mesh and all children
            mmdMesh.setEnabled(true);
            mmdMesh.isVisible = true;
            for (const mesh of result.meshes) {
                mesh.setEnabled(true);
                mesh.isVisible = true;
                mesh.receiveShadows = true;
                if ((mesh.getTotalVertices?.() ?? 0) > 0) {
                    this.shadowGenerator.addShadowCaster(mesh, true);
                }

                // Fix MmdStandardMaterial: the builder sets alpha=diffuse[3] from PMX data,
                // but MmdStandardMaterialProxy manages alpha at runtime, so reset to visible here.
                if (mesh.material) {
                    const mat = mesh.material as any;
                    // Only fix alpha if it was set to 0 (invisible) by the loader
                    if (mat.alpha === 0) {
                        // Some MMD materials are rendered by the proxy even when alpha is 0.
                        // For shadow pass, alpha=0 can fully suppress casting; restore to opaque
                        // only when a texture is present to avoid revealing helper geometry.
                        if (mat.diffuseTexture || mat.opacityTexture) {
                            mat.alpha = 1;
                        }
                    }
                    // Ensure backFaceCulling is properly set for MMD models
                    mat.backFaceCulling = false;
                }
            }

            this.applyModelEdgeToMeshes(result.meshes as Mesh[]);
            this.applyCelShadingToMeshes(result.meshes as Mesh[]);

            // Capture metadata before runtime model creation (metadata may be trimmed).
            const mmdMetadata = mmdMesh.metadata as typeof mmdMesh.metadata & {
                displayFrames?: readonly {
                    name: string;
                    frames: readonly { type: number; index: number }[];
                }[];
            };

            // Create MMD model
            const mmdModel = this.mmdRuntime.createMmdModel(mmdMesh, {
                materialProxyConstructor: MmdStandardMaterialProxy,
                buildPhysics: this.physicsAvailable
                    ? { disableOffsetForConstraintFrame: true }
                    : false,
            });
            this.applyPhysicsStateToModel(mmdModel);
            this.modelKeyframeTracksByModel.set(mmdModel, new Map());
            this.modelSourceAnimationsByModel.delete(mmdModel);
            this.setModelMotionImports(mmdModel, []);

            console.log("[PMX] MmdModel created, morph:", !!mmdModel.morph);

            // Gather model info in PMX order from mmd metadata.
            const morphNames: string[] = [];
            const metadataMorphs = Array.isArray(mmdMetadata.morphs) ? mmdMetadata.morphs : [];
            const seenMorphNames = new Set<string>();
            for (const morph of metadataMorphs) {
                if (!seenMorphNames.has(morph.name)) {
                    seenMorphNames.add(morph.name);
                    morphNames.push(morph.name);
                }
            }

            // PMX root mesh can have 0 vertices / no skeleton.
            // Aggregate across imported meshes and skeletons for stable info values.
            const vertexCount = result.meshes.reduce((sum, mesh) => {
                const meshVertices = mesh.getTotalVertices?.() ?? 0;
                return sum + meshVertices;
            }, 0);

            const skeletonPool: Skeleton[] = [];
            if (mmdMesh.skeleton) skeletonPool.push(mmdMesh.skeleton);
            for (const mesh of result.meshes) {
                if (mesh.skeleton) skeletonPool.push(mesh.skeleton);
            }
            for (const skeleton of result.skeletons) {
                if (skeleton) skeletonPool.push(skeleton);
            }

            const uniqueSkeletons = Array.from(new Set(skeletonPool));
            const boneCount = uniqueSkeletons.reduce((max, skeleton) => {
                return Math.max(max, skeleton.bones.length);
            }, 0);

            const boneNames: string[] = [];
            const boneControlInfos: BoneControlInfo[] = [];
            const metadataBones = Array.isArray(mmdMetadata.bones) ? mmdMetadata.bones : [];
            const metadataRigidBodies = Array.isArray(mmdMetadata.rigidBodies) ? mmdMetadata.rigidBodies : [];
            const physicsBoneIndices = new Set<number>();
            for (const rigidBody of metadataRigidBodies) {
                if (!rigidBody) continue;
                if (rigidBody.physicsMode === PMX_RIGID_BODY_MODE_FOLLOW_BONE) continue;
                if (typeof rigidBody.boneIndex !== "number" || rigidBody.boneIndex < 0) continue;
                physicsBoneIndices.add(rigidBody.boneIndex);
            }

            const ikBoneIndices = new Set<number>();
            const ikAffectedBoneIndices = new Set<number>();
            for (let boneIndex = 0; boneIndex < metadataBones.length; boneIndex += 1) {
                const bone = metadataBones[boneIndex];
                if (!bone?.ik) continue;

                ikBoneIndices.add(boneIndex);

                if (typeof bone.ik.target === "number" && bone.ik.target >= 0) {
                    ikAffectedBoneIndices.add(bone.ik.target);
                }

                for (const ikLink of bone.ik.links) {
                    if (typeof ikLink.target !== "number" || ikLink.target < 0) continue;
                    ikAffectedBoneIndices.add(ikLink.target);
                }
            }

            const seenBoneNames = new Set<string>();
            for (let boneIndex = 0; boneIndex < metadataBones.length; boneIndex += 1) {
                const bone = metadataBones[boneIndex];
                if (!bone) continue;

                const isVisible = (bone.flag & PMX_BONE_FLAG_VISIBLE) !== 0;
                if (!isVisible) continue;
                if (physicsBoneIndices.has(boneIndex)) continue;

                const isRotatable = (bone.flag & PMX_BONE_FLAG_ROTATABLE) !== 0;
                const isMovable = (bone.flag & PMX_BONE_FLAG_MOVABLE) !== 0;
                const isIk = ikBoneIndices.has(boneIndex);
                const isIkAffected = ikAffectedBoneIndices.has(boneIndex);

                if (!seenBoneNames.has(bone.name)) {
                    seenBoneNames.add(bone.name);
                    boneNames.push(bone.name);
                    boneControlInfos.push({
                        name: bone.name,
                        movable: isMovable,
                        rotatable: isRotatable,
                        isIk,
                        isIkAffected,
                    });
                }
            }

            const morphDisplayFrames: { name: string; morphNames: string[] }[] = [];
            const metadataDisplayFrames = Array.isArray(mmdMetadata.displayFrames) ? mmdMetadata.displayFrames : [];
            for (const displayFrame of metadataDisplayFrames) {
                const frameMorphNames: string[] = [];
                const seenFrameMorphNames = new Set<string>();

                for (const frameEntry of displayFrame.frames) {
                    if (frameEntry.type !== 1) continue;
                    const morph = metadataMorphs[frameEntry.index];
                    if (!morph) continue;
                    if (seenFrameMorphNames.has(morph.name)) continue;
                    seenFrameMorphNames.add(morph.name);
                    frameMorphNames.push(morph.name);
                }

                if (frameMorphNames.length > 0) {
                    morphDisplayFrames.push({
                        name: displayFrame.name,
                        morphNames: frameMorphNames,
                    });
                }
            }

            if (morphDisplayFrames.length === 0 && morphNames.length > 0) {
                morphDisplayFrames.push({
                    name: "All",
                    morphNames: [...morphNames],
                });
            }
            const modelInfo: ModelInfo = {
                name: fileName.replace(/\.(pmx|pmd)$/i, ''),
                path: filePath,
                vertexCount,
                boneCount,
                boneNames,
                boneControlInfos,
                morphCount: morphNames.length,
                morphNames,
                morphDisplayFrames,
            };

            console.log("[PMX] Model info:", modelInfo);

            this.sceneModels.push({
                mesh: mmdMesh,
                model: mmdModel,
                info: modelInfo,
            });

            const activateAsCurrent = this.shouldActivateAsCurrent(modelInfo);
            if (activateAsCurrent) {
                this.currentMesh = mmdMesh;
                this.currentModel = mmdModel;
                this.activeModelInfo = modelInfo;
                this.refreshBoneVisualizerTarget();
                this.updateBoneGizmoTarget();
                this.onModelLoaded?.(modelInfo);
                this.emitMergedKeyframeTracks();
            }

            this.onSceneModelLoaded?.(modelInfo, this.sceneModels.length, activateAsCurrent);
            return modelInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load PMX/PMD:", message);
            this.onError?.(`PMX/PMD load error: ${message}`);
            return null;
        }
    }

    private shouldActivateAsCurrent(info: ModelInfo): boolean {
        if (!this.currentModel || !this.currentMesh || !this.activeModelInfo) {
            return true;
        }

        // Keep the current character model active unless the current active model
        // is effectively non-animatable (e.g. stage model loaded first).
        if (this.activeModelInfo.boneCount === 0 && info.boneCount > 0) {
            return true;
        }
        if (this.activeModelInfo.morphCount === 0 && info.morphCount > 0) {
            return true;
        }

        return false;
    }

    private applyModelEdgeToAllModels(): void {
        for (const sceneModel of this.sceneModels) {
            const meshes = [sceneModel.mesh, ...sceneModel.mesh.getChildMeshes()];
            this.applyModelEdgeToMeshes(meshes as Mesh[]);
        }
    }

    private applyModelEdgeToMeshes(meshes: Mesh[]): void {
        const scale = this.modelEdgeWidthValue;
        const materials = new Set<any>();

        for (const mesh of meshes) {
            const material = mesh.material as any;
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

            const enabled = defaults.enabled && scale > 0;
            mat.renderOutline = enabled;
            mat.outlineWidth = enabled ? defaults.width * scale : 0;
            if ("outlineAlpha" in mat) {
                mat.outlineAlpha = defaults.alpha;
            }
            if ("outlineColor" in mat && mat.outlineColor?.set) {
                mat.outlineColor.set(defaults.colorR, defaults.colorG, defaults.colorB);
            }
        }
    }

    private applyCelShadingToMeshes(meshes: Mesh[]): void {
        const materials = new Set<any>();

        for (const mesh of meshes) {
            const material = mesh.material as any;
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
    }

    async loadVMD(filePath: string): Promise<MotionInfo | null> {
        const pathParts = filePath.replace(/\\/g, "/");
        const lastSlash = pathParts.lastIndexOf("/");
        const fileName = pathParts.substring(lastSlash + 1);
        const extensionMatch = fileName.match(/\.([^.]+)$/);
        const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";

        if (extension === "vpd") {
            return await this.loadVPD(filePath);
        }

        try {
            const targetModel = this.currentModel;
            if (!targetModel) {
                this.onError?.("Load a PMX model first");
                return null;
            }
            const loadFrame = this._currentFrame;
            // Read the file via electron API
            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("Failed to read VMD file");
                return null;
            }

            // Create a Blob URL from the buffer - use Uint8Array for type safety
            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const blob = new Blob([uint8]);
            const blobUrl = URL.createObjectURL(blob);

            const animation = await this.vmdLoader.loadAsync("modelMotion", blobUrl);

            URL.revokeObjectURL(blobUrl);

            this.modelSourceAnimationsByModel.set(targetModel, animation);
            this.setModelMotionImports(targetModel, [{ type: "vmd", path: filePath }]);
            const animHandle = targetModel.createRuntimeAnimation(animation);
            targetModel.setRuntimeAnimation(animHandle);

            // Get frame count from runtime animation duration
            this._totalFrames = Math.max(
                Math.floor(this.mmdRuntime.animationFrameTimeDuration),
                300
            );
            this.seekTo(loadFrame);

            // Extract keyframe tracks from model animation data
            this.modelKeyframeTracksByModel.set(
                targetModel,
                this.buildModelTrackFrameMapFromAnimation(animation)
            );
            this.emitMergedKeyframeTracks();

            const motionInfo: MotionInfo = {
                name: fileName.replace(/\.vmd$/i, ""),
                path: filePath,
                frameCount: this._totalFrames,
            };

            this.onMotionLoaded?.(motionInfo);
            return motionInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load VMD:", message);
            this.onError?.(`VMD load error: ${message}`);
            return null;
        }
    }

    async loadVPD(filePath: string): Promise<MotionInfo | null> {
        try {
            const targetModel = this.currentModel;
            if (!targetModel) {
                this.onError?.("Load a PMX model first");
                return null;
            }
            const loadFrame = this._currentFrame;
            const previousTotalFrames = this._totalFrames;
            const pathParts = filePath.replace(/\\/g, "/");
            const lastSlash = pathParts.lastIndexOf("/");
            const fileName = pathParts.substring(lastSlash + 1);

            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("Failed to read pose file");
                return null;
            }

            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const arrayBuffer = uint8.buffer.slice(
                uint8.byteOffset,
                uint8.byteOffset + uint8.byteLength
            );
            const poseAnimation = this.vpdLoader.loadFromBuffer("modelPose", arrayBuffer);
            const shiftedPoseAnimation = this.createOffsetModelAnimation(poseAnimation, loadFrame);
            const baseAnimation = this.modelSourceAnimationsByModel.get(targetModel);
            const mergedAnimation = baseAnimation
                ? this.mergeModelAnimations(baseAnimation, shiftedPoseAnimation)
                : shiftedPoseAnimation;
            this.modelSourceAnimationsByModel.set(targetModel, mergedAnimation);
            this.appendModelMotionImport(targetModel, { type: "vpd", path: filePath, frame: loadFrame });

            const animHandle = targetModel.createRuntimeAnimation(mergedAnimation);
            targetModel.setRuntimeAnimation(animHandle);

            this._totalFrames = Math.max(
                previousTotalFrames,
                Math.floor(this.mmdRuntime.animationFrameTimeDuration),
                loadFrame,
                300
            );
            this.seekTo(loadFrame);

            this.modelKeyframeTracksByModel.set(
                targetModel,
                this.buildModelTrackFrameMapFromAnimation(mergedAnimation)
            );
            this.emitMergedKeyframeTracks();

            const motionInfo: MotionInfo = {
                name: fileName.replace(/\.vpd$/i, ""),
                path: filePath,
                frameCount: this._totalFrames,
            };

            this.onMotionLoaded?.(motionInfo);
            return motionInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load pose:", message);
            this.onError?.(`Pose load error: ${message}`);
            return null;
        }
    }

    async loadCameraVMD(filePath: string): Promise<MotionInfo | null> {
        try {
            const pathParts = filePath.replace(/\\/g, "/");
            const lastSlash = pathParts.lastIndexOf("/");
            const fileName = pathParts.substring(lastSlash + 1);

            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("Failed to read camera VMD file");
                return null;
            }

            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const blob = new Blob([uint8]);
            const blobUrl = URL.createObjectURL(blob);

            const animationPromise = this.vmdLoader.loadAsync("cameraMotion", blobUrl);
            let animation: Awaited<typeof animationPromise>;
            try {
                animation = await animationPromise;
            } finally {
                URL.revokeObjectURL(blobUrl);
            }

            if (animation.cameraTrack.frameNumbers.length === 0) {
                this.onError?.("This VMD has no camera track");
                return null;
            }

            this.syncMmdCameraFromViewportCamera();

            if (this.cameraAnimationHandle !== null) {
                this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
                this.cameraAnimationHandle = null;
            }

            this.cameraAnimationHandle = this.mmdCamera.createRuntimeAnimation(animation);
            this.mmdCamera.setRuntimeAnimation(this.cameraAnimationHandle);
            this.hasCameraMotion = true;
            this.cameraMotionPath = filePath;
            this.cameraSourceAnimation = animation;
            this.cameraKeyframeFrames = new Uint32Array(animation.cameraTrack.frameNumbers);
            this.emitMergedKeyframeTracks();

            this._currentFrame = 0;
            this.mmdRuntime.seekAnimation(0, true);
            this.onFrameUpdate?.(this._currentFrame, this._totalFrames);

            const motionInfo: MotionInfo = {
                name: fileName.replace(/\.vmd$/i, ""),
                path: filePath,
                frameCount: this._totalFrames,
            };

            this.onCameraMotionLoaded?.(motionInfo);
            return motionInfo;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load camera VMD:", message);
            this.onError?.(`Camera VMD load error: ${message}`);
            return null;
        }
    }

    async loadMP3(filePath: string): Promise<boolean> {
        try {
            const pathParts = filePath.replace(/\\/g, "/");
            const lastSlash = pathParts.lastIndexOf("/");
            const fileName = pathParts.substring(lastSlash + 1);

            // Read the file via electron API
            const buffer = await window.electronAPI.readBinaryFile(filePath);
            if (!buffer) {
                this.onError?.("Audio file read failed");
                return false;
            }

            // Clean up previous audio
            if (this.audioBlobUrl) {
                URL.revokeObjectURL(this.audioBlobUrl);
            }
            if (this.audioPlayer) {
                this.audioPlayer.dispose();
            }

            // Create Blob URL from the buffer
            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const blob = new Blob([uint8], { type: this.getAudioMimeType(fileName) });
            this.audioBlobUrl = URL.createObjectURL(blob);

            // Create StreamAudioPlayer and set it to MmdRuntime
            this.audioPlayer = new StreamAudioPlayer(this.scene);
            this.audioPlayer.source = this.audioBlobUrl;
            await this.mmdRuntime.setAudioPlayer(this.audioPlayer);
            this.audioSourcePath = filePath;

            this.onAudioLoaded?.(fileName.replace(/\.(mp3|wav|wave|ogg)$/i, ""));
            return true;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to load audio:", message);
            this.onError?.(`Audio load error: ${message}`);
            return false;
        }
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
        this.manualPlaybackWithoutAudio = this.audioPlayer === null;
        if (this.manualPlaybackWithoutAudio) {
            this.manualPlaybackFrameCursor = this._currentFrame;
            this.mmdRuntime.pauseAnimation();
            this.mmdRuntime.seekAnimation(this._currentFrame, true);
        } else {
            this.mmdRuntime.playAnimation();
        }
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
    }

    pause(): void {
        this._isPlaying = false;
        this.manualPlaybackWithoutAudio = false;
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.mmdRuntime.pauseAnimation();
    }

    stop(): void {
        this._isPlaying = false;
        this.manualPlaybackWithoutAudio = false;
        this.manualPlaybackFrameCursor = 0;
        this.syncBoneVisualizerVisibility();
        this.updateBoneGizmoTarget();
        this.mmdRuntime.pauseAnimation();
        this.mmdRuntime.seekAnimation(0, true);
        this._currentFrame = 0;
        this.onFrameUpdate?.(0, this._totalFrames);
    }

    seekTo(frame: number): void {
        const targetFrame = Math.max(0, Math.floor(frame));
        if (targetFrame > this._totalFrames) {
            this._totalFrames = targetFrame;
        }
        this._currentFrame = targetFrame;
        this.mmdRuntime.seekAnimation(this._currentFrame, true);
        if (this.manualPlaybackWithoutAudio) {
            this.manualPlaybackFrameCursor = this._currentFrame;
        }
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    seekToBoundary(frame: number): void {
        const wasPlaying = this._isPlaying;
        if (wasPlaying) {
            this.pause();
        }

        this.seekTo(frame);
        this.stabilizePhysicsAfterHardSeek();

        if (wasPlaying) {
            this.play();
        }
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

    private serializePropertyTrack(track: MmdPropertyAnimationTrack): ProjectSerializedPropertyTrack {
        const ikStates: ProjectNumberArray[] = [];
        for (let i = 0; i < track.ikBoneNames.length; i += 1) {
            ikStates.push(this.packUint8Array(track.getIkState(i)));
        }

        return {
            frameNumbers: this.packFrameNumbers(track.frameNumbers),
            visibles: this.packUint8Array(track.visibles),
            ikBoneNames: [...track.ikBoneNames],
            ikStates,
        };
    }

    private serializeCameraTrack(track: MmdCameraAnimationTrack | null | undefined): ProjectSerializedCameraTrack | null {
        if (!track || track.frameNumbers.length === 0) return null;

        return {
            frameNumbers: this.packFrameNumbers(track.frameNumbers),
            positions: this.packFloat32Array(track.positions),
            positionInterpolations: this.packUint8Array(track.positionInterpolations),
            rotations: this.packFloat32Array(track.rotations),
            rotationInterpolations: this.packUint8Array(track.rotationInterpolations),
            distances: this.packFloat32Array(track.distances),
            distanceInterpolations: this.packUint8Array(track.distanceInterpolations),
            fovs: this.packFloat32Array(track.fovs),
            fovInterpolations: this.packUint8Array(track.fovInterpolations),
        };
    }

    private serializeModelAnimation(animation: MmdAnimation | undefined): ProjectSerializedModelAnimation | null {
        if (!animation) return null;

        const boneTracks: ProjectSerializedBoneTrack[] = animation.boneTracks.map((track) => ({
            name: track.name,
            frameNumbers: this.packFrameNumbers(track.frameNumbers),
            rotations: this.packFloat32Array(track.rotations),
            rotationInterpolations: this.packUint8Array(track.rotationInterpolations),
            physicsToggles: this.packUint8Array(track.physicsToggles),
        }));

        const movableBoneTracks: ProjectSerializedMovableBoneTrack[] = animation.movableBoneTracks.map((track) => ({
            name: track.name,
            frameNumbers: this.packFrameNumbers(track.frameNumbers),
            positions: this.packFloat32Array(track.positions),
            positionInterpolations: this.packUint8Array(track.positionInterpolations),
            rotations: this.packFloat32Array(track.rotations),
            rotationInterpolations: this.packUint8Array(track.rotationInterpolations),
            physicsToggles: this.packUint8Array(track.physicsToggles),
        }));

        const morphTracks: ProjectSerializedMorphTrack[] = animation.morphTracks.map((track) => ({
            name: track.name,
            frameNumbers: this.packFrameNumbers(track.frameNumbers),
            weights: this.packFloat32Array(track.weights),
        }));

        return {
            name: animation.name,
            boneTracks,
            movableBoneTracks,
            morphTracks,
            propertyTrack: this.serializePropertyTrack(animation.propertyTrack),
        };
    }

    private deserializePropertyTrack(data: ProjectSerializedPropertyTrack | null | undefined): MmdPropertyAnimationTrack {
        const frameCount = this.getProjectArrayLength(data?.frameNumbers);
        const ikBoneNames = Array.isArray(data?.ikBoneNames)
            ? data.ikBoneNames.filter((name): name is string => typeof name === "string")
            : [];
        const ikStates = Array.isArray(data?.ikStates) ? data.ikStates : [];

        const track = new MmdPropertyAnimationTrack(frameCount, ikBoneNames);
        this.copyProjectArrayToUint32(data?.frameNumbers, track.frameNumbers);
        this.copyProjectArrayToUint8(data?.visibles, track.visibles);
        for (let i = 0; i < ikBoneNames.length; i += 1) {
            this.copyProjectArrayToUint8(ikStates[i], track.getIkState(i));
        }
        return track;
    }

    private deserializeCameraTrack(data: ProjectSerializedCameraTrack | null | undefined): MmdCameraAnimationTrack {
        const frameCount = this.getProjectArrayLength(data?.frameNumbers);
        const track = new MmdCameraAnimationTrack(frameCount);

        this.copyProjectArrayToUint32(data?.frameNumbers, track.frameNumbers);
        this.copyProjectArrayToFloat32(data?.positions, track.positions);
        this.copyProjectArrayToUint8(data?.positionInterpolations, track.positionInterpolations);
        this.copyProjectArrayToFloat32(data?.rotations, track.rotations);
        this.copyProjectArrayToUint8(data?.rotationInterpolations, track.rotationInterpolations);
        this.copyProjectArrayToFloat32(data?.distances, track.distances);
        this.copyProjectArrayToUint8(data?.distanceInterpolations, track.distanceInterpolations);
        this.copyProjectArrayToFloat32(data?.fovs, track.fovs);
        this.copyProjectArrayToUint8(data?.fovInterpolations, track.fovInterpolations);

        return track;
    }

    private deserializeModelAnimation(data: ProjectSerializedModelAnimation | null | undefined, fallbackName: string): MmdAnimation | null {
        if (!data || typeof data !== "object") return null;

        const boneTracks: MmdBoneAnimationTrack[] = [];
        for (const sourceTrack of Array.isArray(data.boneTracks) ? data.boneTracks : []) {
            if (!sourceTrack || typeof sourceTrack.name !== "string") continue;
            const track = new MmdBoneAnimationTrack(sourceTrack.name, this.getProjectArrayLength(sourceTrack.frameNumbers));
            this.copyProjectArrayToUint32(sourceTrack.frameNumbers, track.frameNumbers);
            this.copyProjectArrayToFloat32(sourceTrack.rotations, track.rotations);
            this.copyProjectArrayToUint8(sourceTrack.rotationInterpolations, track.rotationInterpolations);
            this.copyProjectArrayToUint8(sourceTrack.physicsToggles, track.physicsToggles);
            boneTracks.push(track);
        }

        const movableBoneTracks: MmdMovableBoneAnimationTrack[] = [];
        for (const sourceTrack of Array.isArray(data.movableBoneTracks) ? data.movableBoneTracks : []) {
            if (!sourceTrack || typeof sourceTrack.name !== "string") continue;
            const track = new MmdMovableBoneAnimationTrack(sourceTrack.name, this.getProjectArrayLength(sourceTrack.frameNumbers));
            this.copyProjectArrayToUint32(sourceTrack.frameNumbers, track.frameNumbers);
            this.copyProjectArrayToFloat32(sourceTrack.positions, track.positions);
            this.copyProjectArrayToUint8(sourceTrack.positionInterpolations, track.positionInterpolations);
            this.copyProjectArrayToFloat32(sourceTrack.rotations, track.rotations);
            this.copyProjectArrayToUint8(sourceTrack.rotationInterpolations, track.rotationInterpolations);
            this.copyProjectArrayToUint8(sourceTrack.physicsToggles, track.physicsToggles);
            movableBoneTracks.push(track);
        }

        const morphTracks: MmdMorphAnimationTrack[] = [];
        for (const sourceTrack of Array.isArray(data.morphTracks) ? data.morphTracks : []) {
            if (!sourceTrack || typeof sourceTrack.name !== "string") continue;
            const track = new MmdMorphAnimationTrack(sourceTrack.name, this.getProjectArrayLength(sourceTrack.frameNumbers));
            this.copyProjectArrayToUint32(sourceTrack.frameNumbers, track.frameNumbers);
            this.copyProjectArrayToFloat32(sourceTrack.weights, track.weights);
            morphTracks.push(track);
        }

        const propertyTrack = this.deserializePropertyTrack(data.propertyTrack);
        const cameraTrack = new MmdCameraAnimationTrack(0);
        const animationName = typeof data.name === "string" && data.name.length > 0 ? data.name : fallbackName;

        return new MmdAnimation(
            animationName,
            boneTracks,
            movableBoneTracks,
            morphTracks,
            propertyTrack,
            cameraTrack,
        );
    }

    private createCameraAnimationFromTrack(cameraTrack: MmdCameraAnimationTrack, name: string): MmdAnimation {
        const propertyTrack = new MmdPropertyAnimationTrack(0, []);
        return new MmdAnimation(name, [], [], [], propertyTrack, cameraTrack);
    }

    private applyCameraAnimation(animation: MmdAnimation, sourcePath: string | null): void {
        this.syncMmdCameraFromViewportCamera();

        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }

        this.cameraAnimationHandle = this.mmdCamera.createRuntimeAnimation(animation);
        this.mmdCamera.setRuntimeAnimation(this.cameraAnimationHandle);
        this.hasCameraMotion = true;
        this.cameraSourceAnimation = animation;
        this.cameraMotionPath = sourcePath;
        this.cameraKeyframeFrames = new Uint32Array(animation.cameraTrack.frameNumbers);
        this.emitMergedKeyframeTracks();

        this._currentFrame = 0;
        this.mmdRuntime.seekAnimation(0, true);
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    public exportProjectState(): MmdModokiProjectFileV1 {
        const models = this.sceneModels.map((entry) => ({
            path: entry.info.path,
            visible: this.getModelVisibility(entry.mesh),
            motionImports: (this.modelMotionImportsByModel.get(entry.model) ?? []).map((item) => ({ ...item })),
        }));

        const keyframes: ProjectKeyframeBundle = {
            modelAnimations: this.sceneModels.map((entry) => ({
                modelPath: entry.info.path,
                animation: this.serializeModelAnimation(this.modelSourceAnimationsByModel.get(entry.model)),
            })),
            cameraAnimation: this.serializeCameraTrack(this.cameraSourceAnimation?.cameraTrack),
        };

        return {
            format: "mmd_modoki_project",
            version: 1,
            savedAt: new Date().toISOString(),
            scene: {
                models,
                activeModelPath: this.activeModelInfo?.path ?? null,
                timelineTarget: this.timelineTarget,
                currentFrame: this._currentFrame,
                playbackSpeed: this._playbackSpeed,
            },
            assets: {
                cameraVmdPath: this.cameraMotionPath,
                audioPath: this.audioSourcePath,
            },
            camera: {
                position: {
                    x: this.camera.position.x,
                    y: this.camera.position.y,
                    z: this.camera.position.z,
                },
                target: {
                    x: this.camera.target.x,
                    y: this.camera.target.y,
                    z: this.camera.target.z,
                },
                rotation: {
                    x: this.cameraRotationEulerDeg.x,
                    y: this.cameraRotationEulerDeg.y,
                    z: this.cameraRotationEulerDeg.z,
                },
                fov: this.getCameraFov(),
                distance: this.getCameraDistance(),
            },
            lighting: {
                azimuth: this.getLightAzimuth(),
                elevation: this.getLightElevation(),
                intensity: this.lightIntensity,
                ambientIntensity: this.ambientIntensity,
                temperatureKelvin: this.lightColorTemperature,
                shadowEnabled: this.shadowEnabled,
                shadowDarkness: this.shadowDarkness,
                shadowEdgeSoftness: this.shadowEdgeSoftness,
                selfShadowEdgeSoftness: this.selfShadowEdgeSoftness,
                occlusionShadowEdgeSoftness: this.occlusionShadowEdgeSoftness,
            },
            viewport: {
                groundVisible: this.isGroundVisible(),
                skydomeVisible: this.isSkydomeVisible(),
                antialiasEnabled: this.antialiasEnabled,
            },
            physics: {
                enabled: this.physicsEnabled,
                gravityAcceleration: this.physicsGravityAcceleration,
                gravityDirection: {
                    x: this.physicsGravityDirection.x,
                    y: this.physicsGravityDirection.y,
                    z: this.physicsGravityDirection.z,
                },
            },
            effects: {
                dofEnabled: this.dofEnabled,
                dofFocusDistanceMm: this.dofFocusDistanceMm,
                dofFStop: this.dofFStop,
                dofLensSize: this.dofLensSize,
                dofLensBlurStrength: this.dofLensBlurStrength,
                dofLensEdgeBlur: this.dofLensEdgeBlur,
                dofLensDistortionInfluence: this.dofLensDistortionInfluence,
                modelEdgeWidth: this.modelEdgeWidth,
                gamma: this.postEffectGamma,
                gammaEncodingVersion: 2,
            },
            keyframes,
        };
    }

    public async importProjectState(data: unknown): Promise<{ loadedModels: number; warnings: string[] }> {
        if (!this.isProjectFileV1(data)) {
            throw new Error("Invalid project file format or version");
        }

        const warnings: string[] = [];
        this.clearProjectForImport();

        let loadedModels = 0;
        const embeddedModelAnimationsByPath = new Map<string, ProjectSerializedModelAnimation | null>();
        const keyframeModelAnimations = Array.isArray(data.keyframes?.modelAnimations)
            ? data.keyframes.modelAnimations
            : [];
        for (const keyframeModel of keyframeModelAnimations) {
            if (!keyframeModel || typeof keyframeModel.modelPath !== "string") continue;
            embeddedModelAnimationsByPath.set(
                this.normalizePathForCompare(keyframeModel.modelPath),
                keyframeModel.animation ?? null,
            );
        }
        for (const modelState of data.scene.models) {
            const modelInfo = await this.loadPMX(modelState.path);
            if (!modelInfo) {
                warnings.push(`Model load failed: ${modelState.path}`);
                continue;
            }

            loadedModels += 1;
            const modelIndex = this.sceneModels.length - 1;
            if (modelIndex < 0) {
                continue;
            }

            this.setActiveModelByIndex(modelIndex);
            this.setActiveModelVisibility(Boolean(modelState.visible));

            const targetModel = this.currentModel;
            if (!targetModel) {
                warnings.push(`Failed to activate model for motion restore: ${modelState.path}`);
                continue;
            }

            this.setModelMotionImports(targetModel, (modelState.motionImports ?? []).map((item) => ({ ...item })));

            let restoredEmbeddedAnimation = false;
            const embeddedAnimationData = embeddedModelAnimationsByPath.get(
                this.normalizePathForCompare(modelState.path),
            ) ?? modelState.animation ?? null;
            if (embeddedAnimationData) {
                const embeddedAnimation = this.deserializeModelAnimation(embeddedAnimationData, `${modelInfo.name}@project`);
                if (embeddedAnimation) {
                    this.modelSourceAnimationsByModel.set(targetModel, embeddedAnimation);
                    const animHandle = targetModel.createRuntimeAnimation(embeddedAnimation);
                    targetModel.setRuntimeAnimation(animHandle);
                    this.modelKeyframeTracksByModel.set(
                        targetModel,
                        this.buildModelTrackFrameMapFromAnimation(embeddedAnimation),
                    );
                    this.emitMergedKeyframeTracks();
                    restoredEmbeddedAnimation = true;
                } else {
                    warnings.push(`Embedded model animation restore failed: ${modelState.path}`);
                }
            }

            if (!restoredEmbeddedAnimation) {
                for (const motionImport of modelState.motionImports ?? []) {
                    if (motionImport.type === "vmd") {
                        const motion = await this.loadVMD(motionImport.path);
                        if (!motion) {
                            warnings.push(`Model VMD load failed: ${motionImport.path}`);
                        }
                        continue;
                    }

                    if (motionImport.type === "vpd") {
                        if (typeof motionImport.frame === "number" && Number.isFinite(motionImport.frame)) {
                            this.seekTo(Math.max(0, Math.floor(motionImport.frame)));
                        }
                        const pose = await this.loadVPD(motionImport.path);
                        if (!pose) {
                            warnings.push(`Model VPD load failed: ${motionImport.path}`);
                        }
                    }
                }
            }
        }

        let restoredEmbeddedCamera = false;
        const embeddedCameraAnimationData = data.keyframes?.cameraAnimation ?? data.assets.cameraAnimation ?? null;
        if (embeddedCameraAnimationData) {
            const cameraTrack = this.deserializeCameraTrack(embeddedCameraAnimationData);
            if (cameraTrack.frameNumbers.length > 0) {
                const cameraAnimation = this.createCameraAnimationFromTrack(cameraTrack, "projectCamera");
                this.applyCameraAnimation(cameraAnimation, data.assets.cameraVmdPath ?? null);
                restoredEmbeddedCamera = true;
            } else {
                warnings.push("Embedded camera animation is empty");
            }
        }

        if (!restoredEmbeddedCamera && data.assets.cameraVmdPath) {
            const loaded = await this.loadCameraVMD(data.assets.cameraVmdPath);
            if (!loaded) {
                warnings.push(`Camera VMD load failed: ${data.assets.cameraVmdPath}`);
            }
        }

        if (data.assets.audioPath) {
            const loaded = await this.loadMP3(data.assets.audioPath);
            if (!loaded) {
                warnings.push(`Audio load failed: ${data.assets.audioPath}`);
            }
        }

        if (data.scene.activeModelPath) {
            const targetPath = this.normalizePathForCompare(data.scene.activeModelPath);
            const targetIndex = this.sceneModels.findIndex(
                (entry) => this.normalizePathForCompare(entry.info.path) === targetPath,
            );
            if (targetIndex >= 0) {
                this.setActiveModelByIndex(targetIndex);
            } else {
                warnings.push(`Active model path not found: ${data.scene.activeModelPath}`);
            }
        }

        this.setGroundVisible(Boolean(data.viewport.groundVisible));
        this.setSkydomeVisible(Boolean(data.viewport.skydomeVisible));
        this.antialiasEnabled = Boolean(data.viewport.antialiasEnabled);

        this.setLightDirection(data.lighting.azimuth, data.lighting.elevation);
        this.lightIntensity = data.lighting.intensity;
        this.ambientIntensity = data.lighting.ambientIntensity;
        this.lightColorTemperature = data.lighting.temperatureKelvin;
        this.shadowDarkness = data.lighting.shadowDarkness;
        const legacyShadowEdgeSoftness = typeof data.lighting.shadowEdgeSoftness === "number" && Number.isFinite(data.lighting.shadowEdgeSoftness)
            ? data.lighting.shadowEdgeSoftness
            : null;
        const selfShadowEdgeSoftness = typeof data.lighting.selfShadowEdgeSoftness === "number" && Number.isFinite(data.lighting.selfShadowEdgeSoftness)
            ? data.lighting.selfShadowEdgeSoftness
            : legacyShadowEdgeSoftness;
        const occlusionShadowEdgeSoftness = typeof data.lighting.occlusionShadowEdgeSoftness === "number" && Number.isFinite(data.lighting.occlusionShadowEdgeSoftness)
            ? data.lighting.occlusionShadowEdgeSoftness
            : legacyShadowEdgeSoftness ?? selfShadowEdgeSoftness;
        if (typeof selfShadowEdgeSoftness === "number") {
            this.selfShadowEdgeSoftness = selfShadowEdgeSoftness;
        }
        if (typeof occlusionShadowEdgeSoftness === "number") {
            this.occlusionShadowEdgeSoftness = occlusionShadowEdgeSoftness;
        }
        this.setShadowEnabled(Boolean(data.lighting.shadowEnabled));

        this.setPhysicsGravityAcceleration(data.physics.gravityAcceleration);
        this.setPhysicsGravityDirection(
            data.physics.gravityDirection.x,
            data.physics.gravityDirection.y,
            data.physics.gravityDirection.z,
        );
        if (this.physicsAvailable) {
            this.setPhysicsEnabled(Boolean(data.physics.enabled));
        } else if (data.physics.enabled) {
            warnings.push("Physics was enabled in project, but physics is unavailable in this environment");
        }

        this.dofEnabled = Boolean(data.effects.dofEnabled);
        this.dofFocusDistanceMm = data.effects.dofFocusDistanceMm;
        this.dofFStop = data.effects.dofFStop;
        this.dofLensSize = data.effects.dofLensSize;
        this.dofLensBlurStrength = data.effects.dofLensBlurStrength;
        this.dofLensEdgeBlur = data.effects.dofLensEdgeBlur;
        this.dofLensDistortionInfluence = data.effects.dofLensDistortionInfluence;
        this.modelEdgeWidth = data.effects.modelEdgeWidth;
        const importedGamma = data.effects.gamma;
        const gammaEncodingVersion = (data.effects as { gammaEncodingVersion?: unknown }).gammaEncodingVersion;
        const normalizedGamma = gammaEncodingVersion === 2
            ? importedGamma
            : importedGamma * 0.5;
        this.postEffectGamma = normalizedGamma;

        this.camera.setPosition(
            new Vector3(
                data.camera.position.x,
                data.camera.position.y,
                data.camera.position.z,
            ),
        );
        this.camera.setTarget(
            new Vector3(
                data.camera.target.x,
                data.camera.target.y,
                data.camera.target.z,
            ),
        );
        this.camera.fov = (data.camera.fov * Math.PI) / 180;
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
        this.updateEditorDofFocusAndFStop();

        this.setPlaybackSpeed(Math.max(0.01, data.scene.playbackSpeed));

        if (data.scene.timelineTarget === "model" && this.currentModel) {
            this.setTimelineTarget("model");
        } else {
            if (data.scene.timelineTarget === "model" && !this.currentModel) {
                warnings.push("Timeline target was model, but no model is loaded");
            }
            this.setTimelineTarget("camera");
        }

        this.seekTo(Math.max(0, Math.floor(data.scene.currentFrame)));
        return { loadedModels, warnings };
    }

    private clearProjectForImport(): void {
        this.pause();

        if (this.cameraAnimationHandle !== null) {
            this.mmdCamera.destroyRuntimeAnimation(this.cameraAnimationHandle);
            this.cameraAnimationHandle = null;
        }
        this.hasCameraMotion = false;
        this.cameraKeyframeFrames = EMPTY_KEYFRAME_FRAMES;
        this.cameraMotionPath = null;
        this.cameraSourceAnimation = null;

        if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
            this.audioBlobUrl = null;
        }
        if (this.audioPlayer) {
            this.audioPlayer.dispose();
            this.audioPlayer = null;
        }
        this.audioSourcePath = null;

        for (const entry of this.sceneModels) {
            try {
                this.mmdRuntime.destroyMmdModel(entry.model);
            } catch {
                // no-op
            }
            this.modelKeyframeTracksByModel.delete(entry.model);
            this.modelSourceAnimationsByModel.delete(entry.model);
            this.modelMotionImportsByModel.delete(entry.model);
            entry.mesh.dispose();
        }

        this.sceneModels = [];
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
        this.updateBoneGizmoTarget();
        this.emitMergedKeyframeTracks();
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    private isProjectFileV1(value: unknown): value is MmdModokiProjectFileV1 {
        if (!value || typeof value !== "object") return false;
        const maybeProject = value as Partial<MmdModokiProjectFileV1>;
        return maybeProject.format === "mmd_modoki_project" && maybeProject.version === 1;
    }
    /** Current render FPS (rounded) */
    getFps(): number {
        return Math.round(this.engine.getFps());
    }

    /** Engine type string: "WebGL2", "WebGL1", or "WebGPU" */
    getEngineType(): string {
        // WebGPUEngine has no webGLVersion
        const ver = (this.engine as unknown as { webGLVersion?: number }).webGLVersion;
        if (ver === undefined) return "WebGPU";
        return ver >= 2 ? "WebGL2" : "WebGL1";
    }

    /** Capture current viewport as PNG data URL */
    async capturePngDataUrl(precision = 1): Promise<string | null> {
        try {
            const clampedPrecision = Math.max(0.25, Math.min(4, precision));
            return await CreateScreenshotUsingRenderTargetAsync(
                this.engine,
                this.camera,
                { precision: clampedPrecision },
                "image/png",
                1,
                true
            );
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Failed to capture PNG:", message);
            this.onError?.(`PNG capture error: ${message}`);
            return null;
        }
    }

    /** Audio volume (0.0 È¨ØÅE©Ëõπ„ÉªÅEΩÅEΩ„ÉªÅEØÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE∂È¨©Âπ¢ÅEΩÅE¢Èö¥Ë∂£ÅEΩÅE¢ÁπùÔΩª„ÉªÅEΩÁπùÔΩª„ÉªÅEª1.0) */
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

    // È¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬Ä Lighting API È¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬ÄÈ¨ØÅEÆ„ÉªÅE´ÁπùÔΩª„ÉªÅE®È´Æ‰πùÔΩÅE†é„ÅEÅEæ„Å§¬Ä

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

    /** Post-process anti-aliasing enabled state. */
    get antialiasEnabled(): boolean {
        return this.antialiasEnabledValue;
    }
    set antialiasEnabled(v: boolean) {
        this.antialiasEnabledValue = v;
        this.applyAntialiasSettings();
    }

    /** Editor-style depth of field enabled state. */
    get dofEnabled(): boolean {
        return this.dofEnabledValue;
    }
    set dofEnabled(v: boolean) {
        this.dofEnabledValue = v;
        if (this.dofEnabledValue) {
            this.configureDofDepthRenderer();
            this.updateEditorDofFocusAndFStop();
        }
        if (this.defaultRenderingPipeline) {
            if (this.depthRenderer) {
                this.defaultRenderingPipeline.depthOfField.depthTexture = this.depthRenderer.getDepthMap();
            }
            this.defaultRenderingPipeline.depthOfFieldEnabled = this.dofEnabledValue;
        }
        this.applyDofLensBlurSettings();
        this.applyAntialiasSettings();
    }

    /** Editor-style depth of field blur quality (0=Low, 1=Medium, 2=High). */
    get dofBlurLevel(): number {
        return this.dofBlurLevelValue;
    }
    set dofBlurLevel(v: number) {
        const level = v <= 0 ? DepthOfFieldEffectBlurLevel.Low : v === 1 ? DepthOfFieldEffectBlurLevel.Medium : DepthOfFieldEffectBlurLevel.High;
        this.dofBlurLevelValue = level;
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.depthOfFieldBlurLevel = level;
            this.applyEditorDofSettings();
        }
        this.applyAntialiasSettings();
    }

    /** DoF focus distance in scene units/1000 (mm). */
    get dofFocusDistanceMm(): number {
        return this.dofFocusDistanceMmValue;
    }
    set dofFocusDistanceMm(v: number) {
        this.dofFocusDistanceMmValue = Math.max(0, Math.min(1000000000, v));
            this.updateEditorDofFocusAndFStop();
    }

    /** Whether focus distance follows camera target each frame. */
    get dofAutoFocusEnabled(): boolean {
        return this.dofAutoFocusToCameraTarget;
    }
    /** In-focus radius used by auto-focus mode (meters). */
    get dofAutoFocusRangeMeters(): number {
        return this.dofAutoFocusInFocusRadiusMm / 1000;
    }
    /** Auto-focus offset toward camera in mm. */
    get dofAutoFocusNearOffsetMm(): number {
        return this.dofAutoFocusNearOffsetMmValue;
    }
    set dofAutoFocusNearOffsetMm(v: number) {
        this.dofAutoFocusNearOffsetMmValue = Math.max(0, Math.min(1000000000, v));
            this.updateEditorDofFocusAndFStop();
    }
    /** Foreground blur suppression scale for auto-focus near side. */
    get dofNearSuppressionScale(): number {
        return this.dofNearSuppressionScaleValue;
    }
    set dofNearSuppressionScale(v: number) {
        this.dofNearSuppressionScaleValue = Math.max(0, Math.min(10, v));
            this.updateEditorDofFocusAndFStop();
    }
    /** Current effective F-stop after auto-focus compensation. */
    get dofEffectiveFStop(): number {
        return this.dofEffectiveFStopValue;
    }

    /** DoF F-stop. Smaller value means stronger blur. */
    get dofFStop(): number {
        return this.dofFStopValue;
    }
    set dofFStop(v: number) {
        this.dofFStopValue = Math.max(0.01, Math.min(32, v));
            this.updateEditorDofFocusAndFStop();
    }



    /** Whether lens-blur highlights are enabled. */
    get dofLensBlurEnabled(): boolean {
        return this.dofLensBlurEnabledValue;
    }
    set dofLensBlurEnabled(v: boolean) {
        this.dofLensBlurEnabledValue = v;
        this.applyDofLensBlurSettings();
    }

    /** Additional lens-blur strength for bright highlights (0.0..1.0). */
    get dofLensBlurStrength(): number {
        return this.dofLensBlurStrengthValue;
    }
    set dofLensBlurStrength(v: number) {
        this.dofLensBlurStrengthValue = Math.max(0, Math.min(1, v));
        this.applyDofLensBlurSettings();
    }


    /** Lens edge blur strength (0.0..3.0). */
    get dofLensEdgeBlur(): number {
        return this.dofLensEdgeBlurValue;
    }
    set dofLensEdgeBlur(v: number) {
        this.dofLensEdgeBlurValue = Math.max(0, Math.min(3, v));
        this.applyDofLensOpticsSettings();
    }

    /** Lens distortion strength (-1.0..1.0). */
    get dofLensDistortion(): number {
        return this.dofLensDistortionValue;
    }
    set dofLensDistortion(v: number) {
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
            return;
        }
        this.dofLensDistortionValue = Math.max(-1, Math.min(1, v));
        this.applyDofLensOpticsSettings();
    }
    get dofLensDistortionLinkedToCameraFov(): boolean {
        return this.dofLensDistortionFollowsCameraFov;
    }
    /** Distortion influence scale for FoV-linked distortion (0.0..1.0). */
    get dofLensDistortionInfluence(): number {
        return this.dofLensDistortionInfluenceValue;
    }
    set dofLensDistortionInfluence(v: number) {
        this.dofLensDistortionInfluenceValue = Math.max(0, Math.min(1, v));
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
            return;
        }
        this.applyDofLensOpticsSettings();
    }
    /** DoF lens size in scene units/1000 (mm). */
    get dofLensSize(): number {
        return this.dofLensSizeValue;
    }
    set dofLensSize(v: number) {
        this.dofLensSizeValue = Math.max(0, Math.min(8192, v));
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.depthOfField.lensSize = this.dofLensSizeValue;
        }
            this.updateEditorDofFocusAndFStop();
    }

    /** DoF focal length in scene units/1000 (mm). */
    get dofFocalLength(): number {
        return this.dofFocalLengthValue;
    }
    set dofFocalLength(v: number) {
        if (this.dofFocalLengthFollowsCameraFov) {
            this.updateDofFocalLengthFromCameraFov();
            this.updateEditorDofFocusAndFStop();
            return;
        }
        this.dofFocalLengthValue = Math.max(1, Math.min(1000, v));
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.depthOfField.focalLength = this.dofFocalLengthValue;
        }
            this.updateEditorDofFocusAndFStop();
    }
    /** Whether camera-distance-linked DoF focal length mapping is inverted. */
    get dofFocalLengthDistanceInverted(): boolean {
        return this.dofFocalLengthDistanceInvertedValue;
    }
    set dofFocalLengthDistanceInverted(v: boolean) {
        this.dofFocalLengthDistanceInvertedValue = v;
        if (this.dofFocalLengthFollowsCameraFov) {
            this.updateDofFocalLengthFromCameraFov();
            this.updateEditorDofFocusAndFStop();
        }
    }
    /** Whether DoF focal length is linked to camera FoV. */
    /** @deprecated Use dofFocalLengthLinkedToCameraFov. */
    get dofFocalLengthLinkedToCameraDistance(): boolean {
        return this.dofFocalLengthLinkedToCameraFov;
    }
    get dofFocalLengthLinkedToCameraFov(): boolean {
        return this.dofFocalLengthFollowsCameraFov;
    }
    /** Far background depth-of-field strength (0.0..1.0). */
    get postEffectFarDofStrength(): number {
        return this.postEffectFarDofStrengthValue;
    }
    set postEffectFarDofStrength(v: number) {
        if (!this.farDofEnabled) {
            this.postEffectFarDofStrengthValue = 0;
            return;
        }
        this.postEffectFarDofStrengthValue = Math.max(0, Math.min(1, v));
    }

    /** Model outline scale. 1.0 keeps PMX edge color/visibility/width as-is. */
    get modelEdgeWidth(): number {
        return this.modelEdgeWidthValue;
    }
    set modelEdgeWidth(v: number) {
        this.modelEdgeWidthValue = Math.max(0, Math.min(2, v));
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
    set lightIntensity(v: number) { this.dirLight.intensity = Math.max(0, Math.min(2, v)); }

    /** Ambient (hemispheric) light intensity (0.0 È¨ØÅE©Ëõπ„ÉªÅEΩÅEΩ„ÉªÅEØÈÉ¢Êô¢ÅEΩÅEªÁπùÔΩª„ÉªÅE∂È¨©Âπ¢ÅEΩÅE¢Èö¥Ë∂£ÅEΩÅE¢ÁπùÔΩª„ÉªÅEΩÁπùÔΩª„ÉªÅEª2.0) */
    get ambientIntensity(): number { return this.hemiLight.intensity; }
    set ambientIntensity(v: number) { this.hemiLight.intensity = Math.max(0, Math.min(2, v)); }

    /** Shadow darkness (0.0=no shadow, 1.0=full black shadow) */
    get shadowDarkness(): number { return this.shadowDarknessValue; }
    set shadowDarkness(v: number) {
        this.shadowDarknessValue = Math.max(0, Math.min(1, v));
        if (this.shadowEnabled) {
            this.shadowGenerator.darkness = this.shadowDarknessValue;
        }
    }

    getShadowEnabled(): boolean {
        return this.shadowEnabled;
    }
    setShadowEnabled(enabled: boolean): void {
        this.shadowEnabled = enabled;
        this.shadowGenerator.darkness = enabled ? this.shadowDarknessValue : 0;
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

    private getEffectiveShadowEdgeSoftness(): number {
        return (this.selfShadowEdgeSoftnessValue + this.occlusionShadowEdgeSoftnessValue) * 0.5;
    }

    private applyShadowEdgeSoftness(): void {
        this.shadowGenerator.contactHardeningLightSizeUVRatio = this.getEffectiveShadowEdgeSoftness();
    }

    /**
     * Set directional light direction from azimuth and elevation angles.
     * @param azimuthDeg  horizontal rotation in degrees (0=front, 90=right)
     * @param elevationDeg  vertical angle in degrees (0=horizontal, -90=straight down)
     */
    setLightDirection(azimuthDeg: number, elevationDeg: number): void {
        const az = (azimuthDeg * Math.PI) / 180;
        const el = (elevationDeg * Math.PI) / 180;
        const x = Math.cos(el) * Math.sin(az);
        const y = Math.sin(el);
        const z = Math.cos(el) * Math.cos(az);
        this.dirLight.direction = new Vector3(x, y, z).normalize();
        // Move light source opposite to direction for good shadow coverage
        const dist = 60;
        this.dirLight.position = new Vector3(-x * dist, Math.abs(y) * dist + 5, -z * dist);
    }

    /** Current azimuth of directional light (degrees) */
    getLightAzimuth(): number {
        const d = this.dirLight.direction;
        return (Math.atan2(d.x, d.z) * 180) / Math.PI;
    }

    /** Current elevation of directional light (degrees) */
    getLightElevation(): number {
        const d = this.dirLight.direction;
        return (Math.asin(d.y) * 180) / Math.PI;
    }

    private applyLightColorTemperature(): void {
        const color = this.kelvinToColor(this.lightColorTemperatureKelvin);
        this.dirLight.diffuse = color.clone();
        this.dirLight.specular = color.clone();
        this.hemiLight.diffuse = color.scale(0.85);
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

    private setupColorCorrectionPostProcess(): void {
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
                    contrasted = clamp(contrasted, vec3(0.0), vec3(1.0));
                    vec3 corrected = pow(max(contrasted, vec3(0.0)), vec3(gammaPower));
                    gl_FragColor = vec4(corrected, color.a);
                }
            `;
        }

        this.colorCorrectionPostProcess = new PostProcess(
            "colorCorrection",
            "mmdColorCorrection",
            ["contrast", "gammaPower"],
            null,
            1.0,
            this.camera,
            Texture.BILINEAR_SAMPLINGMODE,
            this.engine,
            false
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

        this.defaultRenderingPipeline = new DefaultRenderingPipeline(
            "DefaultRenderingPipeline",
            false,
            this.scene,
            [this.camera]
        );

        this.defaultRenderingPipeline.samples = 1;
        this.defaultRenderingPipeline.fxaaEnabled = false;
        this.defaultRenderingPipeline.imageProcessingEnabled = false;
        this.defaultRenderingPipeline.bloomEnabled = false;
        this.defaultRenderingPipeline.sharpenEnabled = false;
        this.defaultRenderingPipeline.grainEnabled = false;
        this.defaultRenderingPipeline.chromaticAberrationEnabled = false;
        this.defaultRenderingPipeline.glowLayerEnabled = false;

        this.configureDofDepthRenderer();
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
        }
        this.setupLensHighlightsPipeline();
        this.defaultRenderingPipeline.depthOfFieldBlurLevel = this.dofBlurLevelValue;
        this.applyEditorDofSettings();
        this.setupFinalLensDistortionPostProcess();
        this.applyAntialiasSettings();
    }

    private setupFinalLensDistortionPostProcess(): void {
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

        if (this.finalLensDistortionPostProcess) {
            this.finalLensDistortionPostProcess.dispose(this.camera);
            this.finalLensDistortionPostProcess = null;
        }

        this.finalLensDistortionPostProcess = new PostProcess(
            "finalLensDistortion",
            "mmdFinalLensDistortion",
            ["distortion"],
            null,
            1.0,
            this.camera,
            Texture.BILINEAR_SAMPLINGMODE,
            this.engine,
            false
        );
        this.finalLensDistortionPostProcess.onApplyObservable.add((effect) => {
            effect.setFloat("distortion", this.dofLensDistortionValue);
        });
        this.enforceFinalPostProcessOrder();
    }

    private applyAntialiasSettings(): void {
        if (this.finalAntialiasPostProcess) {
            this.finalAntialiasPostProcess.dispose(this.camera);
            this.finalAntialiasPostProcess = null;
        }
        if (!this.antialiasEnabledValue) {
            this.enforceFinalPostProcessOrder();
            return;
        }
        this.finalAntialiasPostProcess = new FxaaPostProcess(
            "finalFxaa",
            1.0,
            this.camera,
            Texture.BILINEAR_SAMPLINGMODE,
            this.engine,
            false
        );
        this.enforceFinalPostProcessOrder();
    }

    private enforceFinalPostProcessOrder(): void {
        if (!this.finalLensDistortionPostProcess) return;

        const distortion = this.finalLensDistortionPostProcess;
        const antialias = this.finalAntialiasPostProcess;

        if (antialias) {
            this.camera.detachPostProcess(distortion);
            this.camera.detachPostProcess(antialias);
            this.camera.attachPostProcess(distortion);
            this.camera.attachPostProcess(antialias);
            return;
        }

        // Keep distortion near the tail when AA is disabled.
        this.camera.detachPostProcess(distortion);
        this.camera.attachPostProcess(distortion);
    }

    private ensureSignedLensDistortionShader(): void {
        const shaderKey = "depthOfFieldPixelShader";
        const source = Effect.ShadersStore[shaderKey];
        if (!source || source.includes("mmdSignedLensDistortion")) {
            return;
        }

        const from = "float dist_amount=clamp(distortion*0.23,0.0,1.0);dist_coords=mix(coords,dist_coords,dist_amount);return dist_coords;}";
        const to = "float dist_amount=clamp(abs(distortion)*0.23,0.0,1.0);dist_coords=mix(coords,dist_coords,dist_amount);vec2 inv_coords=vec2(0.5,0.5);inv_coords.x=0.5-direction.x*radius2*1.0;inv_coords.y=0.5-direction.y*radius2*1.0;inv_coords=mix(coords,inv_coords,dist_amount);dist_coords=distortion>=0.0?dist_coords:inv_coords;return dist_coords;}/*mmdSignedLensDistortion*/";

        if (source.includes(from)) {
            Effect.ShadersStore[shaderKey] = source.replace(from, to);
        }
    }

    private setupLensHighlightsPipeline(): void {
        this.ensureSignedLensDistortionShader();
        this.lensRenderingPipeline = new LensRenderingPipeline(
            "DofLensHighlightsPipeline",
            {
                edge_blur: this.dofLensEdgeBlurValue,
                grain_amount: 0,
                chromatic_aberration: 0,
                distortion: 0,
                dof_focus_distance: Math.max(0.1, this.dofFocusDistanceMmValue / 1000),
                dof_aperture: 0.8,
                dof_darken: 0,
                dof_pentagon: true,
                dof_gain: 0,
                dof_threshold: 1,
                blur_noise: false,
            },
            this.scene,
            1.0,
            [this.camera]
        );
        this.applyDofLensOpticsSettings();
    }
    private applyDofLensOpticsSettings(): void {
        if (!this.lensRenderingPipeline) return;
        this.lensRenderingPipeline.setEdgeBlur(this.dofLensEdgeBlurValue);
        // Distortion is applied in a dedicated final pass so DoF output and highlights stay aligned.
        this.lensRenderingPipeline.setEdgeDistortion(0);
    }
    private applyEditorDofSettings(): void {
        if (!this.defaultRenderingPipeline) return;
        const dof = this.defaultRenderingPipeline.depthOfField;
        if (this.depthRenderer) {
            dof.depthTexture = this.depthRenderer.getDepthMap();
        }
        dof.lensSize = this.dofLensSizeValue;
        dof.focalLength = this.dofFocalLengthValue;
            this.updateEditorDofFocusAndFStop();
        this.defaultRenderingPipeline.depthOfFieldEnabled = this.dofEnabledValue;
        this.applyDofLensBlurSettings();
    }
    private applyDofLensBlurSettings(): void {
        if (!this.lensRenderingPipeline) return;
        this.applyDofLensOpticsSettings();
        const strength = this.dofLensBlurStrengthValue;
        const enabled = this.dofEnabledValue && strength > 0.0001;

        if (!enabled) {
            this.lensRenderingPipeline.setHighlightsGain(0);
            this.lensRenderingPipeline.setFocusDistance(-1);
            return;
        }

        const focusDistance = Math.max(0.1, this.dofFocusDistanceMmValue / 1000);
        const boostedStrength = Math.pow(strength, 0.7);
        const highlightsGain = this.dofLensHighlightsBaseGain + boostedStrength * this.dofLensHighlightsGainRange;
        const highlightsThreshold = Math.max(
            0.08,
            this.dofLensHighlightsBaseThreshold - boostedStrength * this.dofLensHighlightsThresholdRange
        );

        const aperture = Math.max(0.35, 0.55 + boostedStrength * 1.1);
        this.lensRenderingPipeline.setFocusDistance(focusDistance);
        this.lensRenderingPipeline.setAperture(aperture);
        this.lensRenderingPipeline.setHighlightsGain(highlightsGain);
        this.lensRenderingPipeline.setHighlightsThreshold(highlightsThreshold);
    }
    private updateEditorDofFocusAndFStop(): void {
        if (this.dofFocalLengthFollowsCameraFov) {
            this.updateDofFocalLengthFromCameraFov();
        }
        if (this.dofLensDistortionFollowsCameraFov) {
            this.updateDofLensDistortionFromCameraFov();
        }
        if (this.dofAutoFocusToCameraTarget) {
            const targetFocusMm = this.getCameraFocusDistanceMm();
            const minFocusMm = this.camera.minZ * 1000;
            this.dofFocusDistanceMmValue = Math.max(minFocusMm, targetFocusMm - this.dofAutoFocusNearOffsetMmValue);
        }
        const autoMinFStop = this.dofAutoFocusToCameraTarget
            ? this.computeAutoFocusMinFStop(this.dofFocusDistanceMmValue)
            : 0;
        this.dofEffectiveFStopValue = Math.max(
            0.01,
            Math.min(32, Math.max(this.dofFStopValue, autoMinFStop))
        );
        if (!this.defaultRenderingPipeline) return;
        const dof = this.defaultRenderingPipeline.depthOfField;
        dof.focusDistance = this.dofFocusDistanceMmValue;
        dof.fStop = this.dofEffectiveFStopValue;
        this.applyDofLensBlurSettings();
    }
    private updateDofLensDistortionFromCameraFov(): void {
        const fovDeg = (this.camera.fov * 180) / Math.PI;
        const minTele = this.dofLensDistortionMinTeleFovDeg;
        const neutral = this.dofLensDistortionNeutralFovDeg;
        const maxWide = this.dofLensDistortionMaxWideFovDeg;
        const clampedFovDeg = Math.max(minTele, Math.min(maxWide, fovDeg));

        let distortion = 0;
        if (clampedFovDeg >= neutral) {
            const wideSpan = Math.max(0.0001, maxWide - neutral);
            distortion = (clampedFovDeg - neutral) / wideSpan;
        } else {
            const teleSpan = Math.max(0.0001, neutral - minTele);
            distortion = -((neutral - clampedFovDeg) / teleSpan);
        }

        const influencedDistortion = distortion * this.dofLensDistortionInfluenceValue;
        this.dofLensDistortionValue = Math.max(-1, Math.min(1, influencedDistortion));
        this.applyDofLensOpticsSettings();
    }
    private updateDofFocalLengthFromCameraFov(): void {
        const fovRad = Math.max(0.01, this.camera.fov);
        const baseFocalLengthMm = (0.5 * this.dofFovLinkSensorWidthMm) / Math.tan(fovRad * 0.5);
        let focalLengthMm = baseFocalLengthMm;

        if (this.dofFocalLengthDistanceInvertedValue) {
            const minFovRad = (10 * Math.PI) / 180;
            const maxFovRad = (120 * Math.PI) / 180;
            const focalAtTeleMm = (0.5 * this.dofFovLinkSensorWidthMm) / Math.tan(minFovRad * 0.5);
            const focalAtWideMm = (0.5 * this.dofFovLinkSensorWidthMm) / Math.tan(maxFovRad * 0.5);
            focalLengthMm = focalAtWideMm + focalAtTeleMm - baseFocalLengthMm;
        }

        this.dofFocalLengthValue = Math.max(1, Math.min(1000, focalLengthMm));
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.depthOfField.focalLength = this.dofFocalLengthValue;
        }
    }
    private computeAutoFocusMinFStop(focusDistanceMm: number): number {
        const focalLengthMm = Math.max(1, this.dofFocalLengthValue);
        const lensSizeMm = Math.max(0.001, this.dofLensSizeValue);
        const safeFocusDistanceMm = Math.max(focalLengthMm + 1, focusDistanceMm);
        const focusBandRadiusMm = Math.max(1, this.dofAutoFocusInFocusRadiusMm);
        // Expand near-side in-focus protection to suppress foreground blur.
        const nearFocusBandRadiusMm = focusBandRadiusMm * this.dofNearSuppressionScaleValue;
        const nearBandDistanceMm = Math.max(focalLengthMm + 1, safeFocusDistanceMm - nearFocusBandRadiusMm);
        // Keep focus assistance active, but avoid fully canceling lens-size impact.
        const compensatedLensSizeMm = Math.pow(lensSizeMm, this.dofAutoFocusLensCompensationExponent);
        const numerator = compensatedLensSizeMm * focalLengthMm * focusBandRadiusMm;
        const denominator = this.dofAutoFocusCocAtRangeEdge * nearBandDistanceMm * (safeFocusDistanceMm - focalLengthMm);
        if (denominator <= 1e-6) {
            return 32;
        }
        return Math.max(0.01, Math.min(32, numerator / denominator));
    }
    private configureDofDepthRenderer(): void {
        const depthRenderer = this.scene.enableDepthRenderer(this.camera, false);
        depthRenderer.useOnlyInActiveCamera = true;
        depthRenderer.forceDepthWriteTransparentMeshes = true;
        this.depthRenderer = depthRenderer;
    }
    private setupFarDofPostProcess(): void {
        if (!this.farDofEnabled) {
            this.postEffectFarDofStrengthValue = 0;
            return;
        }
        this.depthRenderer = this.scene.enableDepthRenderer(this.camera, false, true);

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

        this.dofPostProcess = new PostProcess(
            "farDepthOfField",
            "mmdFarDof",
            ["cameraNearFar", "texelSize", "focusDistance", "focusSharpRadius", "farDofStrength"],
            ["depthSampler"],
            1.6,
            this.camera,
            Texture.TRILINEAR_SAMPLINGMODE,
            this.engine,
            false
        );

        this.dofPostProcess.onApplyObservable.add((effect) => {
            const depthMap = this.depthRenderer?.getDepthMap();
            if (!depthMap) return;

            effect.setTexture("depthSampler", depthMap);
            effect.setFloat2("cameraNearFar", this.camera.minZ, this.camera.maxZ);
            effect.setFloat2(
                "texelSize",
                1 / Math.max(1, this.dofPostProcess?.width ?? this.engine.getRenderWidth()),
                1 / Math.max(1, this.dofPostProcess?.height ?? this.engine.getRenderHeight())
            );
            effect.setFloat("focusDistance", this.getCameraFocusDistanceMm());
            effect.setFloat("focusSharpRadius", this.farDofFocusSharpRadiusMm);
            effect.setFloat("farDofStrength", this.postEffectFarDofStrengthValue);
        });
    }

    private getCameraFocusDistanceMm(): number {
        const distance = Vector3.Distance(this.camera.globalPosition, this.camera.target);
        return Math.max(this.camera.minZ, distance) * 1000;
    }
    getMorphWeight(morphName: string): number {
        if (!this.currentMesh || !this.currentMesh.morphTargetManager) return 0;
        try {
            const mtm = this.currentMesh.morphTargetManager;
            for (let i = 0; i < mtm.numTargets; i++) {
                const target = mtm.getTarget(i);
                if (target.name === morphName) {
                    return target.influence;
                }
            }
        } catch { /* ignore */ }
        return 0;
    }

    setMorphWeight(morphName: string, weight: number): void {
        if (!this.currentMesh || !this.currentMesh.morphTargetManager) return;
        try {
            const mtm = this.currentMesh.morphTargetManager;
            for (let i = 0; i < mtm.numTargets; i++) {
                const target = mtm.getTarget(i);
                if (target.name === morphName) {
                    target.influence = Math.max(0, Math.min(1, weight));
                    break;
                }
            }
        } catch { /* ignore */ }
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

    getBoneTransform(boneName: string): { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number } } | null {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return null;

        const positionOffset = new Vector3();
        runtimeBone.getAnimationPositionOffsetToRef(positionOffset);

        const rotationQuaternion = runtimeBone.getAnimatedRotationToRef(Quaternion.Identity());
        const rotationEuler = rotationQuaternion.toEulerAngles();
        const radToDeg = 180 / Math.PI;

        return {
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
    }

    setBoneTranslation(boneName: string, x: number, y: number, z: number): void {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return;

        const restMatrix = runtimeBone.linkedBone.getRestMatrix();
        const restX = restMatrix.m[12];
        const restY = restMatrix.m[13];
        const restZ = restMatrix.m[14];

        runtimeBone.linkedBone.position.set(restX + x, restY + y, restZ + z);
        this.invalidateBoneVisualizerPose(runtimeBone);
    }

    setBoneRotation(boneName: string, xDeg: number, yDeg: number, zDeg: number): void {
        const runtimeBone = this.getRuntimeBoneByName(boneName);
        if (!runtimeBone) return;

        const xRad = (xDeg * Math.PI) / 180;
        const yRad = (yDeg * Math.PI) / 180;
        const zRad = (zDeg * Math.PI) / 180;
        const rotation = Quaternion.RotationYawPitchRoll(yRad, xRad, zRad);

        runtimeBone.linkedBone.rotationQuaternion.copyFrom(rotation);
        this.invalidateBoneVisualizerPose(runtimeBone);
    }

    private invalidateBoneVisualizerPose(runtimeBone: EditorRuntimeBone): void {
        const linkedBone = runtimeBone.linkedBone;
        const linkedBoneInternal = linkedBone as unknown as {
            markAsDirty?: () => void;
            getSkeleton?: () => Skeleton;
        };
        linkedBoneInternal.markAsDirty?.();
        linkedBoneInternal.getSkeleton?.()?.computeAbsoluteMatrices(true);
        this.boneVisualizerTarget?.skeleton?.computeAbsoluteMatrices(true);
    }
    getCameraPosition(): { x: number; y: number; z: number } {
        const pos = this.camera.position;
        return { x: pos.x, y: pos.y, z: pos.z };
    }

    setCameraPosition(x: number, y: number, z: number): void {
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
        this.cameraRotationEulerDeg.set(xDeg, yDeg, zDeg);
        this.applyCameraRotationFromEuler();
        this.syncMmdCameraFromViewportCamera();
    }

    setCameraTarget(x: number, y: number, z: number): void {
        this.camera.target = new Vector3(x, y, z);
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
    }

    getCameraFov(): number {
        return (this.camera.fov * 180) / Math.PI;
    }

    getCameraDistance(): number {
        return Math.max(this.camera.minZ, Vector3.Distance(this.camera.position, this.camera.target));
    }

    setCameraDistance(distance: number): void {
        const min = Math.max(0.1, this.camera.lowerRadiusLimit ?? this.camera.minZ);
        const max = this.camera.upperRadiusLimit ?? 1000000;
        this.camera.radius = Math.max(min, Math.min(max, distance));
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
            this.updateEditorDofFocusAndFStop();
    }

    setCameraFov(degrees: number): void {
        this.camera.fov = (degrees * Math.PI) / 180;
        this.syncMmdCameraFromViewportCamera();
            this.updateEditorDofFocusAndFStop();
    }

    setCameraView(view: "left" | "front" | "right"): void {
        const target = this.camera.target.clone();
        const horizontalDistance = Math.max(
            5,
            Math.hypot(this.camera.position.x - target.x, this.camera.position.z - target.z)
        );
        const yOffset = Math.max(2, this.camera.position.y - target.y);

        const nextPosition = target.clone();
        switch (view) {
            case "left":
                nextPosition.x -= horizontalDistance;
                break;
            case "right":
                nextPosition.x += horizontalDistance;
                break;
            case "front":
            default:
                nextPosition.z -= horizontalDistance;
                break;
        }
        nextPosition.y += yOffset;

        this.camera.upVector = new Vector3(0, 1, 0);
        this.camera.setPosition(nextPosition);
        this.camera.setTarget(target);
        this.syncCameraRotationFromCurrentView();
        this.syncMmdCameraFromViewportCamera();
    }

    private syncMmdCameraFromViewportCamera(): void {
        this.mmdCamera.target.copyFrom(this.camera.target);
        this.mmdCamera.position = this.camera.position.clone();
        this.mmdCamera.fov = this.camera.fov;
    }

    private syncViewportCameraFromMmdCamera(): void {
        // MmdCamera is not the active scene camera, so keep its position up to date explicitly.
        this.mmdCamera.updatePosition();
        this.camera.setPosition(this.mmdCamera.position);
        this.camera.setTarget(this.mmdCamera.target);
        this.camera.fov = this.mmdCamera.fov;
        this.updateDofFocalLengthFromCameraFov();
        this.camera.upVector.copyFrom(this.mmdCamera.upVector);
        this.syncCameraRotationFromCurrentView();
    }

    private applyCameraRotationFromEuler(): void {
        const xRad = (this.cameraRotationEulerDeg.x * Math.PI) / 180;
        const yRad = (this.cameraRotationEulerDeg.y * Math.PI) / 180;
        const zRad = (this.cameraRotationEulerDeg.z * Math.PI) / 180;
        const rot = Matrix.RotationYawPitchRoll(yRad, xRad, zRad);

        const forward = Vector3.TransformNormal(new Vector3(0, 0, 1), rot).normalize();
        const up = Vector3.TransformNormal(new Vector3(0, 1, 0), rot).normalize();
        const distance = Math.max(this.camera.radius, this.camera.lowerRadiusLimit ?? 2);
        const target = this.camera.position.add(forward.scale(distance));

        this.camera.upVector = up;
        this.camera.target = target;
    }

    private syncCameraRotationFromCurrentView(): void {
        const forward = this.camera.target.subtract(this.camera.position);
        if (forward.lengthSquared() < 1e-8) return;

        forward.normalize();
        const yaw = Math.atan2(forward.x, forward.z);
        const pitch = Math.atan2(-forward.y, Math.sqrt(forward.x * forward.x + forward.z * forward.z));
        this.cameraRotationEulerDeg.x = (pitch * 180) / Math.PI;
        this.cameraRotationEulerDeg.y = (yaw * 180) / Math.PI;
        this.cameraRotationEulerDeg.z = 0;
    }

    private getOrCreateModelTrackFrameMap(model: MmdModel): Map<string, Uint32Array> {
        let frameMap = this.modelKeyframeTracksByModel.get(model);
        if (!frameMap) {
            frameMap = new Map<string, Uint32Array>();
            this.modelKeyframeTracksByModel.set(model, frameMap);
        }
        return frameMap;
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
        const offset = Math.max(0, Math.floor(frameOffset));
        if (offset === 0) return animation;

        const offsetFrames = (frames: Uint32Array): Uint32Array => {
            const shifted = new Uint32Array(frames.length);
            for (let i = 0; i < frames.length; i += 1) {
                shifted[i] = frames[i] + offset;
            }
            return shifted;
        };

        const movableBoneTracks = animation.movableBoneTracks.map((track) => {
            const nextTrack = new MmdMovableBoneAnimationTrack(track.name, track.frameNumbers.length);
            nextTrack.frameNumbers.set(offsetFrames(track.frameNumbers));
            nextTrack.positions.set(track.positions);
            nextTrack.positionInterpolations.set(track.positionInterpolations);
            nextTrack.rotations.set(track.rotations);
            nextTrack.rotationInterpolations.set(track.rotationInterpolations);
            nextTrack.physicsToggles.set(track.physicsToggles);
            return nextTrack;
        });

        const boneTracks = animation.boneTracks.map((track) => {
            const nextTrack = new MmdBoneAnimationTrack(track.name, track.frameNumbers.length);
            nextTrack.frameNumbers.set(offsetFrames(track.frameNumbers));
            nextTrack.rotations.set(track.rotations);
            nextTrack.rotationInterpolations.set(track.rotationInterpolations);
            nextTrack.physicsToggles.set(track.physicsToggles);
            return nextTrack;
        });

        const morphTracks = animation.morphTracks.map((track) => {
            const nextTrack = new MmdMorphAnimationTrack(track.name, track.frameNumbers.length);
            nextTrack.frameNumbers.set(offsetFrames(track.frameNumbers));
            nextTrack.weights.set(track.weights);
            return nextTrack;
        });

        return new MmdAnimation(
            `${animation.name}@${offset}`,
            boneTracks,
            movableBoneTracks,
            morphTracks,
            animation.propertyTrack,
            animation.cameraTrack,
        );
    }

    private mergeModelAnimations(baseAnimation: MmdAnimation, overlayAnimation: MmdAnimation): MmdAnimation {
        const mergedBoneTracks = this.mergeBoneTrackArrays(baseAnimation.boneTracks, overlayAnimation.boneTracks);
        const mergedMovableBoneTracks = this.mergeMovableBoneTrackArrays(baseAnimation.movableBoneTracks, overlayAnimation.movableBoneTracks);
        const mergedMorphTracks = this.mergeMorphTrackArrays(baseAnimation.morphTracks, overlayAnimation.morphTracks);

        return new MmdAnimation(
            `${baseAnimation.name}+${overlayAnimation.name}`,
            mergedBoneTracks,
            mergedMovableBoneTracks,
            mergedMorphTracks,
            baseAnimation.propertyTrack,
            baseAnimation.cameraTrack,
        );
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
    private buildModelTrackFrameMapFromAnimation(animation: any, frameOffset = 0): Map<string, Uint32Array> {
        const frameMap = new Map<string, Uint32Array>();
        const normalizedOffset = Math.max(0, Math.floor(frameOffset));

        const applyFrameOffset = (frames: Uint32Array): Uint32Array => {
            if (normalizedOffset === 0) {
                return new Uint32Array(frames);
            }
            const shiftedFrames = new Uint32Array(frames.length);
            for (let i = 0; i < frames.length; i += 1) {
                shiftedFrames[i] = frames[i] + normalizedOffset;
            }
            return shiftedFrames;
        };

        const upsertTrack = (name: string, category: TrackCategory, frames: Uint32Array): void => {
            if (!frames || frames.length === 0) return;
            const key = createTrackKey(category, name);
            const copiedFrames = applyFrameOffset(frames);
            const existing = frameMap.get(key);
            frameMap.set(key, existing ? mergeFrameNumbers(existing, copiedFrames) : copiedFrames);
        };

        for (const track of animation.movableBoneTracks ?? []) {
            upsertTrack(track.name, classifyBone(track.name), track.frameNumbers);
        }
        for (const track of animation.boneTracks ?? []) {
            upsertTrack(track.name, classifyBone(track.name), track.frameNumbers);
        }
        for (const track of animation.morphTracks ?? []) {
            upsertTrack(track.name, "morph", track.frameNumbers);
        }

        return frameMap;
    }

    private getActiveModelTimelineTracks(): KeyframeTrack[] {
        if (!this.currentModel || !this.activeModelInfo) return [];

        const visibleBoneNameSet = new Set(this.activeModelInfo.boneNames);
        const isVisibleBoneCategory = (category: TrackCategory): boolean => {
            return category === "root" || category === "semi-standard" || category === "bone";
        };

        const frameMap = this.getOrCreateModelTrackFrameMap(this.currentModel);
        const trackMap = new Map<string, KeyframeTrack>();

        for (const [key, frames] of frameMap.entries()) {
            const parsed = parseTrackKey(key);
            if (!parsed) continue;
            if (isVisibleBoneCategory(parsed.category) && !visibleBoneNameSet.has(parsed.name)) {
                continue;
            }
            trackMap.set(key, {
                name: parsed.name,
                category: parsed.category,
                frames,
            });
        }

        for (const boneName of this.activeModelInfo.boneNames) {
            const category = classifyBone(boneName);
            const key = createTrackKey(category, boneName);
            if (!trackMap.has(key)) {
                trackMap.set(key, {
                    name: boneName,
                    category,
                    frames: EMPTY_KEYFRAME_FRAMES,
                });
            }
        }

        for (const morphName of this.activeModelInfo.morphNames) {
            const key = createTrackKey("morph", morphName);
            if (!trackMap.has(key)) {
                trackMap.set(key, {
                    name: morphName,
                    category: "morph",
                    frames: EMPTY_KEYFRAME_FRAMES,
                });
            }
        }

        const ordered: KeyframeTrack[] = [];
        const consumed = new Set<string>();

        const appendByKey = (key: string): void => {
            const track = trackMap.get(key);
            if (!track) return;
            ordered.push(track);
            consumed.add(key);
        };

        for (const boneName of this.activeModelInfo.boneNames) {
            if (classifyBone(boneName) !== "root") continue;
            appendByKey(createTrackKey("root", boneName));
        }

        for (const boneName of this.activeModelInfo.boneNames) {
            const category = classifyBone(boneName);
            if (category === "root") continue;
            appendByKey(createTrackKey(category, boneName));
        }

        for (const morphName of this.activeModelInfo.morphNames) {
            appendByKey(createTrackKey("morph", morphName));
        }

        for (const [key, track] of trackMap) {
            if (consumed.has(key)) continue;
            ordered.push(track);
        }

        return ordered;
    }
    private createCameraChannelTracks(frames: Uint32Array): KeyframeTrack[] {
        const cameraFrames = frames.length > 0 ? frames : EMPTY_KEYFRAME_FRAMES;
        return [
            { name: "Camera", category: "camera", frames: cameraFrames },
        ];
    }

    private getCameraTimelineTracks(): KeyframeTrack[] {
        return this.createCameraChannelTracks(this.cameraKeyframeFrames);
    }

    private getRegisteredKeyframeStats(): { hasAnyKeyframe: boolean; maxFrame: number } {
        let hasAnyKeyframe = false;
        let maxFrame = 0;

        if (this.cameraKeyframeFrames.length > 0) {
            hasAnyKeyframe = true;
            maxFrame = this.cameraKeyframeFrames[this.cameraKeyframeFrames.length - 1];
        }

        for (const sceneModel of this.sceneModels) {
            const frameMap = this.modelKeyframeTracksByModel.get(sceneModel.model);
            if (!frameMap) continue;
            for (const frames of frameMap.values()) {
                if (frames.length === 0) continue;
                hasAnyKeyframe = true;
                const trackMaxFrame = frames[frames.length - 1];
                if (trackMaxFrame > maxFrame) {
                    maxFrame = trackMaxFrame;
                }
            }
        }

        return { hasAnyKeyframe, maxFrame };
    }

    private refreshTotalFramesFromContent(): void {
        const runtimeDurationFrame = Math.max(0, Math.floor(this.mmdRuntime.animationFrameTimeDuration));
        const { hasAnyKeyframe, maxFrame } = this.getRegisteredKeyframeStats();
        const hasAudio = this.audioPlayer !== null;
        const nextTotalFrames = hasAnyKeyframe && !hasAudio
            ? Math.max(maxFrame, 1)
            : Math.max(runtimeDurationFrame, maxFrame, hasAnyKeyframe ? 0 : 300);
        if (nextTotalFrames === this._totalFrames) return;

        this._totalFrames = nextTotalFrames;
        if (this._currentFrame > this._totalFrames) {
            this._currentFrame = this._totalFrames;
            this.mmdRuntime.seekAnimation(this._currentFrame, true);
            if (this.manualPlaybackWithoutAudio) {
                this.manualPlaybackFrameCursor = this._currentFrame;
            }
        }
        this.onFrameUpdate?.(this._currentFrame, this._totalFrames);
    }

    private emitMergedKeyframeTracks(): void {
        this.refreshTotalFramesFromContent();
        if (!this.onKeyframesLoaded) return;

        if (this.timelineTarget === "camera") {
            this.onKeyframesLoaded(this.getCameraTimelineTracks());
            return;
        }

        this.onKeyframesLoaded(this.getActiveModelTimelineTracks());
    }

    resize(): void {
        this.resizeToCanvasClientSize();
    }

    dispose(): void {
        this.renderingCanvas.removeEventListener("pointerdown", this.onCanvasPointerDown);
        this.renderingCanvas.removeEventListener("pointerup", this.onCanvasPointerUp);
        this.renderingCanvas.removeEventListener("pointercancel", this.onCanvasPointerCancel);
        if (this.boneGizmoManager) {
            this.boneGizmoManager.dispose();
            this.boneGizmoManager = null;
        }
        this.boneGizmoRuntimeBone = null;
        this.boneGizmoProxyNode?.dispose();
        this.boneGizmoProxyNode = null;
        window.removeEventListener("resize", this.onWindowResize);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.audioBlobUrl) {
            URL.revokeObjectURL(this.audioBlobUrl);
        }
        if (this.audioPlayer) {
            this.audioPlayer.dispose();
        }
        for (const sceneModel of this.sceneModels) {
            try {
                this.mmdRuntime.destroyMmdModel(sceneModel.model);
            } catch {
                // no-op
            }
            sceneModel.mesh.dispose();
        }
        this.sceneModels = [];
        this.disposeBoneVisualizer();
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
        if (this.scene.getPhysicsEngine()) {
            this.scene.disablePhysicsEngine();
        }
        this.physicsPlugin = null;
        this.physicsRuntime = null;
        if (this.defaultRenderingPipeline) {
            this.defaultRenderingPipeline.dispose();
            this.defaultRenderingPipeline = null;
        }
        if (this.lensRenderingPipeline) {
            this.lensRenderingPipeline.dispose(false);
            this.lensRenderingPipeline = null;
        }
        if (this.colorCorrectionPostProcess) {
            this.colorCorrectionPostProcess.dispose(this.camera);
            this.colorCorrectionPostProcess = null;
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
        }
        if (this.skydome) {
            this.skydome.dispose();
            this.skydome = null;
        }
        this.scene.dispose();
        this.engine.dispose();
    }

    private resizeToCanvasClientSize(): void {
        const width = Math.max(1, Math.floor(this.renderingCanvas.clientWidth));
        const height = Math.max(1, Math.floor(this.renderingCanvas.clientHeight));
        if (width === 0 || height === 0) return;

        this.resizeBoneOverlayCanvas();

        // Keep drawing buffer aligned to CSS pixel size to avoid edge tearing artifacts.
        if (this.engine.getRenderWidth() !== width || this.engine.getRenderHeight() !== height) {
            this.engine.setSize(width, height);
        }
    }
}





export interface ElectronAPI {
    openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>;
    readBinaryFile: (filePath: string) => Promise<Buffer | null>;
    readTextFile: (filePath: string) => Promise<string | null>;
    getFileInfo: (filePath: string) => Promise<{ name: string; path: string; size: number; extension: string } | null>;
    saveTextFile: (
        content: string,
        defaultFileName?: string,
        filters?: { name: string; extensions: string[] }[],
    ) => Promise<string | null>;
    savePngFile: (dataUrl: string, defaultFileName?: string) => Promise<string | null>;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

export interface ModelInfo {
    name: string;
    path: string;
    vertexCount: number;
    boneCount: number;
    boneNames: string[];
    boneControlInfos?: BoneControlInfo[];
    morphCount: number;
    morphNames: string[];
    morphDisplayFrames: MorphDisplayFrameInfo[];
}

export interface BoneControlInfo {
    name: string;
    movable: boolean;
    rotatable: boolean;
    isIk?: boolean;
    isIkAffected?: boolean;
}

export interface MorphDisplayFrameInfo {
    name: string;
    morphNames: string[];
}

export interface MotionInfo {
    name: string;
    path: string;
    frameCount: number;
}

/** Track category for timeline row ordering */
export type TrackCategory = 'root' | 'camera' | 'semi-standard' | 'bone' | 'morph';

/** A single row in the keyframe timeline */
export interface KeyframeTrack {
    /** Bone or morph name */
    name: string;
    /** Row ordering category */
    category: TrackCategory;
    /** Frame numbers that have keyframes (sorted ascending) */
    frames: Uint32Array;
}

export interface InterpolationCurve {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
}

export interface InterpolationChannelPreview {
    id: string;
    label: string;
    curve: InterpolationCurve;
    available: boolean;
}

export type InterpolationPreviewSource =
    | "none"
    | "bone-movable"
    | "bone-rotation-only"
    | "camera"
    | "morph";

export interface TimelineInterpolationPreview {
    source: InterpolationPreviewSource;
    frame: number;
    hasKeyframe: boolean;
    hasCurveData: boolean;
    channels: InterpolationChannelPreview[];
}

export interface AppState {
    modelLoaded: boolean;
    motionLoaded: boolean;
    isPlaying: boolean;
    currentFrame: number;
    totalFrames: number;
    modelInfo: ModelInfo | null;
    motionInfo: MotionInfo | null;
}

export interface ProjectMotionImport {
    type: "vmd" | "vpd";
    path: string;
    frame?: number;
}

export interface ProjectModelState {
    path: string;
    visible: boolean;
    motionImports: ProjectMotionImport[];
    animation?: ProjectSerializedModelAnimation | null;
}

export interface ProjectCameraState {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    fov: number;
    distance: number;
}

export interface ProjectLightingState {
    azimuth: number;
    elevation: number;
    intensity: number;
    ambientIntensity: number;
    temperatureKelvin: number;
    shadowEnabled: boolean;
    shadowDarkness: number;
    shadowEdgeSoftness?: number;
    selfShadowEdgeSoftness?: number;
    occlusionShadowEdgeSoftness?: number;
}

export interface ProjectViewportState {
    groundVisible: boolean;
    skydomeVisible: boolean;
    antialiasEnabled: boolean;
}

export interface ProjectPhysicsState {
    enabled: boolean;
    gravityAcceleration: number;
    gravityDirection: { x: number; y: number; z: number };
}

export interface ProjectEffectState {
    dofEnabled: boolean;
    dofFocusDistanceMm: number;
    dofFStop: number;
    dofLensSize: number;
    dofLensBlurStrength: number;
    dofLensEdgeBlur: number;
    dofLensDistortionInfluence: number;
    modelEdgeWidth: number;
    gamma: number;
    gammaEncodingVersion?: 2;
}

export interface ProjectSerializedBoneTrack {
    name: string;
    frameNumbers: ProjectNumberArray;
    rotations: ProjectNumberArray;
    rotationInterpolations: ProjectNumberArray;
    physicsToggles: ProjectNumberArray;
}

export interface ProjectSerializedMovableBoneTrack {
    name: string;
    frameNumbers: ProjectNumberArray;
    positions: ProjectNumberArray;
    positionInterpolations: ProjectNumberArray;
    rotations: ProjectNumberArray;
    rotationInterpolations: ProjectNumberArray;
    physicsToggles: ProjectNumberArray;
}

export interface ProjectSerializedMorphTrack {
    name: string;
    frameNumbers: ProjectNumberArray;
    weights: ProjectNumberArray;
}

export interface ProjectSerializedPropertyTrack {
    frameNumbers: ProjectNumberArray;
    visibles: ProjectNumberArray;
    ikBoneNames: string[];
    ikStates: ProjectNumberArray[];
}

export interface ProjectSerializedCameraTrack {
    frameNumbers: ProjectNumberArray;
    positions: ProjectNumberArray;
    positionInterpolations: ProjectNumberArray;
    rotations: ProjectNumberArray;
    rotationInterpolations: ProjectNumberArray;
    distances: ProjectNumberArray;
    distanceInterpolations: ProjectNumberArray;
    fovs: ProjectNumberArray;
    fovInterpolations: ProjectNumberArray;
}

export interface ProjectPackedArray {
    encoding: "u8-b64" | "f32-b64" | "u32-delta-varint-b64";
    length: number;
    data: string;
}

export type ProjectNumberArray = number[] | ProjectPackedArray;

export interface ProjectSerializedModelAnimation {
    name: string;
    boneTracks: ProjectSerializedBoneTrack[];
    movableBoneTracks: ProjectSerializedMovableBoneTrack[];
    morphTracks: ProjectSerializedMorphTrack[];
    propertyTrack: ProjectSerializedPropertyTrack;
}

export interface ProjectKeyframeModelAnimation {
    modelPath: string;
    animation: ProjectSerializedModelAnimation | null;
}

export interface ProjectKeyframeBundle {
    modelAnimations: ProjectKeyframeModelAnimation[];
    cameraAnimation: ProjectSerializedCameraTrack | null;
}

export interface MmdModokiProjectFileV1 {
    format: "mmd_modoki_project";
    version: 1;
    savedAt: string;
    scene: {
        models: ProjectModelState[];
        activeModelPath: string | null;
        timelineTarget: "model" | "camera";
        currentFrame: number;
        playbackSpeed: number;
    };
    assets: {
        cameraVmdPath: string | null;
        audioPath: string | null;
        cameraAnimation?: ProjectSerializedCameraTrack | null;
    };
    camera: ProjectCameraState;
    lighting: ProjectLightingState;
    viewport: ProjectViewportState;
    physics: ProjectPhysicsState;
    effects: ProjectEffectState;
    keyframes?: ProjectKeyframeBundle;
}

import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { MmdBoneAnimationTrack, MmdCameraAnimationTrack, MmdMorphAnimationTrack, MmdMovableBoneAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import type { KeyframeTrack, ModelInfo, TimelineTarget, TrackCategory } from "../types";
import type { AccessoryTransformKeyframeValue } from "./accessory-transform-keyframe-track";
import type { ModelExternalParentKeyframePayload } from "../shared/model-external-parent";
import { addFrameNumber, classifyBone, createTrackKey, hasFrameNumber, mergeFrameNumbers, moveFrameNumber, parseTrackKey, removeFrameNumber } from "../shared/timeline-helpers";

const EMPTY_KEYFRAME_FRAMES = new Uint32Array(0);
const DEFAULT_EDIT_TIMELINE_FRAMES = 300;

type RuntimePropertyTrackLike = {
    frameNumbers: ArrayLike<number>;
    visibles: Uint8Array;
    ikBoneNames: readonly string[];
    getIkState: (index: number) => Uint8Array;
};

type RuntimePropertyTrackMutable = {
    frameNumbers: Uint32Array;
    visibles: Uint8Array;
    ikBoneNames: readonly string[];
    getIkState: (index: number) => Uint8Array;
};

type CameraTrackBatchMutable = {
    frameNumbers: Uint32Array;
    positions: Float32Array;
    positionInterpolations: Uint8Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    distances: Float32Array;
    distanceInterpolations: Uint8Array;
    fovs: Float32Array;
    fovInterpolations: Uint8Array;
};

type MorphTrackBatchMutable = {
    name: string;
    frameNumbers: Uint32Array;
    weights: Float32Array;
};

type MovableBoneTrackBatchMutable = {
    name: string;
    frameNumbers: Uint32Array;
    positions: Float32Array;
    positionInterpolations: Uint8Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    physicsToggles: Uint8Array;
};

type BoneTrackBatchMutable = {
    name: string;
    frameNumbers: Uint32Array;
    rotations: Float32Array;
    rotationInterpolations: Uint8Array;
    physicsToggles: Uint8Array;
};

function asMutableCameraTrack(track: MmdCameraAnimationTrack): CameraTrackBatchMutable {
    return track as unknown as CameraTrackBatchMutable;
}

function asMutableMorphTrack(track: MmdMorphAnimationTrack): MorphTrackBatchMutable {
    return track as unknown as MorphTrackBatchMutable;
}

function asMutableMovableBoneTrack(track: MmdMovableBoneAnimationTrack): MovableBoneTrackBatchMutable {
    return track as unknown as MovableBoneTrackBatchMutable;
}

function asMutableBoneTrack(track: MmdBoneAnimationTrack): BoneTrackBatchMutable {
    return track as unknown as BoneTrackBatchMutable;
}

type TimelineEditRuntimeModel = {
    name?: string;
};

type TimelineEditSceneModel = {
    model: TimelineEditRuntimeModel;
};

type TimelineEditHost = {
    currentModel: TimelineEditRuntimeModel | null;
    activeModelInfo: ModelInfo | null;
    sceneModels: TimelineEditSceneModel[];
    modelKeyframeTracksByModel: WeakMap<TimelineEditRuntimeModel, Map<string, Uint32Array>>;
    modelSourceAnimationsByModel: WeakMap<TimelineEditRuntimeModel, MmdAnimation>;
    cameraKeyframeFrames: Uint32Array;
    cameraSourceAnimation: MmdAnimation | null;
    cameraMotionPath: string | null;
    timelineTarget: TimelineTarget;
    getActiveTimelineAccessoryIndex?: () => number | null;
    getLoadedAccessories?: () => readonly { index: number; name: string; kind?: string }[];
    getAccessoryTransformKeyframeFrames?: (index: number) => Uint32Array;
    getAllAccessoryTransformKeyframeFrames?: () => Uint32Array[];
    captureAccessoryTransformKeyframeValue?: (index: number) => AccessoryTransformKeyframeValue | null;
    readAccessoryTransformKeyframeValue?: (index: number, frame: number) => AccessoryTransformKeyframeValue | null;
    applyAccessoryTransformKeyframeValue?: (index: number, frame: number, value: AccessoryTransformKeyframeValue | null) => boolean;
    removeAccessoryTransformKeyframeValues?: (index: number, frames: readonly number[]) => boolean;
    moveAccessoryTransformKeyframeValue?: (index: number, fromFrame: number, toFrame: number) => boolean;
    showPhysicsBones?: boolean;
    mmdRuntime: {
        animationFrameTimeDuration: number;
        seekAnimation(frame: number, forceEvaluate: boolean): void;
    };
    audioPlayer: unknown | null;
    _totalFrames: number;
    _currentFrame: number;
    manualPlaybackWithoutAudio: boolean;
    manualPlaybackFrameCursor: number;
    timelineEditBatchDepth?: number;
    timelineEditPendingEmit?: boolean;
    onFrameUpdate?: (currentFrame: number, totalFrames: number) => void;
    onKeyframesLoaded?: (tracks: KeyframeTrack[]) => void;
    getActiveModelVisibility?: () => boolean;
    getActiveModelIkStates?: () => readonly { boneName: string; enabled: boolean }[];
    readCameraExternalParentKeyframe?: (frame: number) => CameraExternalParentKeyframePayload | null;
    upsertCameraExternalParentKeyframe?: (frame: number, payload: CameraExternalParentKeyframePayload) => boolean;
    removeCameraExternalParentKeyframes?: (frames: readonly number[]) => boolean;
    moveCameraExternalParentKeyframe?: (fromFrame: number, toFrame: number) => boolean;
    readModelExternalParentKeyframe?: (frame: number, childBoneName: string) => ModelExternalParentKeyframePayload | null;
    upsertModelExternalParentKeyframe?: (frame: number, payload: ModelExternalParentKeyframePayload) => boolean;
    removeModelExternalParentKeyframes?: (frames: readonly number[], childBoneName: string) => boolean;
    moveModelExternalParentKeyframe?: (fromFrame: number, toFrame: number, childBoneName: string) => boolean;
    getLightSceneKeyframeFrames?: () => Uint32Array;
    captureCurrentLightKeyframePayload?: () => LightKeyframePayload;
    readLightSceneKeyframePayload?: (frame: number) => LightKeyframePayload | null;
    applyLightSceneKeyframePayload?: (frame: number, payload: LightKeyframePayload | null) => boolean;
    removeLightSceneKeyframePayloads?: (frames: readonly number[]) => boolean;
    moveLightSceneKeyframe?: (fromFrame: number, toFrame: number) => boolean;
    getShadowSceneKeyframeFrames?: () => Uint32Array;
    captureCurrentShadowKeyframePayload?: () => ShadowKeyframePayload;
    readShadowSceneKeyframePayload?: (frame: number) => ShadowKeyframePayload | null;
    applyShadowSceneKeyframePayload?: (frame: number, payload: ShadowKeyframePayload | null) => boolean;
    removeShadowSceneKeyframePayloads?: (frames: readonly number[]) => boolean;
    moveShadowSceneKeyframe?: (fromFrame: number, toFrame: number) => boolean;
    getGravitySceneKeyframeFrames?: () => Uint32Array;
    captureCurrentGravityKeyframePayload?: () => GravityKeyframePayload;
    readGravitySceneKeyframePayload?: (frame: number) => GravityKeyframePayload | null;
    applyGravitySceneKeyframePayload?: (frame: number, payload: GravityKeyframePayload | null) => boolean;
    removeGravitySceneKeyframePayloads?: (frames: readonly number[]) => boolean;
    moveGravitySceneKeyframe?: (fromFrame: number, toFrame: number) => boolean;
};

export type BoneKeyframePayload = {
    kind: "bone";
    rotations: number[];
    rotationInterpolations: number[];
    physicsToggles: number[];
    externalParent?: ModelExternalParentKeyframePayload;
};

export type MovableBoneKeyframePayload = {
    kind: "movableBone";
    positions: number[];
    positionInterpolations: number[];
    rotations: number[];
    rotationInterpolations: number[];
    physicsToggles: number[];
    externalParent?: ModelExternalParentKeyframePayload;
};

export type MorphKeyframePayload = {
    kind: "morph";
    weights: number[];
};

export type PropertyKeyframePayload = {
    kind: "property";
    visible: boolean;
    ikStates: { boneName: string; enabled: boolean }[];
};

export type CameraKeyframePayload = {
    kind: "camera";
    positions: number[];
    positionInterpolations: number[];
    rotations: number[];
    rotationInterpolations: number[];
    distances: number[];
    distanceInterpolations: number[];
    fovs: number[];
    fovInterpolations: number[];
    externalParent: CameraExternalParentKeyframePayload;
};

export type CameraExternalParentKeyframePayload = {
    modelInstanceId?: string | null;
    modelPath: string | null;
    boneName: string | null;
};

export type LightKeyframePayload = {
    kind: "light";
    color: { r: number; g: number; b: number };
    direction: { x: number; y: number; z: number };
};

export type ShadowKeyframePayload = {
    kind: "shadow";
    color: { r: number; g: number; b: number };
    toonInfluence: number;
    maxZ: number;
    lightIntensity: number;
};

export type GravityKeyframePayload = {
    kind: "gravity";
    acceleration: number;
    direction: { x: number; y: number; z: number };
};

export type AccessoryKeyframePayload = AccessoryTransformKeyframeValue & {
    kind: "accessory";
};

export type TimelineKeyframePayload =
    | BoneKeyframePayload
    | MovableBoneKeyframePayload
    | MorphKeyframePayload
    | PropertyKeyframePayload
    | CameraKeyframePayload
    | AccessoryKeyframePayload
    | LightKeyframePayload
    | ShadowKeyframePayload
    | GravityKeyframePayload;

export function getOrCreateModelTrackFrameMap(host: TimelineEditHost, model: TimelineEditRuntimeModel): Map<string, Uint32Array> {
    let frameMap = host.modelKeyframeTracksByModel.get(model);
    if (!frameMap) {
        frameMap = new Map<string, Uint32Array>();
        host.modelKeyframeTracksByModel.set(model, frameMap);
    }
    return frameMap;
}

function getCurrentModelAnimation(host: TimelineEditHost): MmdAnimation | null {
    if (!host.currentModel) return null;
    return host.modelSourceAnimationsByModel.get(host.currentModel) ?? null;
}

function createCameraAnimationFromTrack(cameraTrack: MmdCameraAnimationTrack, name: string): MmdAnimation {
    const propertyTrack = new MmdPropertyAnimationTrack(0, []);
    return new MmdAnimation(name, [], [], [], propertyTrack, cameraTrack);
}

function createModelAnimationForEditing(name: string): MmdAnimation {
    const propertyTrack = new MmdPropertyAnimationTrack(0, []);
    const cameraTrack = new MmdCameraAnimationTrack(0);
    return new MmdAnimation(name, [], [], [], propertyTrack, cameraTrack);
}

function refreshAnimationFrameRange(animation: MmdAnimation): void {
    let minStartFrame = Number.MAX_SAFE_INTEGER;
    let maxEndFrame = Number.MIN_SAFE_INTEGER;

    const visitTrack = (track: { startFrame: number; endFrame: number }): void => {
        minStartFrame = Math.min(minStartFrame, track.startFrame);
        maxEndFrame = Math.max(maxEndFrame, track.endFrame);
    };

    for (const track of animation.boneTracks) visitTrack(track);
    for (const track of animation.movableBoneTracks) visitTrack(track);
    for (const track of animation.morphTracks) visitTrack(track);
    visitTrack(animation.propertyTrack);
    visitTrack(animation.cameraTrack);

    const mutableAnimation = animation as unknown as { startFrame: number; endFrame: number };
    mutableAnimation.startFrame = minStartFrame === Number.MAX_SAFE_INTEGER ? 0 : minStartFrame;
    mutableAnimation.endFrame = maxEndFrame === Number.MIN_SAFE_INTEGER ? 0 : maxEndFrame;
}

function createFrameIndexMap(frames: Uint32Array): Map<number, number> {
    const indexMap = new Map<number, number>();
    for (let i = 0; i < frames.length; i += 1) {
        indexMap.set(frames[i], i);
    }
    return indexMap;
}

function copyFloatFrameBlock(
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

function copyUint8FrameBlock(
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

function readFloatFrameBlock(
    source: ArrayLike<number>,
    sourceFrameIndex: number,
    stride: number,
): number[] {
    const result = new Array<number>(stride);
    const sourceOffset = sourceFrameIndex * stride;
    for (let i = 0; i < stride; i += 1) {
        const value = source[sourceOffset + i];
        result[i] = Number.isFinite(value) ? value : 0;
    }
    return result;
}

function readUint8FrameBlock(
    source: ArrayLike<number>,
    sourceFrameIndex: number,
    stride: number,
): number[] {
    const result = new Array<number>(stride);
    const sourceOffset = sourceFrameIndex * stride;
    for (let i = 0; i < stride; i += 1) {
        const value = source[sourceOffset + i];
        const normalized = Number.isFinite(value) ? Math.round(value) : 0;
        result[i] = Math.max(0, Math.min(255, normalized));
    }
    return result;
}

function findFrameIndex(frames: ArrayLike<number>, frame: number): number {
    const normalized = Math.max(0, Math.floor(frame));
    for (let i = 0; i < (frames?.length ?? 0); i += 1) {
        if (Math.max(0, Math.floor(frames[i] ?? 0)) === normalized) return i;
    }
    return -1;
}

function removeFloatValues(
    values: ArrayLike<number>,
    stride: number,
    frameIndex: number,
): Float32Array {
    const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
    const target = new Float32Array(Math.max(0, sourceFrameCount - 1) * stride);
    for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
        if (sourceFrameIndex === frameIndex) continue;
        const targetFrameIndex = sourceFrameIndex > frameIndex ? sourceFrameIndex - 1 : sourceFrameIndex;
        const sourceOffset = sourceFrameIndex * stride;
        const targetOffset = targetFrameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = values[sourceOffset + i];
            target[targetOffset + i] = Number.isFinite(value) ? value : 0;
        }
    }
    return target;
}

function removeUint8Values(
    values: ArrayLike<number>,
    stride: number,
    frameIndex: number,
): Uint8Array {
    const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
    const target = new Uint8Array(Math.max(0, sourceFrameCount - 1) * stride);
    for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
        if (sourceFrameIndex === frameIndex) continue;
        const targetFrameIndex = sourceFrameIndex > frameIndex ? sourceFrameIndex - 1 : sourceFrameIndex;
        const sourceOffset = sourceFrameIndex * stride;
        const targetOffset = targetFrameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = values[sourceOffset + i];
            const normalized = Number.isFinite(value) ? Math.round(value) : 0;
            target[targetOffset + i] = Math.max(0, Math.min(255, normalized));
        }
    }
    return target;
}

function createNormalizedFrameSet(frames: readonly number[]): Set<number> {
    const normalizedFrames = new Set<number>();
    for (const frame of frames) {
        if (!Number.isFinite(frame)) continue;
        normalizedFrames.add(Math.max(0, Math.floor(frame)));
    }
    return normalizedFrames;
}

function mergeFrameArrays(...sources: Array<ArrayLike<number> | null | undefined>): Uint32Array {
    const frames = new Set<number>();
    for (const source of sources) {
        if (!source) continue;
        for (let i = 0; i < source.length; i += 1) {
            const value = source[i];
            if (!Number.isFinite(value)) continue;
            frames.add(Math.max(0, Math.floor(value)));
        }
    }
    return new Uint32Array([...frames].sort((a, b) => a - b));
}

function getBoneKeyframeFrames(animation: MmdAnimation | null, boneName: string): Uint32Array {
    if (!animation) return EMPTY_KEYFRAME_FRAMES;

    const boneTrack = animation.boneTracks.find((candidate) => candidate.name === boneName);
    const movableTrack = animation.movableBoneTracks.find((candidate) => candidate.name === boneName);
    return mergeFrameArrays(boneTrack?.frameNumbers, movableTrack?.frameNumbers);
}

function hasExplicitBoneKeyframe(animation: MmdAnimation | null, boneName: string, frame: number): boolean {
    const normalizedFrame = Math.max(0, Math.floor(frame));
    const frames = getBoneKeyframeFrames(animation, boneName);
    for (let i = 0; i < frames.length; i += 1) {
        if (frames[i] === normalizedFrame) return true;
    }
    return false;
}

function getDefaultPhysicsOnFrames(animation: MmdAnimation | null, boneName: string, showPhysicsBones: boolean): number[] | null {
    if (!showPhysicsBones) return null;
    return hasExplicitBoneKeyframe(animation, boneName, 0) ? null : [0];
}

function getBonePhysicsOnFrames(animation: MmdAnimation | null, boneName: string): Uint32Array {
    if (!animation) return EMPTY_KEYFRAME_FRAMES;

    const collect = (
        frameNumbers: ArrayLike<number> | undefined,
        physicsToggles: ArrayLike<number> | undefined,
    ): number[] => {
        if (!frameNumbers || !physicsToggles) return [];
        const result: number[] = [];
        const length = Math.min(frameNumbers.length, physicsToggles.length);
        for (let i = 0; i < length; i += 1) {
            if (Math.round(physicsToggles[i] ?? 0) !== 1) continue;
            result.push(Math.max(0, Math.floor(frameNumbers[i] ?? 0)));
        }
        return result;
    };

    const boneTrack = animation.boneTracks.find((candidate) => candidate.name === boneName);
    const movableTrack = animation.movableBoneTracks.find((candidate) => candidate.name === boneName);
    return mergeFrameArrays(
        boneTrack ? collect(boneTrack.frameNumbers, boneTrack.physicsToggles) : null,
        movableTrack ? collect(movableTrack.frameNumbers, movableTrack.physicsToggles) : null,
    );
}

function removeFrameNumbersForPayloads(
    frames: ArrayLike<number>,
    framesToRemove: ReadonlySet<number>,
): { frames: Uint32Array; removedIndexes: number[] } | null {
    const sourceLength = frames?.length ?? 0;
    const keptFrames: number[] = [];
    const removedIndexes: number[] = [];
    for (let i = 0; i < sourceLength; i += 1) {
        const frame = Math.max(0, Math.floor(frames[i] ?? 0));
        if (framesToRemove.has(frame)) {
            removedIndexes.push(i);
        } else {
            keptFrames.push(frame);
        }
    }
    if (removedIndexes.length !== framesToRemove.size) return null;
    return {
        frames: new Uint32Array(keptFrames),
        removedIndexes,
    };
}

function removeFloatValuesByIndexes(
    values: ArrayLike<number>,
    stride: number,
    removedIndexes: readonly number[],
): Float32Array {
    const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
    const removedSet = new Set(removedIndexes);
    const target = new Float32Array(Math.max(0, sourceFrameCount - removedSet.size) * stride);
    let targetFrameIndex = 0;
    for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
        if (removedSet.has(sourceFrameIndex)) continue;
        const sourceOffset = sourceFrameIndex * stride;
        const targetOffset = targetFrameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = values[sourceOffset + i];
            target[targetOffset + i] = Number.isFinite(value) ? value : 0;
        }
        targetFrameIndex += 1;
    }
    return target;
}

function removeUint8ValuesByIndexes(
    values: ArrayLike<number>,
    stride: number,
    removedIndexes: readonly number[],
): Uint8Array {
    const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
    const removedSet = new Set(removedIndexes);
    const target = new Uint8Array(Math.max(0, sourceFrameCount - removedSet.size) * stride);
    let targetFrameIndex = 0;
    for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
        if (removedSet.has(sourceFrameIndex)) continue;
        const sourceOffset = sourceFrameIndex * stride;
        const targetOffset = targetFrameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = values[sourceOffset + i];
            const normalized = Number.isFinite(value) ? Math.round(value) : 0;
            target[targetOffset + i] = Math.max(0, Math.min(255, normalized));
        }
        targetFrameIndex += 1;
    }
    return target;
}

export function getRegisteredKeyframeStats(host: TimelineEditHost): { hasAnyKeyframe: boolean; maxFrame: number } {
    let hasAnyKeyframe = false;
    let maxFrame = 0;

    if (host.cameraKeyframeFrames.length > 0) {
        hasAnyKeyframe = true;
        maxFrame = host.cameraKeyframeFrames[host.cameraKeyframeFrames.length - 1];
    }

    const lightFrames = host.getLightSceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES;
    if (lightFrames.length > 0) {
        hasAnyKeyframe = true;
        maxFrame = Math.max(maxFrame, lightFrames[lightFrames.length - 1]);
    }

    const shadowFrames = host.getShadowSceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES;
    if (shadowFrames.length > 0) {
        hasAnyKeyframe = true;
        maxFrame = Math.max(maxFrame, shadowFrames[shadowFrames.length - 1]);
    }

    const gravityFrames = host.getGravitySceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES;
    if (gravityFrames.length > 0) {
        hasAnyKeyframe = true;
        maxFrame = Math.max(maxFrame, gravityFrames[gravityFrames.length - 1]);
    }

    for (const accessoryFrames of host.getAllAccessoryTransformKeyframeFrames?.() ?? []) {
        if (accessoryFrames.length === 0) continue;
        hasAnyKeyframe = true;
        maxFrame = Math.max(maxFrame, accessoryFrames[accessoryFrames.length - 1]);
    }

    for (const sceneModel of host.sceneModels) {
        const frameMap = host.modelKeyframeTracksByModel.get(sceneModel.model);
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

    for (const sceneModel of host.sceneModels) {
        const animation = host.modelSourceAnimationsByModel.get(sceneModel.model);
        const propertyFrames = animation?.propertyTrack?.frameNumbers;
        if (!propertyFrames || propertyFrames.length === 0) continue;
        hasAnyKeyframe = true;
        const trackMaxFrame = propertyFrames[propertyFrames.length - 1];
        if (trackMaxFrame > maxFrame) {
            maxFrame = trackMaxFrame;
        }
    }

    return { hasAnyKeyframe, maxFrame };
}

export function getActiveModelTimelineTracks(host: TimelineEditHost): KeyframeTrack[] {
    if (!host.currentModel || !host.activeModelInfo) return [];

    const visibleBoneNameSet = new Set(host.activeModelInfo.boneNames);
    const physicsBoneNameSet = new Set(host.activeModelInfo.physicsBoneNames ?? []);
    const showPhysicsBones = host.showPhysicsBones === true;
    const animation = getCurrentModelAnimation(host);
    const isVisibleBoneCategory = (category: TrackCategory): boolean => {
        return category === "root" || category === "semi-standard" || category === "bone";
    };

    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const trackMap = new Map<string, KeyframeTrack>();
    trackMap.set(createTrackKey("property", "Property"), {
        name: "Property",
        category: "property",
        frames: animation?.propertyTrack.frameNumbers ?? EMPTY_KEYFRAME_FRAMES,
    });

    for (const [key, frames] of frameMap.entries()) {
        const parsed = parseTrackKey(key);
        if (!parsed) continue;
        if (isVisibleBoneCategory(parsed.category) && !visibleBoneNameSet.has(parsed.name)) {
            if (!showPhysicsBones || !physicsBoneNameSet.has(parsed.name)) continue;
        }
        const isPhysicsBone = physicsBoneNameSet.has(parsed.name);
        const defaultPhysicsOnFrames = getDefaultPhysicsOnFrames(animation, parsed.name, showPhysicsBones);
        trackMap.set(key, {
            name: parsed.name,
            category: parsed.category,
            frames: isPhysicsBone && showPhysicsBones
                ? mergeFrameArrays(frames, getBoneKeyframeFrames(animation, parsed.name))
                : frames,
            physicsOnFrames: isPhysicsBone
                ? getBonePhysicsOnFrames(animation, parsed.name)
                : undefined,
            virtualPhysicsOnFrames: isPhysicsBone && defaultPhysicsOnFrames
                ? mergeFrameArrays(defaultPhysicsOnFrames)
                : undefined,
            physicsBone: isPhysicsBone,
        });
    }

    for (const boneName of host.activeModelInfo.boneNames) {
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

    if (showPhysicsBones) {
        for (const boneName of physicsBoneNameSet) {
            const category = classifyBone(boneName);
            const key = createTrackKey(category, boneName);
            const existing = trackMap.get(key);
            const defaultPhysicsOnFrames = getDefaultPhysicsOnFrames(animation, boneName, true);
            const physicsOnFrames = getBonePhysicsOnFrames(animation, boneName);
            const displayFrames = mergeFrameArrays(existing?.frames, getBoneKeyframeFrames(animation, boneName));
            const virtualPhysicsOnFrames = defaultPhysicsOnFrames
                ? mergeFrameArrays(defaultPhysicsOnFrames)
                : undefined;
            if (existing) {
                trackMap.set(key, {
                    ...existing,
                    frames: displayFrames,
                    physicsOnFrames,
                    virtualPhysicsOnFrames,
                    physicsBone: true,
                });
                continue;
            }
            trackMap.set(key, {
                name: boneName,
                category,
                frames: displayFrames,
                physicsOnFrames,
                virtualPhysicsOnFrames,
                physicsBone: true,
            });
        }
    }

    for (const morphName of host.activeModelInfo.morphNames) {
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

    appendByKey(createTrackKey("property", "Property"));

    // Keep the timeline row order aligned with the bone selection list.
    // Category is still preserved in the track key, but row ordering follows
    // the model's bone order instead of grouping roots/bones separately.
    for (const boneName of host.activeModelInfo.boneNames) {
        appendByKey(createTrackKey(classifyBone(boneName), boneName));
    }

    if (showPhysicsBones) {
        for (const boneName of physicsBoneNameSet) {
            appendByKey(createTrackKey(classifyBone(boneName), boneName));
        }
    }

    for (const morphName of host.activeModelInfo.morphNames) {
        appendByKey(createTrackKey("morph", morphName));
    }

    for (const [key, track] of trackMap) {
        if (consumed.has(key)) continue;
        ordered.push(track);
    }

    return ordered;
}

export function getCameraTimelineTracks(host: TimelineEditHost): KeyframeTrack[] {
    const lightFrames = host.getLightSceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES;
    const shadowFrames = host.getShadowSceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES;
    const gravityFrames = host.getGravitySceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES;
    return [
        {
            name: "Camera",
            category: "camera",
            frames: host.cameraKeyframeFrames.length > 0 ? host.cameraKeyframeFrames : EMPTY_KEYFRAME_FRAMES,
        },
        {
            name: "Light",
            category: "light",
            frames: lightFrames,
        },
        {
            name: "Shadow",
            category: "shadow",
            frames: shadowFrames,
        },
        {
            name: "Gravity",
            category: "gravity",
            frames: gravityFrames,
        },
    ];
}

export function getAccessoryTimelineTracks(host: TimelineEditHost): KeyframeTrack[] {
    const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
    if (accessoryIndex === null) return [];
    const accessory = host.getLoadedAccessories?.().find((candidate) => candidate.index === accessoryIndex);
    if (!accessory) return [];
    return [{
        name: `${accessory.name}${accessory.kind ? ` [${accessory.kind.toUpperCase()}]` : ""}`,
        category: "accessory",
        frames: host.getAccessoryTransformKeyframeFrames?.(accessoryIndex) ?? EMPTY_KEYFRAME_FRAMES,
    }];
}

export function refreshTotalFramesFromContent(host: TimelineEditHost): void {
    const runtimeDurationFrame = Math.max(0, Math.floor(host.mmdRuntime.animationFrameTimeDuration));
    const { hasAnyKeyframe, maxFrame } = getRegisteredKeyframeStats(host);
    const hasAudio = host.audioPlayer !== null;
    const nextTotalFrames = hasAudio
        ? Math.max(runtimeDurationFrame, maxFrame, host._totalFrames, hasAnyKeyframe ? 0 : DEFAULT_EDIT_TIMELINE_FRAMES)
        : Math.max(runtimeDurationFrame, maxFrame, host._totalFrames, DEFAULT_EDIT_TIMELINE_FRAMES, hasAnyKeyframe ? 1 : 0);
    if (nextTotalFrames === host._totalFrames) return;

    host._totalFrames = nextTotalFrames;
    if (host._currentFrame > host._totalFrames) {
        host._currentFrame = host._totalFrames;
        host.mmdRuntime.seekAnimation(host._currentFrame, true);
        if (host.manualPlaybackWithoutAudio) {
            host.manualPlaybackFrameCursor = host._currentFrame;
        }
    }
    host.onFrameUpdate?.(host._currentFrame, host._totalFrames);
}

export function emitMergedKeyframeTracks(host: TimelineEditHost): void {
    if ((host.timelineEditBatchDepth ?? 0) > 0) {
        host.timelineEditPendingEmit = true;
        return;
    }

    refreshTotalFramesFromContent(host);
    if (!host.onKeyframesLoaded) return;

    if (host.timelineTarget === "camera") {
        host.onKeyframesLoaded(getCameraTimelineTracks(host));
        return;
    }

    if (host.timelineTarget === "accessory") {
        host.onKeyframesLoaded(getAccessoryTimelineTracks(host));
        return;
    }

    host.onKeyframesLoaded(getActiveModelTimelineTracks(host));
}

export function beginTimelineEditBatch(host: TimelineEditHost): void {
    host.timelineEditBatchDepth = (host.timelineEditBatchDepth ?? 0) + 1;
}

export function endTimelineEditBatch(host: TimelineEditHost): void {
    const nextDepth = Math.max(0, (host.timelineEditBatchDepth ?? 0) - 1);
    host.timelineEditBatchDepth = nextDepth;
    if (nextDepth > 0 || !host.timelineEditPendingEmit) return;

    host.timelineEditPendingEmit = false;
    emitMergedKeyframeTracks(host);
}

export function hasTimelineKeyframe(host: TimelineEditHost, track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
    const normalized = Math.max(0, Math.floor(frame));

    if (track.category === "accessory") {
        const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
        return accessoryIndex !== null
            && hasFrameNumber(host.getAccessoryTransformKeyframeFrames?.(accessoryIndex) ?? EMPTY_KEYFRAME_FRAMES, normalized);
    }

    if (track.category === "camera") {
        return hasFrameNumber(host.cameraKeyframeFrames, normalized);
    }

    if (track.category === "light") {
        return hasFrameNumber(host.getLightSceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES, normalized);
    }

    if (track.category === "shadow") {
        return hasFrameNumber(host.getShadowSceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES, normalized);
    }

    if (track.category === "gravity") {
        return hasFrameNumber(host.getGravitySceneKeyframeFrames?.() ?? EMPTY_KEYFRAME_FRAMES, normalized);
    }

    if (track.category === "property") {
        return hasInfoKeyframe(host, normalized);
    }

    if (!host.currentModel) return false;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const key = createTrackKey(track.category, track.name);
    const frames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
    return hasFrameNumber(frames, normalized);
}

export function hasInfoKeyframe(host: TimelineEditHost, frame: number): boolean {
    const animation = getCurrentModelAnimation(host);
    if (!animation) return false;
    const normalized = Math.max(0, Math.floor(frame));
    return hasFrameNumber(animation.propertyTrack.frameNumbers, normalized);
}

export function addTimelineKeyframe(host: TimelineEditHost, track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
    const normalized = Math.max(0, Math.floor(frame));

    if (track.category === "accessory") {
        const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
        if (accessoryIndex === null) return false;
        const value = host.captureAccessoryTransformKeyframeValue?.(accessoryIndex) ?? null;
        const applied = value
            ? (host.applyAccessoryTransformKeyframeValue?.(accessoryIndex, normalized, value) ?? false)
            : false;
        if (applied) emitMergedKeyframeTracks(host);
        return applied;
    }

    if (track.category === "camera") {
        if (!ensureCameraAnimationForEditing(host)) return false;
        const nextFrames = addFrameNumber(host.cameraKeyframeFrames, normalized);
        if (nextFrames === host.cameraKeyframeFrames) return false;
        host.cameraKeyframeFrames = nextFrames;
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (track.category === "light") {
        const payload = host.captureCurrentLightKeyframePayload?.();
        return payload ? (host.applyLightSceneKeyframePayload?.(normalized, payload) ?? false) : false;
    }

    if (track.category === "shadow") {
        const payload = host.captureCurrentShadowKeyframePayload?.();
        return payload ? (host.applyShadowSceneKeyframePayload?.(normalized, payload) ?? false) : false;
    }

    if (track.category === "gravity") {
        const payload = host.captureCurrentGravityKeyframePayload?.();
        return payload ? (host.applyGravitySceneKeyframePayload?.(normalized, payload) ?? false) : false;
    }

    if (track.category === "property") {
        return addInfoKeyframe(host, normalized);
    }

    if (!host.currentModel) return false;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const key = createTrackKey(track.category, track.name);
    const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
    const nextFrames = addFrameNumber(currentFrames, normalized);
    if (nextFrames === currentFrames) return false;
    frameMap.set(key, nextFrames);
    emitMergedKeyframeTracks(host);
    return true;
}

function findInsertIndex(frames: ArrayLike<number>, frame: number): number {
    let lo = 0;
    let hi = frames?.length ?? 0;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if ((frames[mid] ?? 0) < frame) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function resolveInsertReferenceIndex(frames: ArrayLike<number>, frame: number): number {
    const normalized = Math.max(0, Math.floor(frame));
    const insertIndex = findInsertIndex(frames, normalized);
    if (insertIndex < (frames?.length ?? 0) && (frames[insertIndex] ?? 0) === normalized) {
        return insertIndex;
    }
    return insertIndex > 0 ? insertIndex - 1 : -1;
}

function upsertUint8Values(
    values: ArrayLike<number>,
    stride: number,
    frameIndex: number,
    exists: boolean,
    block: readonly number[],
): Uint8Array {
    const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
    const targetFrameCount = sourceFrameCount + (exists ? 0 : 1);
    const target = new Uint8Array(targetFrameCount * stride);

    for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
        const targetFrameIndex = !exists && sourceFrameIndex >= frameIndex
            ? sourceFrameIndex + 1
            : sourceFrameIndex;
        const sourceOffset = sourceFrameIndex * stride;
        const targetOffset = targetFrameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = values[sourceOffset + i];
            const normalized = Number.isFinite(value) ? Math.round(value) : 0;
            target[targetOffset + i] = Math.max(0, Math.min(255, normalized));
        }
    }

    const writeOffset = frameIndex * stride;
    for (let i = 0; i < stride; i += 1) {
        const value = block[i] ?? 0;
        const normalized = Number.isFinite(value) ? Math.round(value) : 0;
        target[writeOffset + i] = Math.max(0, Math.min(255, normalized));
    }

    return target;
}

function readUint8Block(
    values: ArrayLike<number>,
    frameIndex: number,
    stride: number,
    fallback: readonly number[],
): number[] {
    const block = new Array<number>(stride);
    for (let i = 0; i < stride; i += 1) {
        block[i] = Number.isFinite(fallback[i]) ? Math.round(fallback[i]) : 0;
    }
    if (frameIndex < 0) return block;

    const offset = frameIndex * stride;
    for (let i = 0; i < stride; i += 1) {
        const value = values[offset + i];
        if (!Number.isFinite(value)) continue;
        block[i] = Math.max(0, Math.min(255, Math.round(value)));
    }
    return block;
}

export function captureCurrentPropertyKeyframePayload(
    host: TimelineEditHost,
    frame: number,
): PropertyKeyframePayload | null {
    const animation = getCurrentModelAnimation(host);
    if (!animation) return null;

    const normalizedFrame = Math.max(0, Math.floor(frame));
    const propertyTrack = animation.propertyTrack as RuntimePropertyTrackLike;
    const referenceIndex = resolveInsertReferenceIndex(propertyTrack.frameNumbers, normalizedFrame);
    const runtimeStates = new Map(
        (host.getActiveModelIkStates?.() ?? []).map((state) => [state.boneName, state.enabled] as const),
    );
    const ikBoneNames = [...propertyTrack.ikBoneNames];
    for (const boneName of runtimeStates.keys()) {
        if (!ikBoneNames.includes(boneName)) ikBoneNames.push(boneName);
    }

    return {
        kind: "property",
        visible: host.getActiveModelVisibility?.() ?? true,
        ikStates: ikBoneNames.map((boneName) => {
            const runtimeValue = runtimeStates.get(boneName);
            if (runtimeValue !== undefined) return { boneName, enabled: runtimeValue };
            const ikIndex = propertyTrack.ikBoneNames.indexOf(boneName);
            const heldValue = ikIndex >= 0
                ? readUint8Block(propertyTrack.getIkState(ikIndex), referenceIndex, 1, [1])[0]
                : 1;
            return { boneName, enabled: heldValue !== 0 };
        }),
    };
}

function applyPropertyKeyframePayload(
    host: TimelineEditHost,
    frame: number,
    payload: PropertyKeyframePayload,
): boolean {
    const animation = getCurrentModelAnimation(host);
    if (!animation) return false;

    const normalizedFrame = Math.max(0, Math.floor(frame));
    const propertyTrack = animation.propertyTrack as RuntimePropertyTrackMutable & RuntimePropertyTrackLike;
    const insertIndex = findInsertIndex(propertyTrack.frameNumbers, normalizedFrame);
    const exists = insertIndex < propertyTrack.frameNumbers.length && (propertyTrack.frameNumbers[insertIndex] ?? 0) === normalizedFrame;
    const referenceIndex = resolveInsertReferenceIndex(propertyTrack.frameNumbers, normalizedFrame);
    const ikStateByName = new Map(payload.ikStates.map((state) => [state.boneName, state.enabled] as const));
    const ikBoneNames = [...propertyTrack.ikBoneNames];
    for (const boneName of ikStateByName.keys()) {
        if (!ikBoneNames.includes(boneName)) ikBoneNames.push(boneName);
    }

    const nextTrack = new MmdPropertyAnimationTrack(
        propertyTrack.frameNumbers.length + (exists ? 0 : 1),
        ikBoneNames,
    );
    const nextFrameNumbers = exists
        ? new Uint32Array(propertyTrack.frameNumbers)
        : (() => {
            const next = new Uint32Array(propertyTrack.frameNumbers.length + 1);
            for (let i = 0; i < insertIndex; i += 1) next[i] = Math.max(0, Math.floor(propertyTrack.frameNumbers[i] ?? 0));
            next[insertIndex] = normalizedFrame;
            for (let i = insertIndex; i < propertyTrack.frameNumbers.length; i += 1) {
                next[i + 1] = Math.max(0, Math.floor(propertyTrack.frameNumbers[i] ?? 0));
            }
            return next;
        })();

    nextTrack.frameNumbers.set(nextFrameNumbers);
    nextTrack.visibles.set(upsertUint8Values(propertyTrack.visibles, 1, insertIndex, exists, [payload.visible ? 1 : 0]));

    for (let i = 0; i < ikBoneNames.length; i += 1) {
        const boneName = ikBoneNames[i];
        const currentIndex = propertyTrack.ikBoneNames.indexOf(boneName);
        const currentIkState = currentIndex >= 0
            ? propertyTrack.getIkState(currentIndex)
            : new Uint8Array(propertyTrack.frameNumbers.length).fill(1);
        const heldValue = readUint8Block(currentIkState, referenceIndex, 1, [1])[0] !== 0;
        const nextValue = ikStateByName.get(boneName) ?? heldValue;
        nextTrack.getIkState(i).set(upsertUint8Values(
            currentIkState,
            1,
            insertIndex,
            exists,
            [nextValue ? 1 : 0],
        ));
    }

    (animation as unknown as { propertyTrack: MmdPropertyAnimationTrack }).propertyTrack = nextTrack;
    refreshAnimationFrameRange(animation);
    emitMergedKeyframeTracks(host);
    return true;
}

export function addInfoKeyframe(host: TimelineEditHost, frame: number): boolean {
    const payload = captureCurrentPropertyKeyframePayload(host, frame);
    return payload ? applyPropertyKeyframePayload(host, frame, payload) : false;
}

export function evaluatePropertyTrackAtFrame(
    track: RuntimePropertyTrackLike,
    frame: number,
): PropertyKeyframePayload | null {
    if (track.frameNumbers.length === 0) return null;
    const normalizedFrame = Math.max(0, Math.floor(frame));
    const clampedFrame = Math.max(
        track.frameNumbers[0] ?? normalizedFrame,
        Math.min(track.frameNumbers[track.frameNumbers.length - 1] ?? normalizedFrame, normalizedFrame),
    );
    const frameIndex = Math.max(0, resolveInsertReferenceIndex(track.frameNumbers, clampedFrame));
    return {
        kind: "property",
        visible: (track.visibles[frameIndex] ?? 0) !== 0,
        ikStates: track.ikBoneNames.map((boneName, ikIndex) => ({
            boneName,
            enabled: (track.getIkState(ikIndex)[frameIndex] ?? 0) !== 0,
        })),
    };
}

export function ensureCameraAnimationForEditing(host: TimelineEditHost): boolean {
    if (host.cameraSourceAnimation) return true;

    const cameraTrack = new MmdCameraAnimationTrack(0);
    host.cameraSourceAnimation = createCameraAnimationFromTrack(cameraTrack, "editorCamera");
    host.cameraMotionPath = null;
    host.cameraKeyframeFrames = new Uint32Array(cameraTrack.frameNumbers);
    return true;
}

export function ensureModelAnimationForEditing(host: TimelineEditHost, track: Pick<KeyframeTrack, "name" | "category">): boolean {
    if (!host.currentModel) return false;

    let animation = getCurrentModelAnimation(host);
    if (!animation) {
        const modelName = typeof host.currentModel?.name === "string" && host.currentModel.name.length > 0
            ? `${host.currentModel.name}@editor`
            : "editorModel";
        animation = createModelAnimationForEditing(modelName);
        host.modelSourceAnimationsByModel.set(host.currentModel, animation);
    }

    const animationMutable = animation as unknown as {
        boneTracks: MmdBoneAnimationTrack[];
        movableBoneTracks: MmdMovableBoneAnimationTrack[];
        morphTracks: MmdMorphAnimationTrack[];
    };

    if (track.category === "property") return true;

    if (track.category === "morph") {
        if (!animationMutable.morphTracks.some((candidate) => candidate.name === track.name)) {
            animationMutable.morphTracks.push(new MmdMorphAnimationTrack(track.name, 0));
        }
        return true;
    }

    const hasExistingBoneTrack = animationMutable.boneTracks.some((candidate) => candidate.name === track.name);
    const hasExistingMovableTrack = animationMutable.movableBoneTracks.some((candidate) => candidate.name === track.name);
    const preferMovableTrack = shouldUseMovableBoneTrack(host, track);
    if (preferMovableTrack) {
        if (!hasExistingMovableTrack) {
            animationMutable.movableBoneTracks.push(new MmdMovableBoneAnimationTrack(track.name, 0));
        }
    } else if (!hasExistingBoneTrack) {
        const existingMovableTrack = animationMutable.movableBoneTracks.find((candidate) => candidate.name === track.name);
        animationMutable.boneTracks.push(existingMovableTrack
            ? createBoneTrackFromMovableTrack(existingMovableTrack)
            : new MmdBoneAnimationTrack(track.name, 0));
    }
    if (!preferMovableTrack) {
        const wrongMovableIndex = animationMutable.movableBoneTracks.findIndex((candidate) => candidate.name === track.name);
        if (wrongMovableIndex >= 0) {
            animationMutable.movableBoneTracks.splice(wrongMovableIndex, 1);
        }
    }

    return true;
}

function createBoneTrackFromMovableTrack(track: MmdMovableBoneAnimationTrack): MmdBoneAnimationTrack {
    const boneTrack = new MmdBoneAnimationTrack(track.name, track.frameNumbers.length);
    boneTrack.frameNumbers.set(track.frameNumbers);
    boneTrack.rotations.set(track.rotations);
    boneTrack.rotationInterpolations.set(track.rotationInterpolations);
    boneTrack.physicsToggles.set(track.physicsToggles);
    return boneTrack;
}

function shouldUseMovableBoneTrack(host: TimelineEditHost, track: Pick<KeyframeTrack, "name" | "category">): boolean {
    if (track.category === "camera" || track.category === "accessory" || track.category === "light" || track.category === "shadow" || track.category === "gravity" || track.category === "property" || track.category === "morph") return false;
    const boneControl = host.activeModelInfo?.boneControlInfos?.find((candidate) => candidate.name === track.name);
    if (boneControl) return boneControl.movable;
    return track.category === "root";
}

export function removeTimelineKeyframe(host: TimelineEditHost, track: Pick<KeyframeTrack, "name" | "category">, frame: number): boolean {
    const normalized = Math.max(0, Math.floor(frame));

    if (track.category === "accessory") {
        const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
        if (accessoryIndex === null) return false;
        const removed = host.applyAccessoryTransformKeyframeValue?.(accessoryIndex, normalized, null) ?? false;
        if (removed) emitMergedKeyframeTracks(host);
        return removed;
    }

    if (track.category === "camera") {
        const nextFrames = removeFrameNumber(host.cameraKeyframeFrames, normalized);
        if (nextFrames === host.cameraKeyframeFrames) return false;
        host.cameraKeyframeFrames = nextFrames;
        host.removeCameraExternalParentKeyframes?.([normalized]);
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (track.category === "light") {
        return host.applyLightSceneKeyframePayload?.(normalized, null) ?? false;
    }

    if (track.category === "shadow") {
        return host.applyShadowSceneKeyframePayload?.(normalized, null) ?? false;
    }

    if (track.category === "gravity") {
        return host.applyGravitySceneKeyframePayload?.(normalized, null) ?? false;
    }

    if (track.category === "property") {
        return removeTimelineKeyframePayloads(host, track, [normalized]);
    }

    if (!host.currentModel) return false;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const key = createTrackKey(track.category, track.name);
    const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
    const nextFrames = removeFrameNumber(currentFrames, normalized);
    if (nextFrames === currentFrames) return false;
    frameMap.set(key, nextFrames);
    host.removeModelExternalParentKeyframes?.([normalized], track.name);
    emitMergedKeyframeTracks(host);
    return true;
}

export function moveTimelineKeyframe(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    fromFrame: number,
    toFrame: number,
): boolean {
    const normalizedFrom = Math.max(0, Math.floor(fromFrame));
    const normalizedTo = Math.max(0, Math.floor(toFrame));

    if (track.category === "accessory") {
        const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
        if (accessoryIndex === null) return false;
        const moved = host.moveAccessoryTransformKeyframeValue?.(accessoryIndex, normalizedFrom, normalizedTo) ?? false;
        if (moved) emitMergedKeyframeTracks(host);
        return moved;
    }

    if (track.category === "camera") {
        const nextFrames = moveFrameNumber(host.cameraKeyframeFrames, normalizedFrom, normalizedTo);
        if (nextFrames === host.cameraKeyframeFrames) return false;
        host.cameraKeyframeFrames = nextFrames;
        host.moveCameraExternalParentKeyframe?.(normalizedFrom, normalizedTo);
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (track.category === "light") {
        return host.moveLightSceneKeyframe?.(normalizedFrom, normalizedTo) ?? false;
    }

    if (track.category === "shadow") {
        return host.moveShadowSceneKeyframe?.(normalizedFrom, normalizedTo) ?? false;
    }

    if (track.category === "gravity") {
        return host.moveGravitySceneKeyframe?.(normalizedFrom, normalizedTo) ?? false;
    }

    if (!host.currentModel) return false;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    const key = createTrackKey(track.category, track.name);
    const currentFrames = frameMap.get(key) ?? EMPTY_KEYFRAME_FRAMES;
    const nextFrames = moveFrameNumber(currentFrames, normalizedFrom, normalizedTo);
    if (nextFrames === currentFrames) return false;
    frameMap.set(key, nextFrames);
    host.moveModelExternalParentKeyframe?.(normalizedFrom, normalizedTo, track.name);
    emitMergedKeyframeTracks(host);
    return true;
}

export function readTimelineKeyframePayload(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frame: number,
): TimelineKeyframePayload | null {
    const normalized = Math.max(0, Math.floor(frame));

    if (track.category === "accessory") {
        const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
        if (accessoryIndex === null) return null;
        const value = host.readAccessoryTransformKeyframeValue?.(accessoryIndex, normalized) ?? null;
        return value ? { kind: "accessory", ...value } : null;
    }

    if (track.category === "camera") {
        const cameraTrack = host.cameraSourceAnimation?.cameraTrack;
        if (!cameraTrack) return null;
        const frameIndex = findFrameIndex(cameraTrack.frameNumbers, normalized);
        if (frameIndex < 0) return null;
        return {
            kind: "camera",
            positions: readFloatFrameBlock(cameraTrack.positions, frameIndex, 3),
            positionInterpolations: readUint8FrameBlock(cameraTrack.positionInterpolations, frameIndex, 12),
            rotations: readFloatFrameBlock(cameraTrack.rotations, frameIndex, 3),
            rotationInterpolations: readUint8FrameBlock(cameraTrack.rotationInterpolations, frameIndex, 4),
            distances: readFloatFrameBlock(cameraTrack.distances, frameIndex, 1),
            distanceInterpolations: readUint8FrameBlock(cameraTrack.distanceInterpolations, frameIndex, 4),
            fovs: readFloatFrameBlock(cameraTrack.fovs, frameIndex, 1),
            fovInterpolations: readUint8FrameBlock(cameraTrack.fovInterpolations, frameIndex, 4),
            externalParent: host.readCameraExternalParentKeyframe?.(normalized) ?? {
                modelPath: null,
                boneName: null,
            },
        };
    }

    if (track.category === "light") {
        return host.readLightSceneKeyframePayload?.(normalized) ?? null;
    }

    if (track.category === "shadow") {
        return host.readShadowSceneKeyframePayload?.(normalized) ?? null;
    }

    if (track.category === "gravity") {
        return host.readGravitySceneKeyframePayload?.(normalized) ?? null;
    }

    const animation = getCurrentModelAnimation(host);
    if (!animation) return null;

    if (track.category === "property") {
        const frameIndex = findFrameIndex(animation.propertyTrack.frameNumbers, normalized);
        if (frameIndex < 0) return null;
        return {
            kind: "property",
            visible: (animation.propertyTrack.visibles[frameIndex] ?? 0) !== 0,
            ikStates: animation.propertyTrack.ikBoneNames.map((boneName, ikIndex) => ({
                boneName,
                enabled: (animation.propertyTrack.getIkState(ikIndex)[frameIndex] ?? 0) !== 0,
            })),
        };
    }

    if (track.category === "morph") {
        const morphTrack = animation.morphTracks.find((candidate) => candidate.name === track.name);
        if (!morphTrack) return null;
        const frameIndex = findFrameIndex(morphTrack.frameNumbers, normalized);
        if (frameIndex < 0) return null;
        return {
            kind: "morph",
            weights: readFloatFrameBlock(morphTrack.weights, frameIndex, 1),
        };
    }

    const preferMovableTrack = shouldUseMovableBoneTrack(host, track);
    const movableTrack = animation.movableBoneTracks.find((candidate) => candidate.name === track.name);
    const boneTrack = animation.boneTracks.find((candidate) => candidate.name === track.name);
    if (preferMovableTrack && movableTrack) {
        const frameIndex = findFrameIndex(movableTrack.frameNumbers, normalized);
        if (frameIndex < 0) return null;
        return {
            kind: "movableBone",
            positions: readFloatFrameBlock(movableTrack.positions, frameIndex, 3),
            positionInterpolations: readUint8FrameBlock(movableTrack.positionInterpolations, frameIndex, 12),
            rotations: readFloatFrameBlock(movableTrack.rotations, frameIndex, 4),
            rotationInterpolations: readUint8FrameBlock(movableTrack.rotationInterpolations, frameIndex, 4),
            physicsToggles: readUint8FrameBlock(movableTrack.physicsToggles, frameIndex, 1),
            ...(host.readModelExternalParentKeyframe?.(normalized, track.name)
                ? { externalParent: host.readModelExternalParentKeyframe(normalized, track.name) ?? undefined }
                : {}),
        };
    }

    if (boneTrack) {
        const frameIndex = findFrameIndex(boneTrack.frameNumbers, normalized);
        if (frameIndex >= 0) {
            return {
                kind: "bone",
                rotations: readFloatFrameBlock(boneTrack.rotations, frameIndex, 4),
                rotationInterpolations: readUint8FrameBlock(boneTrack.rotationInterpolations, frameIndex, 4),
                physicsToggles: readUint8FrameBlock(boneTrack.physicsToggles, frameIndex, 1),
                ...(host.readModelExternalParentKeyframe?.(normalized, track.name)
                    ? { externalParent: host.readModelExternalParentKeyframe(normalized, track.name) ?? undefined }
                    : {}),
            };
        }
    }

    if (!movableTrack) return null;
    const frameIndex = findFrameIndex(movableTrack.frameNumbers, normalized);
    if (frameIndex < 0) return null;
    return {
        kind: "movableBone",
        positions: readFloatFrameBlock(movableTrack.positions, frameIndex, 3),
        positionInterpolations: readUint8FrameBlock(movableTrack.positionInterpolations, frameIndex, 12),
        rotations: readFloatFrameBlock(movableTrack.rotations, frameIndex, 4),
        rotationInterpolations: readUint8FrameBlock(movableTrack.rotationInterpolations, frameIndex, 4),
        physicsToggles: readUint8FrameBlock(movableTrack.physicsToggles, frameIndex, 1),
        ...(host.readModelExternalParentKeyframe?.(normalized, track.name)
            ? { externalParent: host.readModelExternalParentKeyframe(normalized, track.name) ?? undefined }
            : {}),
    };

}

export function applyTimelineKeyframePayload(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frame: number,
    payload: TimelineKeyframePayload | null,
): boolean {
    if (payload === null) {
        return removeTimelineKeyframePayload(host, track, frame);
    }

    const normalized = Math.max(0, Math.floor(frame));
    switch (payload.kind) {
        case "accessory": {
            const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
            if (accessoryIndex === null) return false;
            const applied = host.applyAccessoryTransformKeyframeValue?.(accessoryIndex, normalized, payload) ?? false;
            if (applied) emitMergedKeyframeTracks(host);
            return applied;
        }
        case "camera":
            return applyCameraKeyframePayload(host, normalized, payload);
        case "morph":
            return applyMorphKeyframePayload(host, track, normalized, payload);
        case "property":
            return applyPropertyKeyframePayload(host, normalized, payload);
        case "movableBone":
            return applyMovableBoneKeyframePayload(host, track, normalized, payload);
        case "bone":
            return applyBoneKeyframePayload(host, track, normalized, payload);
        case "light":
            return host.applyLightSceneKeyframePayload?.(normalized, payload) ?? false;
        case "shadow":
            return host.applyShadowSceneKeyframePayload?.(normalized, payload) ?? false;
        case "gravity":
            return host.applyGravitySceneKeyframePayload?.(normalized, payload) ?? false;
    }
}

export function removeTimelineKeyframePayloads(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frames: readonly number[],
): boolean {
    const normalizedFrames = createNormalizedFrameSet(frames);
    if (normalizedFrames.size === 0) return true;

    if (track.category === "accessory") {
        const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
        if (accessoryIndex === null) return false;
        const removed = host.removeAccessoryTransformKeyframeValues?.(accessoryIndex, [...normalizedFrames]) ?? false;
        if (removed) emitMergedKeyframeTracks(host);
        return removed;
    }

    if (track.category === "camera") {
        const cameraTrack = host.cameraSourceAnimation?.cameraTrack as unknown as CameraTrackBatchMutable | undefined;
        if (!cameraTrack) return false;
        const frameEdit = removeFrameNumbersForPayloads(cameraTrack.frameNumbers, normalizedFrames);
        if (!frameEdit) return false;
        cameraTrack.frameNumbers = frameEdit.frames;
        cameraTrack.positions = removeFloatValuesByIndexes(cameraTrack.positions, 3, frameEdit.removedIndexes);
        cameraTrack.positionInterpolations = removeUint8ValuesByIndexes(cameraTrack.positionInterpolations, 12, frameEdit.removedIndexes);
        cameraTrack.rotations = removeFloatValuesByIndexes(cameraTrack.rotations, 3, frameEdit.removedIndexes);
        cameraTrack.rotationInterpolations = removeUint8ValuesByIndexes(cameraTrack.rotationInterpolations, 4, frameEdit.removedIndexes);
        cameraTrack.distances = removeFloatValuesByIndexes(cameraTrack.distances, 1, frameEdit.removedIndexes);
        cameraTrack.distanceInterpolations = removeUint8ValuesByIndexes(cameraTrack.distanceInterpolations, 4, frameEdit.removedIndexes);
        cameraTrack.fovs = removeFloatValuesByIndexes(cameraTrack.fovs, 1, frameEdit.removedIndexes);
        cameraTrack.fovInterpolations = removeUint8ValuesByIndexes(cameraTrack.fovInterpolations, 4, frameEdit.removedIndexes);
        host.removeCameraExternalParentKeyframes?.([...normalizedFrames]);
        refreshAnimationFrameRange(host.cameraSourceAnimation);
        host.cameraKeyframeFrames = new Uint32Array(cameraTrack.frameNumbers);
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (track.category === "light") {
        return host.removeLightSceneKeyframePayloads?.([...normalizedFrames]) ?? false;
    }

    if (track.category === "shadow") {
        return host.removeShadowSceneKeyframePayloads?.([...normalizedFrames]) ?? false;
    }

    if (track.category === "gravity") {
        return host.removeGravitySceneKeyframePayloads?.([...normalizedFrames]) ?? false;
    }

    const animation = getCurrentModelAnimation(host);
    if (!animation || !host.currentModel) return false;

    if (track.category === "property") {
        const propertyTrack = animation.propertyTrack as RuntimePropertyTrackLike;
        const frameEdit = removeFrameNumbersForPayloads(propertyTrack.frameNumbers, normalizedFrames);
        if (!frameEdit) return false;
        const nextTrack = new MmdPropertyAnimationTrack(frameEdit.frames.length, propertyTrack.ikBoneNames);
        nextTrack.frameNumbers.set(frameEdit.frames);
        nextTrack.visibles.set(removeUint8ValuesByIndexes(propertyTrack.visibles, 1, frameEdit.removedIndexes));
        for (let ikIndex = 0; ikIndex < propertyTrack.ikBoneNames.length; ikIndex += 1) {
            const current = propertyTrack.getIkState(ikIndex);
            nextTrack.getIkState(ikIndex).set(removeUint8ValuesByIndexes(current, 1, frameEdit.removedIndexes));
        }
        (animation as unknown as { propertyTrack: MmdPropertyAnimationTrack }).propertyTrack = nextTrack;
        refreshAnimationFrameRange(animation);
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (track.category === "morph") {
        const morphTrack = animation.morphTracks.find((candidate) =>
            candidate.name === track.name
        ) as unknown as MorphTrackBatchMutable | undefined;
        if (!morphTrack) return false;
        const frameEdit = removeFrameNumbersForPayloads(morphTrack.frameNumbers, normalizedFrames);
        if (!frameEdit) return false;
        morphTrack.frameNumbers = frameEdit.frames;
        morphTrack.weights = removeFloatValuesByIndexes(morphTrack.weights, 1, frameEdit.removedIndexes);
        refreshAnimationFrameRange(animation);
        syncModelFrameMapFromTrack(host, track, morphTrack.frameNumbers);
        emitMergedKeyframeTracks(host);
        return true;
    }

    const movableTrack = animation.movableBoneTracks.find((candidate) =>
        candidate.name === track.name
    ) as unknown as MovableBoneTrackBatchMutable | undefined;
    if (movableTrack) {
        const frameEdit = removeFrameNumbersForPayloads(movableTrack.frameNumbers, normalizedFrames);
        if (!frameEdit) return false;
        movableTrack.frameNumbers = frameEdit.frames;
        movableTrack.positions = removeFloatValuesByIndexes(movableTrack.positions, 3, frameEdit.removedIndexes);
        movableTrack.positionInterpolations = removeUint8ValuesByIndexes(movableTrack.positionInterpolations, 12, frameEdit.removedIndexes);
        movableTrack.rotations = removeFloatValuesByIndexes(movableTrack.rotations, 4, frameEdit.removedIndexes);
        movableTrack.rotationInterpolations = removeUint8ValuesByIndexes(movableTrack.rotationInterpolations, 4, frameEdit.removedIndexes);
        movableTrack.physicsToggles = removeUint8ValuesByIndexes(movableTrack.physicsToggles, 1, frameEdit.removedIndexes);
        host.removeModelExternalParentKeyframes?.([...normalizedFrames], track.name);
        refreshAnimationFrameRange(animation);
        syncModelFrameMapFromTrack(host, track, movableTrack.frameNumbers);
        emitMergedKeyframeTracks(host);
        return true;
    }

    const boneTrack = animation.boneTracks.find((candidate) =>
        candidate.name === track.name
    ) as unknown as BoneTrackBatchMutable | undefined;
    if (!boneTrack) return false;
    const frameEdit = removeFrameNumbersForPayloads(boneTrack.frameNumbers, normalizedFrames);
    if (!frameEdit) return false;
    boneTrack.frameNumbers = frameEdit.frames;
    boneTrack.rotations = removeFloatValuesByIndexes(boneTrack.rotations, 4, frameEdit.removedIndexes);
    boneTrack.rotationInterpolations = removeUint8ValuesByIndexes(boneTrack.rotationInterpolations, 4, frameEdit.removedIndexes);
    boneTrack.physicsToggles = removeUint8ValuesByIndexes(boneTrack.physicsToggles, 1, frameEdit.removedIndexes);
    host.removeModelExternalParentKeyframes?.([...normalizedFrames], track.name);
    refreshAnimationFrameRange(animation);
    syncModelFrameMapFromTrack(host, track, boneTrack.frameNumbers);
    emitMergedKeyframeTracks(host);
    return true;
}

function applyCameraKeyframePayload(
    host: TimelineEditHost,
    frame: number,
    payload: CameraKeyframePayload,
): boolean {
    if (!ensureCameraAnimationForEditing(host)) return false;
    const cameraTrack = asMutableCameraTrack(host.cameraSourceAnimation.cameraTrack);
    const frameEdit = upsertFrameNumberForPayload(cameraTrack.frameNumbers, frame);
    cameraTrack.frameNumbers = frameEdit.frames;
    cameraTrack.positions = upsertFloatValuesForPayload(cameraTrack.positions, 3, frameEdit.index, frameEdit.exists, payload.positions);
    cameraTrack.positionInterpolations = upsertUint8Values(cameraTrack.positionInterpolations, 12, frameEdit.index, frameEdit.exists, payload.positionInterpolations);
    cameraTrack.rotations = upsertFloatValuesForPayload(cameraTrack.rotations, 3, frameEdit.index, frameEdit.exists, payload.rotations);
    cameraTrack.rotationInterpolations = upsertUint8Values(cameraTrack.rotationInterpolations, 4, frameEdit.index, frameEdit.exists, payload.rotationInterpolations);
    cameraTrack.distances = upsertFloatValuesForPayload(cameraTrack.distances, 1, frameEdit.index, frameEdit.exists, payload.distances);
    cameraTrack.distanceInterpolations = upsertUint8Values(cameraTrack.distanceInterpolations, 4, frameEdit.index, frameEdit.exists, payload.distanceInterpolations);
    cameraTrack.fovs = upsertFloatValuesForPayload(cameraTrack.fovs, 1, frameEdit.index, frameEdit.exists, payload.fovs);
    cameraTrack.fovInterpolations = upsertUint8Values(cameraTrack.fovInterpolations, 4, frameEdit.index, frameEdit.exists, payload.fovInterpolations);
    host.upsertCameraExternalParentKeyframe?.(frame, payload.externalParent);
    refreshAnimationFrameRange(host.cameraSourceAnimation);
    host.cameraKeyframeFrames = new Uint32Array(cameraTrack.frameNumbers);
    emitMergedKeyframeTracks(host);
    return true;
}

function applyMorphKeyframePayload(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frame: number,
    payload: MorphKeyframePayload,
): boolean {
    if (!host.currentModel || !ensureModelAnimationForEditing(host, track)) return false;
    const animation = getCurrentModelAnimation(host);
    const sourceMorphTrack = animation?.morphTracks.find((candidate) => candidate.name === track.name);
    if (!sourceMorphTrack) return false;
    const morphTrack = asMutableMorphTrack(sourceMorphTrack);
    const frameEdit = upsertFrameNumberForPayload(morphTrack.frameNumbers, frame);
    morphTrack.frameNumbers = frameEdit.frames;
    morphTrack.weights = upsertFloatValuesForPayload(morphTrack.weights, 1, frameEdit.index, frameEdit.exists, payload.weights);
    refreshAnimationFrameRange(animation);
    syncModelFrameMapFromTrack(host, track, morphTrack.frameNumbers);
    emitMergedKeyframeTracks(host);
    return true;
}

function applyMovableBoneKeyframePayload(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frame: number,
    payload: MovableBoneKeyframePayload,
): boolean {
    if (!shouldUseMovableBoneTrack(host, track)) {
        return applyBoneKeyframePayload(host, track, frame, {
            kind: "bone",
            rotations: payload.rotations,
            rotationInterpolations: payload.rotationInterpolations,
            physicsToggles: payload.physicsToggles,
            externalParent: payload.externalParent,
        });
    }

    if (!host.currentModel || !ensureModelAnimationForEditing(host, track)) return false;
    if (!applyModelExternalParentKeyframePayload(host, track, frame, payload.externalParent)) return false;
    const animation = getCurrentModelAnimation(host);
    const sourceMovableTrack = animation?.movableBoneTracks.find((candidate) => candidate.name === track.name);
    if (!sourceMovableTrack) return false;
    const movableTrack = asMutableMovableBoneTrack(sourceMovableTrack);
    const frameEdit = upsertFrameNumberForPayload(movableTrack.frameNumbers, frame);
    movableTrack.frameNumbers = frameEdit.frames;
    movableTrack.positions = upsertFloatValuesForPayload(movableTrack.positions, 3, frameEdit.index, frameEdit.exists, payload.positions);
    movableTrack.positionInterpolations = upsertUint8Values(movableTrack.positionInterpolations, 12, frameEdit.index, frameEdit.exists, payload.positionInterpolations);
    movableTrack.rotations = upsertFloatValuesForPayload(movableTrack.rotations, 4, frameEdit.index, frameEdit.exists, payload.rotations);
    movableTrack.rotationInterpolations = upsertUint8Values(movableTrack.rotationInterpolations, 4, frameEdit.index, frameEdit.exists, payload.rotationInterpolations);
    movableTrack.physicsToggles = upsertUint8Values(movableTrack.physicsToggles, 1, frameEdit.index, frameEdit.exists, payload.physicsToggles);
    refreshAnimationFrameRange(animation);
    syncModelFrameMapFromTrack(host, track, movableTrack.frameNumbers);
    emitMergedKeyframeTracks(host);
    return true;
}

function applyBoneKeyframePayload(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frame: number,
    payload: BoneKeyframePayload,
): boolean {
    if (!host.currentModel) return false;
    let animation = getCurrentModelAnimation(host);
    if (!animation) {
        if (!ensureModelAnimationForEditing(host, track)) return false;
        animation = getCurrentModelAnimation(host);
    }
    if (!animation) return false;
    if (!applyModelExternalParentKeyframePayload(host, track, frame, payload.externalParent)) return false;

    let sourceBoneTrack = animation.boneTracks.find((candidate) => candidate.name === track.name);
    if (!sourceBoneTrack) {
        const animationMutable = animation as unknown as { boneTracks: MmdBoneAnimationTrack[] };
        sourceBoneTrack = new MmdBoneAnimationTrack(track.name, 0);
        animationMutable.boneTracks.push(sourceBoneTrack);
    }
    const boneTrack = asMutableBoneTrack(sourceBoneTrack);
    const frameEdit = upsertFrameNumberForPayload(boneTrack.frameNumbers, frame);
    boneTrack.frameNumbers = frameEdit.frames;
    boneTrack.rotations = upsertFloatValuesForPayload(boneTrack.rotations, 4, frameEdit.index, frameEdit.exists, payload.rotations);
    boneTrack.rotationInterpolations = upsertUint8Values(boneTrack.rotationInterpolations, 4, frameEdit.index, frameEdit.exists, payload.rotationInterpolations);
    boneTrack.physicsToggles = upsertUint8Values(boneTrack.physicsToggles, 1, frameEdit.index, frameEdit.exists, payload.physicsToggles);
    refreshAnimationFrameRange(animation);
    syncModelFrameMapFromTrack(host, track, boneTrack.frameNumbers);
    emitMergedKeyframeTracks(host);
    return true;
}

function applyModelExternalParentKeyframePayload(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frame: number,
    payload: ModelExternalParentKeyframePayload | undefined,
): boolean {
    if (payload) {
        return host.upsertModelExternalParentKeyframe?.(frame, payload) ?? false;
    }
    return host.removeModelExternalParentKeyframes?.([frame], track.name) ?? true;
}

function removeTimelineKeyframePayload(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frame: number,
): boolean {
    const normalized = Math.max(0, Math.floor(frame));

    if (track.category === "accessory") {
        const accessoryIndex = host.getActiveTimelineAccessoryIndex?.() ?? null;
        if (accessoryIndex === null) return false;
        const removed = host.applyAccessoryTransformKeyframeValue?.(accessoryIndex, normalized, null) ?? false;
        if (removed) emitMergedKeyframeTracks(host);
        return removed;
    }

    if (track.category === "camera") {
        const sourceCameraTrack = host.cameraSourceAnimation?.cameraTrack;
        if (!sourceCameraTrack) return false;
        const cameraTrack = asMutableCameraTrack(sourceCameraTrack);
        const frameIndex = findFrameIndex(cameraTrack.frameNumbers, normalized);
        if (frameIndex < 0) return false;
        cameraTrack.frameNumbers = removeFrameNumber(cameraTrack.frameNumbers, normalized);
        cameraTrack.positions = removeFloatValues(cameraTrack.positions, 3, frameIndex);
        cameraTrack.positionInterpolations = removeUint8Values(cameraTrack.positionInterpolations, 12, frameIndex);
        cameraTrack.rotations = removeFloatValues(cameraTrack.rotations, 3, frameIndex);
        cameraTrack.rotationInterpolations = removeUint8Values(cameraTrack.rotationInterpolations, 4, frameIndex);
        cameraTrack.distances = removeFloatValues(cameraTrack.distances, 1, frameIndex);
        cameraTrack.distanceInterpolations = removeUint8Values(cameraTrack.distanceInterpolations, 4, frameIndex);
        cameraTrack.fovs = removeFloatValues(cameraTrack.fovs, 1, frameIndex);
        cameraTrack.fovInterpolations = removeUint8Values(cameraTrack.fovInterpolations, 4, frameIndex);
        host.removeCameraExternalParentKeyframes?.([normalized]);
        refreshAnimationFrameRange(host.cameraSourceAnimation);
        host.cameraKeyframeFrames = new Uint32Array(cameraTrack.frameNumbers);
        emitMergedKeyframeTracks(host);
        return true;
    }

    if (track.category === "light") {
        return host.applyLightSceneKeyframePayload?.(normalized, null) ?? false;
    }

    if (track.category === "shadow") {
        return host.applyShadowSceneKeyframePayload?.(normalized, null) ?? false;
    }

    if (track.category === "gravity") {
        return host.applyGravitySceneKeyframePayload?.(normalized, null) ?? false;
    }

    const animation = getCurrentModelAnimation(host);
    if (!animation || !host.currentModel) return false;

    if (track.category === "property") {
        return removeTimelineKeyframePayloads(host, track, [normalized]);
    }

    if (track.category === "morph") {
        const sourceMorphTrack = animation.morphTracks.find((candidate) => candidate.name === track.name);
        if (!sourceMorphTrack) return false;
        const morphTrack = asMutableMorphTrack(sourceMorphTrack);
        const frameIndex = findFrameIndex(morphTrack.frameNumbers, normalized);
        if (frameIndex < 0) return false;
        morphTrack.frameNumbers = removeFrameNumber(morphTrack.frameNumbers, normalized);
        morphTrack.weights = removeFloatValues(morphTrack.weights, 1, frameIndex);
        refreshAnimationFrameRange(animation);
        syncModelFrameMapFromTrack(host, track, morphTrack.frameNumbers);
        emitMergedKeyframeTracks(host);
        return true;
    }

    const sourceMovableTrack = animation.movableBoneTracks.find((candidate) => candidate.name === track.name);
    if (sourceMovableTrack) {
        const movableTrack = asMutableMovableBoneTrack(sourceMovableTrack);
        const frameIndex = findFrameIndex(movableTrack.frameNumbers, normalized);
        if (frameIndex < 0) return false;
        movableTrack.frameNumbers = removeFrameNumber(movableTrack.frameNumbers, normalized);
        movableTrack.positions = removeFloatValues(movableTrack.positions, 3, frameIndex);
        movableTrack.positionInterpolations = removeUint8Values(movableTrack.positionInterpolations, 12, frameIndex);
        movableTrack.rotations = removeFloatValues(movableTrack.rotations, 4, frameIndex);
        movableTrack.rotationInterpolations = removeUint8Values(movableTrack.rotationInterpolations, 4, frameIndex);
        movableTrack.physicsToggles = removeUint8Values(movableTrack.physicsToggles, 1, frameIndex);
        host.removeModelExternalParentKeyframes?.([normalized], track.name);
        refreshAnimationFrameRange(animation);
        syncModelFrameMapFromTrack(host, track, movableTrack.frameNumbers);
        emitMergedKeyframeTracks(host);
        return true;
    }

    const sourceBoneTrack = animation.boneTracks.find((candidate) => candidate.name === track.name);
    if (!sourceBoneTrack) return false;
    const boneTrack = asMutableBoneTrack(sourceBoneTrack);
    const frameIndex = findFrameIndex(boneTrack.frameNumbers, normalized);
    if (frameIndex < 0) return false;
    boneTrack.frameNumbers = removeFrameNumber(boneTrack.frameNumbers, normalized);
    boneTrack.rotations = removeFloatValues(boneTrack.rotations, 4, frameIndex);
    boneTrack.rotationInterpolations = removeUint8Values(boneTrack.rotationInterpolations, 4, frameIndex);
    boneTrack.physicsToggles = removeUint8Values(boneTrack.physicsToggles, 1, frameIndex);
    host.removeModelExternalParentKeyframes?.([normalized], track.name);
    refreshAnimationFrameRange(animation);
    syncModelFrameMapFromTrack(host, track, boneTrack.frameNumbers);
    emitMergedKeyframeTracks(host);
    return true;
}

function syncModelFrameMapFromTrack(
    host: TimelineEditHost,
    track: Pick<KeyframeTrack, "name" | "category">,
    frames: Uint32Array,
): void {
    if (!host.currentModel) return;
    const frameMap = getOrCreateModelTrackFrameMap(host, host.currentModel);
    frameMap.set(createTrackKey(track.category, track.name), new Uint32Array(frames));
}

function upsertFrameNumberForPayload(
    frames: ArrayLike<number>,
    frame: number,
): { frames: Uint32Array; index: number; exists: boolean } {
    const normalizedFrame = Math.max(0, Math.floor(frame));
    const sourceLength = frames?.length ?? 0;
    let lo = 0;
    let hi = sourceLength;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if ((frames[mid] ?? 0) < normalizedFrame) lo = mid + 1;
        else hi = mid;
    }

    const exists = lo < sourceLength && (frames[lo] ?? 0) === normalizedFrame;
    if (exists) {
        return { frames: new Uint32Array(frames as ArrayLike<number>), index: lo, exists: true };
    }

    const nextFrames = new Uint32Array(sourceLength + 1);
    for (let i = 0; i < lo; i += 1) nextFrames[i] = Math.max(0, Math.floor(frames[i] ?? 0));
    nextFrames[lo] = normalizedFrame;
    for (let i = lo; i < sourceLength; i += 1) {
        nextFrames[i + 1] = Math.max(0, Math.floor(frames[i] ?? 0));
    }
    return { frames: nextFrames, index: lo, exists: false };
}

function upsertFloatValuesForPayload(
    values: ArrayLike<number>,
    stride: number,
    frameIndex: number,
    exists: boolean,
    block: readonly number[],
): Float32Array {
    const sourceFrameCount = Math.floor((values?.length ?? 0) / stride);
    const targetFrameCount = sourceFrameCount + (exists ? 0 : 1);
    const target = new Float32Array(targetFrameCount * stride);
    for (let sourceFrameIndex = 0; sourceFrameIndex < sourceFrameCount; sourceFrameIndex += 1) {
        const targetFrameIndex = !exists && sourceFrameIndex >= frameIndex
            ? sourceFrameIndex + 1
            : sourceFrameIndex;
        const sourceOffset = sourceFrameIndex * stride;
        const targetOffset = targetFrameIndex * stride;
        for (let i = 0; i < stride; i += 1) {
            const value = values[sourceOffset + i];
            target[targetOffset + i] = Number.isFinite(value) ? value : 0;
        }
    }

    const writeOffset = frameIndex * stride;
    for (let i = 0; i < stride; i += 1) {
        const value = block[i] ?? 0;
        target[writeOffset + i] = Number.isFinite(value) ? value : 0;
    }
    return target;
}

export function buildModelTrackFrameMapFromAnimation(_host: unknown, animation: MmdAnimation, frameOffset = 0): Map<string, Uint32Array> {
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

export function getTimelineKeyframeStats(host: TimelineEditHost): { hasAnyKeyframe: boolean; maxFrame: number } {
    return getRegisteredKeyframeStats(host);
}

export function createOffsetModelAnimation(animation: MmdAnimation, frameOffset: number): MmdAnimation {
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

export function mergeModelAnimations(baseAnimation: MmdAnimation, overlayAnimation: MmdAnimation): MmdAnimation {
    const mergedBoneTracks = mergeBoneTrackArrays(baseAnimation.boneTracks, overlayAnimation.boneTracks);
    const mergedMovableBoneTracks = mergeMovableBoneTrackArrays(baseAnimation.movableBoneTracks, overlayAnimation.movableBoneTracks);
    const mergedMorphTracks = mergeMorphTrackArrays(baseAnimation.morphTracks, overlayAnimation.morphTracks);
    const mergedPropertyTrack = mergePropertyTrack(baseAnimation.propertyTrack, overlayAnimation.propertyTrack);

    return new MmdAnimation(
        `${baseAnimation.name}+${overlayAnimation.name}`,
        mergedBoneTracks,
        mergedMovableBoneTracks,
        mergedMorphTracks,
        mergedPropertyTrack,
        baseAnimation.cameraTrack,
    );
}

function mergePropertyTrack(
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

    const baseIndexMap = createFrameIndexMap(baseTrack.frameNumbers);
    const overlayIndexMap = createFrameIndexMap(overlayTrack.frameNumbers);
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

function mergeMovableBoneTrackArrays(
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
        mergedTracks.push(mergeMovableBoneTrack(baseTrack, overlayTrack));
    }

    for (const overlayTrack of overlayTracks) {
        if (mergedNames.has(overlayTrack.name)) continue;
        mergedTracks.push(overlayTrack);
    }

    return mergedTracks;
}

function mergeBoneTrackArrays(
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
        mergedTracks.push(mergeBoneTrack(baseTrack, overlayTrack));
    }

    for (const overlayTrack of overlayTracks) {
        if (mergedNames.has(overlayTrack.name)) continue;
        mergedTracks.push(overlayTrack);
    }

    return mergedTracks;
}

function mergeMorphTrackArrays(
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
        mergedTracks.push(mergeMorphTrack(baseTrack, overlayTrack));
    }

    for (const overlayTrack of overlayTracks) {
        if (mergedNames.has(overlayTrack.name)) continue;
        mergedTracks.push(overlayTrack);
    }

    return mergedTracks;
}

function mergeMovableBoneTrack(
    baseTrack: MmdMovableBoneAnimationTrack,
    overlayTrack: MmdMovableBoneAnimationTrack,
): MmdMovableBoneAnimationTrack {
    const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
    const mergedTrack = new MmdMovableBoneAnimationTrack(baseTrack.name, mergedFrames.length);
    mergedTrack.frameNumbers.set(mergedFrames);

    const baseIndexMap = createFrameIndexMap(baseTrack.frameNumbers);
    const overlayIndexMap = createFrameIndexMap(overlayTrack.frameNumbers);

    for (let i = 0; i < mergedFrames.length; i += 1) {
        const frame = mergedFrames[i];
        const overlayIndex = overlayIndexMap.get(frame);
        if (overlayIndex !== undefined) {
            copyFloatFrameBlock(overlayTrack.positions, overlayIndex, 3, mergedTrack.positions, i);
            copyUint8FrameBlock(overlayTrack.positionInterpolations, overlayIndex, 12, mergedTrack.positionInterpolations, i);
            copyFloatFrameBlock(overlayTrack.rotations, overlayIndex, 4, mergedTrack.rotations, i);
            copyUint8FrameBlock(overlayTrack.rotationInterpolations, overlayIndex, 4, mergedTrack.rotationInterpolations, i);
            copyUint8FrameBlock(overlayTrack.physicsToggles, overlayIndex, 1, mergedTrack.physicsToggles, i);
            continue;
        }

        const baseIndex = baseIndexMap.get(frame);
        if (baseIndex === undefined) continue;
        copyFloatFrameBlock(baseTrack.positions, baseIndex, 3, mergedTrack.positions, i);
        copyUint8FrameBlock(baseTrack.positionInterpolations, baseIndex, 12, mergedTrack.positionInterpolations, i);
        copyFloatFrameBlock(baseTrack.rotations, baseIndex, 4, mergedTrack.rotations, i);
        copyUint8FrameBlock(baseTrack.rotationInterpolations, baseIndex, 4, mergedTrack.rotationInterpolations, i);
        copyUint8FrameBlock(baseTrack.physicsToggles, baseIndex, 1, mergedTrack.physicsToggles, i);
    }

    return mergedTrack;
}

function mergeBoneTrack(
    baseTrack: MmdBoneAnimationTrack,
    overlayTrack: MmdBoneAnimationTrack,
): MmdBoneAnimationTrack {
    const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
    const mergedTrack = new MmdBoneAnimationTrack(baseTrack.name, mergedFrames.length);
    mergedTrack.frameNumbers.set(mergedFrames);

    const baseIndexMap = createFrameIndexMap(baseTrack.frameNumbers);
    const overlayIndexMap = createFrameIndexMap(overlayTrack.frameNumbers);

    for (let i = 0; i < mergedFrames.length; i += 1) {
        const frame = mergedFrames[i];
        const overlayIndex = overlayIndexMap.get(frame);
        if (overlayIndex !== undefined) {
            copyFloatFrameBlock(overlayTrack.rotations, overlayIndex, 4, mergedTrack.rotations, i);
            copyUint8FrameBlock(overlayTrack.rotationInterpolations, overlayIndex, 4, mergedTrack.rotationInterpolations, i);
            copyUint8FrameBlock(overlayTrack.physicsToggles, overlayIndex, 1, mergedTrack.physicsToggles, i);
            continue;
        }

        const baseIndex = baseIndexMap.get(frame);
        if (baseIndex === undefined) continue;
        copyFloatFrameBlock(baseTrack.rotations, baseIndex, 4, mergedTrack.rotations, i);
        copyUint8FrameBlock(baseTrack.rotationInterpolations, baseIndex, 4, mergedTrack.rotationInterpolations, i);
        copyUint8FrameBlock(baseTrack.physicsToggles, baseIndex, 1, mergedTrack.physicsToggles, i);
    }

    return mergedTrack;
}

function mergeMorphTrack(
    baseTrack: MmdMorphAnimationTrack,
    overlayTrack: MmdMorphAnimationTrack,
): MmdMorphAnimationTrack {
    const mergedFrames = mergeFrameNumbers(baseTrack.frameNumbers, overlayTrack.frameNumbers);
    const mergedTrack = new MmdMorphAnimationTrack(baseTrack.name, mergedFrames.length);
    mergedTrack.frameNumbers.set(mergedFrames);

    const baseIndexMap = createFrameIndexMap(baseTrack.frameNumbers);
    const overlayIndexMap = createFrameIndexMap(overlayTrack.frameNumbers);

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

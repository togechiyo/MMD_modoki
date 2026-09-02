import type { MotionInfo } from "../types";
import { logError, logInfo, logWarn, toLogErrorData } from "../app-logger";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";

type MotionAssetAnimation = object;

type CameraMotionAnimation = MotionAssetAnimation & {
    cameraTrack: {
        frameNumbers: ArrayLike<number>;
    };
};

type MotionAssetRuntimeModel = {
    setRuntimeAnimation(animationHandle: unknown): void;
};

type MotionAssetHost = {
    currentModel: MotionAssetRuntimeModel | null;
    _currentFrame: number;
    _totalFrames: number;
    onError?: (message: string) => void;
    onMotionLoaded?: (motionInfo: MotionInfo) => void;
    onCameraMotionLoaded?: (motionInfo: MotionInfo) => void;
    onAudioLoaded?: (audioName: string) => void;
    vmdLoader: {
        loadAsync(name: string, url: string): Promise<MotionAssetAnimation>;
    };
    vpdLoader: {
        loadFromBuffer(name: string, buffer: ArrayBuffer): MotionAssetAnimation;
    };
    bvmdLoader: {
        loadFromBuffer(name: string, buffer: ArrayBuffer): MotionAssetAnimation;
    };
    modelSourceAnimationsByModel: WeakMap<MotionAssetRuntimeModel, MotionAssetAnimation>;
    modelKeyframeTracksByModel: WeakMap<MotionAssetRuntimeModel, Map<string, Uint32Array>>;
    mergeModelAnimations(baseAnimation: MotionAssetAnimation, animation: MotionAssetAnimation): MotionAssetAnimation;
    createOffsetModelAnimation(animation: MotionAssetAnimation, frameOffset: number): MotionAssetAnimation;
    appendModelMotionImport(
        model: MotionAssetRuntimeModel,
        motionImport: { type: "vmd" | "bvmd" | "vpd"; path: string; frame?: number },
    ): void;
    createModelRuntimeAnimation(model: MotionAssetRuntimeModel, animation: MotionAssetAnimation): unknown;
    buildModelTrackFrameMapFromAnimation(animation: MotionAssetAnimation): Map<string, Uint32Array>;
    emitMergedKeyframeTracks(): void;
    mmdRuntime: {
        animationFrameTimeDuration: number;
        setAudioPlayer(audioPlayer: StreamAudioPlayer | null): Promise<void>;
    };
    seekTo(frame: number): void;
    syncMmdCameraFromViewportCamera(force: boolean): void;
    cameraAnimationHandle: unknown | null;
    mmdCamera: {
        createRuntimeAnimation(animation: MotionAssetAnimation): unknown;
        setRuntimeAnimation(animationHandle: unknown): void;
        destroyRuntimeAnimation(animationHandle: unknown): void;
    };
    hasCameraMotion: boolean;
    cameraMotionPath: string | null;
    cameraSourceAnimation: MotionAssetAnimation | null;
    cameraKeyframeFrames: Uint32Array;
    audioPlayer: StreamAudioPlayer | null;
    audioBlobUrl: string | null;
    scene: ConstructorParameters<typeof StreamAudioPlayer>[0];
    audioSourcePath: string | null;
    refreshTotalFramesFromContent?: () => void;
};

function toExactArrayBuffer(value: ArrayBufferView): ArrayBuffer {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return bytes.slice().buffer;
}

function getAudioMimeType(fileName: string): string {
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

export async function loadVMD(host: MotionAssetHost, filePath: string): Promise<MotionInfo | null> {
    const pathParts = filePath.replace(/\\/g, "/");
    const lastSlash = pathParts.lastIndexOf("/");
    const fileName = pathParts.substring(lastSlash + 1);
    const extensionMatch = fileName.match(/\.([^.]+)$/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";

    if (extension === "vpd") {
        return await loadVPD(host, filePath);
    }

    const motionType = extension === "bvmd" ? "bvmd" : "vmd";

    try {
        logInfo("asset", "motion load started", { filePath, type: motionType });
        const targetModel = host.currentModel;
        if (!targetModel) {
            logWarn("asset", "motion load skipped because no model is active", {
                filePath,
                type: motionType,
            });
            host.onError?.("Load a PMX model first");
            return null;
        }
        const loadFrame = host._currentFrame;
        const previousTotalFrames = host._totalFrames;
        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            logError("asset", "motion file read failed", {
                filePath,
                type: motionType,
            });
            host.onError?.(`Failed to read ${motionType.toUpperCase()} file`);
            return null;
        }

        let animation: MotionAssetAnimation;
        if (motionType === "bvmd") {
            animation = host.bvmdLoader.loadFromBuffer(
                "modelMotion",
                toExactArrayBuffer(buffer),
            );
        } else {
            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const blob = new Blob([uint8]);
            const blobUrl = URL.createObjectURL(blob);
            try {
                animation = await host.vmdLoader.loadAsync("modelMotion", blobUrl);
            } finally {
                URL.revokeObjectURL(blobUrl);
            }
        }

        const baseAnimation = host.modelSourceAnimationsByModel.get(targetModel);
        const mergedAnimation = baseAnimation
            ? host.mergeModelAnimations(baseAnimation, animation)
            : animation;

        host.modelSourceAnimationsByModel.set(targetModel, mergedAnimation);
        host.appendModelMotionImport(targetModel, { type: motionType, path: filePath });
        const animHandle = host.createModelRuntimeAnimation(targetModel, mergedAnimation);
        targetModel.setRuntimeAnimation(animHandle);

        host._totalFrames = Math.max(
            previousTotalFrames,
            Math.floor(host.mmdRuntime.animationFrameTimeDuration),
            300,
        );
        host.seekTo(loadFrame);

        host.modelKeyframeTracksByModel.set(
            targetModel,
            host.buildModelTrackFrameMapFromAnimation(mergedAnimation),
        );
        host.emitMergedKeyframeTracks();

        const motionInfo: MotionInfo = {
            name: fileName.replace(/\.(vmd|bvmd)$/i, ""),
            path: filePath,
            frameCount: host._totalFrames,
        };

        host.onMotionLoaded?.(motionInfo);
        logInfo("asset", "motion load completed", {
            filePath,
            fileName,
            type: motionType,
            frameCount: motionInfo.frameCount,
        });
        return motionInfo;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logError("asset", "motion load failed", {
            filePath,
            type: motionType,
            ...toLogErrorData(err),
        });
        host.onError?.(`${motionType.toUpperCase()} load error: ${message}`);
        return null;
    }
}

export async function loadVPD(host: MotionAssetHost, filePath: string): Promise<MotionInfo | null> {
    try {
        logInfo("asset", "motion load started", { filePath, type: "vpd" });
        const targetModel = host.currentModel;
        if (!targetModel) {
            logWarn("asset", "motion load skipped because no model is active", {
                filePath,
                type: "vpd",
            });
            host.onError?.("Load a PMX model first");
            return null;
        }
        const loadFrame = host._currentFrame;
        const previousTotalFrames = host._totalFrames;
        const pathParts = filePath.replace(/\\/g, "/");
        const lastSlash = pathParts.lastIndexOf("/");
        const fileName = pathParts.substring(lastSlash + 1);

        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            logError("asset", "motion file read failed", {
                filePath,
                type: "vpd",
            });
            host.onError?.("Failed to read pose file");
            return null;
        }

        const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
        const arrayBuffer = uint8.buffer.slice(
            uint8.byteOffset,
            uint8.byteOffset + uint8.byteLength,
        );
        const poseAnimation = host.vpdLoader.loadFromBuffer("modelPose", arrayBuffer);
        const shiftedPoseAnimation = host.createOffsetModelAnimation(poseAnimation, loadFrame);
        const baseAnimation = host.modelSourceAnimationsByModel.get(targetModel);
        const mergedAnimation = baseAnimation
            ? host.mergeModelAnimations(baseAnimation, shiftedPoseAnimation)
            : shiftedPoseAnimation;
        host.modelSourceAnimationsByModel.set(targetModel, mergedAnimation);
        host.appendModelMotionImport(targetModel, { type: "vpd", path: filePath, frame: loadFrame });

        const animHandle = host.createModelRuntimeAnimation(targetModel, mergedAnimation);
        targetModel.setRuntimeAnimation(animHandle);

        host._totalFrames = Math.max(
            previousTotalFrames,
            Math.floor(host.mmdRuntime.animationFrameTimeDuration),
            loadFrame,
            300,
        );
        host.seekTo(loadFrame);

        host.modelKeyframeTracksByModel.set(
            targetModel,
            host.buildModelTrackFrameMapFromAnimation(mergedAnimation),
        );
        host.emitMergedKeyframeTracks();

        const motionInfo: MotionInfo = {
            name: fileName.replace(/\.vpd$/i, ""),
            path: filePath,
            frameCount: host._totalFrames,
        };

        host.onMotionLoaded?.(motionInfo);
        logInfo("asset", "motion load completed", {
            filePath,
            fileName,
            type: "vpd",
            frameCount: motionInfo.frameCount,
            loadFrame,
        });
        return motionInfo;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logError("asset", "motion load failed", {
            filePath,
            type: "vpd",
            ...toLogErrorData(err),
        });
        host.onError?.(`Pose load error: ${message}`);
        return null;
    }
}

export async function loadCameraVMD(host: MotionAssetHost, filePath: string): Promise<MotionInfo | null> {
    try {
        const pathParts = filePath.replace(/\\/g, "/");
        const lastSlash = pathParts.lastIndexOf("/");
        const fileName = pathParts.substring(lastSlash + 1);
        const motionType = /\.bvmd$/i.test(fileName) ? "bvmd" : "vmd";
        logInfo("camera-vmd", "load started", { filePath, type: motionType });

        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            logError("camera-vmd", "file read failed", { filePath, type: motionType });
            host.onError?.(`Failed to read camera ${motionType.toUpperCase()} file`);
            return null;
        }

        let animation: CameraMotionAnimation;
        if (motionType === "bvmd") {
            animation = host.bvmdLoader.loadFromBuffer(
                "cameraMotion",
                toExactArrayBuffer(buffer),
            ) as CameraMotionAnimation;
        } else {
            const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
            const blob = new Blob([uint8]);
            const blobUrl = URL.createObjectURL(blob);
            try {
                animation = await host.vmdLoader.loadAsync("cameraMotion", blobUrl) as CameraMotionAnimation;
            } finally {
                URL.revokeObjectURL(blobUrl);
            }
        }

        if (animation.cameraTrack.frameNumbers.length === 0) {
            logWarn("camera-vmd", "camera track is empty", { filePath, type: motionType });
            host.onError?.(`This ${motionType.toUpperCase()} has no camera track`);
            return null;
        }

        host.syncMmdCameraFromViewportCamera(true);

        if (host.cameraAnimationHandle !== null) {
            host.mmdCamera.destroyRuntimeAnimation(host.cameraAnimationHandle);
            host.cameraAnimationHandle = null;
        }

        host.cameraAnimationHandle = host.mmdCamera.createRuntimeAnimation(animation);
        host.mmdCamera.setRuntimeAnimation(host.cameraAnimationHandle);
        host.hasCameraMotion = true;
        host.cameraMotionPath = filePath;
        host.cameraSourceAnimation = animation;
        host.cameraKeyframeFrames = new Uint32Array(animation.cameraTrack.frameNumbers);
        host.emitMergedKeyframeTracks();

        host.seekTo(0);

        const motionInfo: MotionInfo = {
            name: fileName.replace(/\.(vmd|bvmd)$/i, ""),
            path: filePath,
            frameCount: host._totalFrames,
        };
        const lastCameraFrame = host.cameraKeyframeFrames.length > 0
            ? host.cameraKeyframeFrames[host.cameraKeyframeFrames.length - 1]
            : null;
        logInfo("camera-vmd", "load completed", {
            filePath,
            type: motionType,
            cameraFrameCount: animation.cameraTrack.frameNumbers.length,
            lastCameraFrame,
            totalFrames: host._totalFrames,
            currentFrame: host._currentFrame,
        });

        host.onCameraMotionLoaded?.(motionInfo);
        return motionInfo;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const motionType = /\.bvmd$/i.test(filePath) ? "bvmd" : "vmd";
        logError("camera-vmd", "load failed", {
            filePath,
            type: motionType,
            ...toLogErrorData(err),
        });
        host.onError?.(`Camera ${motionType.toUpperCase()} load error: ${message}`);
        return null;
    }
}

export async function loadMP3(host: MotionAssetHost, filePath: string): Promise<boolean> {
    try {
        logInfo("asset", "audio load started", { filePath });
        const pathParts = filePath.replace(/\\/g, "/");
        const lastSlash = pathParts.lastIndexOf("/");
        const fileName = pathParts.substring(lastSlash + 1);

        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            logError("asset", "audio file read failed", { filePath });
            host.onError?.("Audio file read failed");
            return false;
        }

        if (host.audioPlayer) {
            await host.mmdRuntime.setAudioPlayer(null);
            host.audioPlayer.dispose();
            host.audioPlayer = null;
        }
        if (host.audioBlobUrl) {
            URL.revokeObjectURL(host.audioBlobUrl);
            host.audioBlobUrl = null;
        }

        const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
        const blob = new Blob([uint8], { type: getAudioMimeType(fileName) });
        host.audioBlobUrl = URL.createObjectURL(blob);

        host.audioPlayer = new StreamAudioPlayer(host.scene);
        host.audioPlayer.source = host.audioBlobUrl;
        await host.mmdRuntime.setAudioPlayer(host.audioPlayer);
        host.audioSourcePath = filePath;
        host.audioPlayer.onDurationChangedObservable.add(() => {
            host.refreshTotalFramesFromContent?.();
        });
        host.refreshTotalFramesFromContent?.();

        host.onAudioLoaded?.(fileName.replace(/\.(mp3|wav|wave|ogg)$/i, ""));
        logInfo("asset", "audio load completed", { filePath, fileName });
        return true;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logError("asset", "audio load failed", {
            filePath,
            ...toLogErrorData(err),
        });
        host.onError?.(`Audio load error: ${message}`);
        return false;
    }
}

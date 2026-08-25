import {
    AudioBufferSource,
    StreamTarget,
    canEncode,
    canEncodeAudio,
    canEncodeVideo,
    Output,
    VideoSample,
    VideoSampleSource,
    WebMOutputFormat,
} from "mediabunny";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";
import { MmdManager, type RenderEnginePreference } from "./mmd-manager";
import type {
    WebmCaptureMode,
    WebmExportDiagnostics,
    WebmExportPhase,
    WebmExportRequest,
} from "./types";
import { getWebmVideoEncodingQuality } from "./export/webm-video-quality-policy";

export interface WebmExportCallbacks {
    onStatus?: (message: string, phase: WebmExportPhase) => void;
    onProgress?: (encoded: number, total: number, frame: number, captured: number) => void;
}

export interface WebmExportResult {
    encodedFrames: number;
    totalFrames: number;
    codec: "vp9" | "vp8";
    outputBytes: number;
    diagnostics: WebmExportDiagnostics;
}

export class WebmExportCanceledError extends Error {
    constructor() {
        super("WebM export canceled");
        this.name = "WebmExportCanceledError";
    }
}

export function isWebmExportCanceledError(error: unknown): boolean {
    return error instanceof WebmExportCanceledError
        || (error instanceof Error && error.name === "WebmExportCanceledError");
}

const throwIfWebmExportCanceled = (signal?: AbortSignal): void => {
    if (signal?.aborted) {
        throw new WebmExportCanceledError();
    }
};

const updateStatus = (
    callbacks: WebmExportCallbacks,
    message: string,
    phase: WebmExportPhase,
): void => {
    callbacks.onStatus?.(message, phase);
};

const formatCaptureModeLabel = (mode: WebmCaptureMode): string => {
    switch (mode) {
        case "canvas":
            return "Canvas";
        case "rgba-surface":
            return "RGBA統合";
        case "webgpu-copy":
            return "旧WebGPU copy";
        case "readpixels":
        default:
            return "安定";
    }
};

type ExportRuntimeInternals = {
    engine: AbstractEngine;
    camera: Camera;
    scene: Scene;
    mmdRuntime: {
        playAnimation: () => Promise<void>;
        pauseAnimation: () => void;
    };
};

type WebGpuCaptureEngineInternals = {
    _getCurrentRenderPassWrapper?: () => unknown;
    _currentRenderTarget?: unknown;
    _colorFormat?: unknown;
    getRenderWidth: (useScreen?: boolean) => number;
    getRenderHeight: (useScreen?: boolean) => number;
};

const isCaptureDiagnosticsEnabled = (): boolean => (
    new URLSearchParams(window.location.search).get("e2e") === "1"
);

const readScalarDiagnosticValue = (value: unknown): string | number | null => {
    if (typeof value === "string" || typeof value === "number") {
        return value;
    }
    return null;
};

const readNumberDiagnosticValue = (value: unknown): number | null => (
    typeof value === "number" && Number.isFinite(value) ? value : null
);

const readObjectDiagnosticValue = (value: unknown, key: string): unknown => {
    if (!value || typeof value !== "object") {
        return null;
    }
    return (value as Record<string, unknown>)[key] ?? null;
};

const getWebGpuCaptureSourceDiagnostics = (
    engine: WebGPUEngine,
    requestedWidth: number,
    requestedHeight: number,
): Record<string, unknown> => {
    try {
        const engineInternals = engine as unknown as WebGpuCaptureEngineInternals;
        const renderPassWrapper = engineInternals._getCurrentRenderPassWrapper?.() ?? null;
        const attachments = readObjectDiagnosticValue(renderPassWrapper, "colorAttachmentGPUTextures");
        const hardwareTexture = Array.isArray(attachments) ? attachments[0] ?? null : null;
        const gpuTexture = readObjectDiagnosticValue(hardwareTexture, "underlyingResource");
        const renderWidth = engine.getRenderWidth(true);
        const renderHeight = engine.getRenderHeight(true);
        return {
            source: "engine.readPixels.current-render-pass-color-attachment",
            currentRenderTargetBound: Boolean(engineInternals._currentRenderTarget),
            renderPassWrapperAvailable: Boolean(renderPassWrapper),
            colorAttachmentCount: Array.isArray(attachments) ? attachments.length : null,
            engineColorFormat: readScalarDiagnosticValue(engineInternals._colorFormat),
            hardwareTextureFormat: readScalarDiagnosticValue(
                readObjectDiagnosticValue(hardwareTexture, "format"),
            ),
            gpuTextureLabel: readScalarDiagnosticValue(readObjectDiagnosticValue(gpuTexture, "label")),
            gpuTextureFormat: readScalarDiagnosticValue(readObjectDiagnosticValue(gpuTexture, "format")),
            gpuTextureUsage: readNumberDiagnosticValue(readObjectDiagnosticValue(gpuTexture, "usage")),
            gpuTextureWidth: readNumberDiagnosticValue(readObjectDiagnosticValue(gpuTexture, "width")),
            gpuTextureHeight: readNumberDiagnosticValue(readObjectDiagnosticValue(gpuTexture, "height")),
            engineRenderWidth: Number.isFinite(renderWidth) ? renderWidth : null,
            engineRenderHeight: Number.isFinite(renderHeight) ? renderHeight : null,
            requestedWidth,
            requestedHeight,
        };
    } catch (error: unknown) {
        return {
            source: "engine.readPixels.current-render-pass-color-attachment",
            requestedWidth,
            requestedHeight,
            diagnosticsError: error instanceof Error ? error.message : String(error),
        };
    }
};

type ExportQueueItem = {
    frame: number;
    videoSample: VideoSample;
    release?: (() => void) | null;
    captureTiming?: {
        readbackMs: number;
        pixelTransformMs: number;
        sampleCreationMs: number;
    };
};

type WebmVideoCodec = "vp9" | "vp8";
type WebmAudioCodec = "opus" | "vorbis";
type VideoHardwareAccelerationHint = "no-preference";
type SelectedWebmVideoEncoding = {
    codec: WebmVideoCodec;
    hardwareAcceleration: VideoHardwareAccelerationHint;
};

type FrameCapture = {
    modeLabel: WebmCaptureMode;
    captureFrameAsync: (frame: number, timestamp: number, duration: number) => Promise<ExportQueueItem | null>;
    flushPendingAsync: () => Promise<ExportQueueItem[]>;
    dispose: () => void;
};

const TIMELINE_FPS = 30;
const CAPTURE_TIMEOUT_MS = 8_000;
const PROGRESS_STATUS_MIN_INTERVAL_MS = 200;

const waitForAnimationFrame = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
    });
};

const waitForAnimationFrames = async (count: number): Promise<void> => {
    const frames = Math.max(1, Math.floor(count));
    for (let i = 0; i < frames; i += 1) {
        await waitForAnimationFrame();
    }
};

const sleepMs = async (ms: number): Promise<void> => {
    const delay = Math.max(0, ms);
    await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), delay);
    });
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutHandle = 0;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = window.setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs} ms`));
        }, Math.max(1, timeoutMs));
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        window.clearTimeout(timeoutHandle);
    }
};

const flipRgbaRowsInPlace = (bytes: Uint8Array, width: number, height: number): void => {
    const rowStride = width * 4;
    const swapBuffer = new Uint8Array(rowStride);
    const halfRows = Math.floor(height / 2);
    for (let y = 0; y < halfRows; y += 1) {
        const topStart = y * rowStride;
        const bottomStart = (height - 1 - y) * rowStride;
        swapBuffer.set(bytes.subarray(topStart, topStart + rowStride));
        bytes.copyWithin(topStart, bottomStart, bottomStart + rowStride);
        bytes.set(swapBuffer, bottomStart);
    }
};

const copyBgraToRgba = (
    source: Uint8Array,
    target: Uint8Array,
    width: number,
    height: number,
): void => {
    const pixelCount = width * height;
    for (let i = 0; i < pixelCount; i += 1) {
        const offset = i * 4;
        target[offset + 0] = source[offset + 2];
        target[offset + 1] = source[offset + 1];
        target[offset + 2] = source[offset + 0];
        target[offset + 3] = source[offset + 3];
    }
};

const createCaptureRenderTarget = (
    exportInternals: ExportRuntimeInternals,
    width: number,
    height: number,
): RenderTargetTexture => {
    const renderTarget = new RenderTargetTexture(
        "webm-export-capture",
        { width, height },
        exportInternals.scene,
        false,
        true,
    );
    renderTarget.activeCamera = exportInternals.camera;
    renderTarget.renderList = null;
    renderTarget.samples = 1;
    renderTarget.refreshRate = 1;
    renderTarget.ignoreCameraViewport = true;
    return renderTarget;
};

const createRawRgbaVideoSample = (
    rgbaData: Uint8Array,
    width: number,
    height: number,
    timestamp: number,
    duration: number,
): VideoSample => {
    return new VideoSample(rgbaData, {
        format: "RGBA",
        codedWidth: width,
        codedHeight: height,
        timestamp,
        duration,
    });
};

const createReadPixelsFrameCapture = (
    callbacks: WebmExportCallbacks,
    exportInternals: ExportRuntimeInternals,
    width: number,
    height: number,
): FrameCapture => {
    const renderTarget = createCaptureRenderTarget(exportInternals, width, height);

    return {
        modeLabel: "readpixels",
        captureFrameAsync: async (frame: number, timestamp: number, duration: number): Promise<ExportQueueItem | null> => {
            renderTarget.resetRefreshCounter();
            renderTarget.render(true);
            const readbackStartedAt = performance.now();
            const pixelPromise = renderTarget.readPixels(0, 0, null, true, false, 0, 0, width, height);
            if (!pixelPromise) {
                return null;
            }

            const pixelData = await withTimeout(pixelPromise, CAPTURE_TIMEOUT_MS, "readPixels capture");
            const readbackMs = performance.now() - readbackStartedAt;
            const pixelTransformStartedAt = performance.now();
            const source = pixelData instanceof Uint8Array
                ? pixelData
                : new Uint8Array(pixelData.buffer, pixelData.byteOffset, pixelData.byteLength);
            const rgbaData = new Uint8Array(source);
            flipRgbaRowsInPlace(rgbaData, width, height);
            const pixelTransformMs = performance.now() - pixelTransformStartedAt;
            const sampleCreationStartedAt = performance.now();
            const videoSample = createRawRgbaVideoSample(rgbaData, width, height, timestamp, duration);
            const sampleCreationMs = performance.now() - sampleCreationStartedAt;
            return {
                frame,
                videoSample,
                release: null,
                captureTiming: {
                    readbackMs,
                    pixelTransformMs,
                    sampleCreationMs,
                },
            };
        },
        flushPendingAsync: async (): Promise<ExportQueueItem[]> => [],
        dispose: () => {
            renderTarget.dispose();
        },
    };
};

const createCanvasFrameCapture = (
    callbacks: WebmExportCallbacks,
    canvas: HTMLCanvasElement,
): FrameCapture => {
    return {
        modeLabel: "canvas",
        captureFrameAsync: async (frame: number, timestamp: number, duration: number): Promise<ExportQueueItem> => {
            const sampleCreationStartedAt = performance.now();
            const videoSample = new VideoSample(canvas, {
                timestamp,
                duration,
            });
            return {
                frame,
                videoSample,
                release: null,
                captureTiming: {
                    readbackMs: 0,
                    pixelTransformMs: 0,
                    sampleCreationMs: performance.now() - sampleCreationStartedAt,
                },
            };
        },
        flushPendingAsync: async (): Promise<ExportQueueItem[]> => [],
        dispose: () => {
            // nothing to dispose
        },
    };
};

const createRgbaSurfaceFrameCapture = (
    mmdManager: MmdManager,
): FrameCapture => {
    return {
        modeLabel: "rgba-surface",
        captureFrameAsync: async (frame: number, timestamp: number, duration: number): Promise<ExportQueueItem> => {
            const readbackStartedAt = performance.now();
            const renderedFrame = await mmdManager.readExportRenderFrameAsync();
            const readbackMs = performance.now() - readbackStartedAt;
            const sampleCreationStartedAt = performance.now();
            const videoSample = createRawRgbaVideoSample(
                renderedFrame.pixels,
                renderedFrame.width,
                renderedFrame.height,
                timestamp,
                duration,
            );
            return {
                frame,
                videoSample,
                release: null,
                captureTiming: {
                    readbackMs,
                    pixelTransformMs: 0,
                    sampleCreationMs: performance.now() - sampleCreationStartedAt,
                },
            };
        },
        flushPendingAsync: async (): Promise<ExportQueueItem[]> => [],
        dispose: () => {
            // ExportRenderSurface is owned by MmdManager.
        },
    };
};

const createWebGpuCopyFrameCapture = (
    callbacks: WebmExportCallbacks,
    exportInternals: ExportRuntimeInternals,
    width: number,
    height: number,
): FrameCapture => {
    if (!(exportInternals.engine instanceof WebGPUEngine)) {
        throw new Error("WebGPU copy capture requires a WebGPU engine");
    }

    const engine = exportInternals.engine as WebGPUEngine & {
        _device?: GPUDevice;
        readPixels: (
            x: number,
            y: number,
            width: number,
            height: number,
            hasAlpha?: boolean,
            flushRenderer?: boolean,
            data?: Uint8Array | null,
        ) => Promise<ArrayBufferView>;
    };
    const device = engine._device;
    if (!device) {
        throw new Error("WebGPU device is unavailable for capture");
    }

    const bufferByteLength = width * height * 4;
    const freeRgbaBuffers: Uint8Array[] = [];
    const captureDiagnosticsEnabled = isCaptureDiagnosticsEnabled();
    let captureSourceLogged = false;

    const acquireRgbaBuffer = (): Uint8Array => {
        const existing = freeRgbaBuffers.pop();
        if (existing && existing.byteLength === bufferByteLength) {
            return existing;
        }
        return new Uint8Array(bufferByteLength);
    };

    return {
        modeLabel: "webgpu-copy",
        captureFrameAsync: async (frame: number, timestamp: number, duration: number): Promise<ExportQueueItem | null> => {
            const readbackStartedAt = performance.now();
            engine.flushFramebuffer();
            if (captureDiagnosticsEnabled && !captureSourceLogged) {
                captureSourceLogged = true;
                window.electronAPI.logInfo("performance", "webm capture source diagnostics", {
                    captureMode: "webgpu-copy",
                    frame,
                    explicitFlushBeforeReadPixels: true,
                    readPixelsFlushRenderer: true,
                    ...getWebGpuCaptureSourceDiagnostics(engine, width, height),
                });
            }
            try {
                const sourcePixels = await withTimeout(
                    engine.readPixels(0, 0, width, height, true, true, null).then((data) => {
                        return data instanceof Uint8Array
                            ? data
                            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                    }),
                    CAPTURE_TIMEOUT_MS,
                    "WebGPU copy capture",
                );
                const readbackMs = performance.now() - readbackStartedAt;
                const pixelTransformStartedAt = performance.now();
                const rgbaData = acquireRgbaBuffer();
                copyBgraToRgba(sourcePixels, rgbaData, width, height);
                const pixelTransformMs = performance.now() - pixelTransformStartedAt;
                const sampleCreationStartedAt = performance.now();
                const videoSample = createRawRgbaVideoSample(rgbaData, width, height, timestamp, duration);
                const sampleCreationMs = performance.now() - sampleCreationStartedAt;
                return {
                    frame,
                    videoSample,
                    release: () => {
                        freeRgbaBuffers.push(rgbaData);
                    },
                    captureTiming: {
                        readbackMs,
                        pixelTransformMs,
                        sampleCreationMs,
                    },
                };
            } catch (error: unknown) {
                const detail = error instanceof Error ? error.message : String(error);
                throw new Error(`WebGPU copy capture stalled or failed: ${detail}. Try readPixels (stable) or canvas / VideoFrame.`);
            }
        },
        flushPendingAsync: async (): Promise<ExportQueueItem[]> => {
            return [];
        },
        dispose: () => {
            freeRgbaBuffers.length = 0;
        },
    };
};

const createFrameCapture = (
    callbacks: WebmExportCallbacks,
    captureMode: WebmCaptureMode,
    canvas: HTMLCanvasElement,
    mmdManager: MmdManager,
    exportInternals: ExportRuntimeInternals,
    width: number,
    height: number,
): FrameCapture => {
    switch (captureMode) {
        case "canvas":
            return createCanvasFrameCapture(callbacks, canvas);
        case "rgba-surface":
            return createRgbaSurfaceFrameCapture(mmdManager);
        case "webgpu-copy":
            return createWebGpuCopyFrameCapture(callbacks, exportInternals, width, height);
        case "readpixels":
        default:
            return createReadPixelsFrameCapture(callbacks, exportInternals, width, height);
    }
};

const selectWebmVideoEncoding = async (
    width: number,
    height: number,
    bitrate: number,
    preferredCodec: "auto" | WebmVideoCodec,
): Promise<SelectedWebmVideoEncoding | null> => {
    const codecOrder: WebmVideoCodec[] = preferredCodec === "auto"
        ? ["vp8", "vp9"]
        : [preferredCodec];
    for (const codec of codecOrder) {
        if (await canEncodeVideo(codec, {
            width,
            height,
            bitrate,
            hardwareAcceleration: "no-preference",
        })) {
            return {
                codec,
                hardwareAcceleration: "no-preference",
            };
        }
    }

    for (const codec of codecOrder) {
        if (await canEncode(codec)) {
            return {
                codec,
                hardwareAcceleration: "no-preference",
            };
        }
    }

    return null;
};

const estimateAudioBitrate = (channelCount: number): number => {
    if (channelCount <= 1) {
        return 128_000;
    }
    return 192_000;
};

const selectWebmAudioCodec = async (
    channelCount: number,
    sampleRate: number,
    bitrate: number,
): Promise<WebmAudioCodec | null> => {
    if (await canEncodeAudio("opus", { numberOfChannels: channelCount, sampleRate, bitrate })) {
        return "opus";
    }
    if (await canEncodeAudio("vorbis", { numberOfChannels: channelCount, sampleRate, bitrate })) {
        return "vorbis";
    }
    return null;
};

const readFileAsArrayBuffer = async (filePath: string): Promise<ArrayBuffer | null> => {
    const buffer = await window.electronAPI.readBinaryFile(filePath);
    if (!buffer) {
        return null;
    }

    const bytes = buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer as unknown as ArrayBuffer);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
};

const decodeAudioFile = async (filePath: string): Promise<AudioBuffer> => {
    const arrayBuffer = await readFileAsArrayBuffer(filePath);
    if (!arrayBuffer) {
        throw new Error(`Failed to read audio file: ${filePath}`);
    }

    const audioContext = new AudioContext();
    try {
        return await audioContext.decodeAudioData(arrayBuffer);
    } finally {
        try {
            await audioContext.close();
        } catch {
            // ignore close failures
        }
    }
};

const sliceAudioBuffer = (
    source: AudioBuffer,
    startSeconds: number,
    durationSeconds: number,
): AudioBuffer | null => {
    const sampleRate = Math.max(1, source.sampleRate);
    const startSample = Math.max(0, Math.floor(startSeconds * sampleRate));
    const endSample = Math.min(
        source.length,
        Math.ceil((startSeconds + Math.max(0, durationSeconds)) * sampleRate),
    );

    if (endSample <= startSample) {
        return null;
    }

    const slicedLength = endSample - startSample;
    const slicedBuffer = new AudioBuffer({
        length: slicedLength,
        numberOfChannels: source.numberOfChannels,
        sampleRate,
    });

    for (let channelIndex = 0; channelIndex < source.numberOfChannels; channelIndex += 1) {
        const channelData = source.getChannelData(channelIndex);
        slicedBuffer.copyToChannel(channelData.subarray(startSample, endSample), channelIndex, 0);
    }

    return slicedBuffer;
};

const finalizeWebmOutputWithDiagnostics = async (
    output: Output,
    callbacks: WebmExportCallbacks,
): Promise<void> => {
    const outputInternal = output as Output & {
        _finalizePromise?: Promise<void>;
        _tracks: Array<{ source: { _flushOrWaitForOngoingClose: (force: boolean) => Promise<void> } }>;
        _muxer: { finalize: () => Promise<void> };
        _writer: { flush: () => Promise<void>; finalize: () => Promise<void> };
        _mutex: { acquire: () => Promise<() => void> };
        state: string;
    };

    if (outputInternal.state === "pending") {
        throw new Error("Cannot finalize before starting.");
    }
    if (outputInternal.state === "canceled") {
        throw new Error("Cannot finalize after canceling.");
    }
    if (outputInternal._finalizePromise) {
        return outputInternal._finalizePromise;
    }

    outputInternal._finalizePromise = (async () => {
        outputInternal.state = "finalizing";
        updateStatus(callbacks, "Finalizing WebM: acquiring output mutex...", "finalizing");
        const release = await outputInternal._mutex.acquire();
        try {
            updateStatus(callbacks, "Finalizing WebM: flushing track sources...", "finalizing");
            await Promise.all(outputInternal._tracks.map((track) => track.source._flushOrWaitForOngoingClose(false)));
            updateStatus(callbacks, "Finalizing WebM: finalizing muxer...", "finalizing");
            await outputInternal._muxer.finalize();
            updateStatus(callbacks, "Finalizing WebM: flushing writer...", "finalizing");
            await outputInternal._writer.flush();
            updateStatus(callbacks, "Finalizing WebM: closing writer...", "finalizing");
            await outputInternal._writer.finalize();
            outputInternal.state = "finalized";
            updateStatus(callbacks, "Finalizing WebM: completed.", "finalizing");
        } finally {
            release();
        }
    })();

    return outputInternal._finalizePromise;
};

export async function runWebmExportJob(
    canvas: HTMLCanvasElement,
    request: WebmExportRequest,
    callbacks: WebmExportCallbacks = {},
    enginePreference: RenderEnginePreference = "auto",
    signal?: AbortSignal,
): Promise<WebmExportResult> {
    throwIfWebmExportCanceled(signal);
    if (!window.isSecureContext) {
        throw new Error("WebCodecs requires a secure context");
    }

    const jobStartedAt = performance.now();
    const startFrame = Math.max(0, Math.floor(request.startFrame));
    const endFrame = Math.max(startFrame, Math.floor(request.endFrame));
    const fps = Math.max(1, Math.floor(request.fps || 30));
    const outputWidth = Math.max(320, Math.min(8192, Math.floor(request.outputWidth || 1920)));
    const outputHeight = Math.max(180, Math.min(8192, Math.floor(request.outputHeight || 1080)));
    const timelineFrameCount = endFrame - startFrame + 1;
    if (timelineFrameCount <= 0) {
        throw new Error("No frames to export");
    }
    const totalFrames = Math.max(1, Math.round((timelineFrameCount / TIMELINE_FPS) * fps));
    const exportDurationSeconds = totalFrames / fps;
    const captureMode: WebmCaptureMode = request.captureMode === "canvas"
        || request.captureMode === "rgba-surface"
        || request.captureMode === "webgpu-copy"
        || request.captureMode === "readpixels"
        ? request.captureMode
        : "rgba-surface";

    const maxQueueLength = typeof request.diagnosticQueueLimit === "number"
        && Number.isFinite(request.diagnosticQueueLimit)
        ? Math.max(1, Math.min(64, Math.floor(request.diagnosticQueueLimit)))
        : 16;
    const frameDuration = 1 / fps;

    updateStatus(callbacks, "Initializing WebM export renderer...", "initializing");
    const mmdManager = await MmdManager.create(canvas, enginePreference);
    throwIfWebmExportCanceled(signal);

    try {
        const exportRuntimeInternals = mmdManager as unknown as ExportRuntimeInternals & {
            engine: AbstractEngine & {
                setHardwareScalingLevel?: (level: number) => void;
            };
        };
        exportRuntimeInternals.engine.setHardwareScalingLevel?.(1);
        mmdManager.resize();

        updateStatus(callbacks, "Loading project into export renderer...", "loading-project");
        const importResult = await mmdManager.importProjectState(request.project, { forExport: true });
        throwIfWebmExportCanceled(signal);
        if (request.externalLut) {
            mmdManager.setPostEffectExternalLut(
                request.externalLut.path,
                request.externalLut.runtimeText,
                request.externalLut.sourceFormat,
            );
        }
        const expectedModelCount = request.project.scene.models.length;
        if (importResult.loadedModels < expectedModelCount) {
            const warningText = importResult.warnings.slice(0, 3).join(" | ");
            throw new Error(
                `Project load incomplete (${importResult.loadedModels}/${expectedModelCount}). ${warningText}`
            );
        }
        mmdManager.setCheckerBackgroundPreviewEnabled(false);

        if (captureMode === "rgba-surface") {
            mmdManager.prepareExportRenderSurface(outputWidth, outputHeight);
        }

        mmdManager.setTimelineTarget("camera");
        await waitForAnimationFrames(1);
        throwIfWebmExportCanceled(signal);
        mmdManager.pause();
        mmdManager.setAutoRenderEnabled(false);
        mmdManager.seekTo(startFrame);
        mmdManager.setExternalPlaybackSimulationEnabled(true);
        const restoredInitialPhysics = mmdManager.applyWebmInitialPhysicsState(request.initialPhysicsState);
        if (request.initialPhysicsState && !restoredInitialPhysics) {
            console.warn("[WebM] Initial physics snapshot was provided but could not be restored.");
        }
        if (captureMode !== "readpixels") {
            updateStatus(callbacks, "Preparing post effects for WebM capture...", "initializing");
            const postEffectReady = await mmdManager.waitForPostEffectBackendReadyForCapture();
            throwIfWebmExportCanceled(signal);
            if (!postEffectReady) {
                throw new Error("FrameGraph post effects were not ready for WebM capture");
            }
        }
        if (captureMode === "readpixels") {
            mmdManager.renderOnce(0);
        } else {
            mmdManager.renderOnceForCapture(0);
        }
        await waitForAnimationFrames(1);
        throwIfWebmExportCanceled(signal);

        const videoQuality = getWebmVideoEncodingQuality(outputWidth, outputHeight, fps);
        const videoBitrate = videoQuality.bitrate;

        updateStatus(callbacks, "Checking WebM codec support...", "checking-codec");
        const selectedVideoEncoding = await selectWebmVideoEncoding(
            outputWidth,
            outputHeight,
            videoBitrate,
            request.preferredVideoCodec === "vp8" || request.preferredVideoCodec === "vp9"
                ? request.preferredVideoCodec
                : "auto",
        );
        throwIfWebmExportCanceled(signal);
        if (!selectedVideoEncoding) {
            throw new Error("No supported WebM codec available (vp9/vp8)");
        }
        const { codec, hardwareAcceleration } = selectedVideoEncoding;

        let audioSource: AudioBufferSource | null = null;
        let audioSegment: AudioBuffer | null = null;
        let audioCodec: WebmAudioCodec | null = null;
        let audioSourceClosed = false;
        if (request.includeAudio && request.audioFilePath) {
            updateStatus(callbacks, "Decoding audio for WebM track...", "loading-project");
            const decodedAudio = await decodeAudioFile(request.audioFilePath);
            throwIfWebmExportCanceled(signal);
            audioSegment = sliceAudioBuffer(
                decodedAudio,
                startFrame / TIMELINE_FPS,
                exportDurationSeconds,
            );
            if (!audioSegment) {
                throw new Error("Audio segment is empty for the selected export range");
            }

            const audioBitrate = estimateAudioBitrate(audioSegment.numberOfChannels);
            audioCodec = await selectWebmAudioCodec(
                audioSegment.numberOfChannels,
                audioSegment.sampleRate,
                audioBitrate,
            );
            throwIfWebmExportCanceled(signal);
            if (!audioCodec) {
                throw new Error("No supported WebM audio codec available (opus/vorbis)");
            }

            audioSource = new AudioBufferSource({
                codec: audioCodec,
                bitrate: audioBitrate,
            });
        }

        const frameCapture = createFrameCapture(
            callbacks,
            captureMode,
            canvas,
            mmdManager,
            exportRuntimeInternals,
            outputWidth,
            outputHeight,
        );
        updateStatus(callbacks, "Opening WebM output file...", "opening-output");
        throwIfWebmExportCanceled(signal);
        const saveSession = await window.electronAPI.beginWebmStreamSave(request.outputFilePath);
        if (!saveSession) {
            throw new Error("Failed to open WebM output file");
        }

        let saveSessionId: string | null = saveSession.saveId;
        let savedPath: string | null = null;
        let outputBytes = 0;
        const target = new StreamTarget(new WritableStream({
            write: async (chunk) => {
                throwIfWebmExportCanceled(signal);
                if (!saveSessionId) {
                    throw new Error("WebM output stream is not open");
                }
                const written = await window.electronAPI.writeWebmStreamChunk(
                    saveSessionId,
                    chunk.data,
                    chunk.position,
                );
                if (!written) {
                    throw new Error("Failed to write WebM output chunk");
                }
                outputBytes = Math.max(outputBytes, chunk.position + chunk.data.byteLength);
            },
            close: async () => {
                if (!saveSessionId) {
                    return;
                }
                if (signal?.aborted) {
                    await window.electronAPI.cancelWebmStreamSave(saveSessionId);
                    saveSessionId = null;
                    savedPath = null;
                    return;
                }
                const finishedPath = await window.electronAPI.finishWebmStreamSave(saveSessionId);
                saveSessionId = null;
                if (!finishedPath) {
                    throw new Error("Failed to finalize WebM output file");
                }
                savedPath = finishedPath;
            },
            abort: async () => {
                if (!saveSessionId) {
                    return;
                }
                await window.electronAPI.cancelWebmStreamSave(saveSessionId);
                saveSessionId = null;
            },
        }), {
            chunked: true,
            chunkSize: 4 * 1024 * 1024,
        });
        const output = new Output({
            format: new WebMOutputFormat(),
            target,
        });
        const captureModeLabel = formatCaptureModeLabel(frameCapture.modeLabel);
        const videoSource = new VideoSampleSource({
            codec,
            bitrate: videoBitrate,
            bitrateMode: videoQuality.bitrateMode,
            latencyMode: videoQuality.latencyMode,
            keyFrameInterval: 10,
            hardwareAcceleration,
            onEncoderConfig: () => {
                // Keep encoder config internal; do not expose it in user-facing progress text.
            },
        });

        const queue: ExportQueueItem[] = [];
        let producerDone = false;
        let fatalError: Error | null = null;
        let encodedFrames = 0;
        let capturedFrames = 0;
        let lastProgressStatusAt = 0;
        let renderMsTotal = 0;
        let captureMsTotal = 0;
        let captureReadbackMsTotal = 0;
        let capturePixelTransformMsTotal = 0;
        let sampleCreationMsTotal = 0;
        let encodeWaitMsTotal = 0;
        let queuePeakLength = 0;
        let queueWaitMsTotal = 0;
        let queueWaitCount = 0;

        const reportProgress = (frame: number): void => {
            const now = performance.now();
            const shouldEmitNow =
                encodedFrames <= 1 ||
                encodedFrames === totalFrames ||
                now - lastProgressStatusAt >= PROGRESS_STATUS_MIN_INTERVAL_MS;
            if (!shouldEmitNow) {
                return;
            }
            lastProgressStatusAt = now;
            updateStatus(
                callbacks,
                `WebM出力中 | ${captureModeLabel} | ${encodedFrames}/${totalFrames} フレーム`,
                "encoding",
            );
            callbacks.onProgress?.(encodedFrames, totalFrames, frame, capturedFrames);
        };

        const consumeQueue = async (): Promise<void> => {
            try {
                while (!producerDone || queue.length > 0) {
                    throwIfWebmExportCanceled(signal);
                    if (fatalError) break;
                    const item = queue.shift();
                    if (!item) {
                        await sleepMs(1);
                        continue;
                    }

                    try {
                        const encodeStartedAt = performance.now();
                        await videoSource.add(item.videoSample);
                        throwIfWebmExportCanceled(signal);
                        encodeWaitMsTotal += performance.now() - encodeStartedAt;
                    } finally {
                        item.videoSample.close();
                        item.release?.();
                    }

                    encodedFrames += 1;
                    reportProgress(item.frame);
                }
            } catch (error: unknown) {
                fatalError = error instanceof Error
                    ? error
                    : new Error(`Failed to encode WebM frame: ${String(error)}`);
            }
        };

        let started = false;
        let sourceClosed = false;
        try {
            throwIfWebmExportCanceled(signal);
            output.addVideoTrack(videoSource, {
                frameRate: fps,
                maximumPacketCount: totalFrames,
            });
            if (audioSource) {
                output.addAudioTrack(audioSource);
            }
            await output.start();
            started = true;
            throwIfWebmExportCanceled(signal);

            if (audioSource) {
                if (!audioSegment) {
                    throw new Error("Audio segment missing for WebM export");
                }
                updateStatus(callbacks, `Encoding audio track (${audioCodec ?? "unknown"})...`, "encoding");
                await audioSource.add(audioSegment);
                throwIfWebmExportCanceled(signal);
                audioSource.close();
                audioSourceClosed = true;
            }

            updateStatus(callbacks, `WebM出力を開始します | ${captureModeLabel}`, "encoding");
            const consumerPromise = consumeQueue();

            try {
                let playbackStarted = false;
                for (let outputFrameIndex = 0; outputFrameIndex < totalFrames; outputFrameIndex += 1) {
                    throwIfWebmExportCanceled(signal);
                    if (fatalError) break;

                    if (queue.length >= maxQueueLength) {
                        const queueWaitStartedAt = performance.now();
                        queueWaitCount += 1;
                        while (queue.length >= maxQueueLength && !fatalError) {
                            throwIfWebmExportCanceled(signal);
                            await sleepMs(1);
                        }
                        queueWaitMsTotal += performance.now() - queueWaitStartedAt;
                    }
                    if (fatalError) break;
                    queuePeakLength = Math.max(queuePeakLength, queue.length);

                    const frame = Math.min(
                        endFrame,
                        startFrame + Math.round((outputFrameIndex * TIMELINE_FPS) / fps),
                    );
                    const renderStartedAt = performance.now();
                    if (!playbackStarted) {
                        if (captureMode === "readpixels") {
                            mmdManager.renderOnce(0);
                        } else {
                            mmdManager.renderOnceForCapture(0);
                        }
                        playbackStarted = true;
                    } else {
                        await exportRuntimeInternals.mmdRuntime.playAnimation();

                        if (captureMode === "readpixels") {
                            mmdManager.renderOnce(1000 / fps);
                        } else {
                            mmdManager.renderOnceForCapture(1000 / fps);
                        }
                        exportRuntimeInternals.mmdRuntime.pauseAnimation();
                    }
                    renderMsTotal += performance.now() - renderStartedAt;

                    let capturedItem: ExportQueueItem | null = null;
                    const captureStartedAt = performance.now();
                    try {
                        capturedItem = await frameCapture.captureFrameAsync(frame, outputFrameIndex / fps, frameDuration);
                        throwIfWebmExportCanceled(signal);
                        captureMsTotal += performance.now() - captureStartedAt;
                        const timing = capturedItem?.captureTiming;
                        if (timing) {
                            captureReadbackMsTotal += timing.readbackMs;
                            capturePixelTransformMsTotal += timing.pixelTransformMs;
                            sampleCreationMsTotal += timing.sampleCreationMs;
                        }
                    } catch (error: unknown) {
                        fatalError = error instanceof Error
                            ? error
                            : new Error(`Failed to capture frame ${frame}: ${String(error)}`);
                    }
                    if (capturedItem) {
                        queue.push(capturedItem);
                        queuePeakLength = Math.max(queuePeakLength, queue.length);
                        capturedFrames += 1;
                    }
                }
            } finally {
                if (!fatalError && !signal?.aborted) {
                    try {
                        const pendingItems = await frameCapture.flushPendingAsync();
                        for (const pendingItem of pendingItems) {
                            queue.push(pendingItem);
                            queuePeakLength = Math.max(queuePeakLength, queue.length);
                            capturedFrames += 1;
                        }
                    } catch (error: unknown) {
                        fatalError = error instanceof Error
                            ? error
                            : new Error(`Failed to flush pending capture frames: ${String(error)}`);
                    }
                }
                producerDone = true;
                await consumerPromise;
            }

            if (fatalError) {
                throw fatalError;
            }
            throwIfWebmExportCanceled(signal);

            updateStatus(callbacks, `Closing WebM track (${codec})...`, "closing-track");
            videoSource.close();
            sourceClosed = true;
            throwIfWebmExportCanceled(signal);

            updateStatus(callbacks, `Finalizing WebM (${codec})...`, "finalizing");
            const finalizeStartedAt = performance.now();
            await withTimeout(finalizeWebmOutputWithDiagnostics(output, callbacks), 15_000, "WebM finalize");
            const finalizeMs = performance.now() - finalizeStartedAt;
            if (!savedPath) {
                throw new Error("Failed to save WebM file");
            }

            return {
                encodedFrames,
                totalFrames,
                codec,
                outputBytes,
                diagnostics: {
                    wallClockMs: performance.now() - jobStartedAt,
                    frameCount: encodedFrames,
                    renderMs: renderMsTotal,
                    captureMs: captureMsTotal,
                    captureReadbackMs: captureReadbackMsTotal,
                    capturePixelTransformMs: capturePixelTransformMsTotal,
                    sampleCreationMs: sampleCreationMsTotal,
                    encodeWaitMs: encodeWaitMsTotal,
                    queueLimit: maxQueueLength,
                    queuePeakLength,
                    queueWaitMs: queueWaitMsTotal,
                    queueWaitCount,
                    finalizeMs,
                },
            };
        } finally {
            if (started && output.state !== "finalized" && output.state !== "canceled") {
                try {
                    if (!sourceClosed) {
                        videoSource.close();
                    }
                } catch {
                    // ignore cleanup failures
                }
                try {
                    if (audioSource && !audioSourceClosed) {
                        audioSource.close();
                    }
                } catch {
                    // ignore cleanup failures
                }
                try {
                    await withTimeout(output.cancel(), 5_000, "WebM cancel");
                } catch {
                    // ignore cleanup failures
                }
            }
            if (saveSessionId) {
                try {
                    await window.electronAPI.cancelWebmStreamSave(saveSessionId);
                } catch {
                    // ignore cleanup failures
                }
                saveSessionId = null;
            }
            while (queue.length > 0) {
                const queued = queue.shift();
                queued?.videoSample.close();
            }
            frameCapture.dispose();
        }
    } finally {
        mmdManager.setExternalPlaybackSimulationEnabled(false);
        // This exporter runs in a dedicated hidden window. Synchronous Babylon / physics disposal can stall
        // the renderer after the file is already finalized, so let window teardown reclaim these resources.
    }
}

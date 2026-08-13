import { MmdManager, type RenderEnginePreference } from "./mmd-manager";
import { PngEncoderWebWorkerPool } from "./output/png-encoder-web-worker-pool";
import type { PngSequenceExportDiagnostics, PngSequenceExportRequest } from "./types";

export interface PngSequenceExportCallbacks {
    onStatus?: (message: string) => void;
    onProgress?: (saved: number, total: number, frame: number, captured: number) => void;
    onCompleted?: (result: PngSequenceExportResult) => void | Promise<void>;
}

export interface PngSequenceExportResult {
    exportedFrames: number;
    totalFrames: number;
    diagnostics: PngSequenceExportDiagnostics;
}

export interface PngSequenceExportOptions {
    encoderMode?: "main" | "renderer-worker";
}

type ExportQueueItem = {
    frame: number;
    fileName: string;
    width: number;
    height: number;
    rgbaData: Uint8Array;
};

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

export async function runPngSequenceExportJob(
    canvas: HTMLCanvasElement,
    request: PngSequenceExportRequest,
    callbacks: PngSequenceExportCallbacks = {},
    enginePreference: RenderEnginePreference = "auto",
    options: PngSequenceExportOptions = {},
): Promise<PngSequenceExportResult> {
    const jobStartedAt = performance.now();
    const startFrame = Math.max(0, Math.floor(request.startFrame));
    const endFrame = Math.max(startFrame, Math.floor(request.endFrame));
    const step = Math.max(1, Math.floor(request.step));
    const outputWidth = Math.max(320, Math.min(8192, Math.floor(request.outputWidth || 1920)));
    const outputHeight = Math.max(180, Math.min(8192, Math.floor(request.outputHeight || 1080)));
    const qualityScaleRaw = Number.isFinite(request.precision) ? request.precision : 1;
    const qualityScale = Math.max(0.25, Math.min(4, qualityScaleRaw));
    const captureWidth = Math.max(320, Math.min(8192, Math.round(outputWidth * qualityScale)));
    const captureHeight = Math.max(180, Math.min(8192, Math.round(outputHeight * qualityScale)));
    const prefix = request.prefix?.trim() || "mmd_seq";
    const encoderMode = options.encoderMode ?? "renderer-worker";
    const rawByteBudget = 256 * 1024 * 1024;

    const frameList: number[] = [];
    for (let frame = startFrame; frame <= endFrame; frame += step) {
        frameList.push(frame);
    }
    if (frameList.length === 0) {
        throw new Error("No frames to export");
    }

    canvas.style.width = `${captureWidth}px`;
    canvas.style.height = `${captureHeight}px`;
    canvas.width = captureWidth;
    canvas.height = captureHeight;

    callbacks.onStatus?.("Initializing export renderer...");
    const mmdManager = await MmdManager.create(canvas, enginePreference);
    const encoderPool = encoderMode === "renderer-worker"
        ? new PngEncoderWebWorkerPool(request.exportKind === "single" ? { size: 1 } : undefined)
        : null;

    try {
        callbacks.onStatus?.("Loading project into export renderer...");
        const importResult = await mmdManager.importProjectState(request.project, { forExport: true });
        const expectedModelCount = request.project.scene.models.length;
        if (importResult.loadedModels < expectedModelCount) {
            const warningText = importResult.warnings.slice(0, 3).join(" | ");
            throw new Error(
                `Project load incomplete (${importResult.loadedModels}/${expectedModelCount}). ${warningText}`
            );
        }
        if (importResult.warnings.length > 0) {
            callbacks.onStatus?.(
                `Project loaded with warnings (${importResult.warnings.length})`
            );
        }

        // Export window does not need bone-edit overlay.
        mmdManager.setTimelineTarget("camera");
        mmdManager.setCheckerBackgroundPreviewEnabled(false);
        mmdManager.setExportTransparentBackgroundEnabled(request.transparentBackground === true);

        mmdManager.prepareExportRenderSurface(captureWidth, captureHeight);

        // Let async Babylon resource/state updates settle before freeze-mode export.
        await waitForAnimationFrames(3);
        mmdManager.pause();
        mmdManager.setAutoRenderEnabled(false);
        mmdManager.seekTo(startFrame);
        const postEffectReady = await mmdManager.waitForPostEffectBackendReadyForCapture();
        if (!postEffectReady) {
            throw new Error("Post effects were not ready for PNG sequence capture");
        }

        const padDigits = Math.max(4, String(endFrame).length);
        const totalFrames = frameList.length;
        const ioWorkerCount = encoderPool?.size ?? 4;
        const maxQueueLength = encoderPool ? encoderPool.size * 2 : 24;
        const nextRawByteLength = captureWidth * captureHeight * 4;
        const queue: ExportQueueItem[] = [];
        let capturedCount = 0;
        let savedCount = 0;
        let producerDone = false;
        let fatalError: Error | null = null;
        let seekMsTotal = 0;
        let captureMsTotal = 0;
        let saveIpcMsTotal = 0;
        let encodeMsTotal = 0;
        let saveMsTotal = 0;
        let filterMsTotal = 0;
        let deflateMsTotal = 0;
        let assembleMsTotal = 0;
        let workerDispatchWaitMsTotal = 0;
        let encodedPngBytesTotal = 0;
        let queuedRawBytes = 0;
        let activeRawBytes = 0;
        let queuedRawBytesPeak = 0;
        let activeRawBytesPeak = 0;

        const reportProgress = (frame: number): void => {
            callbacks.onStatus?.(
                `Exporting ${savedCount}/${totalFrames} saved (${capturedCount}/${totalFrames} captured, q=${queue.length})`
            );
            callbacks.onProgress?.(savedCount, totalFrames, frame, capturedCount);
        };

        const consumeQueue = async (): Promise<void> => {
            while (!producerDone || queue.length > 0) {
                if (fatalError) break;
                const item = queue.shift();
                if (!item) {
                    await sleepMs(1);
                    continue;
                }
                const itemRawByteLength = item.rgbaData.byteLength;
                queuedRawBytes -= itemRawByteLength;
                activeRawBytes += itemRawByteLength;
                activeRawBytesPeak = Math.max(activeRawBytesPeak, activeRawBytes);

                try {
                    if (encoderPool) {
                        const encoded = await encoderPool.encode(item.rgbaData, item.width, item.height);
                        encodeMsTotal += encoded.encodeMs;
                        filterMsTotal += encoded.filterMs;
                        deflateMsTotal += encoded.deflateMs;
                        assembleMsTotal += encoded.assembleMs;
                        workerDispatchWaitMsTotal += encoded.dispatchWaitMs;

                        const saveStartedAt = performance.now();
                        const saveResult = await window.electronAPI.savePngBytesFileToPath(
                            encoded.pngBuffer,
                            request.outputDirectoryPath,
                            item.fileName,
                        );
                        saveIpcMsTotal += performance.now() - saveStartedAt;
                        if (!saveResult) {
                            throw new Error(`Failed to save frame ${item.frame}`);
                        }
                        saveMsTotal += saveResult.saveMs;
                        encodedPngBytesTotal += saveResult.byteLength;
                    } else {
                        const saveStartedAt = performance.now();
                        const saveResult = await window.electronAPI.savePngRgbaFileToPath(
                            item.rgbaData,
                            item.width,
                            item.height,
                            request.outputDirectoryPath,
                            item.fileName,
                        );
                        saveIpcMsTotal += performance.now() - saveStartedAt;
                        if (!saveResult) {
                            throw new Error(`Failed to save frame ${item.frame}`);
                        }
                        encodeMsTotal += saveResult.encodeMs;
                        saveMsTotal += saveResult.saveMs;
                        encodedPngBytesTotal += saveResult.byteLength;
                    }

                    savedCount += 1;
                    reportProgress(item.frame);
                } catch (error: unknown) {
                    fatalError = error instanceof Error ? error : new Error(String(error));
                } finally {
                    activeRawBytes -= itemRawByteLength;
                }
            }
        };

        callbacks.onStatus?.(
            `Exporting ${frameList.length} frame(s) with ${encoderMode}... (${captureWidth}x${captureHeight})`
        );
        const consumerPromises: Promise<void>[] = [];
        for (let i = 0; i < ioWorkerCount; i += 1) {
            consumerPromises.push(consumeQueue());
        }

        try {
            for (let i = 0; i < frameList.length; i += 1) {
                if (fatalError) break;

                while (
                    (
                        queue.length >= maxQueueLength
                        || (
                            queuedRawBytes + activeRawBytes + nextRawByteLength > rawByteBudget
                            && queuedRawBytes + activeRawBytes > 0
                        )
                    )
                    && !fatalError
                ) {
                    await sleepMs(1);
                }
                if (fatalError) break;

                const frame = frameList[i];
                const seekStartedAt = performance.now();
                mmdManager.seekTo(frame);
                seekMsTotal += performance.now() - seekStartedAt;

                const captureStartedAt = performance.now();
                mmdManager.renderOnceForCapture(0);
                const capturedFrame = await mmdManager.readExportRenderFrameAsync(
                    request.transparentBackground === true ? "straight" : "opaque",
                );
                captureMsTotal += performance.now() - captureStartedAt;

                const fileName = request.exportKind === "single" && request.singleFileName
                    ? request.singleFileName
                    : `${prefix}_${String(frame).padStart(padDigits, "0")}.png`;
                queue.push({
                    frame,
                    fileName,
                    width: capturedFrame.width,
                    height: capturedFrame.height,
                    rgbaData: capturedFrame.pixels,
                });
                queuedRawBytes += capturedFrame.pixels.byteLength;
                queuedRawBytesPeak = Math.max(queuedRawBytesPeak, queuedRawBytes);
                capturedCount += 1;
            }
        } finally {
            producerDone = true;
            await Promise.all(consumerPromises);
        }

        if (fatalError) {
            throw fatalError;
        }

        const poolDiagnostics = encoderPool?.getDiagnostics();
        const result: PngSequenceExportResult = {
            exportedFrames: savedCount,
            totalFrames,
            diagnostics: {
                wallClockMs: performance.now() - jobStartedAt,
                frameCount: savedCount,
                seekMs: seekMsTotal,
                captureMs: captureMsTotal,
                saveIpcMs: saveIpcMsTotal,
                encodeMs: encodeMsTotal,
                saveMs: saveMsTotal,
                encoderMode,
                filterStrategy: encoderPool ? "none" : "native-image",
                filterMs: filterMsTotal,
                deflateMs: deflateMsTotal,
                assembleMs: assembleMsTotal,
                workerDispatchWaitMs: workerDispatchWaitMsTotal,
                encodedPngBytes: encodedPngBytesTotal,
                workerPoolSize: poolDiagnostics?.poolSize ?? 0,
                queuedRawBytesPeak: Math.max(
                    queuedRawBytesPeak,
                    poolDiagnostics?.queuedRawBytesPeak ?? 0,
                ),
                activeRawBytesPeak: Math.max(
                    activeRawBytesPeak,
                    poolDiagnostics?.activeRawBytesPeak ?? 0,
                ),
                workerRecreateCount: poolDiagnostics?.workerRecreateCount ?? 0,
            },
        };
        await callbacks.onCompleted?.(result);
        return result;
    } finally {
        encoderPool?.terminate();
        mmdManager.setAutoRenderEnabled(true);
        // This exporter runs in a dedicated hidden window. Synchronous Babylon / physics disposal can
        // stall after the files are already saved, so let window teardown reclaim these resources.
    }
}

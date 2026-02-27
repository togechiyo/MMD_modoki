import { MmdManager } from "./mmd-manager";
import { CreateScreenshotUsingRenderTargetAsync } from "@babylonjs/core/Misc/screenshotTools";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { PngSequenceExportRequest } from "./types";

export interface PngSequenceExportCallbacks {
    onStatus?: (message: string) => void;
    onProgress?: (saved: number, total: number, frame: number, captured: number) => void;
}

export interface PngSequenceExportResult {
    exportedFrames: number;
    totalFrames: number;
}

type ExportQueueItem = {
    frame: number;
    fileName: string;
    width: number;
    height: number;
    rgbaData: Uint8Array;
};

type ScreenshotInternals = {
    engine: AbstractEngine;
    camera: Camera;
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

const captureFrameRgbaAsync = async (
    screenshotInternals: ScreenshotInternals,
    outputWidth: number,
    outputHeight: number,
): Promise<{ width: number; height: number; rgbaData: Uint8Array } | null> => {
    let captured: { width: number; height: number; rgbaData: Uint8Array } | null = null;

    await CreateScreenshotUsingRenderTargetAsync(
        screenshotInternals.engine,
        screenshotInternals.camera,
        { width: outputWidth, height: outputHeight },
        "image/png",
        1,
        false,
        undefined,
        false,
        false,
        true,
        undefined,
        undefined,
        (
            width,
            height,
            data,
            successCallback,
            _mimeType,
            _fileName,
            invertY
        ) => {
            const source = data instanceof Uint8Array
                ? data
                : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
            const rgbaData = new Uint8Array(source);
            if (invertY) {
                flipRgbaRowsInPlace(rgbaData, width, height);
            }
            captured = { width, height, rgbaData };
            successCallback?.("");
        }
    );

    return captured;
};

export async function runPngSequenceExportJob(
    canvas: HTMLCanvasElement,
    request: PngSequenceExportRequest,
    callbacks: PngSequenceExportCallbacks = {},
): Promise<PngSequenceExportResult> {
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
    // Speed-priority export tuning:
    // - keep a larger capture queue
    // - save files in parallel workers
    // - disable screenshot antialiasing
    const maxQueueLength = 24;
    const ioWorkerCount = 4;

    const frameList: number[] = [];
    for (let frame = startFrame; frame <= endFrame; frame += step) {
        frameList.push(frame);
    }
    if (frameList.length === 0) {
        throw new Error("No frames to export");
    }

    callbacks.onStatus?.("Initializing export renderer...");
    const mmdManager = await MmdManager.create(canvas);

    try {
        callbacks.onStatus?.("Loading project into export renderer...");
        const importResult = await mmdManager.importProjectState(request.project);
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

        // Let async Babylon resource/state updates settle before freeze-mode export.
        await waitForAnimationFrames(3);
        mmdManager.pause();
        mmdManager.setAutoRenderEnabled(false);
        mmdManager.seekTo(startFrame);
        const screenshotInternals = mmdManager as unknown as ScreenshotInternals;

        const padDigits = Math.max(4, String(endFrame).length);
        const totalFrames = frameList.length;
        const queue: ExportQueueItem[] = [];
        let capturedCount = 0;
        let savedCount = 0;
        let producerDone = false;
        let fatalError: Error | null = null;

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

                const savedPath = await window.electronAPI.savePngRgbaFileToPath(
                    item.rgbaData,
                    item.width,
                    item.height,
                    request.outputDirectoryPath,
                    item.fileName
                );
                if (!savedPath) {
                    fatalError = new Error(`Failed to save frame ${item.frame}`);
                    break;
                }

                savedCount += 1;
                reportProgress(item.frame);
            }
        };

        callbacks.onStatus?.(
            `Exporting ${frameList.length} frame(s) in speed-priority mode... (${captureWidth}x${captureHeight})`
        );
        const consumerPromises: Promise<void>[] = [];
        for (let i = 0; i < ioWorkerCount; i += 1) {
            consumerPromises.push(consumeQueue());
        }

        try {
            for (let i = 0; i < frameList.length; i += 1) {
                if (fatalError) break;

                while (queue.length >= maxQueueLength && !fatalError) {
                    await sleepMs(1);
                }
                if (fatalError) break;

                const frame = frameList[i];
                mmdManager.seekTo(frame);

                const capturedFrame = await captureFrameRgbaAsync(
                    screenshotInternals,
                    captureWidth,
                    captureHeight,
                );
                if (!capturedFrame) {
                    fatalError = new Error(`Failed to capture frame ${frame}`);
                    break;
                }

                const fileName = `${prefix}_${String(frame).padStart(padDigits, "0")}.png`;
                queue.push({
                    frame,
                    fileName,
                    width: capturedFrame.width,
                    height: capturedFrame.height,
                    rgbaData: capturedFrame.rgbaData,
                });
                capturedCount += 1;
            }
        } finally {
            producerDone = true;
            await Promise.all(consumerPromises);
        }

        if (fatalError) {
            throw fatalError;
        }

        return {
            exportedFrames: savedCount,
            totalFrames,
        };
    } finally {
        mmdManager.setAutoRenderEnabled(true);
        mmdManager.dispose();
    }
}

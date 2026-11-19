import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { _CommonDispose } from "@babylonjs/core/Engines/engine.common";
import { WebGPUEngine, type WebGPUEngineOptions } from "@babylonjs/core/Engines/webgpuEngine";
import { logWarn, toLogErrorData } from "../app-logger";

type PartialWebGpuResources = {
    _isDisposed: boolean;
    _timestampQuery?: { dispose(): void };
    _mainTexture?: { destroy(): void };
    _depthTexture?: { destroy(): void };
    _textureHelper?: { destroyDeferredTextures(): void };
    _bufferManager?: { destroyDeferredBuffers(): void };
    _device?: { destroy(): void };
};

/** Babylon 9.2.0's normal dispose assumes initAsync has created every GPU helper. */
function disposeFailedInitialization(engine: WebGPUEngine, canvas: HTMLCanvasElement): void {
    const partial = engine as unknown as PartialWebGpuResources;
    // Set this before destroying a device so its lost callback cannot restart initialization.
    partial._isDisposed = true;
    const cleanup = (resource: string, release: () => void): void => {
        try {
            release();
        } catch (error: unknown) {
            // Preserve the original startup failure, but retain diagnostics for cleanup failures.
            logWarn("shader", "failed WebGPU initialization cleanup", { resource, ...toLogErrorData(error) });
        }
    };
    // Keep the failed-init adapter aligned with WebGPUEngine.dispose when upgrading Babylon.
    cleanup("loading UI", () => engine.hideLoadingUI());
    cleanup("timestamp query", () => partial._timestampQuery?.dispose());
    cleanup("main texture", () => partial._mainTexture?.destroy());
    cleanup("depth texture", () => partial._depthTexture?.destroy());
    cleanup("deferred textures", () => partial._textureHelper?.destroyDeferredTextures());
    cleanup("deferred buffers", () => partial._bufferManager?.destroyDeferredBuffers());
    cleanup("device", () => partial._device?.destroy());
    cleanup("DOM listeners", () => _CommonDispose(engine, canvas));
    cleanup("engine registration", () => AbstractEngine.prototype.dispose.call(engine));
}

export async function createInitializedWebGpuEngine(
    canvas: HTMLCanvasElement,
    options: WebGPUEngineOptions,
): Promise<WebGPUEngine> {
    const engine = new WebGPUEngine(canvas, options);
    try {
        // Babylon 9.2.0 CreateAsync does not forward initAsync rejection to its outer promise.
        // Await initAsync directly so the caller can select WebGL after device creation fails.
        await engine.initAsync(options.glslangOptions, options.twgslOptions);
        return engine;
    } catch (error: unknown) {
        disposeFailedInitialization(engine, canvas);
        throw error;
    }
}

import { Constants } from "@babylonjs/core/Engines/constants";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { InternalTexture } from "@babylonjs/core/Materials/Textures/internalTexture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

export type RenderedExportFrame = {
    width: number;
    height: number;
    pixels: Uint8Array;
    format: "RGBA";
    rowOrder: "top-to-bottom";
    alphaMode: "straight" | "opaque";
    colorSpace: "srgb";
};

export type ExportRenderSurfaceDiagnostics = {
    width: number;
    height: number;
    format: "rgba8unorm";
    samples: 1;
    readbackCount: number;
};

const DEFAULT_READBACK_TIMEOUT_MS = 8_000;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = globalThis.setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs} ms`));
        }, Math.max(1, timeoutMs));
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutHandle !== undefined) {
            globalThis.clearTimeout(timeoutHandle);
        }
    }
};

export const normalizeExportRgbaRows = (
    source: ArrayBufferView,
    width: number,
    height: number,
): Uint8Array => {
    const normalizedWidth = Math.max(1, Math.floor(width));
    const normalizedHeight = Math.max(1, Math.floor(height));
    const expectedByteLength = normalizedWidth * normalizedHeight * 4;
    if (source.byteLength < expectedByteLength) {
        throw new Error(
            `RGBA readback is too small (${source.byteLength}/${expectedByteLength} bytes)`,
        );
    }

    const input = new Uint8Array(source.buffer, source.byteOffset, expectedByteLength);
    const output = new Uint8Array(expectedByteLength);
    const rowStride = normalizedWidth * 4;
    for (let y = 0; y < normalizedHeight; y += 1) {
        const sourceStart = (normalizedHeight - 1 - y) * rowStride;
        output.set(input.subarray(sourceStart, sourceStart + rowStride), y * rowStride);
    }
    return output;
};

export const unpremultiplyExportRgba = (pixels: Uint8Array): Uint8Array => {
    for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
        const alpha = pixels[offset + 3];
        if (alpha === 0) {
            pixels[offset] = 0;
            pixels[offset + 1] = 0;
            pixels[offset + 2] = 0;
            continue;
        }
        if (alpha === 255) continue;
        const scale = 255 / alpha;
        pixels[offset] = Math.min(255, Math.round(pixels[offset] * scale));
        pixels[offset + 1] = Math.min(255, Math.round(pixels[offset + 1] * scale));
        pixels[offset + 2] = Math.min(255, Math.round(pixels[offset + 2] * scale));
    }
    return pixels;
};

export class ExportRenderSurface {
    public readonly renderTarget: RenderTargetTexture;
    private readbackCount = 0;
    private disposed = false;

    constructor(
        scene: Scene,
        camera: Camera,
        public readonly width: number,
        public readonly height: number,
    ) {
        this.renderTarget = new RenderTargetTexture(
            "mmdModokiExportRenderSurface",
            { width, height },
            scene,
            {
                generateMipMaps: false,
                doNotChangeAspectRatio: true,
                type: Constants.TEXTURETYPE_UNSIGNED_BYTE,
                samplingMode: Texture.BILINEAR_SAMPLINGMODE,
                generateDepthBuffer: true,
                generateStencilBuffer: true,
                format: Constants.TEXTUREFORMAT_RGBA,
                samples: 1,
                useSRGBBuffer: false,
                gammaSpace: true,
            },
        );
        this.renderTarget.activeCamera = camera;
        this.renderTarget.renderList = null;
        this.renderTarget.samples = 1;
        this.renderTarget.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME;
        this.renderTarget.ignoreCameraViewport = true;
        this.renderTarget.renderParticles = true;
        this.renderTarget.renderSprites = true;
    }

    public getInternalTexture(): InternalTexture {
        const texture = this.renderTarget.getInternalTexture();
        if (!texture) {
            throw new Error("Export render surface texture is unavailable");
        }
        return texture;
    }

    public getDiagnostics(): ExportRenderSurfaceDiagnostics {
        return {
            width: this.width,
            height: this.height,
            format: "rgba8unorm",
            samples: 1,
            readbackCount: this.readbackCount,
        };
    }

    public async readFrameAsync(
        alphaMode: RenderedExportFrame["alphaMode"] = "opaque",
        timeoutMs = DEFAULT_READBACK_TIMEOUT_MS,
    ): Promise<RenderedExportFrame> {
        if (this.disposed) {
            throw new Error("Export render surface has been disposed");
        }
        const readback = this.renderTarget.readPixels(
            0,
            0,
            null,
            true,
            false,
            0,
            0,
            this.width,
            this.height,
        );
        if (!readback) {
            throw new Error("Export render surface readback is unavailable");
        }
        const data = await withTimeout(readback, timeoutMs, "Export render surface readback");
        this.readbackCount += 1;
        const pixels = normalizeExportRgbaRows(data, this.width, this.height);
        if (alphaMode === "straight") {
            unpremultiplyExportRgba(pixels);
        }
        return {
            width: this.width,
            height: this.height,
            pixels,
            format: "RGBA",
            rowOrder: "top-to-bottom",
            alphaMode,
            colorSpace: "srgb",
        };
    }

    public dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.renderTarget.dispose();
    }
}

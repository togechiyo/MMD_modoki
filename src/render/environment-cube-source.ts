import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Tools } from "@babylonjs/core/Misc/tools";
import { GetEnvInfo } from "@babylonjs/core/Misc/environmentTextureTools";
import type { Scene } from "@babylonjs/core/scene";

/** DDS environment input must contain all six square faces and roughness mipmaps. */
export function validateEnvironmentDds(data: ArrayBuffer): void {
    if (data.byteLength < 128) throw new Error("DDS header is incomplete");
    const header = new DataView(data);
    if (header.getUint32(0, true) !== 0x20534444 || header.getUint32(4, true) !== 124) {
        throw new Error("Invalid DDS header");
    }
    const height = header.getUint32(12, true);
    const width = header.getUint32(16, true);
    const caps2 = header.getUint32(112, true);
    if (!width || width !== height || (caps2 & 0xfe00) !== 0xfe00) {
        throw new Error("Environment DDS must be a complete square cubemap");
    }
    if (header.getUint32(28, true) < 2) {
        throw new Error("Environment DDS requires prefiltered mipmaps");
    }
}

export async function loadEnvironmentCube(url: string, extension: ".env" | ".dds", scene: Scene): Promise<CubeTexture> {
    const data = await Tools.LoadFileAsync(url, true);
    if (extension === ".dds") validateEnvironmentDds(data);
    // The Babylon ENV loader parses before its upload try/catch. Catch malformed
    // manifests here so the UI can keep the previous environment and report failure.
    else if (!GetEnvInfo(new Uint8Array(data))) throw new Error("Invalid environment map");
    return new Promise((resolve, reject) => {
        const texture = new CubeTexture(url, scene, {
            prefiltered: true,
            forcedExtension: extension,
            createPolynomials: true,
            onLoad: () => queueMicrotask(() => resolve(texture)),
            onError: (message, exception) => {
                queueMicrotask(() => {
                    texture.dispose();
                    reject(exception instanceof Error ? exception : new Error(message ?? "Environment cube load failed"));
                });
            },
        });
        texture.gammaSpace = false;
    });
}

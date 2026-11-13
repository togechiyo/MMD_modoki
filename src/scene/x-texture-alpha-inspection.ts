import type { Scene } from "@babylonjs/core/scene";
import { LoadFile, LoadImage } from "@babylonjs/core/Misc/fileTools";
import type { IFileRequest } from "@babylonjs/core/Misc/fileRequest";
import { classifyOpaqueBmp, classifyRgbaAlpha, getStaticPngSize, X_ALPHA_STRIP_ROWS, type XTextureAlpha } from "../shared/x-texture-alpha";

/** Load-time PNG alpha inspection and RGB24 BMP validation. Unknown formats retain cutout. */
export function inspectXTextureAlpha(url: string, scene: Scene): Promise<XTextureAlpha> {
    return new Promise(resolve => {
        let settled = false;
        let request: IFileRequest | undefined;
        let imageUrl: string | null = null;
        const finish = (result: XTextureAlpha): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (imageUrl) { URL.revokeObjectURL(imageUrl); imageUrl = null; }
            resolve(result);
        };
        const timeout = setTimeout(() => {
            finish("unknown");
            request?.abort();
        }, 5000);
        try {
            request = LoadFile(url, data => {
                if (settled) return;
                if (!(data instanceof ArrayBuffer)) { finish("unknown"); return; }
                const bytes = new Uint8Array(data);
                if (scene.isDisposed) { finish("unknown"); return; }
                if (bytes[0] === 0x42 && bytes[1] === 0x4d) { finish(classifyOpaqueBmp(bytes)); return; }
                const size = getStaticPngSize(bytes);
                if (!size || scene.isDisposed) { finish("unknown"); return; }
                try {
                    // Own this URL: Babylon 9.2 only revokes its ArrayBuffer URL on
                    // successful bitmap decode, so failed decode must be cleaned up here.
                    imageUrl = URL.createObjectURL(new Blob([data], { type: "image/png" }));
                    LoadImage(imageUrl, image => {
                        let canvas: HTMLCanvasElement | null = null;
                        try {
                            if (settled || scene.isDisposed) { finish("unknown"); return; }
                            const width = "naturalWidth" in image ? image.naturalWidth : image.width;
                            const height = "naturalHeight" in image ? image.naturalHeight : image.height;
                            if (width !== size.width || height !== size.height) { finish("unknown"); return; }
                            canvas = document.createElement("canvas");
                            canvas.width = width;
                            canvas.height = Math.min(height, X_ALPHA_STRIP_ROWS);
                            const context = canvas.getContext("2d", { willReadFrequently: true });
                            if (!context) { finish("unknown"); return; }
                            for (let y = 0; y < height; y += X_ALPHA_STRIP_ROWS) {
                                const rows = Math.min(X_ALPHA_STRIP_ROWS, height - y);
                                context.clearRect(0, 0, width, rows);
                                context.drawImage(image, 0, y, width, rows, 0, 0, width, rows);
                                const alpha = classifyRgbaAlpha(context.getImageData(0, 0, width, rows).data, width * rows);
                                if (alpha !== "opaque") { finish(alpha); return; }
                            }
                            finish("opaque");
                        } catch {
                            // Decode/canvas access is optional; unknown retains the old cutout path.
                            finish("unknown");
                        } finally {
                            if (canvas) { canvas.width = 0; canvas.height = 0; }
                            if ("close" in image) image.close();
                        }
                    }, () => finish("unknown"), scene.offlineProvider, "image/png", undefined, scene.getEngine());
                } catch {
                    finish("unknown");
                }
            }, undefined, scene.offlineProvider ?? undefined, true, () => finish("unknown"));
        } catch {
            finish("unknown");
        }
    });
}

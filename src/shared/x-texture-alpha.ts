export type XTextureAlpha = "opaque" | "alpha" | "unknown";
export const X_ALPHA_MAX_DIMENSION = 8192;
export const X_ALPHA_MAX_ENCODED_BYTES = 64 * 1024 * 1024;
export const X_ALPHA_STRIP_ROWS = 128;

/** RGB24 BI_RGB has no alpha channel. Validate its complete padded pixel array before certifying it. */
export function classifyOpaqueBmp(bytes: Uint8Array): XTextureAlpha {
    if (bytes.length < 54 || bytes.length > X_ALPHA_MAX_ENCODED_BYTES || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return "unknown";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Other DIB layouts, palettes, compression and alpha-capable 32-bit BMPs retain cutout.
    if (view.getUint32(14, true) !== 40 || view.getUint16(26, true) !== 1 || view.getUint16(28, true) !== 24
        || view.getUint32(30, true) !== 0 || view.getUint32(6, true) !== 0 || view.getUint32(46, true) !== 0) return "unknown";
    const width = view.getInt32(18, true), height = Math.abs(view.getInt32(22, true));
    if (width <= 0 || width > X_ALPHA_MAX_DIMENSION || !height || height > X_ALPHA_MAX_DIMENSION) return "unknown";
    const fileSize = view.getUint32(2, true), pixelOffset = view.getUint32(10, true);
    const pixelBytes = Math.ceil(width * 3 / 4) * 4 * height, imageSize = view.getUint32(34, true);
    if (fileSize > bytes.length || pixelOffset < 54 || pixelOffset + pixelBytes > fileSize) return "unknown";
    // BI_RGB permits sizeImage=0. Some writers include trailing padding in it;
    // that is harmless if all rows and the declared image bytes are present.
    if (imageSize !== 0 && (imageSize < pixelBytes || pixelOffset + imageSize > fileSize)) return "unknown";
    return "opaque";
}

/** Reject animation, oversized dimensions and incomplete chunks before decoding; the browser validates image data. */
export function getStaticPngSize(bytes: Uint8Array): { width: number; height: number } | null {
    if (bytes.length < 45 || bytes.length > X_ALPHA_MAX_ENCODED_BYTES) return null;
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (signature.some((value, index) => bytes[index] !== value)) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let size: { width: number; height: number } | null = null;
    let hasImageData = false;
    for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = view.getUint32(offset), end = offset + length + 12;
        if (end > bytes.length) return null;
        const type = view.getUint32(offset + 4);
        if (type === 0x6163544c) return null; // acTL: APNG stays conservatively cutout.
        if (offset === 8) {
            if (type !== 0x49484452 || length !== 13) return null; // IHDR
            const width = view.getUint32(offset + 8), height = view.getUint32(offset + 12);
            if (!width || !height || width > X_ALPHA_MAX_DIMENSION || height > X_ALPHA_MAX_DIMENSION) return null;
            size = { width, height };
        } else if (type === 0x49484452) return null;
        if (type === 0x49444154) hasImageData = true; // IDAT
        if (type === 0x49454e44) return length === 0 && end === bytes.length && hasImageData ? size : null; // IEND
        offset = end;
    }
    return null;
}

/** No downsampling or percentage threshold: one nonopaque texel keeps cutout. */
export function classifyRgbaAlpha(bytes: Uint8Array | Uint8ClampedArray, pixels: number): XTextureAlpha {
    if (!Number.isSafeInteger(pixels) || pixels <= 0 || bytes.length !== pixels * 4) return "unknown";
    for (let index = 3; index < bytes.length; index += 4) if (bytes[index] !== 255) return "alpha";
    return "opaque";
}

/** One import owns this cache; a later import may observe changed file contents. */
export function createXTextureAlphaCache(inspect: (url: string) => Promise<XTextureAlpha>): (url: string) => Promise<XTextureAlpha> {
    const pending = new Map<string, Promise<XTextureAlpha>>();
    return url => {
        let result = pending.get(url);
        if (!result) {
            result = Promise.resolve().then(() => inspect(url)).catch((): XTextureAlpha => "unknown");
            pending.set(url, result);
        }
        return result;
    };
}

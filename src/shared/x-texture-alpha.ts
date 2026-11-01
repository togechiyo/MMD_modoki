export type XTextureAlpha = "opaque" | "alpha" | "unknown";
export const X_ALPHA_MAX_DIMENSION = 8192;
export const X_ALPHA_MAX_ENCODED_BYTES = 64 * 1024 * 1024;
export const X_ALPHA_STRIP_ROWS = 128;

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

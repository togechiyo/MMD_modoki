export type DecodedBmpTexture = {
    width: number;
    height: number;
    rgba: Uint8Array;
    hasAlpha: boolean;
    minAlpha: number;
    maxAlpha: number;
    transparentPixelRatio: number;
    lowAlphaPixelRatio: number;
    whiteMattedAlpha: boolean;
};

const BMP_MAGIC = 0x4d42;
const BITMAPINFOHEADER_SIZE = 40;
const BI_RGB = 0;
const RGB_BLEED_ALPHA_THRESHOLD = 128;

export function isBmpTexturePath(path: string): boolean {
    const withoutQuery = path.split(/[?#]/, 1)[0] ?? path;
    return withoutQuery.toLowerCase().endsWith(".bmp");
}

export async function loadBmpTextureWithAlphaCorrection<T>(
    data: ArrayBuffer,
    loadOfficial: () => Promise<T | null>,
    createDecoded: (decoded: DecodedBmpTexture) => Promise<T | null>,
): Promise<T | null> {
    const decoded = decodeBmpTextureToRgba(data);
    if (decoded?.whiteMattedAlpha) return createDecoded(decoded);
    const officialTexture = await loadOfficial();
    if (officialTexture) return officialTexture;
    return decoded?.hasAlpha ? createDecoded(decoded) : null;
}

export function decodeBmpTextureToRgba(data: ArrayBuffer | ArrayBufferView): DecodedBmpTexture | null {
    const view = data instanceof ArrayBuffer
        ? new DataView(data)
        : new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.byteLength < 54) return null;
    if (view.getUint16(0, true) !== BMP_MAGIC) return null;

    const dataOffset = view.getUint32(10, true);
    const dibHeaderSize = view.getUint32(14, true);
    if (dibHeaderSize < BITMAPINFOHEADER_SIZE) return null;

    const width = view.getInt32(18, true);
    const signedHeight = view.getInt32(22, true);
    const planes = view.getUint16(26, true);
    const bitsPerPixel = view.getUint16(28, true);
    const compression = view.getUint32(30, true);
    if (planes !== 1 || width <= 0 || signedHeight === 0) return null;
    if (bitsPerPixel !== 32 || compression !== BI_RGB) return null;

    const height = Math.abs(signedHeight);
    const topDown = signedHeight < 0;
    const rowStride = width * 4;
    const requiredBytes = dataOffset + rowStride * height;
    if (requiredBytes > view.byteLength) return null;

    const rgba = new Uint8Array(width * height * 4);
    let hasAlpha = false;
    let minAlpha = 255;
    let maxAlpha = 0;
    let transparentPixelCount = 0;
    let lowAlphaPixelCount = 0;

    for (let y = 0; y < height; y += 1) {
        const sourceY = topDown ? y : height - 1 - y;
        const sourceRow = dataOffset + sourceY * rowStride;
        const targetRow = y * width * 4;
        for (let x = 0; x < width; x += 1) {
            const source = sourceRow + x * 4;
            const target = targetRow + x * 4;
            const alpha = view.getUint8(source + 3);
            rgba[target] = view.getUint8(source + 2);
            rgba[target + 1] = view.getUint8(source + 1);
            rgba[target + 2] = view.getUint8(source);
            rgba[target + 3] = alpha;
            hasAlpha ||= alpha < 255;
            minAlpha = Math.min(minAlpha, alpha);
            maxAlpha = Math.max(maxAlpha, alpha);
            if (alpha === 0) transparentPixelCount += 1;
            if (alpha > 0 && alpha < RGB_BLEED_ALPHA_THRESHOLD) lowAlphaPixelCount += 1;
        }
    }

    const whiteMattedAlpha = looksWhiteMattedAlphaTexture(rgba);
    if (whiteMattedAlpha) {
        unmatteWhiteRgb(rgba);
    }
    bleedTransparentRgbFromAlpha(rgba, width, height);
    const pixelCount = width * height;

    return {
        width,
        height,
        rgba,
        hasAlpha,
        minAlpha,
        maxAlpha,
        transparentPixelRatio: transparentPixelCount / pixelCount,
        lowAlphaPixelRatio: lowAlphaPixelCount / pixelCount,
        whiteMattedAlpha,
    };
}

function looksWhiteMattedAlphaTexture(rgba: Uint8Array): boolean {
    let transparentCount = 0;
    let transparentRgb = 0;
    let lowAlphaCount = 0;
    let lowAlphaRgb = 0;

    for (let index = 0; index < rgba.length; index += 4) {
        const alpha = rgba[index + 3];
        if (alpha === 0) {
            transparentCount += 1;
            transparentRgb += rgba[index] + rgba[index + 1] + rgba[index + 2];
        } else if (alpha < RGB_BLEED_ALPHA_THRESHOLD) {
            lowAlphaCount += 1;
            lowAlphaRgb += rgba[index] + rgba[index + 1] + rgba[index + 2];
        }
    }

    if (transparentCount < 64 || lowAlphaCount < 16) return false;

    const transparentAverage = transparentRgb / (transparentCount * 3);
    const lowAlphaAverage = lowAlphaRgb / (lowAlphaCount * 3);
    return transparentAverage >= 245 && lowAlphaAverage >= 235;
}

function unmatteWhiteRgb(rgba: Uint8Array): void {
    for (let index = 0; index < rgba.length; index += 4) {
        const alphaByte = rgba[index + 3];
        if (alphaByte === 0 || alphaByte === 255) continue;

        const alpha = alphaByte / 255;
        rgba[index] = unmatteWhiteChannel(rgba[index], alpha);
        rgba[index + 1] = unmatteWhiteChannel(rgba[index + 1], alpha);
        rgba[index + 2] = unmatteWhiteChannel(rgba[index + 2], alpha);
    }
}

function unmatteWhiteChannel(channel: number, alpha: number): number {
    return Math.max(0, Math.min(255, Math.round((channel - 255 * (1 - alpha)) / alpha)));
}

function bleedTransparentRgbFromAlpha(rgba: Uint8Array, width: number, height: number): void {
    const maxIterations = 16;
    const source = new Uint8Array(rgba);
    const filled = new Uint8Array(width * height);

    for (let index = 0; index < width * height; index += 1) {
        filled[index] = rgba[index * 4 + 3] >= RGB_BLEED_ALPHA_THRESHOLD ? 1 : 0;
    }

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        let changed = false;
        source.set(rgba);
        const sourceFilled = new Uint8Array(filled);

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const pixelIndex = y * width + x;
                if (sourceFilled[pixelIndex]) continue;
                const index = pixelIndex * 4;

                let red = 0;
                let green = 0;
                let blue = 0;
                let count = 0;

                for (let dy = -1; dy <= 1; dy += 1) {
                    const ny = y + dy;
                    if (ny < 0 || ny >= height) continue;
                    for (let dx = -1; dx <= 1; dx += 1) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = x + dx;
                        if (nx < 0 || nx >= width) continue;
                        const neighborIndex = ny * width + nx;
                        if (!sourceFilled[neighborIndex]) continue;
                        const neighbor = neighborIndex * 4;
                        red += source[neighbor];
                        green += source[neighbor + 1];
                        blue += source[neighbor + 2];
                        count += 1;
                    }
                }

                if (count === 0) continue;
                rgba[index] = Math.round(red / count);
                rgba[index + 1] = Math.round(green / count);
                rgba[index + 2] = Math.round(blue / count);
                filled[pixelIndex] = 1;
                changed = true;
            }
        }

        if (!changed) break;
    }
}

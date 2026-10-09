const maxBytes = 256 * 1024 * 1024;
const maxSplats = 5_000_000;

export function validateRawSplat(data: ArrayBuffer): number {
    const count = data.byteLength / 32;
    if (!count || !Number.isInteger(count) || count > maxSplats || data.byteLength > maxBytes) {
        throw new Error("Gaussian .splat needs 32-byte rows (up to 5 million splats / 256 MiB)");
    }
    const view = new DataView(data);
    for (let row = 0; row < count; row++) {
        for (let component = 0; component < 6; component++) {
            const value = view.getFloat32(row * 32 + component * 4, true);
            if (!Number.isFinite(value)) throw new Error("Invalid Gaussian Splat numeric value");
            if (component >= 3 && value <= 0) throw new Error("Gaussian Splat scale must be positive");
        }
    }
    return count;
}

/** Guard the layout before calling the native SPZ v2/v3 parser. */
export function validateSpz(data: ArrayBuffer): { count: number; version: number } {
    if (data.byteLength < 16) throw new Error("Truncated SPZ header");
    const view = new DataView(data);
    if (view.getUint32(0, true) !== 0x5053474e) throw new Error("Invalid SPZ signature");
    const version = view.getUint32(4, true);
    if (version !== 2 && version !== 3) throw new Error("Only SPZ version 2 / 3 is supported by Babylon.js 9.2.0");
    const count = view.getUint32(8, true);
    if (!count || count > maxSplats) throw new Error("Invalid or excessive SPZ splat count");
    const shDegree = view.getUint8(12);
    if (shDegree > 3 || view.getUint8(13) > 24 || view.getUint8(15) !== 0) throw new Error("Unsupported SPZ header values");
    const rowLength = 9 + 4 + 3 + (version === 3 ? 4 : 3) + 3 * ((shDegree + 1) ** 2 - 1);
    if (data.byteLength < 16 + rowLength * count) throw new Error("Truncated SPZ data");
    if (data.byteLength > maxBytes) throw new Error("SPZ data exceeds 256 MiB");
    return { count, version };
}

export async function decompressSpz(data: ArrayBuffer): Promise<ArrayBuffer> {
    const bytes = new Uint8Array(data);
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error("SPZ file needs gzip encoding");
    if (data.byteLength > maxBytes) throw new Error("SPZ file exceeds 256 MiB");
    const source = new ReadableStream<BufferSource>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
    const reader = source.pipeThrough(new DecompressionStream("gzip")).getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const result = await reader.read();
            if (result.done) break;
            length += result.value.length;
            if (length > maxBytes) throw new Error("SPZ decompressed data exceeds 256 MiB");
            chunks.push(result.value);
        }
    } finally { await reader.cancel(); }
    const decompressed = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { decompressed.set(chunk, offset); offset += chunk.length; }
    return decompressed.buffer;
}

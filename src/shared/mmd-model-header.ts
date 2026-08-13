export type MmdModelHeaderPreview = {
    format: "pmx" | "pmd";
    version: string;
    modelName: string;
    englishModelName: string;
    comment: string;
    englishComment: string;
};

const PMX_MAGIC = "PMX ";
const PMD_MAGIC = "Pmd";
const MAX_TEXT_BYTES = 16 * 1024 * 1024;

function decodeAscii(bytes: Uint8Array, offset: number, length: number): string {
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function decodeText(bytes: Uint8Array, encoding: "utf-8" | "utf-16le" | "shift_jis"): string {
    const text = new TextDecoder(encoding).decode(bytes);
    const nullIndex = text.indexOf("\0");
    return (nullIndex >= 0 ? text.slice(0, nullIndex) : text).trim();
}

function parsePmxHeader(bytes: Uint8Array): MmdModelHeaderPreview | null {
    if (bytes.byteLength < 13 || decodeAscii(bytes, 0, 4) !== PMX_MAGIC) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getFloat32(4, true);
    const globalCount = view.getUint8(8);
    if (globalCount < 1 || 9 + globalCount > bytes.byteLength) return null;
    const encoding = view.getUint8(9) === 0 ? "utf-16le" : "utf-8";
    let offset = 9 + globalCount;

    const readText = (): string | null => {
        if (offset + 4 > bytes.byteLength) return null;
        const length = view.getInt32(offset, true);
        offset += 4;
        if (length < 0 || length > MAX_TEXT_BYTES || offset + length > bytes.byteLength) return null;
        const value = decodeText(bytes.subarray(offset, offset + length), encoding);
        offset += length;
        return value;
    };

    const modelName = readText();
    const englishModelName = readText();
    const comment = readText();
    const englishComment = readText();
    if (modelName === null || englishModelName === null || comment === null || englishComment === null) return null;
    return {
        format: "pmx",
        version: Number.isFinite(version) ? version.toFixed(1) : "2.0",
        modelName,
        englishModelName,
        comment,
        englishComment,
    };
}

function parsePmdHeader(bytes: Uint8Array): MmdModelHeaderPreview | null {
    const requiredLength = 3 + 4 + 20 + 256;
    if (bytes.byteLength < requiredLength || decodeAscii(bytes, 0, 3) !== PMD_MAGIC) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getFloat32(3, true);
    return {
        format: "pmd",
        version: Number.isFinite(version) ? version.toFixed(1) : "1.0",
        modelName: decodeText(bytes.subarray(7, 27), "shift_jis"),
        englishModelName: "",
        comment: decodeText(bytes.subarray(27, 283), "shift_jis"),
        englishComment: "",
    };
}

export function parseMmdModelHeader(bytes: Uint8Array): MmdModelHeaderPreview | null {
    return parsePmxHeader(bytes) ?? parsePmdHeader(bytes);
}

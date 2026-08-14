import iconv from "iconv-lite";

export type ShiftJisFixedStringResult =
    | { ok: true; bytes: Uint8Array; truncated: boolean }
    | { ok: false; reason: "unencodable" | "too_long"; codePoint?: string; byteLength?: number };

function encodeCodePoint(codePoint: string): Uint8Array | null {
    const bytes = iconv.encode(codePoint, "shift_jis");
    if (bytes.length === 1 && bytes[0] === 0x3f && codePoint !== "?") return null;
    return Uint8Array.from(bytes);
}

export function encodeShiftJisFixedString(
    value: string,
    fieldLength: number,
    allowTruncate: boolean,
): ShiftJisFixedStringResult {
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    let truncated = false;

    for (const codePoint of value) {
        const encoded = encodeCodePoint(codePoint);
        if (!encoded) return { ok: false, reason: "unencodable", codePoint };
        if (byteLength + encoded.byteLength > fieldLength) {
            if (!allowTruncate) {
                const fullLength = iconv.encode(value, "shift_jis").byteLength;
                return { ok: false, reason: "too_long", byteLength: fullLength };
            }
            truncated = true;
            break;
        }
        chunks.push(encoded);
        byteLength += encoded.byteLength;
    }

    const result = new Uint8Array(fieldLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { ok: true, bytes: result, truncated };
}

export function fixedStringByteKey(bytes: Uint8Array): string {
    let key = "";
    for (const value of bytes) key += value.toString(16).padStart(2, "0");
    return key;
}

import { describe, expect, it } from "vitest";
import { parseMmdModelHeader } from "./mmd-model-header";

function createPmxHeader(fields: readonly string[], utf16 = false): Uint8Array {
    const encoder = new TextEncoder();
    const encode = (value: string): Uint8Array => {
        if (!utf16) return encoder.encode(value);
        const result = new Uint8Array(value.length * 2);
        const view = new DataView(result.buffer);
        for (let index = 0; index < value.length; index += 1) view.setUint16(index * 2, value.charCodeAt(index), true);
        return result;
    };
    const encodedFields = fields.map(encode);
    const result = new Uint8Array(17 + encodedFields.reduce((sum, field) => sum + 4 + field.byteLength, 0));
    result.set([0x50, 0x4d, 0x58, 0x20], 0);
    const view = new DataView(result.buffer);
    view.setFloat32(4, 2.1, true);
    view.setUint8(8, 8);
    view.setUint8(9, utf16 ? 0 : 1);
    let offset = 17;
    for (const field of encodedFields) {
        view.setInt32(offset, field.byteLength, true);
        offset += 4;
        result.set(field, offset);
        offset += field.byteLength;
    }
    return result;
}

function createBpmxHeader(fields: readonly string[], version: readonly [number, number, number] = [3, 0, 0]): Uint8Array {
    const encoder = new TextEncoder();
    const encodedFields = fields.map((value) => encoder.encode(value));
    const headerLength = 12 + 40;
    const fieldLength = encodedFields.reduce(
        (sum, field) => sum + 4 + field.byteLength + ((4 - (field.byteLength % 4)) % 4),
        0,
    );
    const result = new Uint8Array(headerLength + fieldLength);
    result.set([0x42, 0x50, 0x4d, 0x58], 0);
    result.set(version, 4);
    const view = new DataView(result.buffer);
    view.setUint32(8, 40, true);
    view.setUint32(12, headerLength, true);
    let offset = headerLength;
    for (const field of encodedFields) {
        view.setUint32(offset, field.byteLength, true);
        offset += 4;
        result.set(field, offset);
        offset += field.byteLength + ((4 - (field.byteLength % 4)) % 4);
    }
    return result;
}

describe("parseMmdModelHeader", () => {
    it("parses UTF-8 PMX names and comments", () => {
        expect(parseMmdModelHeader(createPmxHeader(["モデル", "Model", "注記", "Notice"]))).toEqual({
            format: "pmx",
            version: "2.1",
            modelName: "モデル",
            englishModelName: "Model",
            comment: "注記",
            englishComment: "Notice",
        });
    });

    it("parses UTF-16LE PMX names and comments", () => {
        expect(parseMmdModelHeader(createPmxHeader(["豆腐", "Tofu", "確認用", "Test"], true))?.comment).toBe("確認用");
    });

    it("parses BPMX 3.0 model information without losing Unicode text", () => {
        expect(parseMmdModelHeader(createBpmxHeader(["アリシア", "Alicia", "利用条件を確認", "Read me"]))).toEqual({
            format: "bpmx",
            version: "3.0.0",
            modelName: "アリシア",
            englishModelName: "Alicia",
            comment: "利用条件を確認",
            englishComment: "Read me",
        });
    });

    it("rejects unsupported or truncated BPMX data", () => {
        expect(parseMmdModelHeader(createBpmxHeader(["A", "B", "C", "D"], [2, 0, 0]))).toBeNull();
        expect(parseMmdModelHeader(createBpmxHeader(["A", "B", "C", "D"]).subarray(0, 60))).toBeNull();
    });

    it("rejects truncated or unrelated data", () => {
        expect(parseMmdModelHeader(createPmxHeader(["A", "B", "C", "D"]).subarray(0, 20))).toBeNull();
        expect(parseMmdModelHeader(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    });
});

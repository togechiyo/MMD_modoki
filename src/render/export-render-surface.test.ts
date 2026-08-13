import { describe, expect, it } from "vitest";
import { normalizeExportRgbaRows, unpremultiplyExportRgba } from "./export-render-surface";

describe("normalizeExportRgbaRows", () => {
    it("converts bottom-to-top RGBA readback into top-to-bottom row order", () => {
        const bottomRow = [1, 2, 3, 4, 5, 6, 7, 8];
        const topRow = [9, 10, 11, 12, 13, 14, 15, 16];
        const source = new Uint8Array([...bottomRow, ...topRow]);

        const result = normalizeExportRgbaRows(source, 2, 2);

        expect([...result]).toEqual([...topRow, ...bottomRow]);
        expect([...source]).toEqual([...bottomRow, ...topRow]);
    });

    it("rejects undersized readback buffers", () => {
        expect(() => normalizeExportRgbaRows(new Uint8Array(3), 1, 1)).toThrow(
            "RGBA readback is too small",
        );
    });
});

describe("unpremultiplyExportRgba", () => {
    it("converts premultiplied RGB into straight alpha RGB", () => {
        const pixels = new Uint8Array([
            64, 32, 16, 128,
            9, 8, 7, 255,
            12, 13, 14, 0,
        ]);

        expect([...unpremultiplyExportRgba(pixels)]).toEqual([
            128, 64, 32, 128,
            9, 8, 7, 255,
            0, 0, 0, 0,
        ]);
    });

    it("clamps rounding overflow", () => {
        const pixels = new Uint8Array([200, 1, 0, 128]);

        expect([...unpremultiplyExportRgba(pixels)]).toEqual([255, 2, 0, 128]);
    });
});

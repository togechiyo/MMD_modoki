import { describe, expect, it, vi } from "vitest";
import { classifyOpaqueBmp, classifyRgbaAlpha, createXTextureAlphaCache, getStaticPngSize, type XTextureAlpha } from "./x-texture-alpha";

function png(width: number, height: number, animated = false): Uint8Array {
    const bytes = new Uint8Array(animated ? 69 : 57), view = new DataView(bytes.buffer);
    bytes.set([137,80,78,71,13,10,26,10]);
    view.setUint32(8, 13); view.setUint32(12, 0x49484452);
    view.setUint32(16, width); view.setUint32(20, height);
    bytes[24] = 8; bytes[25] = 6;
    view.setUint32(37, 0x49444154); // Empty IDAT; this tests metadata only, not PNG decoding.
    if (animated) view.setUint32(49, 0x6163544c);
    view.setUint32(animated ? 61 : 49, 0x49454e44);
    return bytes;
}

describe("X texture alpha classification", () => {
    function bmp(height = 2, extraImageBytes = 0): Uint8Array {
        // Three pixels require one padding byte per row. Padding is not alpha.
        const imageBytes = 12 * Math.abs(height) + extraImageBytes;
        const bytes = new Uint8Array(54 + imageBytes), view = new DataView(bytes.buffer);
        bytes.set([0x42, 0x4d]);
        view.setUint32(2, bytes.length, true); view.setUint32(10, 54, true);
        view.setUint32(14, 40, true); view.setInt32(18, 3, true); view.setInt32(22, height, true);
        view.setUint16(26, 1, true); view.setUint16(28, 24, true); view.setUint32(34, imageBytes, true);
        return bytes;
    }

    it("recognizes complete RGB24 BMPs with row padding, top-down rows and trailing image bytes", () => {
        for (const bytes of [bmp(), bmp(-2), bmp(2, 2)]) expect(classifyOpaqueBmp(bytes)).toBe("opaque");
        const noImageSize = bmp(); new DataView(noImageSize.buffer).setUint32(34, 0, true);
        expect(classifyOpaqueBmp(noImageSize)).toBe("opaque");
        const sliced = new Uint8Array(100); sliced.set(bmp(), 3);
        expect(classifyOpaqueBmp(sliced.subarray(3, 81))).toBe("opaque");
    });

    it.each([
        [28, 32, "32-bit alpha-capable data"], [28, 8, "palette data"],
        [30, 3, "bitfields"], [30, 1, "compressed data"], [14, 108, "extended DIB"],
        [26, 2, "invalid planes"], [18, 0, "zero width"], [22, 0, "zero height"],
        [18, 8193, "oversized width"], [22, 0x80000000, "invalid height"],
        [10, 53, "overlapping pixel offset"], [2, 1000, "truncated file"],
        [2, 77, "truncated pixel array"], [34, 23, "undersized image data"],
        [34, 1000, "truncated declared image"], [46, 1, "unexpected palette"], [6, 1, "reserved header"],
    ])("keeps unsupported or malformed BMP conservative: %s/%s (%s)", (offset, value) => {
        const bytes = bmp(), view = new DataView(bytes.buffer);
        if (offset === 26 || offset === 28) view.setUint16(Number(offset), Number(value), true);
        else view.setUint32(Number(offset), Number(value), true);
        expect(classifyOpaqueBmp(bytes)).toBe("unknown");
    });

    it("rejects missing BMP signatures and incomplete headers or padded rows", () => {
        expect(classifyOpaqueBmp(new Uint8Array())).toBe("unknown");
        expect(classifyOpaqueBmp(bmp().subarray(0, 53))).toBe("unknown");
        expect(classifyOpaqueBmp(bmp().subarray(0, 77))).toBe("unknown");
        const invalid = bmp(); invalid[0] = 0;
        expect(classifyOpaqueBmp(invalid)).toBe("unknown");
    });

    it("requires every alpha byte to be 255, including one almost-opaque last pixel", () => {
        const bytes = new Uint8ClampedArray(32 * 32 * 4).fill(255);
        bytes[0] = 0; // RGB does not determine transparency.
        expect(classifyRgbaAlpha(bytes, 1024)).toBe("opaque");
        bytes[bytes.length - 1] = 254;
        expect(classifyRgbaAlpha(bytes, 1024)).toBe("alpha");
        bytes[bytes.length - 1] = 0;
        expect(classifyRgbaAlpha(bytes, 1024)).toBe("alpha");
    });

    it("does not certify empty, truncated or inconsistent data", () => {
        expect(classifyRgbaAlpha(new Uint8Array(), 0)).toBe("unknown");
        expect(classifyRgbaAlpha(new Uint8Array([1,2,3]), 1)).toBe("unknown");
        expect(classifyRgbaAlpha(new Uint8Array([1,2,3,255]), 2)).toBe("unknown");
    });

    it("accepts static 4K and 8K dimensions while rejecting oversized, animated and truncated input", () => {
        expect(getStaticPngSize(png(4096, 4096))).toEqual({ width:4096, height:4096 });
        expect(getStaticPngSize(png(8192, 8192))).toEqual({ width:8192, height:8192 });
        expect(getStaticPngSize(png(8193, 1))).toBeNull();
        expect(getStaticPngSize(png(1, 0))).toBeNull();
        expect(getStaticPngSize(png(32, 32, true))).toBeNull();
        expect(getStaticPngSize(png(32, 32).subarray(0, 56))).toBeNull();
        const overflow = png(32, 32);
        new DataView(overflow.buffer).setUint32(33, 0xffffffff);
        expect(getStaticPngSize(overflow)).toBeNull();
    });

    it("shares one in-flight inspection per URL and releases the cache with its import", async () => {
        let complete: (value: XTextureAlpha) => void = () => undefined;
        const inspect = vi.fn(() => new Promise<XTextureAlpha>(resolve => { complete = resolve; }));
        const firstImport = createXTextureAlphaCache(inspect);
        const a = firstImport("file:///shared.png"), b = firstImport("file:///shared.png");
        expect(a).toBe(b);
        await Promise.resolve();
        expect(inspect).toHaveBeenCalledTimes(1);
        complete("opaque");
        expect(await a).toBe("opaque");
        expect(await firstImport("file:///shared.png")).toBe("opaque");
        const secondImport = createXTextureAlphaCache(async () => "alpha");
        expect(await secondImport("file:///shared.png")).toBe("alpha");
    });

    it("keeps failed inspection conservative and cached without poisoning another URL", async () => {
        const inspect = vi.fn(async (url: string): Promise<XTextureAlpha> => {
            if (url.endsWith("bad.png")) throw new Error("decode failed");
            return "opaque";
        });
        const read = createXTextureAlphaCache(inspect);
        expect(await read("bad.png")).toBe("unknown");
        expect(await read("bad.png")).toBe("unknown");
        expect(await read("good.png")).toBe("opaque");
        expect(inspect).toHaveBeenCalledTimes(2);
    });
});

import { describe, expect, it, vi } from "vitest";
import { decodeBmpTextureToRgba, isBmpTexturePath, loadBmpTextureWithAlphaCorrection } from "./bmp-texture-compat";

function create32BitBmp(width: number, height: number, pixelsBottomUpBgra: readonly number[]): ArrayBuffer {
    const rowStride = width * 4;
    const dataOffset = 54;
    const buffer = new ArrayBuffer(dataOffset + rowStride * height);
    const view = new DataView(buffer);
    view.setUint16(0, 0x4d42, true);
    view.setUint32(2, buffer.byteLength, true);
    view.setUint32(10, dataOffset, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 32, true);
    view.setUint32(30, 0, true);

    const bytes = new Uint8Array(buffer);
    bytes.set(pixelsBottomUpBgra, dataOffset);
    return buffer;
}

describe("bmp texture compatibility", () => {
    it("detects bmp paths without being confused by query strings", () => {
        expect(isBmpTexturePath("tex/shadow.bmp")).toBe(true);
        expect(isBmpTexturePath("tex/shadow.BMP?cache=1")).toBe(true);
        expect(isBmpTexturePath("tex/shadow.dds")).toBe(false);
    });

    it("decodes 32-bit bottom-up BMP pixels to top-down RGBA", () => {
        const buffer = create32BitBmp(1, 2, [
            10, 20, 30, 200,
            50, 60, 70, 255,
        ]);

        const decoded = decodeBmpTextureToRgba(buffer);

        expect(decoded?.width).toBe(1);
        expect(decoded?.height).toBe(2);
        expect(decoded?.hasAlpha).toBe(true);
        expect(decoded?.minAlpha).toBe(200);
        expect(decoded?.maxAlpha).toBe(255);
        expect(decoded?.transparentPixelRatio).toBe(0);
        expect(decoded?.lowAlphaPixelRatio).toBe(0);
        expect(decoded?.whiteMattedAlpha).toBe(false);
        expect(Array.from(decoded?.rgba ?? [])).toEqual([
            70, 60, 50, 255,
            30, 20, 10, 200,
        ]);
    });

    it("bleeds visible RGB into fully transparent BMP pixels to avoid white fringes", () => {
        const buffer = create32BitBmp(3, 1, [
            255, 255, 255, 0,
            10, 20, 200, 255,
            255, 255, 255, 8,
        ]);

        const decoded = decodeBmpTextureToRgba(buffer);

        expect(decoded?.transparentPixelRatio).toBeCloseTo(1 / 3);
        expect(decoded?.lowAlphaPixelRatio).toBeCloseTo(1 / 3);
        expect(decoded?.whiteMattedAlpha).toBe(false);
        expect(Array.from(decoded?.rgba ?? [])).toEqual([
            200, 20, 10, 0,
            200, 20, 10, 255,
            200, 20, 10, 8,
        ]);
    });

    it("unmattes white RGB from low-alpha BMP pixels before bleeding", () => {
        const lowAlphaPixels = Array.from({ length: 16 }, () => [239, 239, 255, 16]).flat();
        const buffer = create32BitBmp(81, 1, [
            ...Array.from({ length: 64 }, () => [255, 255, 255, 0]).flat(),
            ...lowAlphaPixels,
            0, 0, 255, 255,
        ]);

        const decoded = decodeBmpTextureToRgba(buffer);
        const lowAlphaOffset = 64 * 4;

        expect(decoded?.transparentPixelRatio).toBeCloseTo(64 / 81);
        expect(decoded?.lowAlphaPixelRatio).toBeCloseTo(16 / 81);
        expect(decoded?.whiteMattedAlpha).toBe(true);
        expect(Array.from(decoded?.rgba.slice(lowAlphaOffset, lowAlphaOffset + 4) ?? [])).toEqual([
            255, 0, 0, 16,
        ]);
    });

    it("leaves non-32-bit BMPs to the regular texture path", () => {
        const buffer = create32BitBmp(1, 1, [0, 0, 0, 255]);
        new DataView(buffer).setUint16(28, 24, true);

        expect(decodeBmpTextureToRgba(buffer)).toBeNull();
    });
});

describe("BMP texture loader selection", () => {
    it("decodes white-matted alpha before the official loader and preserves alpha", async () => {
        const data = create32BitBmp(81, 1, [
            ...Array.from({ length: 64 }, () => [255, 255, 255, 0]).flat(),
            ...Array.from({ length: 16 }, () => [239, 239, 255, 16]).flat(),
            0, 0, 255, 255,
        ]);
        const official = vi.fn(async () => "official");
        const create = vi.fn(async (decoded: NonNullable<ReturnType<typeof decodeBmpTextureToRgba>>) => {
            expect(decoded.whiteMattedAlpha).toBe(true);
            expect(decoded.hasAlpha).toBe(true);
            expect([...decoded.rgba.slice(64 * 4, 65 * 4)]).toEqual([255, 0, 0, 16]);
            return "decoded";
        });
        expect(await loadBmpTextureWithAlphaCorrection(data, official, create)).toBe("decoded");
        expect(official).not.toHaveBeenCalled();
        expect(create).toHaveBeenCalledOnce();
    });

    it("keeps non-white-matted alpha on the official path when it succeeds", async () => {
        const create = vi.fn(async () => "decoded");
        const official = vi.fn(async () => "official");
        expect(await loadBmpTextureWithAlphaCorrection(
            create32BitBmp(1, 1, [0, 0, 255, 64]), official, create,
        )).toBe("official");
        expect(official).toHaveBeenCalledOnce();
        expect(create).not.toHaveBeenCalled();
    });

    it("uses non-white-matted alpha CPU fallback only after official failure", async () => {
        const calls: string[] = [];
        expect(await loadBmpTextureWithAlphaCorrection(
            create32BitBmp(1, 1, [0, 0, 255, 64]),
            async () => { calls.push("official"); return null; },
            async () => { calls.push("decoded"); return "decoded"; },
        )).toBe("decoded");
        expect(calls).toEqual(["official", "decoded"]);
    });

    it.each([new ArrayBuffer(0), create32BitBmp(1, 1, [0, 0, 255, 255])])(
        "does not CPU-fallback for invalid or opaque data after official failure", async data => {
            const create = vi.fn(async () => "decoded");
            const official = vi.fn(async () => null);
            expect(await loadBmpTextureWithAlphaCorrection(data, official, create)).toBeNull();
            expect(official).toHaveBeenCalledOnce();
            expect(create).not.toHaveBeenCalled();
        },
    );

    it("preserves official loader errors instead of silently changing paths", async () => {
        const create = vi.fn(async () => "decoded");
        await expect(loadBmpTextureWithAlphaCorrection(new ArrayBuffer(0), async () => {
            throw new Error("official failed");
        }, create)).rejects.toThrow("official failed");
        expect(create).not.toHaveBeenCalled();
    });
});

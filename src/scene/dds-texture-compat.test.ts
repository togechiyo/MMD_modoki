import { describe, expect, it } from "vitest";
import {
    decodeDdsTextureToRgba,
    inspectDdsTexture,
    isDdsTexturePath,
    shouldSkipDdsTextureForWebGpu,
} from "./dds-texture-compat";

function createDds(fourCc: string | null, payloadLength = 0, width = 1024, height = 512): ArrayBuffer {
    const buffer = new ArrayBuffer(128 + payloadLength);
    const view = new DataView(buffer);
    view.setUint32(0, 0x20534444, true);
    view.setUint32(4, 124, true);
    view.setInt32(12, height, true);
    view.setInt32(16, width, true);
    if (fourCc) {
        view.setUint32(80, 0x4, true);
        for (let index = 0; index < 4; index += 1) {
            view.setUint8(84 + index, fourCc.charCodeAt(index));
        }
    }
    return buffer;
}

describe("dds texture compatibility", () => {
    it("detects dds paths without being confused by query strings", () => {
        expect(isDdsTexturePath("tex/body.dds")).toBe(true);
        expect(isDdsTexturePath("tex/body.DDS?cache=1")).toBe(true);
        expect(isDdsTexturePath("tex/body.png")).toBe(false);
    });

    it("reads compressed dds header information", () => {
        const info = inspectDdsTexture(createDds("DXT5"));

        expect(info).toMatchObject({
            isDds: true,
            isCompressed: true,
            fourCc: "DXT5",
            width: 1024,
            height: 512,
        });
    });

    it("skips compressed dds when WebGPU has no S3TC support", () => {
        const info = shouldSkipDdsTextureForWebGpu(createDds("DXT1"), false);

        expect(info?.fourCc).toBe("DXT1");
    });

    it("keeps compressed dds when S3TC is available", () => {
        const info = shouldSkipDdsTextureForWebGpu(createDds("DXT1"), true);

        expect(info).toBeNull();
    });

    it("keeps non-FourCC dds for Babylon's uncompressed path", () => {
        const info = shouldSkipDdsTextureForWebGpu(createDds(null), false);

        expect(info).toBeNull();
    });

    it("keeps unsupported compressed formats on Babylon's standard path", () => {
        const info = shouldSkipDdsTextureForWebGpu(createDds("ATI2"), false);

        expect(info).toBeNull();
    });

    it("decodes a DXT1 color block to RGBA", () => {
        const buffer = createDds("DXT1", 8, 4, 4);
        const view = new DataView(buffer);
        view.setUint16(128, 0xf800, true);
        view.setUint16(130, 0x001f, true);
        view.setUint32(132, 0, true);

        const decoded = decodeDdsTextureToRgba(buffer);

        expect(Array.from(decoded?.rgba.slice(0, 4) ?? [])).toEqual([255, 0, 0, 255]);
    });

    it("decodes DXT5 alpha values", () => {
        const buffer = createDds("DXT5", 16, 4, 4);
        const view = new DataView(buffer);
        view.setUint8(128, 10);
        view.setUint8(129, 250);
        view.setUint8(130, 0x08);
        view.setUint16(136, 0x001f, true);
        view.setUint16(138, 0xf800, true);
        view.setUint32(140, 3, true);

        const decoded = decodeDdsTextureToRgba(buffer);

        expect(decoded?.hasAlpha).toBe(true);
        expect(decoded?.minAlpha).toBe(10);
        expect(decoded?.maxAlpha).toBe(250);
        expect(Array.from(decoded?.rgba.slice(0, 4) ?? [])).toEqual([170, 0, 85, 10]);
        expect(decoded?.rgba[3]).toBe(10);
    });

    it("does not mark opaque DXT3 textures as alpha textures", () => {
        const buffer = createDds("DXT3", 16, 4, 4);
        const view = new DataView(buffer);
        for (let offset = 128; offset < 136; offset += 2) {
            view.setUint16(offset, 0xffff, true);
        }
        view.setUint16(136, 0xf800, true);
        view.setUint16(138, 0x001f, true);
        view.setUint32(140, 0, true);

        const decoded = decodeDdsTextureToRgba(buffer);

        expect(decoded?.hasAlpha).toBe(false);
        expect(decoded?.minAlpha).toBe(255);
        expect(decoded?.maxAlpha).toBe(255);
        expect(decoded?.rgba[3]).toBe(255);
    });

    it("decodes DXT3 alpha for every block after alpha has already been found", () => {
        const buffer = createDds("DXT3", 32, 8, 4);
        const view = new DataView(buffer);

        for (let offset = 128; offset < 136; offset += 2) {
            view.setUint16(offset, 0xeeee, true);
        }
        view.setUint16(136, 0xf800, true);
        view.setUint16(138, 0x001f, true);
        view.setUint32(140, 0, true);

        for (let offset = 144; offset < 152; offset += 2) {
            view.setUint16(offset, 0x0000, true);
        }
        view.setUint16(152, 0xf800, true);
        view.setUint16(154, 0x001f, true);
        view.setUint32(156, 0, true);

        const decoded = decodeDdsTextureToRgba(buffer);

        expect(decoded?.hasAlpha).toBe(true);
        expect(decoded?.minAlpha).toBe(0);
        expect(decoded?.maxAlpha).toBe(238);
        expect(decoded?.rgba[3]).toBe(238);
        expect(decoded?.rgba[(4 * 4) + 3]).toBe(0);
    });
});

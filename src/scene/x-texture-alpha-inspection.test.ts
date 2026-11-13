import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Scene } from "@babylonjs/core/scene";
import { Observable } from "@babylonjs/core/Misc/observable";
import { LoadFile, LoadImage } from "@babylonjs/core/Misc/fileTools";
import type { IFileRequest } from "@babylonjs/core/Misc/fileRequest";
import { inspectXTextureAlpha } from "./x-texture-alpha-inspection";

vi.mock("@babylonjs/core/Misc/fileTools", () => ({ LoadFile: vi.fn(), LoadImage: vi.fn() }));

function metadata(width: number, height: number): ArrayBuffer {
    const bytes = new Uint8Array(57), view = new DataView(bytes.buffer);
    bytes.set([137,80,78,71,13,10,26,10]);
    view.setUint32(8,13); view.setUint32(12,0x49484452);
    view.setUint32(16,width); view.setUint32(20,height);
    view.setUint32(37,0x49444154); view.setUint32(49,0x49454e44);
    return bytes.buffer;
}

describe("X load-time texture alpha inspection", () => {
    const engine = {};
    const scene = { isDisposed:false, offlineProvider:null, getEngine:() => engine } as unknown as Scene;
    let sourceY = 0;
    const draw = vi.fn((_image: unknown, _x: number, y: number) => { sourceY = y; });
    const pixels = vi.fn((_x: number, _y: number, width: number, height: number) => ({ data:new Uint8ClampedArray(width * height * 4).fill(255) }));
    const canvas = { width:0, height:0, getContext:vi.fn(() => ({ clearRect:vi.fn(), drawImage:draw, getImageData:pixels })) };
    const abort = vi.fn();
    const image = { width:2, height:129, close:vi.fn() } as unknown as ImageBitmap;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x-alpha-test");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
        sourceY = 0;
        pixels.mockImplementation((_x, _y, width, height) => ({ data:new Uint8ClampedArray(width * height * 4).fill(255) }));
        vi.stubGlobal("document", { createElement:vi.fn(() => canvas) });
        vi.mocked(LoadFile).mockImplementation((_url, success) => {
            success(metadata(2,129));
            return { abort, onCompleteObservable:new Observable<IFileRequest>() };
        });
        vi.mocked(LoadImage).mockImplementation((_data, success) => { success(image); return null; });
    });
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it("recognizes RGB24 BMP without allocating a canvas or decoding a second bitmap", async () => {
        const bytes = new Uint8Array(62), view = new DataView(bytes.buffer);
        bytes.set([0x42, 0x4d]);
        view.setUint32(2, 62, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true);
        view.setInt32(18, 2, true); view.setInt32(22, 1, true);
        view.setUint16(26, 1, true); view.setUint16(28, 24, true);
        vi.mocked(LoadFile).mockImplementation((_url, success) => {
            success(bytes.buffer); return { abort, onCompleteObservable:new Observable<IFileRequest>() };
        });
        expect(await inspectXTextureAlpha("file:///opaque.bmp", scene)).toBe("opaque");
        expect(LoadImage).not.toHaveBeenCalled();
        expect(document.createElement).not.toHaveBeenCalled();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        view.setUint16(28, 32, true);
        expect(await inspectXTextureAlpha("file:///alpha.bmp", scene)).toBe("unknown");
    });

    it("scans the final partial strip at original resolution and closes its image", async () => {
        pixels.mockImplementation((_x, _y, width, height) => {
            expect(canvas.height).toBe(128);
            const data = new Uint8ClampedArray(width * height * 4).fill(255);
            if (sourceY === 128) data[data.length - 1] = 254;
            return { data };
        });
        expect(await inspectXTextureAlpha("file:///test.png", scene)).toBe("alpha");
        expect(draw.mock.calls.map(call => call[2])).toEqual([0,128]);
        expect(pixels.mock.calls.map(call => [call[2],call[3]])).toEqual([[2,128],[2,1]]);
        expect(LoadImage).toHaveBeenCalledWith("blob:x-alpha-test", expect.any(Function), expect.any(Function), null, "image/png", undefined, engine);
        expect(image.close).toHaveBeenCalledOnce();
        expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:x-alpha-test");
        expect([canvas.width,canvas.height]).toEqual([0,0]);
    });

    it("certifies all-opaque data and handles denied canvas access conservatively", async () => {
        expect(await inspectXTextureAlpha("file:///opaque.png", scene)).toBe("opaque");
        pixels.mockImplementation(() => { throw new Error("SecurityError"); });
        expect(await inspectXTextureAlpha("file:///unreadable.png", scene)).toBe("unknown");
        expect(image.close).toHaveBeenCalledTimes(2);
        expect([canvas.width,canvas.height]).toEqual([0,0]);
    });

    it("times out once, aborts outstanding IO and closes a late bitmap without reading it", async () => {
        let loaded: ((image: HTMLImageElement | ImageBitmap) => void) | undefined;
        vi.mocked(LoadImage).mockImplementation((_data, success) => { loaded = success; return null; });
        const result = inspectXTextureAlpha("file:///late.png", scene);
        await vi.advanceTimersByTimeAsync(5000);
        expect(await result).toBe("unknown");
        expect(abort).toHaveBeenCalledOnce();
        expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:x-alpha-test");
        loaded?.(image);
        expect(image.close).toHaveBeenCalledOnce();
        expect(draw).not.toHaveBeenCalled();
    });

    it("releases the encoded bytes when bitmap decoding rejects", async () => {
        vi.mocked(LoadImage).mockImplementation((_url, _success, failure) => { failure("decode failed"); return null; });
        expect(await inspectXTextureAlpha("file:///broken.png", scene)).toBe("unknown");
        expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:x-alpha-test");
        expect(draw).not.toHaveBeenCalled();
    });

    it("does not decode malformed or oversized PNG metadata", async () => {
        vi.mocked(LoadFile).mockImplementation((_url, success) => {
            success(metadata(8193,1));
            return { abort, onCompleteObservable:new Observable<IFileRequest>() };
        });
        expect(await inspectXTextureAlpha("file:///huge.png", scene)).toBe("unknown");
        expect(LoadImage).not.toHaveBeenCalled();
    });
});

import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow, NativeImage } from "electron";
import { captureViewportImage } from "../../src/main/automation/viewport-capture";

function captureFixture() {
    const resized = { tag: "resized" } as unknown as NativeImage;
    const picture = { isEmpty: vi.fn(() => false), getSize: vi.fn(() => ({ width: 800, height: 600 })), resize: vi.fn(() => resized) };
    const window = {
        isDestroyed: vi.fn(() => false), isMinimized: vi.fn(() => false), isVisible: vi.fn(() => true),
        getContentSize: vi.fn(() => [1000, 800]),
        webContents: { getZoomFactor: vi.fn(() => 1), capturePage: vi.fn(async () => picture as unknown as NativeImage) },
    };
    const capture = (rect = { x: 10, y: 20, width: 800, height: 600 }, maxEdge = 1280) => captureViewportImage(window as unknown as BrowserWindow, rect, maxEdge);
    return { window, picture, resized, capture };
}

describe("MCP viewport capture failure reasons", () => {
    it.each(["window_destroyed", "window_minimized", "window_hidden"] as const)("rejects %s before accessing the capture surface", async reason => {
        const fixture = captureFixture();
        if (reason === "window_destroyed") fixture.window.isDestroyed.mockReturnValue(true);
        if (reason === "window_minimized") fixture.window.isMinimized.mockReturnValue(true);
        if (reason === "window_hidden") fixture.window.isVisible.mockReturnValue(false);
        await expect(fixture.capture()).rejects.toMatchObject({ code: "CAPTURE_UNAVAILABLE", details: { reason } });
        expect(fixture.window.webContents.getZoomFactor).not.toHaveBeenCalled();
        expect(fixture.window.webContents.capturePage).not.toHaveBeenCalled();
        if (reason === "window_destroyed") expect(fixture.window.isMinimized).not.toHaveBeenCalled();
    });

    it.each([
        { x: 0, y: 0, width: 0, height: 100 },
        { x: Number.NaN, y: 0, width: 100, height: 100 },
        { x: 1100, y: 0, width: 100, height: 100 },
    ])("rejects invalid or off-window capture bounds without capturing", async rect => {
        const fixture = captureFixture();
        await expect(fixture.capture(rect)).rejects.toMatchObject({ code: "CAPTURE_UNAVAILABLE", details: { reason: "invalid_rect" } });
        expect(fixture.window.webContents.capturePage).not.toHaveBeenCalled();
    });

    it("reports an empty capture without encoding or resizing it", async () => {
        const fixture = captureFixture();
        fixture.picture.isEmpty.mockReturnValue(true);
        await expect(fixture.capture()).rejects.toMatchObject({ code: "CAPTURE_UNAVAILABLE", details: { reason: "empty_image" } });
        expect(fixture.picture.getSize).not.toHaveBeenCalled();
        expect(fixture.picture.resize).not.toHaveBeenCalled();
    });

    it("preserves zoom, content clipping and proportional resizing", async () => {
        const fixture = captureFixture();
        fixture.window.webContents.getZoomFactor.mockReturnValue(2);
        const result = await fixture.capture({ x: 100, y: 50, width: 500, height: 400 }, 640);
        expect(fixture.window.webContents.capturePage).toHaveBeenCalledWith({ x: 200, y: 100, width: 800, height: 700 });
        expect(fixture.picture.resize).toHaveBeenCalledWith({ width: 640 });
        expect(result).toBe(fixture.resized);
    });

    it("keeps a valid image below the requested limit without enlargement", async () => {
        const fixture = captureFixture();
        expect(await fixture.capture()).toBe(fixture.picture);
        expect(fixture.picture.resize).not.toHaveBeenCalled();
    });
});

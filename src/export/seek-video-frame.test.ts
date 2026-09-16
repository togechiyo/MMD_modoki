import { describe, expect, it, vi } from "vitest";
import { seekVideoFrame } from "./seek-video-frame";

function createVideo() {
    return Object.assign(new EventTarget(), {
        currentTime: 0, readyState: 1, seeking: true, error: null,
        pause: vi.fn(),
    });
}

describe("seekVideoFrame", () => {
    it("waits for seek completion and decoded data before resolving", async () => {
        const video = createVideo();
        let complete = false;
        const pending = seekVideoFrame(video, 1).then(() => { complete = true; });
        expect(video.currentTime).toBe(1);
        video.dispatchEvent(new Event("seeked"));
        await Promise.resolve();
        expect(complete).toBe(false);
        video.seeking = false; video.readyState = 2;
        video.dispatchEvent(new Event("loadeddata"));
        await pending;
        expect(complete).toBe(true);
    });

    it("does not restart an in-flight seek to the same time", async () => {
        const video = createVideo();
        const setTime = vi.fn();
        Object.defineProperty(video, "currentTime", { get: () => 1, set: setTime });
        const pending = seekVideoFrame(video, 1);
        expect(setTime).not.toHaveBeenCalled();
        video.seeking = false; video.readyState = 2;
        video.dispatchEvent(new Event("seeked"));
        await pending;
    });

    it("accepts an already decoded paused frame without waiting for another event", async () => {
        const video = createVideo(); video.readyState = 2; video.seeking = false;
        await seekVideoFrame(video, 0);
        expect(video.pause).toHaveBeenCalledOnce();
    });

    it("accepts Chromium's rounded decoded seek time", async () => {
        const video = createVideo();
        video.currentTime = 2.033332; video.readyState = 4; video.seeking = false;
        await seekVideoFrame(video, 61 / 30);
    });

    it("rejects decode errors and cancellation instead of capturing stale pixels", async () => {
        const video = createVideo();
        const failure = seekVideoFrame(video, 1);
        video.dispatchEvent(new Event("error"));
        await expect(failure).rejects.toThrow("Background video decode failed");
        const controller = new AbortController();
        const canceled = seekVideoFrame(video, 1, controller.signal);
        controller.abort();
        await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    });

    it("bounds a stalled seek", async () => {
        vi.useFakeTimers();
        try {
            const pending = expect(seekVideoFrame(createVideo(), 1)).rejects.toThrow("timed out");
            await vi.advanceTimersByTimeAsync(10000);
            await pending;
        } finally { vi.useRealTimers(); }
    });
});

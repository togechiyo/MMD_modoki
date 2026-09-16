type SeekableVideo = Pick<HTMLVideoElement,
    "currentTime" | "readyState" | "seeking" | "error" | "pause" | "addEventListener" | "removeEventListener">;

/** Wait for decoded media at the requested time, not just the currentTime assignment. */
export async function seekVideoFrame(video: SeekableVideo, time: number, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    video.pause();
    if (video.error) throw new Error(`Background video decode failed: ${video.error.message}`);
    // Chromium can round twice at the microsecond boundary (e.g. 61/30 -> 2.033332).
    // 0.1 ms is below a timeline frame and avoids waiting forever after seeked.
    const atTarget = (): boolean => Math.abs(video.currentTime - time) < 0.0001;
    const ready = (): boolean => atTarget() && !video.seeking && video.readyState >= 2;
    if (ready()) return;
    await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
            clearTimeout(timeout);
            for (const event of ["seeked", "loadeddata", "canplay"]) video.removeEventListener(event, onReady);
            video.removeEventListener("error", onError);
            video.removeEventListener("emptied", onError);
            signal?.removeEventListener("abort", onAbort);
        };
        const finish = (error?: unknown): void => {
            cleanup();
            if (error !== undefined) reject(error); else resolve();
        };
        const onReady = (): void => { if (ready()) finish(); };
        const onError = (): void => finish(new Error(`Background video decode failed: ${video.error?.message ?? "media unloaded"}`));
        const onAbort = (): void => finish(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        const timeout = setTimeout(() => finish(new Error(
            `Background video seek timed out at ${time}s (current=${video.currentTime}, readyState=${video.readyState}, seeking=${video.seeking})`,
        )), 10000);
        for (const event of ["seeked", "loadeddata", "canplay"]) video.addEventListener(event, onReady);
        video.addEventListener("error", onError);
        video.addEventListener("emptied", onError);
        signal?.addEventListener("abort", onAbort, { once: true });
        try {
            // An in-flight seek to this time must finish instead of being restarted.
            if (!atTarget()) video.currentTime = time;
            onReady();
        } catch (error) { finish(error); }
    });
}

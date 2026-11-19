// loadeddata can precede a frame that drawImage can read. Use presentation
// evidence, as in csm-distance-fade-export.spec, rather than a fixed delay.
export async function decodeFirstVideoFrame(page, path) {
  return await page.evaluate(async path => {
    const bytes = await window.electronAPI.readBinaryFile(path);
    if (!bytes) throw new Error("WebM output unavailable");
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "video/webm" }));
    const video = document.createElement("video");
    video.muted = true;
    const waitFor = (event, label, start) => new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener(event, ready);
        video.removeEventListener("error", failed);
      };
      const ready = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error(`WebM first-frame ${label} failed`)); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`WebM first-frame ${label} timeout`)); }, 15000);
      video.addEventListener(event, ready, { once: true });
      video.addEventListener("error", failed, { once: true });
      try { start(); } catch (error) { cleanup(); reject(error); }
    });
    try {
      await waitFor("loadeddata", "decode", () => { video.src = url; video.load(); });
      await waitFor("seeked", "seek", () => {
        video.currentTime = Math.min(.001, Number.isFinite(video.duration) ? video.duration / 2 : .001);
      });
      if (typeof video.requestVideoFrameCallback !== "function") throw new Error("Video frame presentation callback unavailable");
      const presented = await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          video.cancelVideoFrameCallback(callbackId);
          video.removeEventListener("error", failed);
        };
        const fail = error => { cleanup(); reject(error); };
        const failed = () => fail(new Error("WebM first-frame presentation failed"));
        const timer = setTimeout(() => fail(new Error("WebM first-frame presentation timeout")), 15000);
        const callbackId = video.requestVideoFrameCallback((_now, metadata) => {
          cleanup();
          resolve({ mediaTime: metadata.mediaTime, presentedFrames: metadata.presentedFrames,
            width: metadata.width, height: metadata.height });
        });
        video.addEventListener("error", failed, { once: true });
        video.play().catch(fail);
      });
      video.pause();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Video decode canvas unavailable");
      context.drawImage(video, 0, 0);
      return { width: canvas.width, height: canvas.height, presented,
        png: canvas.toDataURL("image/png").split(",")[1] };
    } finally {
      video.pause();
      video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
    }
  }, path);
}

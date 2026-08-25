export type WebmVideoEncodingQuality = {
    bitrate: number;
    bitrateMode: "variable";
    latencyMode: "quality";
};

export function getWebmVideoEncodingQuality(width: number, height: number, fps: number): WebmVideoEncodingQuality {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const pixelCount = safeWidth * safeHeight;
    const isHighFrameRate = fps > 30;

    // Keep delivery-oriented defaults near the upper end of major video-site
    // recommendations without multiplying bitrate linearly for 60 fps.
    let bitrate: number;
    if (pixelCount <= 1280 * 720) {
        bitrate = 10_000_000;
    } else if (pixelCount <= 1920 * 1200) {
        bitrate = isHighFrameRate ? 25_000_000 : 20_000_000;
    } else if (pixelCount <= 2560 * 1440) {
        bitrate = 30_000_000;
    } else if (pixelCount <= 3840 * 2160) {
        bitrate = isHighFrameRate ? 68_000_000 : 60_000_000;
    } else {
        bitrate = isHighFrameRate ? 100_000_000 : 80_000_000;
    }

    return {
        bitrate,
        bitrateMode: "variable",
        latencyMode: "quality",
    };
}

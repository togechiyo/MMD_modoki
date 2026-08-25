export type WebmVideoEncodingQuality = {
    bitrate: number;
    bitrateMode: "variable";
    latencyMode: "quality";
};

export function getWebmVideoEncodingQuality(width: number, height: number, fps: number): WebmVideoEncodingQuality {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    const megapixels = (safeWidth * safeHeight) / 1_000_000;
    const frameRateScale = Math.max(1, Math.min(2, fps / 30));

    // Lower-resolution delivery files do not benefit from 4K downsampling, so give
    // 1080p/QHD more bits per pixel to preserve toon and skin gradients.
    const bitsPerSecondPerMegapixel = megapixels <= 3.8 ? 8_000_000 : 5_500_000;
    const bitrate = Math.round(megapixels * bitsPerSecondPerMegapixel * frameRateScale);

    return {
        bitrate: Math.max(12_000_000, Math.min(100_000_000, bitrate)),
        bitrateMode: "variable",
        latencyMode: "quality",
    };
}

import { describe, expect, it } from "vitest";
import { getWebmVideoEncodingQuality } from "./webm-video-quality-policy";

describe("WebM video quality policy", () => {
    it("raises 1080p and QHD headroom for gradients", () => {
        expect(getWebmVideoEncodingQuality(1920, 1080, 30).bitrate).toBe(16_588_800);
        expect(getWebmVideoEncodingQuality(2560, 1440, 30).bitrate).toBe(29_491_200);
    });

    it("scales 60 fps output and caps unusually large frames", () => {
        expect(getWebmVideoEncodingQuality(1920, 1080, 60).bitrate).toBe(33_177_600);
        expect(getWebmVideoEncodingQuality(8192, 8192, 60).bitrate).toBe(100_000_000);
    });

    it("uses offline quality-oriented encoder options", () => {
        expect(getWebmVideoEncodingQuality(3840, 2160, 30)).toMatchObject({
            bitrateMode: "variable",
            latencyMode: "quality",
        });
    });
});

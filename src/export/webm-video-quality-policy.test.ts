import { describe, expect, it } from "vitest";
import { getWebmVideoEncodingQuality } from "./webm-video-quality-policy";

describe("WebM video quality policy", () => {
    it("uses delivery-site upper-range targets through QHD", () => {
        expect(getWebmVideoEncodingQuality(1280, 720, 30).bitrate).toBe(10_000_000);
        expect(getWebmVideoEncodingQuality(1920, 1080, 30).bitrate).toBe(20_000_000);
        expect(getWebmVideoEncodingQuality(1920, 1080, 60).bitrate).toBe(25_000_000);
        expect(getWebmVideoEncodingQuality(2560, 1440, 30).bitrate).toBe(30_000_000);
        expect(getWebmVideoEncodingQuality(2560, 1440, 60).bitrate).toBe(30_000_000);
    });

    it("uses 4K site ceilings and bounds larger output", () => {
        expect(getWebmVideoEncodingQuality(3840, 2160, 30).bitrate).toBe(60_000_000);
        expect(getWebmVideoEncodingQuality(3840, 2160, 60).bitrate).toBe(68_000_000);
        expect(getWebmVideoEncodingQuality(8192, 8192, 30).bitrate).toBe(80_000_000);
        expect(getWebmVideoEncodingQuality(8192, 8192, 60).bitrate).toBe(100_000_000);
    });

    it("uses offline quality-oriented encoder options", () => {
        expect(getWebmVideoEncodingQuality(3840, 2160, 30)).toMatchObject({
            bitrateMode: "variable",
            latencyMode: "quality",
        });
    });
});

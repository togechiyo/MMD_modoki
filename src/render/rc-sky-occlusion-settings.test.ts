import { describe, expect, it } from "vitest";
import { cloneRcSkyOcclusionSettings, DEFAULT_RC_SKY_OCCLUSION_SETTINGS, normalizeRcSkyOcclusionSettings } from "./rc-sky-occlusion-settings";

describe("RC sky occlusion settings", () => {
    it("keeps absent and malformed old-project values OFF", () => {
        for (const value of [undefined, null, {}, false, { enabled: "true", strength: NaN, minimum: Infinity }]) {
            expect(normalizeRcSkyOcclusionSettings(value)).toEqual(DEFAULT_RC_SKY_OCCLUSION_SETTINGS);
        }
    });
    it("normalizes scalar limits without losing disabled settings", () => {
        expect(normalizeRcSkyOcclusionSettings({ enabled: false, strength: 2, minimum: -1 })).toEqual({ enabled: false, strength: 1, minimum: 0, volume: null });
        expect(normalizeRcSkyOcclusionSettings({ enabled: true, strength: 0, minimum: 1 })).toEqual({ enabled: true, strength: 0, minimum: 1, volume: null });
    });
    it("accepts only finite nonempty cubic volumes and copies their coordinates", () => {
        for (const volume of [{ min: [0, 0], size: 16 }, { min: [0, NaN, 0], size: 16 }, { min: [0, 0, 0], size: 0 }, { min: [0, 0, 0], size: Infinity }]) {
            expect(normalizeRcSkyOcclusionSettings({ volume }).volume).toBeNull();
        }
        const input = { enabled: true, strength: 0.5, minimum: 0.1, volume: { min: [-8, 0, -8], size: 16 } };
        const normalized = normalizeRcSkyOcclusionSettings(input);
        const copied = cloneRcSkyOcclusionSettings(normalized);
        input.volume.min[0] = 100;
        if (copied.volume) copied.volume.min[1] = 100;
        expect(normalized.volume).toEqual({ min: [-8, 0, -8], size: 16 });
        expect(cloneRcSkyOcclusionSettings({ ...normalized, volume: null }).volume).toBeNull();
        expect(normalizeRcSkyOcclusionSettings({ volume: { min: [-1e9, 0, 1e9], size: 1e9 } }).volume).toEqual({ min: [-1e6, 0, 1e6], size: 100000 });
        expect(normalizeRcSkyOcclusionSettings({ volume: { min: [0, 0, 0], size: 0.01 } }).volume?.size).toBe(0.1);
    });
});

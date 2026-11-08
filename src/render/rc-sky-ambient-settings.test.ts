import { describe, expect, it } from "vitest";
import { cloneRcSkyAmbientSettings, DEFAULT_RC_SKY_AMBIENT_SETTINGS, normalizeRcSkyAmbientSettings } from "./rc-sky-ambient-settings";

describe("Sky Ambient RC saved settings", () => {
    it("keeps absent or malformed old-project settings disabled", () => {
        for (const raw of [undefined, null, {}, false, { enabled: "true", strength: NaN, fill: Infinity, baseLight: "0.5" }]) {
            expect(normalizeRcSkyAmbientSettings(raw)).toEqual(DEFAULT_RC_SKY_AMBIENT_SETTINGS);
        }
    });
    it("keeps OFF values and clamps independent shading and residual fill", () => {
        expect(normalizeRcSkyAmbientSettings({ enabled: false, strength: 1.6, fill: 0.07 }))
            .toEqual({ ...DEFAULT_RC_SKY_AMBIENT_SETTINGS, enabled: false, strength: 1.6, fill: 0.07 });
        expect(normalizeRcSkyAmbientSettings({ enabled: true, strength: 5, fill: -1 }))
            .toEqual({ ...DEFAULT_RC_SKY_AMBIENT_SETTINGS, enabled: true, strength: 2, fill: 0 });
        expect(normalizeRcSkyAmbientSettings({ enabled: true, strength: -1, fill: 5 }))
            .toEqual({ ...DEFAULT_RC_SKY_AMBIENT_SETTINGS, enabled: true, strength: 0, fill: 1 });
        expect(normalizeRcSkyAmbientSettings({ baseLight: 2 }).baseLight).toBe(1);
        expect(normalizeRcSkyAmbientSettings({ baseLight: -1 }).baseLight).toBe(0);
        expect(normalizeRcSkyAmbientSettings({ enabled: false, baseLight: 0.6 }).baseLight).toBe(0.6);
    });
    it("preserves legacy control values and normalizes density and development settings independently", () => {
        expect(normalizeRcSkyAmbientSettings({ enabled: true, strength: 1.2 }))
            .toMatchObject({ opacity: 1, skyBrightness: 0, rangeScale: 1, quality: "standard" });
        expect(normalizeRcSkyAmbientSettings({ opacity: 0, rangeScale: 0.5, quality: "low" }))
            .toMatchObject({ opacity: 0, rangeScale: 0.5, quality: "low" });
        expect(normalizeRcSkyAmbientSettings({ opacity: 2, rangeScale: 100, quality: "high" }))
            .toMatchObject({ opacity: 1, rangeScale: 4, quality: "high" });
        expect(normalizeRcSkyAmbientSettings({ opacity: -1, rangeScale: -2, quality: "ultra" }))
            .toMatchObject({ opacity: 0, rangeScale: 0.25, quality: "standard" });
        expect(normalizeRcSkyAmbientSettings({ opacity: NaN, rangeScale: Infinity, quality: null }))
            .toEqual(DEFAULT_RC_SKY_AMBIENT_SETTINGS);
    });
    it("keeps additive sky opt-in and independent from legacy base lighting", () => {
        expect(normalizeRcSkyAmbientSettings({ baseLight: 0.8 })).toMatchObject({ skyBrightness: 0, baseLight: 0.8 });
        expect(normalizeRcSkyAmbientSettings({ skyBrightness: 1.6, strength: 0, fill: 0.2 }))
            .toMatchObject({ skyBrightness: 1.6, strength: 0, fill: 0.2 });
        expect(normalizeRcSkyAmbientSettings({ skyBrightness: 5 }).skyBrightness).toBe(2);
        expect(normalizeRcSkyAmbientSettings({ skyBrightness: -1 }).skyBrightness).toBe(0);
        for (const value of [NaN, Infinity, "1.2"]) expect(normalizeRcSkyAmbientSettings({ skyBrightness: value }).skyBrightness).toBe(0);
    });
    it("copies bounded volumes and rejects invalid coordinates", () => {
        const raw = { volume: { min: [-4, -2, -4], size: 32 } };
        const settings = normalizeRcSkyAmbientSettings(raw), copy = cloneRcSkyAmbientSettings(settings);
        raw.volume.min[0] = 100;
        if (copy.volume) copy.volume.min[1] = 200;
        expect(settings.volume).toEqual({ min: [-4, -2, -4], size: 32 });
        expect(normalizeRcSkyAmbientSettings({ volume: { min: [0, NaN, 0], size: 10 } }).volume).toBeNull();
        expect(normalizeRcSkyAmbientSettings({ volume: { min: [0, 0, 0], size: 0 } }).volume).toBeNull();
        expect(normalizeRcSkyAmbientSettings({ volume: { min: [-1e9, 0, 1e9], size: 1e9 } }).volume)
            .toEqual({ min: [-1e6, 0, 1e6], size: 100000 });
        expect(cloneRcSkyAmbientSettings({ ...settings, volume: null }).volume).toBeNull();
    });
});

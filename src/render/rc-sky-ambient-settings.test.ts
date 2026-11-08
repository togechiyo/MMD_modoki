import { describe, expect, it } from "vitest";
import { cloneRcSkyAmbientSettings, DEFAULT_RC_SKY_AMBIENT_SETTINGS, normalizeRcSkyAmbientSettings } from "./rc-sky-ambient-settings";

describe("Sky Ambient RC saved settings", () => {
    it("keeps absent or malformed old-project settings disabled", () => {
        for (const raw of [undefined, null, {}, false, { enabled: "true", strength: NaN, fill: Infinity, baseLight: "0.5" }]) {
            expect(normalizeRcSkyAmbientSettings(raw)).toEqual(DEFAULT_RC_SKY_AMBIENT_SETTINGS);
        }
    });
    it("keeps OFF values, permits strong sky, and clamps independent fill", () => {
        expect(normalizeRcSkyAmbientSettings({ enabled: false, strength: 1.6, fill: 0.07 }))
            .toEqual({ enabled: false, strength: 1.6, fill: 0.07, baseLight: 0.25, volume: null });
        expect(normalizeRcSkyAmbientSettings({ enabled: true, strength: 5, fill: -1 }))
            .toEqual({ enabled: true, strength: 2, fill: 0, baseLight: 0.25, volume: null });
        expect(normalizeRcSkyAmbientSettings({ enabled: true, strength: -1, fill: 5 }))
            .toEqual({ enabled: true, strength: 0, fill: 1, baseLight: 0.25, volume: null });
        expect(normalizeRcSkyAmbientSettings({ baseLight: 2 }).baseLight).toBe(1);
        expect(normalizeRcSkyAmbientSettings({ baseLight: -1 }).baseLight).toBe(0);
        expect(normalizeRcSkyAmbientSettings({ enabled: false, baseLight: 0.6 }).baseLight).toBe(0.6);
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

import { describe, expect, it } from "vitest";
import { cloneRcDiffuseGiSettings, DEFAULT_RC_DIFFUSE_GI_SETTINGS, normalizeRcDiffuseGiSettings } from "./rc-diffuse-gi-settings";

describe("RC diffuse GI settings", () => {
    it("defaults old projects to OFF and clamps finite strength independently of sky", () => {
        expect(normalizeRcDiffuseGiSettings(undefined)).toEqual(DEFAULT_RC_DIFFUSE_GI_SETTINGS);
        expect(normalizeRcDiffuseGiSettings({ enabled: 1, strength: Infinity })).toEqual(DEFAULT_RC_DIFFUSE_GI_SETTINGS);
        expect(normalizeRcDiffuseGiSettings({ enabled: true, strength: 8, minimum: 0.7 })).toEqual({ enabled: true, strength: 2, volume: null });
        expect(normalizeRcDiffuseGiSettings({ strength: -1 }).strength).toBe(0);
        expect(normalizeRcDiffuseGiSettings({ strength: 1.6 }).strength).toBe(1.6);
    });

    it("keeps automatic volume null, rejects invalid bounds and owns fixed bounds", () => {
        for (const volume of [null, { min: [0, 0], size: 16 }, { min: [0, NaN, 0], size: 16 }, { min: [0, 0, 0], size: 0 }, { min: [0, 0, 0], size: Infinity }]) {
            expect(normalizeRcDiffuseGiSettings({ volume }).volume).toBeNull();
        }
        const source = { enabled: true, strength: 1, volume: { min: [-8, 0, -8], size: 16 } };
        const normalized = normalizeRcDiffuseGiSettings(source), copy = cloneRcDiffuseGiSettings(normalized);
        source.volume.min[0] = 100;
        if (copy.volume) copy.volume.min[1] = 100;
        expect(normalized.volume).toEqual({ min: [-8, 0, -8], size: 16 });
        expect(normalizeRcDiffuseGiSettings({ volume: { min: [-1e9, 0, 1e9], size: 1e9 } }).volume).toEqual({ min: [-1e6, 0, 1e6], size: 100000 });
        expect(normalizeRcDiffuseGiSettings({ volume: { min: [0, 0, 0], size: 0.01 } }).volume?.size).toBe(0.1);
    });
});

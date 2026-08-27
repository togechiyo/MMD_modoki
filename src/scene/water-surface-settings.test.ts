import { describe, expect, it } from "vitest";
import {
    DEFAULT_WATER_SURFACE_SETTINGS,
    normalizeWaterSurfaceSettings,
} from "./water-surface-settings";

describe("normalizeWaterSurfaceSettings", () => {
    it("uses stable defaults for legacy projects", () => {
        expect(normalizeWaterSurfaceSettings(undefined)).toEqual(DEFAULT_WATER_SURFACE_SETTINGS);
    });

    it("clamps Babylon WaterMaterial parameters and normalizes wind direction", () => {
        const settings = normalizeWaterSurfaceSettings({
            enabled: true,
            resolution: 800,
            windDirectionDegrees: -45,
            waveHeight: 4,
            waveLength: 0,
            waterColor: { r: -1, g: 0.4, b: 2 },
        });

        expect(settings.enabled).toBe(true);
        expect(settings.resolution).toBe(1024);
        expect(settings.windDirectionDegrees).toBe(315);
        expect(settings.waveHeight).toBe(1);
        expect(settings.waveLength).toBe(0.01);
        expect(settings.waterColor).toEqual({ r: 0, g: 0.4, b: 1 });
    });

    it("merges partial changes into the current settings", () => {
        const current = normalizeWaterSurfaceSettings({
            enabled: true,
            size: 80,
            waterColor: { r: 0.1, g: 0.2, b: 0.3 },
        });
        const next = normalizeWaterSurfaceSettings({ waveSpeed: 1.2 }, current);

        expect(next.enabled).toBe(true);
        expect(next.size).toBe(80);
        expect(next.waveSpeed).toBe(1.2);
        expect(next.waterColor).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
    });
});

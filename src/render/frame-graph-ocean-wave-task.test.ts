import { describe, expect, it } from "vitest";
import {
    OCEAN_WAVE_BAND_CONFIGS,
} from "./frame-graph-ocean-wave-task";

describe("ocean multi-band wave-field configuration", () => {
    it("separates broad, medium, and fine world scales by large ratios", () => {
        expect(OCEAN_WAVE_BAND_CONFIGS.map((config) => config.band)).toEqual([
            "broad",
            "medium",
            "fine",
        ]);
        expect(OCEAN_WAVE_BAND_CONFIGS[0].tileSize / OCEAN_WAVE_BAND_CONFIGS[1].tileSize)
            .toBeGreaterThanOrEqual(8);
        expect(OCEAN_WAVE_BAND_CONFIGS[1].tileSize / OCEAN_WAVE_BAND_CONFIGS[2].tileSize)
            .toBeGreaterThanOrEqual(8);
    });

    it("uses distinct deterministic direction and phase seeds per band", () => {
        const uniqueSeeds = new Set(OCEAN_WAVE_BAND_CONFIGS.map((config) => config.seed));
        const uniqueRotations = new Set(
            OCEAN_WAVE_BAND_CONFIGS.map((config) => config.directionRotation),
        );
        expect(uniqueSeeds.size).toBe(OCEAN_WAVE_BAND_CONFIGS.length);
        expect(uniqueRotations.size).toBe(OCEAN_WAVE_BAND_CONFIGS.length);
    });

    it("assigns less geometric amplitude to shorter wavelengths", () => {
        const broad = OCEAN_WAVE_BAND_CONFIGS[0];
        const medium = OCEAN_WAVE_BAND_CONFIGS[1];
        const fine = OCEAN_WAVE_BAND_CONFIGS[2];
        expect(broad.amplitude).toBeGreaterThan(medium.amplitude);
        expect(medium.amplitude).toBeGreaterThan(fine.amplitude);
    });
});

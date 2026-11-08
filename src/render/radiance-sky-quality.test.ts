import { describe, expect, it } from "vitest";
import { createRadianceCascadeLayouts } from "./radiance-cascade-lab-model";
import { createSkyVisibilityCascadeLayouts, getSkyVisibilityProbeGrid, scaleSkyVisibilityVolume } from "./radiance-sky-quality";

describe("sky field spatial quality", () => {
    it("keeps the default and standard fields identical to the existing sky field", () => {
        expect(createSkyVisibilityCascadeLayouts()).toEqual(createRadianceCascadeLayouts());
        expect(createSkyVisibilityCascadeLayouts("standard")).toEqual(createRadianceCascadeLayouts());
        expect(getSkyVisibilityProbeGrid()).toBe(16);
    });

    it("scales actual probe storage while preserving angular directions and transport intervals", () => {
        const standard = createRadianceCascadeLayouts();
        const baseBytes = standard.reduce((sum, item) => sum + item.width * item.height * 8, 0);
        for (const [quality, expectedGrid, ratio] of [["low", 8, 1 / 8], ["standard", 16, 1], ["high", 32, 8]] as const) {
            const layouts = createSkyVisibilityCascadeLayouts(quality);
            expect(getSkyVisibilityProbeGrid(quality)).toBe(expectedGrid);
            expect(layouts[0].grid).toBe(expectedGrid);
            expect(layouts.reduce((sum, item) => sum + item.width * item.height * 8, 0)).toBe(baseBytes * ratio);
            for (let i = 0; i < layouts.length; i++) {
                const level = layouts[i], old = standard[i];
                expect(level).toMatchObject({ directionsX: old.directionsX, directionsY: old.directionsY, start: old.start, end: old.end });
                expect(level.grid).toBeGreaterThanOrEqual(1);
                expect(level.width).toBeLessThanOrEqual(8192);
                expect(level.height).toBeLessThanOrEqual(8192);
                expect(level.width * level.height).toBe(level.grid ** 3 * level.directionsX * level.directionsY);
                if (i > 0) expect(level.grid * 2).toBe(layouts[i - 1].grid);
            }
        }
    });
});

describe("sky volume range", () => {
    it("scales about the base center without mutating or cumulatively scaling its saved bounds", () => {
        const base = { min: [-10, 5, 2] as [number, number, number], size: 20 };
        const center = base.min.map(value => value + base.size / 2);
        for (const scale of [0.25, 1, 2, 4]) {
            const effective = scaleSkyVisibilityVolume(base, scale);
            expect(effective.size).toBe(base.size * scale);
            expect(effective.min.map(value => value + effective.size / 2)).toEqual(center);
        }
        expect(base).toEqual({ min: [-10, 5, 2], size: 20 });
        expect(scaleSkyVisibilityVolume(base, 1)).toEqual(base);
    });

    it("keeps invalid or unbounded scale inputs from reaching the renderer", () => {
        const base = { min: [0, 0, 0] as const, size: 8 };
        expect(scaleSkyVisibilityVolume(base, NaN).size).toBe(8);
        expect(scaleSkyVisibilityVolume(base, Infinity).size).toBe(8);
        expect(scaleSkyVisibilityVolume(base, -1).size).toBe(2);
        expect(scaleSkyVisibilityVolume(base, 100).size).toBe(32);
    });
});

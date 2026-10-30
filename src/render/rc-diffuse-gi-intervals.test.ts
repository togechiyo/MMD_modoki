import { describe, expect, it } from "vitest";
import { createRcDiffuseGiIntervals } from "./rc-diffuse-gi-intervals";
import { RC_DIFFUSE_GI_GRID } from "./rc-diffuse-gi-irradiance";

describe("RC diffuse GI intervals", () => {
    it("keeps the first four probe cells in the finest cascade", () => {
        for (const size of [0.1, 16, 57.84, 128]) {
            const first = createRcDiffuseGiIntervals(size)[0];
            expect(first.start).toBe(0);
            expect(first.end / (size / RC_DIFFUSE_GI_GRID)).toBeCloseTo(4);
        }
    });

    it("covers successive near and far distances without gaps or overlap", () => {
        expect(createRcDiffuseGiIntervals(16)).toEqual([
            { start: 0, end: 4 }, { start: 4, end: 20 },
            { start: 20, end: 84 }, { start: 84, end: 340 },
        ]);
        for (const size of [0.1, 57.84, 128]) {
            const intervals = createRcDiffuseGiIntervals(size);
            for (let i = 1; i < intervals.length; i++) {
                expect(intervals[i].start).toBe(intervals[i - 1].end);
                expect(intervals[i].end).toBeGreaterThan(intervals[i].start);
            }
        }
    });

    it("scales all intervals with the world volume", () => {
        const small = createRcDiffuseGiIntervals(16);
        const large = createRcDiffuseGiIntervals(57.84);
        for (let i = 0; i < small.length; i++) {
            expect(large[i].start).toBeCloseTo(small[i].start * 57.84 / 16);
            expect(large[i].end).toBeCloseTo(small[i].end * 57.84 / 16);
        }
    });
});

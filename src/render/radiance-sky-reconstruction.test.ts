import { describe, expect, it } from "vitest";
import { DEFAULT_SKY_RECONSTRUCTION, normalizeSkyReconstruction } from "./radiance-sky-reconstruction";

describe("sky reconstruction comparison settings", () => {
    it("normalizes non-finite and out-of-budget trace distances", () => {
        for (const nearDistance of [NaN, Infinity, -Infinity]) {
            expect(normalizeSkyReconstruction({ nearDistance }).nearDistance).toBe(DEFAULT_SKY_RECONSTRUCTION.nearDistance);
        }
        expect(normalizeSkyReconstruction({ nearDistance: -1 }).nearDistance).toBe(0);
        expect(normalizeSkyReconstruction({ nearDistance: 65 }).nearDistance).toBe(64);
    });

    it("preserves independent comparison controls and is idempotent", () => {
        const value = normalizeSkyReconstruction({ nearDistance: 4, rejectOccludedProbes: true, sampleAtRayEnd: true });
        expect(value).toEqual({ nearDistance: 4, rejectOccludedProbes: true, sampleAtRayEnd: true });
        expect(normalizeSkyReconstruction(value)).toEqual(value);
        expect(normalizeSkyReconstruction({})).toEqual(DEFAULT_SKY_RECONSTRUCTION);
    });
});

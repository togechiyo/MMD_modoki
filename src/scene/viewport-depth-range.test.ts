import { describe, expect, it } from "vitest";
import {
    DEFAULT_CAMERA_MAX_Z,
    DEFAULT_SKYDOME_FAR_PLANE_RATIO,
    getDefaultSkydomeDiameter,
} from "./viewport-depth-range";

describe("viewport depth range", () => {
    it("keeps the city-scale far plane at 100,000 units", () => {
        expect(DEFAULT_CAMERA_MAX_Z).toBe(100_000);
    });

    it("places the default skydome just inside the far plane", () => {
        const radius = getDefaultSkydomeDiameter() / 2;

        expect(radius).toBe(DEFAULT_CAMERA_MAX_Z * DEFAULT_SKYDOME_FAR_PLANE_RATIO);
        expect(radius).toBeLessThan(DEFAULT_CAMERA_MAX_Z);
    });
});

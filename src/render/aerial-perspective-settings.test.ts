import { describe, expect, it } from "vitest";
import {
    DEFAULT_AERIAL_PERSPECTIVE_COLOR,
    DEFAULT_AERIAL_PERSPECTIVE_RANGE,
    DEFAULT_AERIAL_PERSPECTIVE_START,
    DEFAULT_AERIAL_PERSPECTIVE_STRENGTH,
    resolveAerialPerspectiveSettings,
} from "./aerial-perspective-settings";

describe("aerial perspective settings", () => {
    it("keeps the default deliberately subtle and far-biased", () => {
        expect(DEFAULT_AERIAL_PERSPECTIVE_STRENGTH).toBe(0.18);
        expect(DEFAULT_AERIAL_PERSPECTIVE_START).toBe(55);
        expect(DEFAULT_AERIAL_PERSPECTIVE_RANGE).toBe(180);
        expect(DEFAULT_AERIAL_PERSPECTIVE_COLOR).toEqual({ r: 0.72, g: 0.79, b: 0.83 });
    });

    it("clamps project and runtime inputs without allowing a full-screen opaque fog", () => {
        expect(resolveAerialPerspectiveSettings({
            strength: 8,
            startDistance: -20,
            transitionRange: 0,
            color: { r: -1, g: 0.5, b: 3 },
            lightColor: { r: 2, g: -1, b: 0.25 },
            lightIntensity: 8,
        })).toEqual({
            strength: 0.6,
            startDistance: 0,
            transitionRange: 1,
            color: { r: 0, g: 0.5, b: 1 },
            lightColor: { r: 1, g: 0, b: 0.25 },
            lightIntensity: 4,
        });
    });
});

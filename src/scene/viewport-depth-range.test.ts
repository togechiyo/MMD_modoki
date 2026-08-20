import { describe, expect, it } from "vitest";
import {
    configureViewportDepthBuffer,
    DEFAULT_CAMERA_MAX_Z,
    DEFAULT_SKYDOME_FAR_PLANE_RATIO,
    getDefaultSkydomeDiameter,
    isCascadedShadowCompatible,
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

    it("uses reverse depth for WebGPU wide-area rendering", () => {
        const engine = { useReverseDepthBuffer: false };

        expect(configureViewportDepthBuffer(engine, "webgpu")).toBe(true);
        expect(engine.useReverseDepthBuffer).toBe(true);
    });

    it("keeps WebGL on the standard depth buffer", () => {
        const engine = { useReverseDepthBuffer: true };

        expect(configureViewportDepthBuffer(engine, "webgl")).toBe(false);
        expect(engine.useReverseDepthBuffer).toBe(false);
    });

    it("disables cascaded shadows when reverse depth is active", () => {
        expect(isCascadedShadowCompatible({ useReverseDepthBuffer: true }, true)).toBe(false);
    });

    it("keeps cascaded shadows available with the standard depth buffer", () => {
        expect(isCascadedShadowCompatible({ useReverseDepthBuffer: false }, true)).toBe(true);
        expect(isCascadedShadowCompatible({ useReverseDepthBuffer: false }, false)).toBe(false);
    });
});

import { describe, expect, it } from "vitest";
import { selectDirectionalShadowMap } from "./directional-shadow-map";

const caps = { maxTextureSize: 16384, textureFloatRender: true, textureFloatLinearFiltering: true };

describe("directional shadow map selection", () => {
    it("uses the tested 6144 float32 map for hard WebGPU cascades", () => {
        expect(selectDirectionalShadowMap(caps, true, true, false)).toEqual({ mapSize: 6144, preferFloat32: true });
    });

    it.each([
        { name: "PCSS", webgpu: true, cascaded: true, penumbra: true },
        { name: "WebGL CSM", webgpu: false, cascaded: true, penumbra: false },
        { name: "standard shadows", webgpu: true, cascaded: false, penumbra: false },
    ])("keeps the 8192 half-first preference for $name", ({ webgpu, cascaded, penumbra }) => {
        expect(selectDirectionalShadowMap(caps, webgpu, cascaded, penumbra)).toEqual({ mapSize: 8192, preferFloat32: false });
    });

    it("uses nearest float32 for hard shadows even without the optional linear filtering feature", () => {
        const nearestOnly = { ...caps, textureFloatLinearFiltering: false };
        expect(selectDirectionalShadowMap(nearestOnly, true, true, false)).toEqual({ mapSize: 6144, preferFloat32: true });
        expect(selectDirectionalShadowMap(nearestOnly, true, true, true)).toEqual({ mapSize: 8192, preferFloat32: false });
    });

    it("falls back when float32 rendering is unavailable", () => {
        expect(selectDirectionalShadowMap({ ...caps, textureFloatRender: false }, true, true, false))
            .toEqual({ mapSize: 8192, preferFloat32: false });
    });

    it.each([4096, undefined])("respects a smaller or missing maximum texture size (%s)", maxTextureSize => {
        const limited = { ...caps, maxTextureSize };
        expect(selectDirectionalShadowMap(limited, true, true, false)).toEqual({ mapSize: 4096, preferFloat32: true });
        expect(selectDirectionalShadowMap(limited, true, true, true)).toEqual({ mapSize: 4096, preferFloat32: false });
    });
});

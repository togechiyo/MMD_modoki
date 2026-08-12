import { describe, expect, it } from "vitest";
import { FRAME_GRAPH_OCEAN_VOLUME_COMPUTE_WGSL } from "./frame-graph-ocean-volume-shaders";
import { resolveOceanVolumeResolution } from "./frame-graph-ocean-volume-task";

describe("ocean volume compute pass", () => {
    it("uses ceil-divided half resolution for odd render sizes", () => {
        expect(resolveOceanVolumeResolution(641, 359)).toEqual({
            inputWidth: 641,
            inputHeight: 359,
            outputWidth: 321,
            outputHeight: 180,
        });
    });

    it("never creates a zero-sized storage texture", () => {
        expect(resolveOceanVolumeResolution(0, -3)).toEqual({
            inputWidth: 1,
            inputHeight: 1,
            outputWidth: 1,
            outputHeight: 1,
        });
    });

    it("integrates more samples than the previous six-step fragment approximation", () => {
        expect(FRAME_GRAPH_OCEAN_VOLUME_COMPUTE_WGSL).toContain("const stepCount = 12u");
        expect(FRAME_GRAPH_OCEAN_VOLUME_COMPUTE_WGSL).toContain("params.lightDirection");
        expect(FRAME_GRAPH_OCEAN_VOLUME_COMPUTE_WGSL).toContain("sampleDisplacedWaveField(entryXz).a");
        expect(FRAME_GRAPH_OCEAN_VOLUME_COMPUTE_WGSL).not.toContain("stablePixelJitter");
    });
});

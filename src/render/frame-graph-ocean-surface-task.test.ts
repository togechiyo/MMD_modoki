import { describe, expect, it } from "vitest";
import {
    buildOceanSurfaceClipmapGeometry,
    OCEAN_SURFACE_CLIPMAP_LEVELS,
} from "./frame-graph-ocean-surface-task";
import { FRAME_GRAPH_OCEAN_SURFACE_FRAGMENT_WGSL } from "./frame-graph-ocean-surface-shaders";

describe("ocean surface clipmap geometry", () => {
    it("uses progressively coarser near, middle, and far levels", () => {
        expect(OCEAN_SURFACE_CLIPMAP_LEVELS).toEqual([
            { halfExtent: 128, cellSize: 2, innerHalfExtent: 0 },
            { halfExtent: 512, cellSize: 8, innerHalfExtent: 128 },
            { halfExtent: 2048, cellSize: 32, innerHalfExtent: 512 },
        ]);
    });

    it("builds one full center and two rings without empty geometry", () => {
        const geometry = buildOceanSurfaceClipmapGeometry();
        expect(geometry.levelVertexCounts).toEqual([16641, 16641, 16641]);
        expect(geometry.levelTriangleCounts[0]).toBe(32768);
        expect(geometry.levelTriangleCounts[1]).toBeLessThan(32768);
        expect(geometry.levelTriangleCounts[1]).toBeGreaterThan(20000);
        expect(geometry.levelTriangleCounts[2]).toBe(geometry.levelTriangleCounts[1]);
        expect(geometry.positions.length / 3).toBe(49923);
        expect(geometry.indices.length).toBeGreaterThan(200000);
    });

    it("keeps each inner boundary aligned to the previous outer boundary", () => {
        for (let index = 1; index < OCEAN_SURFACE_CLIPMAP_LEVELS.length; index += 1) {
            const previous = OCEAN_SURFACE_CLIPMAP_LEVELS[index - 1];
            const current = OCEAN_SURFACE_CLIPMAP_LEVELS[index];
            expect(current.innerHalfExtent).toBe(previous.halfExtent);
            expect(current.innerHalfExtent % current.cellSize).toBe(0);
        }
    });
});

describe("ocean surface alpha", () => {
    it("keeps the unlit surface transparent and only exposes highlights or the waterline", () => {
        expect(FRAME_GRAPH_OCEAN_SURFACE_FRAGMENT_WGSL).toContain(
            "let visibleWaterline = max(waterlineCore * 0.94, waterlineOuter * 0.28)",
        );
        expect(FRAME_GRAPH_OCEAN_SURFACE_FRAGMENT_WGSL).not.toContain("0.08 + fresnel");
    });

    it("wraps bilinear wave samples across periodic texture edges", () => {
        expect(FRAME_GRAPH_OCEAN_SURFACE_FRAGMENT_WGSL).toContain("wrapShadingCoordinate");
        expect(FRAME_GRAPH_OCEAN_SURFACE_FRAGMENT_WGSL).toContain("textureLoad(texture, p11, 0)");
    });
});

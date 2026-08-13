import { describe, expect, it } from "vitest";
import {
    DEFAULT_MMD_RENDER_ORDER_MODE,
    getMmdGeometryBoundsFromPositions,
    getMmdCoplanarMaterialDepthBiasUnits,
    MMD_RENDER_ORDER_ALPHA_INDEX_BASE,
    MMD_RENDER_ORDER_MODEL_STRIDE,
    getMmdMaterialAlphaIndex,
    getNextMmdModelRenderOrder,
    moveMmdModelRenderOrder,
    normalizeMmdRenderOrderMode,
    normalizeMmdCoplanarDepthBiasStrength,
} from "./mmd-render-order";

describe("MMD render order", () => {
    it("keeps evaluated rendering as the safe default", () => {
        expect(normalizeMmdRenderOrderMode(undefined)).toBe(DEFAULT_MMD_RENDER_ORDER_MODE);
        expect(normalizeMmdRenderOrderMode("unknown")).toBe(DEFAULT_MMD_RENDER_ORDER_MODE);
        expect(normalizeMmdRenderOrderMode("mmd-fixed")).toBe("mmd-fixed");
    });

    it("allocates separate alpha-index blocks for models", () => {
        expect(getMmdMaterialAlphaIndex(0, 0)).toBe(MMD_RENDER_ORDER_ALPHA_INDEX_BASE);
        expect(getMmdMaterialAlphaIndex(0, 3)).toBe(MMD_RENDER_ORDER_ALPHA_INDEX_BASE + 3);
        expect(getMmdMaterialAlphaIndex(1, 0)).toBe(
            MMD_RENDER_ORDER_ALPHA_INDEX_BASE + MMD_RENDER_ORDER_MODEL_STRIDE,
        );
    });

    it("moves a model by visual rank without reordering scene model indices", () => {
        expect(moveMmdModelRenderOrder([0, 1, 2], 1, -1)).toEqual([1, 0, 2]);
        expect(moveMmdModelRenderOrder([2, 0, 1], 0, -1)).toEqual([1, 0, 2]);
        expect(moveMmdModelRenderOrder([0, 1], 0, -1)).toBeNull();
    });

    it("allocates after the highest surviving rank", () => {
        expect(getNextMmdModelRenderOrder([])).toBe(0);
        expect(getNextMmdModelRenderOrder([0, 2])).toBe(3);
    });

    it("normalizes the global coplanar correction strength", () => {
        expect(normalizeMmdCoplanarDepthBiasStrength(undefined)).toBe(0);
        expect(normalizeMmdCoplanarDepthBiasStrength(2.4)).toBe(2);
        expect(normalizeMmdCoplanarDepthBiasStrength(99)).toBe(4);
    });

    it("derives an uninflated flat bound from mesh positions", () => {
        expect(getMmdGeometryBoundsFromPositions(new Float32Array([
            -10, -0.0316, -20,
            10, -0.0316, -20,
            10, -0.0316, 20,
        ]))).toEqual({
            min: { x: -10, y: expect.closeTo(-0.0316), z: -20 },
            max: { x: 10, y: expect.closeTo(-0.0316), z: 20 },
        });
    });

    it("biases only later materials in an overlapping planar cluster", () => {
        const bounds = [
            { min: { x: -20, y: 0, z: -20 }, max: { x: 20, y: 0, z: 20 } },
            { min: { x: -3, y: 0.002, z: -3 }, max: { x: 3, y: 0.002, z: 3 } },
            { min: { x: -1, y: 0.003, z: -1 }, max: { x: 1, y: 0.003, z: 1 } },
        ];

        expect(getMmdCoplanarMaterialDepthBiasUnits(bounds, 2)).toEqual([0, -2, -4]);
    });

    it("keeps later floor decals on distinct depth values at maximum strength", () => {
        const bounds = [
            { min: { x: -100, y: -50, z: -100 }, max: { x: 100, y: 150, z: 100 } },
            { min: { x: -30, y: 0, z: -30 }, max: { x: 30, y: 0, z: 30 } },
            { min: { x: -70, y: 0, z: -70 }, max: { x: 70, y: 0, z: 70 } },
            { min: { x: -70, y: 0, z: -70 }, max: { x: 70, y: 0, z: 70 } },
            { min: { x: -60, y: 0, z: -60 }, max: { x: 60, y: 0, z: 60 } },
            { min: { x: -80, y: 0, z: -80 }, max: { x: 80, y: 0, z: 80 } },
            { min: { x: -80, y: 0, z: -80 }, max: { x: 80, y: 0, z: 80 } },
            { min: { x: -50, y: 0, z: -50 }, max: { x: 50, y: 0, z: 50 } },
        ];

        expect(getMmdCoplanarMaterialDepthBiasUnits(bounds, 2)).toEqual([0, 0, -2, -4, -6, -8, -10, -12]);
        expect(getMmdCoplanarMaterialDepthBiasUnits(bounds, 4)).toEqual([0, 0, -8, -16, -24, -32, -40, -48]);
    });

    it("does not bias separated, perpendicular, or character-scale planes", () => {
        const bounds = [
            { min: { x: -20, y: 0, z: -20 }, max: { x: 20, y: 0, z: 20 } },
            { min: { x: -20, y: 1, z: -20 }, max: { x: 20, y: 1, z: 20 } },
            { min: { x: 0, y: -20, z: -20 }, max: { x: 0, y: 20, z: 20 } },
            { min: { x: 100, y: 0, z: 100 }, max: { x: 102, y: 0, z: 102 } },
        ];

        expect(getMmdCoplanarMaterialDepthBiasUnits(bounds, 2)).toEqual([0, 0, 0, 0]);
    });
});

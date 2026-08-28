import { describe, expect, it } from "vitest";
import { resolveModelEdgeWidth } from "./model-edge-settings";

describe("resolveModelEdgeWidth", () => {
    it("scales each PMX material width when uniform mode is disabled", () => {
        expect(resolveModelEdgeWidth(0.5, 1.2, false)).toBeCloseTo(0.6);
        expect(resolveModelEdgeWidth(1.5, 1.2, false)).toBeCloseTo(1.8);
    });

    it("uses the global scale as a common width when uniform mode is enabled", () => {
        expect(resolveModelEdgeWidth(0.5, 1.2, true)).toBeCloseTo(1.2);
        expect(resolveModelEdgeWidth(1.5, 1.2, true)).toBeCloseTo(1.2);
    });

    it("normalizes invalid and negative inputs to zero", () => {
        expect(resolveModelEdgeWidth(Number.NaN, 1, false)).toBe(0);
        expect(resolveModelEdgeWidth(1, Number.POSITIVE_INFINITY, true)).toBe(0);
        expect(resolveModelEdgeWidth(-1, 1, false)).toBe(0);
        expect(resolveModelEdgeWidth(1, -1, true)).toBe(0);
    });
});

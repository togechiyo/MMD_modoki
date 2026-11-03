import { describe, expect, it } from "vitest";
import { nearestSurfaceUpdate } from "./radiance-nearest-surface-task";

describe("RC nearest surface atlas", () => {
    const before = { volumeKey: "0,0,0:16", layout: 1, geometry: 7, updates: 9 };
    const moved = { ...before, geometry: 8, updates: 10 };
    const low = [-5, 0, -2], high = [4, 9, 3];
    it("updates just the affected probes after a single geometry change with stable IDs", () => {
        expect(nearestSurfaceUpdate(before, moved, low, high)).toBe("partial");
        expect(nearestSurfaceUpdate(before, { ...before, updates: 11 }, low, high)).toBe("reuse");
    });
    it("recomputes all candidates after a missed change, renumbering, volume change or invalid bounds", () => {
        expect(nearestSurfaceUpdate(null, moved, low, high)).toBe("full");
        expect(nearestSurfaceUpdate(before, { ...moved, updates: 11 }, low, high)).toBe("full");
        expect(nearestSurfaceUpdate(before, { ...before, layout: 2 }, low, high)).toBe("full");
        expect(nearestSurfaceUpdate(before, { ...before, volumeKey: "0,1,0:16" }, low, high)).toBe("full");
        expect(nearestSurfaceUpdate(before, moved, [Infinity, 0, 0], high)).toBe("full");
    });
});

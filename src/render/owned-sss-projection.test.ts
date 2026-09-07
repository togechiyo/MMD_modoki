import { describe, expect, it } from "vitest";
import { ownedSssProjectionRadius, snapOwnedSssCoordinate } from "./owned-sss-projection";

describe("SSS light projection", () => {
    it("keeps small pose changes on one scale and still encloses the pose", () => {
        const radii = [1.96, 2, 2.04];
        expect(new Set(radii.map(ownedSssProjectionRadius)).size).toBe(1);
        for (const radius of radii) expect(ownedSssProjectionRadius(radius)).toBeGreaterThan(radius);
    });
    it("moves on whole texels without accumulating history", () => {
        const step = 8 / 2048;
        expect(snapOwnedSssCoordinate(10 * step, 4, 2048)).toBe(10 * step);
        expect(snapOwnedSssCoordinate(10.2 * step, 4, 2048)).toBe(10 * step);
        expect(snapOwnedSssCoordinate(-10.2 * step, 4, 2048)).toBe(-10 * step);
    });
});

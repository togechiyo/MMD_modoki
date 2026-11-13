import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { RC_DIFFUSE_GI_AXIS_WEIGHTS, RC_DIFFUSE_GI_DIRECTIONS, RC_DIFFUSE_GI_IRRADIANCE_WGSL } from "./rc-diffuse-gi-irradiance";

describe("RC GI six-axis quadrature", () => {
    it("keeps a uniform incoming radiance unchanged on every axis, including downward receivers", () => {
        expect(RC_DIFFUSE_GI_AXIS_WEIGHTS).toHaveLength(6);
        for (const weights of RC_DIFFUSE_GI_AXIS_WEIGHTS) {
            expect(weights).toHaveLength(32);
            expect(weights.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
            expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
            expect(weights.reduce((sum, weight) => sum + weight * 0.7, 0)).toBeCloseTo(0.7, 12);
        }
    });
    it("uses only the facing hemisphere with symmetric opposite lobes", () => {
        const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        for (const [axisIndex, axis] of axes.entries()) {
            const weights = RC_DIFFUSE_GI_AXIS_WEIGHTS[axisIndex];
            for (const [index, ray] of RC_DIFFUSE_GI_DIRECTIONS.entries()) {
                expect(Math.hypot(...ray)).toBeCloseTo(1, 12);
                if (axis.reduce((sum, value, i) => sum + value * ray[i], 0) <= 0) expect(weights[index]).toBe(0);
            }
            const opposite = RC_DIFFUSE_GI_AXIS_WEIGHTS[axisIndex ^ 1].slice().sort((a, b) => a - b);
            weights.slice().sort((a, b) => a - b).forEach((value, index) => expect(value).toBeCloseTo(opposite[index], 12));
        }
    });
    it("writes all six lobes into disjoint atlas slices without changing the single-volume layout", () => {
        // Evaluate the actual output address expression; GPU compilation remains an E2E check.
        const expression = RC_DIFFUSE_GI_IRRADIANCE_WGSL.match(/let pixel = (.*);\s*textureStore\(irradiance/);
        expect(expression).not.toBeNull();
        const source = expression?.[1].replace(/(\d+)u\b/g, "$1") ?? "";
        const pixels = new Set<string>();
        for (let level = 0; level < 3; level++) {
            for (const probe of [{ x: 0, y: 0, z: 0 }, { x: 15, y: 15, z: 15 }]) {
                for (let axis = 0; axis < 6; axis++) {
                    const pixel = runInNewContext(source, { probe, axis, atlasOffset: { y: level * 256 },
                        i32: Math.trunc, vec2i: (x: number, y: number) => [x, y] }) as [number, number];
                    expect(pixel[0]).toBe(probe.x + axis * 16);
                    expect(pixel[1]).toBe(level * 256 + (probe.x === 0 ? 0 : 255));
                    expect(pixel[0]).toBeLessThan(96); expect(pixel[1]).toBeLessThan(768);
                    pixels.add(pixel.join(","));
                }
            }
        }
        expect(pixels.size).toBe(36);
    });
});

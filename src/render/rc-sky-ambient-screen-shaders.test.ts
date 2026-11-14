import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { SKY_SCREEN_FILTER_WGSL, SKY_SCREEN_QUERY_WGSL } from "./rc-sky-ambient-screen-shaders";

// Execute the actual scalar WGSL weight, rather than a second implementation.
// GPU compilation and framebuffer conventions remain integration checks.
const weightSource = SKY_SCREEN_FILTER_WGSL.slice(SKY_SCREEN_FILTER_WGSL.indexOf("fn skyScreenFilterWeight("),
    SKY_SCREEN_FILTER_WGSL.indexOf("@compute"))
    .replace(/:\s*f32\b/g, "").replace(/->\s*f32\b/g, "").replace(/\bfn\b/g, "function");
const weight = runInNewContext(weightSource + "\nskyScreenFilterWeight;", {
    sqrt: Math.sqrt, exp2: (value: number) => 2 ** value, pow: Math.pow,
    clamp: (value: number, low: number, high: number) => Math.min(high, Math.max(low, value)),
}) as (distanceSquared: number, planeDistance: number, alignment: number, positionMagnitude: number, radius: number) => number;

describe("Sky Ambient screen reconstruction", () => {
    it("binds the hard query as compute and decodes Babylon world normals", () => {
        expect(SKY_SCREEN_QUERY_WGSL).not.toMatch(/^\s*#/m);
        expect(SKY_SCREEN_QUERY_WGSL).not.toContain("uniforms.");
        expect(SKY_SCREEN_QUERY_WGSL).toContain("blocked = rcSkyProbeBlocked(worldPosition, probePosition, surface.xy)");
        expect(SKY_SCREEN_QUERY_WGSL).not.toContain("rcSkyProbeOcclusion");
        const bindings = [...SKY_SCREEN_QUERY_WGSL.matchAll(/@group\(0\) @binding\((\d)\) var(?:<[^>]*>)? (\w+):/g)]
            .map(match => [Number(match[1]), match[2]]).sort((a, b) => Number(a[0]) - Number(b[0]));
        expect(bindings).toEqual([[0, "params"], [1, "rcSkyTriangles"], [2, "rcSkyField"],
            [3, "rcSkyNearestSurface"], [4, "worldPosition"], [5, "worldNormal"], [6, "outputLight"]]);
        expect(SKY_SCREEN_QUERY_WGSL).toContain("encodedNormal.xyz * 2.0 - vec3f(1.0)");
        const main = SKY_SCREEN_QUERY_WGSL.slice(SKY_SCREEN_QUERY_WGSL.indexOf("@compute"));
        expect(main).toContain("result.w = openSky * visibility");
        expect(main).not.toContain("rcSkySpatialCoverage(");
    });

    it("smooths valid coplanar variation while retaining a constant sky value", () => {
        const taps = [-0.4, 0, 0.4].map(offset => ({ value: offset === 0 ? 0 : 1,
            weight: (offset === 0 ? 2 : 1) * weight(offset * offset, 0, 1, 10, 0.8) }));
        const sum = taps.reduce((total, tap) => total + tap.weight, 0);
        const blurred = taps.reduce((total, tap) => total + tap.value * tap.weight, 0) / sum;
        expect(blurred).toBeGreaterThan(0.2);
        expect(blurred).toBeLessThan(0.5);
        expect(taps.reduce((total, tap) => total + 0.37 * tap.weight, 0) / sum).toBeCloseTo(0.37, 12);
    });

    it("does not bridge thin parallel roofs, even as coordinate precision grows", () => {
        for (const magnitude of [0, 100, 10_000, 32_768, 1_000_000]) {
            expect(weight(0.04 + 0.01 ** 2, 0.01, 1, magnitude, 0.8)).toBe(0);
        }
        // Half-normal rounding can slightly move a truly coplanar sample.
        expect(weight(0.25, 0.0004, 0.99999, 1, 0.8)).toBeGreaterThan(0);
    });

    it("bounds the world footprint and rejects opposing or sharply different faces", () => {
        expect(weight(0, 0, 1, 0, 0)).toBe(0);
        expect(weight(0.81, 0, 1, 0, 0.8)).toBe(0);
        expect(weight(0.01, 0, 0.8, 0, 0.8)).toBe(0);
        expect(weight(0.01, 0, 0, 0, 0.8)).toBe(0);
        expect(weight(0, 0, 1, 0, 0.8)).toBe(1);
    });
});

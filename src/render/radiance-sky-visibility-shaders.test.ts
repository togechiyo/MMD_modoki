import { describe, expect, it } from "vitest";
import { SKY_VISIBILITY_CASCADE_WGSL, SKY_VISIBILITY_DIAGNOSTIC_WGSL } from "./radiance-sky-visibility-shaders";

describe("sky visibility shader contracts", () => {
    it("keeps transport separate from emission and stores visibility in alpha", () => {
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("texture_storage_2d<rgba16float, write>");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("vec4f(0.0, 0.0, 0.0, visibility)");
        for (const source of [SKY_VISIBILITY_CASCADE_WGSL, SKY_VISIBILITY_DIAGNOSTIC_WGSL]) {
            expect(source).not.toContain("emissionPixels");
            expect(source).not.toContain("probeEpochs");
            expect(source).not.toContain("previousField");
            expect(source).toContain("if (params.shape.w < 0.5) { return 1.0; }");
        }
    });

    it("proves the final miss through the scene root rather than the finite cascade endpoint", () => {
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("nodes[0].low.xyz, nodes[0].high.xyz");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("return skyTraceInterval(origin, ray, start, bounds.y + padding);");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("if (params.interval.z < 0.5) { return skyTraceToExit(position, ray, params.interval.x); }");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("distance >= max(start, 0.0001) && distance <= end");
    });

    it("propagates invalid traversal and contributing interpolation taps without turning them into open sky", () => {
        for (const source of [SKY_VISIBILITY_CASCADE_WGSL, SKY_VISIBILITY_DIAGNOSTIC_WGSL]) {
            expect(source).toContain("if (count + 2u > 64u) { return -1.0; }");
            expect(source).toContain("if (visibility < 0.0) { return -1.0; }");
            expect(source).toContain("if (weight <= 0.0) { continue; }");
        }
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("if (farther < 0.0) { return -1.0; }");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("vec4f(-1.0, -1.0, 0.0, 0.0)");
    });

    it("compares matching receiver positions and reports a normalized visibility error with explicit validity", () => {
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("texture_storage_2d<rgba32float, write>");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("params.interval.x");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("skyTraceToExit(position, ray, 0.0)");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("sum / weightSum");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("abs(visibility.x - visibility.y), 1.0");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("any(position < params.volumeMin.xyz)");
    });

    it("rejects wall-crossing taps and falls back from the query at the sampled field's interval start", () => {
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("skyTraceInterval(position, segment / distance, 0.0, distance + 0.0001)");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("if (connected < 0.0) { return -1.0; }");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("if (connected == 0.0) { continue; }");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("skyDirection(angular.x, angular.y, columns, rows), start)");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("rows * 2u, params.interval.y)");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("16u, 8u, 4u, 0.0)");
    });

    it("can split the receiver ray at the near endpoint and traces outside-volume queries without clamping", () => {
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("samplePosition += ray * nearDistance");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("any(samplePosition > params.volumeMin.xyz + params.volumeSize.xyz)");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("rc = skyTraceToExit(position, ray, nearDistance)");
    });
});

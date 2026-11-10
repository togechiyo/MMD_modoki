import { describe, expect, it } from "vitest";
import { SKY_VISIBILITY_CASCADE_WGSL, SKY_VISIBILITY_DIAGNOSTIC_WGSL } from "./radiance-sky-visibility-shaders";
import { createSkyVisibilityCascadeLayouts } from "./radiance-sky-quality";
import { SKY_IRRADIANCE_DIRECTIONS } from "./radiance-sky-irradiance-shaders";

describe("sky visibility shader contracts", () => {
    it("keeps all sky consumers and their parent taps inside the computed upper hemisphere", () => {
        expect(SKY_IRRADIANCE_DIRECTIONS).toHaveLength(16);
        expect(SKY_IRRADIANCE_DIRECTIONS.every(direction => direction[1] > 0)).toBe(true);
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("v < 2u");
        expect(SKY_VISIBILITY_CASCADE_WGSL).toContain("angular * 2u + vec2u(x, y)");
        for (const quality of ["low", "standard", "high"] as const) {
            const layouts = createSkyVisibilityCascadeLayouts(quality);
            expect(layouts[0].directionsY).toBe(4);
            for (let i = 0; i < layouts.length; i++) {
                const current = layouts[i], parent = layouts[i + 1];
                expect(current.directionsY % 2).toBe(0);
                if (!parent) continue;
                for (let v = 0; v < current.directionsY / 2; v++) {
                    expect(v * 2 + 1).toBeLessThan(parent.directionsY / 2);
                }
            }
        }
        const main = SKY_VISIBILITY_CASCADE_WGSL.slice(SKY_VISIBILITY_CASCADE_WGSL.indexOf("fn main("));
        expect(main.indexOf("if (angular.y >= rows / 2u)")).toBeLessThan(main.indexOf("skyCascadeVisibility("));
        expect(main).toContain("vec4f(0.0, 0.0, 0.0, -1.0)");
    });

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

    it("keeps probes above all occluders fully open instead of interpolating shaded parent probes", () => {
        const cascade = SKY_VISIBILITY_CASCADE_WGSL.slice(SKY_VISIBILITY_CASCADE_WGSL.indexOf("fn skyCascadeVisibility("));
        expect(cascade).toContain("arrayLength(&nodes) > 0u");
        expect(cascade).toContain("all(root.low.xyz <= root.high.xyz) && position.y >= root.high.y");
        expect(cascade.indexOf("position.y >= root.high.y")).toBeLessThan(cascade.indexOf("skyFieldVisibility("));
        // This shortcut is valid only with the strictly upward consumer directions.
        expect(SKY_IRRADIANCE_DIRECTIONS.every(direction => direction[1] > 0)).toBe(true);
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
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("u32(params.shape.x), 8u, 4u, 0.0)");
    });

    it("can split the receiver ray at the near endpoint and traces outside-volume queries without clamping", () => {
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("samplePosition += ray * nearDistance");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("any(samplePosition > params.volumeMin.xyz + params.volumeSize.xyz)");
        expect(SKY_VISIBILITY_DIAGNOSTIC_WGSL).toContain("rc = skyTraceToExit(position, ray, nearDistance)");
    });
});

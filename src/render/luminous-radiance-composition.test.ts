import { describe, expect, it } from "vitest";
import { composeRadiance } from "./luminous-radiance-composition";

describe("material-tinted RC composition", () => {
    it("keeps zero light and black reflectance unchanged, including HDR base color", () => {
        for (const base of [[0.05, 0.4, 0.8], [1.4, 0.8, 0.2]]) {
            expect(composeRadiance(base, [1, 1, 1], [0, 0, 0])).toEqual(base);
            expect(composeRadiance(base, [0, 0, 0], [100, 100, 100])).toEqual(base);
        }
    });
    it("illuminates a dark shadow using the material color instead of requiring an already lit pixel", () => {
        const color = composeRadiance([0, 0, 0], [0.8, 0.1, 0.02], [1, 1, 1]);
        expect(color[0]).toBeGreaterThan(0.5);
        expect(color[0]).toBeGreaterThan(color[1]);
        expect(color[1]).toBeGreaterThan(color[2]);
    });
    it("preserves material hue under intense neutral light and limits highlights with one RGB scale", () => {
        const material = [0.8, 0.25, 0.05];
        const result = composeRadiance([0, 0, 0], material, [100, 100, 100]);
        expect(result[1] ** 2.2 / result[0] ** 2.2).toBeCloseTo(material[1] / material[0]);
        expect(result[2] ** 2.2 / result[0] ** 2.2).toBeCloseTo(material[2] / material[0]);
        expect(Math.max(...composeRadiance([0.9, 0.4, 0.2], material, [100, 100, 100]))).toBeLessThanOrEqual(1);
    });
    it("keeps dark materials dark under strong white RC light", () => {
        for (const strength of [8, 10000]) {
            const dark = composeRadiance([0.02, 0.02, 0.02], [0.001, 0.001, 0.001], [strength, strength, strength]);
            const white = composeRadiance([0.02, 0.02, 0.02], [1, 1, 1], [strength, strength, strength]);
            expect(dark[0]).toBeLessThan(white[0] * 0.2);
        }
    });
    it("lets colored light show on an opposing material hue without lifting black reflectance", () => {
        const blue = [0.0063, 0.0707, 0.6118];
        const redLight = composeRadiance([0, 0, 0], blue, [8, 0, 0]);
        const neutral = composeRadiance([0, 0, 0], blue, [8, 8, 8]);
        expect(redLight[0]).toBeGreaterThan(neutral[0] * 1.5);
        expect(redLight[1]).toBe(0); expect(redLight[2]).toBe(0);
        expect(composeRadiance([0, 0, 0], [0, 0, 0], [8, 0, 0])).toEqual([0, 0, 0]);
        const dark = composeRadiance([0, 0, 0], [0.001, 0.001, 0.001], [8, 0, 0]);
        expect(dark[0]).toBeLessThan(redLight[0] * 0.25);
    });
});

import { describe, expect, it } from "vitest";
import { packRadianceTexture } from "./luminous-radiance-textures";

describe("RC emission texture pixels", () => {
    it("keeps UV rows and different colors in a single texture rather than a material-wide average", () => {
        const field = packRadianceTexture(new Uint8Array([
            255, 0, 0, 255, 0, 255, 0, 255,
            0, 0, 255, 128, 255, 255, 255, 0,
        ]), 2, 2, true);
        const pixel = (x: number, y: number) => Array.from(field.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
        expect(pixel(8, 8)).toEqual([1, 0, 0, 1]);
        expect(pixel(48, 8)).toEqual([0, 1, 0, 1]);
        expect(pixel(8, 48).slice(0, 3)).toEqual([0, 0, 1]);
        expect(pixel(8, 48)[3]).toBeCloseTo(128 / 255);
        expect(pixel(48, 48)).toEqual([1, 1, 1, 0]);
    });
    it("linearizes RGB while keeping alpha linear and retains HDR values for linear float input", () => {
        const gamma = packRadianceTexture(new Uint8Array([128, 64, 255, 128]), 1, 1, true);
        expect(gamma[0]).toBeCloseTo((128 / 255) ** 2.2);
        expect(gamma[1]).toBeCloseTo((64 / 255) ** 2.2);
        expect(gamma[3]).toBeCloseTo(128 / 255);
        expect(Array.from(packRadianceTexture(new Float32Array([2, 0.5, 0, 1]), 1, 1, false).subarray(0, 4))).toEqual([2, 0.5, 0, 1]);
    });
    it("rejects missing or invalid texture data", () => {
        expect(() => packRadianceTexture(new Uint8Array(4), 0, 1, true)).toThrow();
        expect(() => packRadianceTexture(new Uint8Array(4), 2, 2, true)).toThrow();
        expect(() => packRadianceTexture(new Float32Array([NaN, 0, 0, 1]), 1, 1, false)).toThrow();
    });
});

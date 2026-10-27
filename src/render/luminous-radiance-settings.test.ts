import { expect, it } from "vitest";
import { DEFAULT_LUMINOUS_RADIANCE, normalizeLuminousRadiance } from "./luminous-radiance-settings";

it("keeps old projects OFF and normalizes experimental RC settings", () => {
    for (const value of [undefined, null, {}, { enabled: "true", strength: NaN, range: Infinity }]) {
        expect(normalizeLuminousRadiance(value)).toEqual(DEFAULT_LUMINOUS_RADIANCE);
    }
    expect(normalizeLuminousRadiance({ enabled: true, strength: 99, range: -10 })).toEqual({ enabled: true, strength: 8, range: 1, softness: 0, distanceSoftness: false });
    expect(normalizeLuminousRadiance({ enabled: true, strength: 0, range: 4 })).toEqual({ enabled: true, strength: 0, range: 4, softness: 0, distanceSoftness: false });
});

it("keeps shelved distance softness OFF even for previously enabled projects without losing softness", () => {
    for (const distanceSoftness of [undefined, null, "true", 1, false, true]) {
        expect(normalizeLuminousRadiance({ softness: 0.3, distanceSoftness })).toMatchObject({ softness: 0.3, distanceSoftness: false });
    }
    expect(normalizeLuminousRadiance({ enabled: true, strength: 2, range: 20, softness: 0.38, distanceSoftness: true }))
        .toEqual({ enabled: true, strength: 2, range: 20, softness: 0.38, distanceSoftness: false });
});

it("defaults legacy RC to its original sharp appearance and clamps softness independently", () => {
    expect(normalizeLuminousRadiance({ enabled: true, strength: 2, range: 20 }).softness).toBe(0);
    expect(normalizeLuminousRadiance({ enabled: true, strength: 2, range: 20, softness: 0.6 })).toMatchObject({ strength: 2, range: 20, softness: 0.6 });
    expect(normalizeLuminousRadiance({ softness: 99 }).softness).toBe(1);
    expect(normalizeLuminousRadiance({ softness: -1 }).softness).toBe(0);
    expect(normalizeLuminousRadiance({ softness: NaN }).softness).toBe(0);
});

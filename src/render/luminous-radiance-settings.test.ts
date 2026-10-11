import { expect, it } from "vitest";
import { DEFAULT_LUMINOUS_RADIANCE, normalizeLuminousRadiance } from "./luminous-radiance-settings";

it("keeps old projects OFF and normalizes experimental RC settings", () => {
    for (const value of [undefined, null, {}, { enabled: "true", strength: NaN, range: Infinity }]) {
        expect(normalizeLuminousRadiance(value)).toEqual(DEFAULT_LUMINOUS_RADIANCE);
    }
    expect(normalizeLuminousRadiance({ enabled: true, strength: 99, range: -10 })).toEqual({ enabled: true, strength: 8, range: 1 });
    expect(normalizeLuminousRadiance({ enabled: true, strength: 0, range: 4 })).toEqual({ enabled: true, strength: 0, range: 4 });
});

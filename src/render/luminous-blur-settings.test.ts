import { describe, expect, it } from "vitest";
import {
    LUMINOUS_BLUR_FIXED_KERNELS,
    resolveLuminousBlurPassSettings,
} from "./luminous-blur-settings";

describe("resolveLuminousBlurPassSettings", () => {
    it("keeps compiled kernels stable across the full radius range", () => {
        for (const radius of [1, 20, 64, 128]) {
            expect(resolveLuminousBlurPassSettings(radius, "core").kernel)
                .toBe(LUMINOUS_BLUR_FIXED_KERNELS.core);
            expect(resolveLuminousBlurPassSettings(radius, "halo").kernel)
                .toBe(LUMINOUS_BLUR_FIXED_KERNELS.halo);
        }
    });

    it("changes blur reach continuously through the direction scale", () => {
        const radii = [20, 21, 22];
        const coreScales = radii.map((radius) => (
            resolveLuminousBlurPassSettings(radius, "core").directionScale
        ));
        const haloScales = radii.map((radius) => (
            resolveLuminousBlurPassSettings(radius, "halo").directionScale
        ));

        expect(coreScales[0]).toBeLessThan(coreScales[1]);
        expect(coreScales[1]).toBeLessThan(coreScales[2]);
        expect(haloScales[0]).toBeLessThan(haloScales[1]);
        expect(haloScales[1]).toBeLessThan(haloScales[2]);
    });

    it("preserves the intended core and halo reach near the default radius", () => {
        const core = resolveLuminousBlurPassSettings(20, "core");
        const halo = resolveLuminousBlurPassSettings(20, "halo");

        expect(core.directionScale * core.kernel).toBeCloseTo(6.4);
        expect(halo.directionScale * halo.kernel).toBeCloseTo(20);
    });

    it("clamps radius values to the supported runtime range", () => {
        expect(resolveLuminousBlurPassSettings(-100, "core"))
            .toEqual(resolveLuminousBlurPassSettings(1, "core"));
        expect(resolveLuminousBlurPassSettings(999, "halo"))
            .toEqual(resolveLuminousBlurPassSettings(128, "halo"));
    });
});

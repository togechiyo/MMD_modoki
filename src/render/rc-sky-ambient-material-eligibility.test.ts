import { describe, expect, it } from "vitest";
import { isRcSkyAmbientPresetEligible } from "./rc-sky-ambient-material-eligibility";

describe("Sky Ambient preset eligibility", () => {
    const ordinary = { hasExternalShader: false, hasPresetShader: false };
    it("accepts Stage Standard's built-in lighting and the existing common Toon presets", () => {
        for (const preset of ["wgsl-mmd-standard", "wgsl-light-and-shadow", "wgsl-accessory-toon", "wgsl-stage-standard"]) {
            expect(isRcSkyAmbientPresetEligible({ ...ordinary, preset })).toBe(true);
        }
        expect(isRcSkyAmbientPresetEligible({ ...ordinary, preset: "wgsl-stage-standard", hasPresetShader: true })).toBe(true);
    });
    it("does not grant other custom lighting or external shaders Stage Standard's compatibility", () => {
        for (const preset of ["wgsl-mmd-standard", "wgsl-stage-standard", "wgsl-semi-matte-highlight"]) {
            expect(isRcSkyAmbientPresetEligible({ ...ordinary, preset, hasExternalShader: true })).toBe(false);
        }
        expect(isRcSkyAmbientPresetEligible({ ...ordinary, preset: "wgsl-mmd-standard", hasPresetShader: true })).toBe(false);
        for (const preset of ["wgsl-semi-matte-highlight", "wgsl-unlit", "pbr-base", "unknown"]) {
            expect(isRcSkyAmbientPresetEligible({ ...ordinary, preset, hasPresetShader: true })).toBe(false);
            expect(isRcSkyAmbientPresetEligible({ ...ordinary, preset })).toBe(false);
        }
    });
});

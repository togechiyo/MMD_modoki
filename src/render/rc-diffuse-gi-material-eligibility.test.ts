import { describe, expect, it } from "vitest";
import { isRcDiffuseGiPresetEligible } from "./rc-diffuse-gi-material-eligibility";

const diffusePresets = ["wgsl-mmd-standard", "wgsl-light-and-shadow", "wgsl-stage-standard",
    "wgsl-accessory-toon", "wgsl-obj-untextured", "wgsl-obj-mtl"];
const eligible = (preset: string, source: boolean, hasPresetShader = false, hasExternalShader = false) =>
    isRcDiffuseGiPresetEligible({ preset, source, hasPresetShader, hasExternalShader });

describe("RC GI material preset eligibility", () => {
    it.each(diffusePresets)("accepts %s as both a receiver and a diffuse source", preset => {
        for (const source of [false, true]) {
            expect(eligible(preset, source, preset === "wgsl-stage-standard")).toBe(true);
        }
    });

    it("keeps Luminous source-only without using its emissive shader as a receiver", () => {
        expect(eligible("wgsl-autoluminous", false)).toBe(false);
        expect(eligible("wgsl-autoluminous", true)).toBe(true);
        expect(eligible("wgsl-autoluminous", true, true)).toBe(false);
    });

    it.each(diffusePresets)("rejects external shaders even when the stored preset is %s", preset => {
        for (const source of [false, true]) expect(eligible(preset, source, preset === "wgsl-stage-standard", true)).toBe(false);
    });

    it("only permits Stage's known built-in custom fragment", () => {
        for (const preset of diffusePresets.filter(value => value !== "wgsl-stage-standard")) {
            for (const source of [false, true]) expect(eligible(preset, source, true)).toBe(false);
        }
    });

    it.each(["wgsl-unlit", "wgsl-full-light", "wgsl-full-shadow", "wgsl-debug-white", "wgsl-sss-standard",
        "wgsl-owned-sss-skin", "wgsl-full-alpha-test", "pbr-standard", "unknown"])("keeps %s outside this contract", preset => {
        for (const source of [false, true]) expect(eligible(preset, source)).toBe(false);
    });
});

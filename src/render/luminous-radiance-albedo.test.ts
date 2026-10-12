import { describe, expect, it } from "vitest";
import { defaultPixelShaderWGSL } from "@babylonjs/core/ShadersWGSL/default.fragment";
import { RADIANCE_ALBEDO_PATCH } from "./luminous-radiance-albedo";

describe("RC Standard/MMD surface color capture", () => {
    it("matches the installed albedo output and changes only that output in the RC pass", () => {
        const original = "fragData[PREPASS_ALBEDO_INDEX]=vec4f(baseColor.rgb,writeGeometryInfo);";
        expect(defaultPixelShaderWGSL.shader).toContain(original);
        const patched = defaultPixelShaderWGSL.shader.replace(original, RADIANCE_ALBEDO_PATCH);
        expect(patched).toContain("uniforms.radianceAlbedoCapture > 0.5");
        expect(patched).toContain("baseColor.rgb * uniforms.vDiffuseColor.rgb");
        expect(patched).toContain("else { fragData[PREPASS_ALBEDO_INDEX] = vec4f(baseColor.rgb, writeGeometryInfo); }");
        expect(patched).toContain("fragData[PREPASS_NORMAL_INDEX]");
        expect(patched).toContain("fragData[PREPASS_DEPTH_INDEX]");
    });
});

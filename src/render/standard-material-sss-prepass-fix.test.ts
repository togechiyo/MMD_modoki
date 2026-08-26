import { describe, expect, it } from "vitest";
import {
    getStandardMaterialSssPrePassPatchDiagnostics,
    injectStandardMaterialSssExclusion,
} from "./standard-material-sss-prepass-fix";

describe("StandardMaterial SSS pre-pass compatibility", () => {
    it("marks non-SSS WGSL StandardMaterial pixels as excluded", () => {
        const source =
            "fn main(input: FragmentInputs)->FragmentOutputs {"
            + "var writeGeometryInfo: f32=select(0.0,1.0,color.a>0.4);var fragData: array<vec4<f32>,SCENE_MRT_COUNT>;"
            + "fragData[PREPASS_COLOR_INDEX]=color; ";
        const patched = injectStandardMaterialSssExclusion(source, "wgsl");

        expect(patched).toContain(
            "fragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4f(0.0,0.0,0.0,1.0);",
        );
        expect(patched).toContain("var mmdSkinSssEnabled: f32=0.0;");
        expect(patched).toContain(
            "mmdSkinSssIrradiance*diffuseColor*baseAmbientColor*mmdSkinSssSqrtAlbedo",
        );
        expect(patched).toContain(
            "sqrt(max(baseColor.rgb,vec3f(0.0)))*mmdSkinSssPreparedIrradiance",
        );
        expect(patched).toContain("color.rgb-mmdSkinSssDiffuseColor");
        expect(injectStandardMaterialSssExclusion(patched, "wgsl")).toBe(patched);
    });

    it("marks non-SSS GLSL StandardMaterial pixels as excluded", () => {
        const source = "float writeGeometryInfo=color.a>0.4 ? 1.0 : 0.0;";
        const patched = injectStandardMaterialSssExclusion(source, "glsl");

        expect(patched).toContain(
            "gl_FragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4(0.0,0.0,0.0,1.0);",
        );
    });

    it("patches the installed Babylon default shaders used by the app", () => {
        expect(getStandardMaterialSssPrePassPatchDiagnostics()).toEqual({
            glslSourcePresent: true,
            glslMarkerPresent: true,
            glslExclusionPresent: true,
            wgslSourcePresent: true,
            wgslMarkerPresent: true,
            wgslExclusionPresent: true,
            wgslProducerStatePresent: true,
            wgslColorSeparationPresent: true,
        });
    });
});

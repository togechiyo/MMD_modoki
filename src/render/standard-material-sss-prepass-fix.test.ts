import { describe, expect, it } from "vitest";
import {
    getStandardMaterialSssPrePassPatchDiagnostics,
    injectStandardMaterialSssExclusion,
} from "./standard-material-sss-prepass-fix";

describe("StandardMaterial SSS pre-pass compatibility", () => {
    it("marks non-SSS WGSL StandardMaterial pixels as excluded", () => {
        const source =
            "fn main(input: FragmentInputs)->FragmentOutputs {"
            + "var finalDiffuse: vec3f=vec3f(1.0);"
            + "#ifdef SPECULARTERM\nvar finalSpecular: vec3f=specularBase*specularColor;"
            + "#define CUSTOM_FRAGMENT_BEFORE_FOG"
            + "var writeGeometryInfo: f32=select(0.0,1.0,color.a>0.4);var fragData: array<vec4<f32>,SCENE_MRT_COUNT>;"
            + "fragData[PREPASS_COLOR_INDEX]=color; "
            + "fragData[PREPASS_ALBEDO_SQRT_INDEX]=vec4f(sqrt(baseColor.rgb),writeGeometryInfo);";
        const patched = injectStandardMaterialSssExclusion(source, "wgsl");

        expect(patched).toContain(
            "fragData[PREPASS_IRRADIANCE_LEGACY_INDEX]=vec4f(0.0,0.0,0.0,1.0);",
        );
        expect(patched).toContain("var mmdSkinSssEnabled: f32=0.0;");
        expect(patched).toContain(
            "diffuseBase-mmdSkinSssIrradiance",
        );
        expect(patched).toContain(
            "(finalDiffuse-mmdSkinSssFinalDiffuseWithoutSss)*baseAmbientColor",
        );
        expect(patched).toContain(
            "mmdSkinSssVisibleDiffuse/max(mmdSkinSssSqrtAlbedo,vec3f(0.0001))",
        );
        expect(patched).toContain("color.rgb-mmdSkinSssVisibleDiffuse");
        expect(patched).toContain("mmdSkinSssSelfMultiplyMask*0.20");
        expect(patched).toContain("sqrt(max(baseColor.rgb,vec3f(0.0)))*mmdSkinSssSelfMultiplyFactor");
        expect(patched).toContain("fragData[PREPASS_COLOR_INDEX]=color; ");
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

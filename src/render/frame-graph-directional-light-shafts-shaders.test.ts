import { describe, expect, it } from "vitest";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ensureFrameGraphDirectionalLightShaftsShaders } from "./frame-graph-directional-light-shafts-shaders";

describe("directional para flare shader", () => {
    it("uses a directional two-color gradient with a single depth sample", () => {
        ensureFrameGraphDirectionalLightShaftsShaders();
        const shader = ShaderStore.ShadersStoreWGSL.mmdFrameGraphDirectionalLightShaftsPixelShader;
        expect(shader).toContain("flareLightColor");
        expect(shader).toContain("flareShadowColor");
        expect(shader).toContain("lightGradient");
        expect(shader).toContain("shadowGradient");
        expect(shader).toContain("multiplied + lightTint * additiveAmount");
        expect(shader).toContain("viewDepthTexture");
        expect(shader).toContain("reconstructViewDistance");
        expect(shader).toContain("vec2f(uniforms.lightViewDirection.x, -uniforms.lightViewDirection.y)");
        expect(shader).not.toContain("for (var index");
        expect(shader).not.toContain("noise");
        expect(shader).not.toContain("fract(");
    });

    it("bounds intensity and preserves source alpha", () => {
        ensureFrameGraphDirectionalLightShaftsShaders();
        const shader = ShaderStore.ShadersStoreWGSL.mmdFrameGraphDirectionalLightShaftsPixelShader;
        expect(shader).toContain("clamp(uniforms.strength / 0.08, 0.0, 2.0)");
        expect(shader).toContain("let flared = multiplied + lightTint * additiveAmount");
        expect(shader).toContain("source.a");
    });
});

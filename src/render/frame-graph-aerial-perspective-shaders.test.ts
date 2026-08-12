import { describe, expect, it } from "vitest";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ensureFrameGraphAerialPerspectiveShaders } from "./frame-graph-aerial-perspective-shaders";

describe("aerial perspective shader", () => {
    it("uses deterministic depth distance and leaves missing geometry untouched", () => {
        ensureFrameGraphAerialPerspectiveShaders();
        const shader = ShaderStore.ShadersStoreWGSL.mmdFrameGraphAerialPerspectivePixelShader;
        expect(shader).toContain("distanceToReceiver - uniforms.startDistance");
        expect(shader).toContain("1.0 - exp(-2.0 * smoothDistance)");
        expect(shader).toContain("abs(viewZ) <= 0.000001");
        expect(shader).not.toContain("noise");
        expect(shader).not.toContain("fract(");
    });

    it("keeps source alpha and only weakly desaturates distant color", () => {
        ensureFrameGraphAerialPerspectiveShaders();
        const shader = ShaderStore.ShadersStoreWGSL.mmdFrameGraphAerialPerspectivePixelShader;
        expect(shader).toContain("amount * 0.18");
        expect(shader).toContain("source.a");
        expect(shader).toContain("0.0, 0.6");
    });
});

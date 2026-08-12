import { describe, expect, it } from "vitest";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { ensureFrameGraphOceanShaders } from "./frame-graph-ocean-shaders";

describe("ocean media composite shader", () => {
    it("fades underwater color from the local surface instead of using a binary mask", () => {
        ensureFrameGraphOceanShaders();
        const shader = ShaderStore.ShadersStoreWGSL.mmdFrameGraphOceanPixelShader;
        expect(shader).toContain("let pathFade = smoothstep(0.0, 3.5, underwaterDistance)");
        expect(shader).toContain("smoothstep(0.05, 2.2, receiverDepth)");
        expect(shader).toContain("color = mix(color, filteredColor, vec3f(mediaBlend))");
        expect(shader).toContain("worldPosition.y < uniforms.waterHeight");
        expect(shader).not.toContain(
            "worldPosition.y < uniforms.waterHeight + waveHeightAt(worldPosition.xz)",
        );
    });
});

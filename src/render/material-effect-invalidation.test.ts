import { describe, expect, it, vi } from "vitest";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { prepareMmdToonGlslDefines, releaseWebGpuEffects } from "./material-effect-invalidation";

describe("material effect invalidation", () => {
    it.each([false, undefined])("keeps live effects when isWebGPU is %s", isWebGPU => {
        const engine = { isWebGPU, releaseEffects: vi.fn() };
        releaseWebGpuEffects(engine);
        expect(engine.releaseEffects).not.toHaveBeenCalled();
    });

    it("preserves WebGPU cache invalidation", () => {
        const engine = { isWebGPU: true, releaseEffects: vi.fn() };
        releaseWebGpuEffects(engine);
        expect(engine.releaseEffects).toHaveBeenCalledOnce();
    });

    it("registers GLSL constants in Babylon's serialized effect key", () => {
        const defines = new MaterialDefines();
        prepareMmdToonGlslDefines(defines, 0.05, 0.1, 0.35);
        expect(defines.toString()).toContain("#define MMD_TOON_SELF_SHADOW_SOFTNESS 0.05\n");
        expect(defines.toString()).toContain("#define MMD_TOON_OCCLUSION_SHADOW_SOFTNESS 0.1\n");
        expect(defines.toString()).toContain("#define MMD_TOON_FLAT_LIGHT_COLOR_INFLUENCE 0.35\n");
        defines.markAsProcessed();
        prepareMmdToonGlslDefines(defines, 0.05, 0.1, 0.35);
        expect(defines.isDirty).toBe(false);
    });

    it.each([
        [0.08, 0.1, 0.35],
        [0.05, 0.07, 0.35],
        [0.05, 0.1, 0.6],
    ])("recompiles a changed constant and reuses a restored key (%s, %s, %s)", (self, occlusion, flat) => {
        const defines = new MaterialDefines();
        prepareMmdToonGlslDefines(defines, 0.05, 0.1, 0.35);
        const initialKey = defines.toString();
        defines.markAsProcessed();
        prepareMmdToonGlslDefines(defines, self, occlusion, flat);
        expect(defines.isDirty).toBe(true);
        expect(defines.toString()).not.toBe(initialKey);
        defines.markAsProcessed();
        prepareMmdToonGlslDefines(defines, 0.05, 0.1, 0.35);
        expect(defines.toString()).toBe(initialKey);
        expect(defines.isDirty).toBe(true);
    });
});

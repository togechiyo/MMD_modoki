import { describe, expect, it } from "vitest";
import {
    DEFAULT_MMD_MATERIAL_PIPELINE_PRESET,
    isPbrMaterialPipelinePreset,
    normalizeMmdMaterialPipelinePreset,
    normalizePbrMaterialShaderPreset,
    PBR_MATERIAL_UI_ENABLED,
    resolveNextImportMaterialPipelinePreset,
} from "./mmd-material-pipeline";

describe("mmd material pipeline", () => {
    it("keeps MMD Standard as the default", () => {
        expect(normalizeMmdMaterialPipelinePreset(undefined)).toBe(DEFAULT_MMD_MATERIAL_PIPELINE_PRESET);
        expect(normalizeMmdMaterialPipelinePreset("unknown")).toBe(DEFAULT_MMD_MATERIAL_PIPELINE_PRESET);
    });

    it("accepts the experimental PBR Standard preset", () => {
        expect(normalizeMmdMaterialPipelinePreset("pbr-standard")).toBe("pbr-standard");
        expect(isPbrMaterialPipelinePreset("pbr-standard")).toBe(true);
        expect(isPbrMaterialPipelinePreset("mmd-standard")).toBe(false);
    });

    it("keeps PBR internal while forcing the public next-import UI to MMD", () => {
        expect(PBR_MATERIAL_UI_ENABLED).toBe(false);
        expect(resolveNextImportMaterialPipelinePreset("pbr-standard")).toBe("mmd-standard");
        expect(resolveNextImportMaterialPipelinePreset("pbr-standard", true)).toBe("pbr-standard");
    });

    it("normalizes per-material PBR shader presets independently", () => {
        expect(normalizePbrMaterialShaderPreset(undefined)).toBe("pbr-mmd-like");
        expect(normalizePbrMaterialShaderPreset("pbr-base")).toBe("pbr-base");
        expect(normalizePbrMaterialShaderPreset("pbr-mmd-like")).toBe("pbr-mmd-like");
        expect(normalizePbrMaterialShaderPreset("pbr-skin")).toBe("pbr-skin");
        expect(normalizePbrMaterialShaderPreset("pbr-sss-wax")).toBe("pbr-sss-wax");
        expect(normalizePbrMaterialShaderPreset("pbr-skin-sss")).toBe("pbr-skin");
        expect(normalizePbrMaterialShaderPreset("pbr-skin-face")).toBe("pbr-skin-face");
        expect(normalizePbrMaterialShaderPreset("pbr-no-shadow")).toBe("pbr-no-shadow");
        expect(normalizePbrMaterialShaderPreset("unknown")).toBe("pbr-mmd-like");
    });
});

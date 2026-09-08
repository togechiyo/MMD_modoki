export const MMD_MATERIAL_PIPELINE_PRESETS = [
    "mmd-standard",
    "pbr-standard",
] as const;

export type MmdMaterialPipelinePreset = typeof MMD_MATERIAL_PIPELINE_PRESETS[number];

export const DEFAULT_MMD_MATERIAL_PIPELINE_PRESET: MmdMaterialPipelinePreset = "mmd-standard";

// Keep the PBR implementation and project compatibility available internally,
// but do not expose the experiment in the regular UI for the next release.
export const PBR_MATERIAL_UI_ENABLED = false;

export const PBR_MATERIAL_SHADER_PRESETS = [
    "pbr-base",
    "pbr-mmd-like",
    "pbr-skin",
    "pbr-sss-wax",
    "pbr-skin-sss",
    "pbr-skin-face",
    "pbr-no-shadow",
    "pbr-metal-polished",
    "pbr-metal-satin",
    "pbr-plastic-glossy",
    "pbr-clay-white",
    "pbr-cotton",
    "pbr-satin",
    "pbr-velvet",
    "pbr-leather",
] as const;

export type PbrMaterialShaderPreset = typeof PBR_MATERIAL_SHADER_PRESETS[number];

export const DEFAULT_PBR_MATERIAL_SHADER_PRESET: PbrMaterialShaderPreset = "pbr-mmd-like";

export function normalizeMmdMaterialPipelinePreset(value: unknown): MmdMaterialPipelinePreset {
    return value === "pbr-standard" ? value : DEFAULT_MMD_MATERIAL_PIPELINE_PRESET;
}

export function resolveNextImportMaterialPipelinePreset(
    value: unknown,
    pbrUiEnabled = PBR_MATERIAL_UI_ENABLED,
): MmdMaterialPipelinePreset {
    const normalized = normalizeMmdMaterialPipelinePreset(value);
    return pbrUiEnabled ? normalized : DEFAULT_MMD_MATERIAL_PIPELINE_PRESET;
}

export function isPbrMaterialPipelinePreset(value: unknown): boolean {
    return normalizeMmdMaterialPipelinePreset(value) === "pbr-standard";
}

export function normalizePbrMaterialShaderPreset(value: unknown): PbrMaterialShaderPreset {
    switch (value) {
        case "pbr-skin-sss":
            return "pbr-skin";
        case "pbr-mmd-like":
        case "pbr-skin":
        case "pbr-sss-wax":
        case "pbr-skin-face":
        case "pbr-no-shadow":
        case "pbr-metal-polished":
        case "pbr-metal-satin":
        case "pbr-plastic-glossy":
        case "pbr-clay-white":
        case "pbr-cotton":
        case "pbr-satin":
        case "pbr-velvet":
        case "pbr-leather":
            return value;
        case "pbr-base":
            return value;
        default:
            return DEFAULT_PBR_MATERIAL_SHADER_PRESET;
    }
}

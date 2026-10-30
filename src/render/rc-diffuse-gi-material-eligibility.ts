type RcDiffuseGiPresetEligibility = {
    preset: string;
    source: boolean;
    hasExternalShader: boolean;
    hasPresetShader: boolean;
};

const DIFFUSE_PRESETS = new Set([
    "wgsl-mmd-standard",
    "wgsl-light-and-shadow",
    "wgsl-stage-standard",
    "wgsl-accessory-toon",
    "wgsl-obj-untextured",
    "wgsl-obj-mtl",
]);

/** Known presets retain diffuse inputs and the material's independent GI before-fog hook. */
export function isRcDiffuseGiPresetEligible(input: RcDiffuseGiPresetEligibility): boolean {
    if (input.hasExternalShader) return false;
    // Stage replaces direct diffuse lighting only. An unexpected custom fragment on
    // another preset must not inherit eligibility from its otherwise supported ID.
    if (input.hasPresetShader && input.preset !== "wgsl-stage-standard") return false;
    return DIFFUSE_PRESETS.has(input.preset) || input.source && input.preset === "wgsl-autoluminous";
}

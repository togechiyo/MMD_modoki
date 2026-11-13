/** Only known lighting paths expose an ambient-equivalent base for Sky Ambient. */
export function isRcSkyAmbientPresetEligible(input: {
    preset: string; hasExternalShader: boolean; hasPresetShader: boolean;
}): boolean {
    if (input.hasExternalShader) return false;
    if (input.preset === "wgsl-stage-standard") return true;
    return !input.hasPresetShader && (input.preset === "wgsl-mmd-standard"
        || input.preset === "wgsl-light-and-shadow" || input.preset === "wgsl-accessory-toon");
}

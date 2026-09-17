export const ENVIRONMENT_LIGHTING_PRESET_IDS = ["yamagata-field", "eitai-bridge", "mifune-bridge"] as const;
export type EnvironmentLightingPresetId = typeof ENVIRONMENT_LIGHTING_PRESET_IDS[number];

/** Older projects and unrecognized settings retain the original snowy field. */
export function normalizeEnvironmentLightingPreset(value: unknown): EnvironmentLightingPresetId {
    return ENVIRONMENT_LIGHTING_PRESET_IDS.find(id => id === value) ?? "yamagata-field";
}

export const DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_STRENGTH = 0.08;
export const DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_PHASE_G = 0;
export const DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_LIGHT_COLOR = { r: 1, g: 1, b: 1 } as const;
export const DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_SHADOW_COLOR = { r: 0, g: 0, b: 0 } as const;

type RgbColor = { r: number; g: number; b: number };

export type DirectionalLightShaftsSettings = {
    strength: number;
    phaseG: number;
    lightColor: RgbColor;
    shadowColor: RgbColor;
};

function resolveColor(color: RgbColor, fallback: RgbColor): RgbColor {
    return {
        r: Math.max(0, Math.min(1, Number.isFinite(color.r) ? color.r : fallback.r)),
        g: Math.max(0, Math.min(1, Number.isFinite(color.g) ? color.g : fallback.g)),
        b: Math.max(0, Math.min(1, Number.isFinite(color.b) ? color.b : fallback.b)),
    };
}

export function resolveDirectionalLightShaftsSettings(
    settings: DirectionalLightShaftsSettings,
): DirectionalLightShaftsSettings {
    return {
        strength: Math.max(0, Math.min(0.16, Number.isFinite(settings.strength)
            ? settings.strength
            : DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_STRENGTH)),
        phaseG: Math.max(-0.9, Math.min(0.9, Number.isFinite(settings.phaseG)
            ? settings.phaseG
            : DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_PHASE_G)),
        lightColor: resolveColor(settings.lightColor, DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_LIGHT_COLOR),
        shadowColor: resolveColor(settings.shadowColor, DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_SHADOW_COLOR),
    };
}

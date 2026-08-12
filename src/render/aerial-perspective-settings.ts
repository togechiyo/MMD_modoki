export const DEFAULT_AERIAL_PERSPECTIVE_STRENGTH = 0.18;
export const DEFAULT_AERIAL_PERSPECTIVE_START = 55;
export const DEFAULT_AERIAL_PERSPECTIVE_RANGE = 180;
export const DEFAULT_AERIAL_PERSPECTIVE_COLOR = { r: 0.72, g: 0.79, b: 0.83 } as const;

export type AerialPerspectiveSettings = {
    strength: number;
    startDistance: number;
    transitionRange: number;
    color: { r: number; g: number; b: number };
    lightColor: { r: number; g: number; b: number };
    lightIntensity: number;
};

function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function resolveAerialPerspectiveSettings(
    settings: AerialPerspectiveSettings,
): AerialPerspectiveSettings {
    return {
        strength: clamp(finiteOr(settings.strength, DEFAULT_AERIAL_PERSPECTIVE_STRENGTH), 0, 0.6),
        startDistance: clamp(finiteOr(settings.startDistance, DEFAULT_AERIAL_PERSPECTIVE_START), 0, 2000),
        transitionRange: clamp(finiteOr(settings.transitionRange, DEFAULT_AERIAL_PERSPECTIVE_RANGE), 1, 4000),
        color: {
            r: clamp(finiteOr(settings.color.r, DEFAULT_AERIAL_PERSPECTIVE_COLOR.r), 0, 1),
            g: clamp(finiteOr(settings.color.g, DEFAULT_AERIAL_PERSPECTIVE_COLOR.g), 0, 1),
            b: clamp(finiteOr(settings.color.b, DEFAULT_AERIAL_PERSPECTIVE_COLOR.b), 0, 1),
        },
        lightColor: {
            r: clamp(finiteOr(settings.lightColor.r, 1), 0, 1),
            g: clamp(finiteOr(settings.lightColor.g, 1), 0, 1),
            b: clamp(finiteOr(settings.lightColor.b, 1), 0, 1),
        },
        lightIntensity: clamp(finiteOr(settings.lightIntensity, 1), 0, 4),
    };
}

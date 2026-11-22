import type { ProjectRingParticleState } from "../types";

export const RING_PARTICLE_PARAMETERS = {
    count: { default: 180, min: 8, max: 512 },
    density: { default: 32.5, min: 5, max: 60 },
    size: { default: 0.335, min: 0.03, max: 3 },
    speed: { default: 0.05, min: -2, max: 2 },
    intensity: { default: 4, min: 0, max: 8 },
} as const;

export const DEFAULT_RING_PARTICLE_SETTINGS: ProjectRingParticleState = normalizeRingParticleSettings();

export function normalizeRingParticleSettings(settings: Partial<ProjectRingParticleState> = {}): ProjectRingParticleState {
    const scalar = (key: keyof typeof RING_PARTICLE_PARAMETERS): number => {
        const value = settings[key];
        const { min, max, default: fallback } = RING_PARTICLE_PARAMETERS[key];
        return typeof value === "number" && Number.isFinite(value)
            ? Math.max(min, Math.min(max, value))
            : fallback;
    };
    const channel = (value?: number): number => typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.min(1, value)) : 1;
    return {
        enabled: settings.enabled === true,
        count: Math.round(scalar("count")),
        density: scalar("density"),
        size: scalar("size"),
        speed: scalar("speed"),
        intensity: scalar("intensity"),
        color: { r: channel(settings.color?.r), g: channel(settings.color?.g), b: channel(settings.color?.b) },
    };
}

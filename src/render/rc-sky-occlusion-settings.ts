export type RcSkyOcclusionVolume = { min: [number, number, number]; size: number };
export type RcSkyOcclusionSettings = {
    enabled: boolean;
    strength: number;
    minimum: number;
    volume: RcSkyOcclusionVolume | null;
};

export const DEFAULT_RC_SKY_OCCLUSION_SETTINGS: Readonly<RcSkyOcclusionSettings> = Object.freeze({
    enabled: false, strength: 0.75, minimum: 0.2, volume: null,
});

export function normalizeRcSkyOcclusionSettings(value: unknown): RcSkyOcclusionSettings {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const scalar = (key: "strength" | "minimum"): number => typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? Math.max(0, Math.min(1, raw[key] as number)) : DEFAULT_RC_SKY_OCCLUSION_SETTINGS[key];
    const candidate = raw.volume && typeof raw.volume === "object" ? raw.volume as Record<string, unknown> : {};
    const min = candidate.min;
    const validVolume = Array.isArray(min) && min.length === 3 && min.every(component => typeof component === "number" && Number.isFinite(component))
        && typeof candidate.size === "number" && Number.isFinite(candidate.size) && candidate.size > 0;
    return {
        enabled: raw.enabled === true,
        strength: scalar("strength"),
        minimum: scalar("minimum"),
        volume: validVolume ? {
            min: min.map(component => Math.max(-1e6, Math.min(1e6, component))) as [number, number, number],
            size: Math.max(0.1, Math.min(100000, candidate.size as number)),
        } : null,
    };
}

export function cloneRcSkyOcclusionSettings(settings: RcSkyOcclusionSettings): RcSkyOcclusionSettings {
    return { ...settings, volume: settings.volume ? { min: [...settings.volume.min], size: settings.volume.size } : null };
}

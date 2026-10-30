export type RcDiffuseGiVolume = { min: [number, number, number]; size: number };
export type RcDiffuseGiSettings = {
    enabled: boolean;
    strength: number;
    volume: RcDiffuseGiVolume | null;
};

export const DEFAULT_RC_DIFFUSE_GI_SETTINGS: Readonly<RcDiffuseGiSettings> = Object.freeze({
    enabled: false, strength: 0.5, volume: null,
});

export function normalizeRcDiffuseGiSettings(value: unknown): RcDiffuseGiSettings {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const candidate = raw.volume && typeof raw.volume === "object" ? raw.volume as Record<string, unknown> : {};
    const min = candidate.min;
    const validVolume = Array.isArray(min) && min.length === 3 && min.every(component => typeof component === "number" && Number.isFinite(component))
        && typeof candidate.size === "number" && Number.isFinite(candidate.size) && candidate.size > 0;
    return {
        enabled: raw.enabled === true,
        strength: typeof raw.strength === "number" && Number.isFinite(raw.strength)
            ? Math.max(0, Math.min(2, raw.strength)) : DEFAULT_RC_DIFFUSE_GI_SETTINGS.strength,
        volume: validVolume ? {
            min: min.map(component => Math.max(-1e6, Math.min(1e6, component))) as [number, number, number],
            size: Math.max(0.1, Math.min(100000, candidate.size as number)),
        } : null,
    };
}

export function cloneRcDiffuseGiSettings(settings: RcDiffuseGiSettings): RcDiffuseGiSettings {
    return { ...settings, volume: settings.volume ? { min: [...settings.volume.min], size: settings.volume.size } : null };
}

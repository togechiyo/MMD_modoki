import { normalizeRcSkyOcclusionSettings, type RcSkyOcclusionVolume } from "./rc-sky-occlusion-settings";

export type RcSkyAmbientVolume = RcSkyOcclusionVolume;

export type RcSkyAmbientSettings = {
    enabled: boolean;
    strength: number;
    fill: number;
    baseLight: number;
    volume: RcSkyOcclusionVolume | null;
};

export const DEFAULT_RC_SKY_AMBIENT_SETTINGS: Readonly<RcSkyAmbientSettings> = Object.freeze({
    enabled: false, strength: 0.95, fill: 0.035, baseLight: 0.25, volume: null,
});

export function normalizeRcSkyAmbientSettings(value: unknown): RcSkyAmbientSettings {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const scalar = (key: "strength" | "fill" | "baseLight", maximum: number): number => typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? Math.max(0, Math.min(maximum, raw[key] as number)) : DEFAULT_RC_SKY_AMBIENT_SETTINGS[key];
    return {
        enabled: raw.enabled === true,
        strength: scalar("strength", 2),
        fill: scalar("fill", 1),
        baseLight: scalar("baseLight", 1),
        // Both fields use the same cubic bounds and serialization limits.
        volume: normalizeRcSkyOcclusionSettings({ volume: raw.volume }).volume,
    };
}

export function cloneRcSkyAmbientSettings(settings: RcSkyAmbientSettings): RcSkyAmbientSettings {
    return { ...settings, volume: settings.volume ? { min: [...settings.volume.min], size: settings.volume.size } : null };
}

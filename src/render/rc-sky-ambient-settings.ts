import { normalizeRcSkyOcclusionSettings, type RcSkyOcclusionVolume } from "./rc-sky-occlusion-settings";

export type RcSkyAmbientVolume = RcSkyOcclusionVolume;
export type RcSkyAmbientQuality = "low" | "standard" | "high";

export type RcSkyAmbientSettings = {
    enabled: boolean;
    opacity: number;
    strength: number;
    fill: number;
    baseLight: number;
    rangeScale: number;
    quality: RcSkyAmbientQuality;
    volume: RcSkyOcclusionVolume | null;
};

export const DEFAULT_RC_SKY_AMBIENT_SETTINGS: Readonly<RcSkyAmbientSettings> = Object.freeze({
    enabled: false, opacity: 1, strength: 0.95, fill: 0.035, baseLight: 0.25, rangeScale: 1, quality: "standard", volume: null,
});

export function normalizeRcSkyAmbientSettings(value: unknown): RcSkyAmbientSettings {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const scalar = (key: "opacity" | "strength" | "fill" | "baseLight" | "rangeScale", maximum: number, minimum = 0): number => typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? Math.max(minimum, Math.min(maximum, raw[key] as number)) : DEFAULT_RC_SKY_AMBIENT_SETTINGS[key];
    return {
        enabled: raw.enabled === true,
        opacity: scalar("opacity", 1),
        strength: scalar("strength", 2),
        fill: scalar("fill", 1),
        baseLight: scalar("baseLight", 1),
        rangeScale: scalar("rangeScale", 4, 0.25),
        quality: raw.quality === "low" || raw.quality === "high" ? raw.quality : "standard",
        // Both fields use the same cubic bounds and serialization limits.
        volume: normalizeRcSkyOcclusionSettings({ volume: raw.volume }).volume,
    };
}

export function cloneRcSkyAmbientSettings(settings: RcSkyAmbientSettings): RcSkyAmbientSettings {
    return { ...settings, volume: settings.volume ? { min: [...settings.volume.min], size: settings.volume.size } : null };
}

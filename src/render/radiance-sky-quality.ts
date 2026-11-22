import { createRadianceCascadeLayouts, type RadianceCascadeLayout } from "./radiance-cascade-lab-model";
import { scaleRcVolumeAboutCenter } from "./rc-origin-volumes";

export type SkyVisibilityQuality = "low" | "standard" | "high";

/** Spatial resolution only; every quality keeps the same angular coverage and four intervals. */
export function getSkyVisibilityProbeGrid(quality: SkyVisibilityQuality = "standard"): number {
    return quality === "low" ? 8 : quality === "high" ? 32 : 16;
}

export function createSkyVisibilityCascadeLayouts(quality: SkyVisibilityQuality = "standard"): RadianceCascadeLayout[] {
    return createRadianceCascadeLayouts(getSkyVisibilityProbeGrid(quality));
}

/** Scale a base volume about its center without changing the saved/fitted base bounds. */
export function scaleSkyVisibilityVolume(volume: { min: readonly [number, number, number]; size: number }, scale: number): {
    min: [number, number, number]; size: number;
} {
    const bounded = Number.isFinite(scale) ? Math.max(0.25, Math.min(4, scale)) : 1;
    return scaleRcVolumeAboutCenter(volume, bounded);
}

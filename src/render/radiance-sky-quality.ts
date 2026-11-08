import { createRadianceCascadeLayouts, type RadianceCascadeLayout } from "./radiance-cascade-lab-model";

export type SkyVisibilityQuality = "low" | "standard" | "high";

/** Spatial resolution only; every quality keeps the same angular coverage and four intervals. */
export function getSkyVisibilityProbeGrid(quality: SkyVisibilityQuality = "standard"): number {
    return quality === "low" ? 8 : quality === "high" ? 32 : 16;
}

export function createSkyVisibilityCascadeLayouts(quality: SkyVisibilityQuality = "standard"): RadianceCascadeLayout[] {
    const scale = getSkyVisibilityProbeGrid(quality) / 16;
    return createRadianceCascadeLayouts().map(layout => {
        const grid = layout.grid * scale;
        return { ...layout, grid, width: grid * layout.directionsX, height: grid * grid * layout.directionsY };
    });
}

/** Scale a base volume about its center without changing the saved/fitted base bounds. */
export function scaleSkyVisibilityVolume(volume: { min: readonly [number, number, number]; size: number }, scale: number): {
    min: [number, number, number]; size: number;
} {
    const bounded = Number.isFinite(scale) ? Math.max(0.25, Math.min(4, scale)) : 1;
    const size = volume.size * bounded, offset = (volume.size - size) / 2;
    return { min: [volume.min[0] + offset, volume.min[1] + offset, volume.min[2] + offset], size };
}

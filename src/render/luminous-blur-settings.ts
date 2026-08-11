export type LuminousBlurBand = "core" | "halo";

export const LUMINOUS_BLUR_FIXED_KERNELS = {
    core: 17,
    halo: 49,
} as const satisfies Record<LuminousBlurBand, number>;

export type LuminousBlurPassSettings = {
    kernel: number;
    directionScale: number;
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Keeps ThinBlurPostProcess shader variants stable while adjusting blur reach
 * continuously through its delta uniform (direction / texture size).
 */
export function resolveLuminousBlurPassSettings(
    luminousRadius: number,
    band: LuminousBlurBand,
): LuminousBlurPassSettings {
    const radius = clamp(Number.isFinite(luminousRadius) ? luminousRadius : 1, 1, 128);
    const intendedReach = band === "core"
        ? clamp(radius * 0.32, 5, 33)
        : clamp(radius, 9, 129);
    const kernel = LUMINOUS_BLUR_FIXED_KERNELS[band];

    return {
        kernel,
        directionScale: intendedReach / kernel,
    };
}

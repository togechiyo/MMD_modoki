/** Development-only comparison controls; these are not project lighting settings. */
export type SkyVisibilityReconstruction = Readonly<{ nearDistance: number; rejectOccludedProbes: boolean; sampleAtRayEnd: boolean }>;

export const DEFAULT_SKY_RECONSTRUCTION: SkyVisibilityReconstruction = {
    nearDistance: 8,
    rejectOccludedProbes: false,
    sampleAtRayEnd: true,
};

export function normalizeSkyReconstruction(value: Partial<SkyVisibilityReconstruction>): SkyVisibilityReconstruction {
    return {
        nearDistance: typeof value.nearDistance === "number" && Number.isFinite(value.nearDistance)
            ? Math.min(64, Math.max(0, value.nearDistance)) : DEFAULT_SKY_RECONSTRUCTION.nearDistance,
        rejectOccludedProbes: typeof value.rejectOccludedProbes === "boolean" ? value.rejectOccludedProbes : DEFAULT_SKY_RECONSTRUCTION.rejectOccludedProbes,
        sampleAtRayEnd: typeof value.sampleAtRayEnd === "boolean" ? value.sampleAtRayEnd : DEFAULT_SKY_RECONSTRUCTION.sampleAtRayEnd,
    };
}

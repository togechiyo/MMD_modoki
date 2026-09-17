/** Keep 360 as a distinct slider endpoint, even though it renders like 0. */
export function normalizeEnvironmentLightingRotation(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value)
        ? Math.max(0, Math.min(360, value))
        : 0;
}

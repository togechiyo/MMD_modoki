export type LuminousRadianceSettings = { enabled: boolean; strength: number; range: number; softness?: number; distanceSoftness?: boolean };
export const DEFAULT_LUMINOUS_RADIANCE: Readonly<LuminousRadianceSettings> = { enabled: false, strength: 1, range: 12, softness: 0, distanceSoftness: false };

export function normalizeLuminousRadiance(value: unknown): LuminousRadianceSettings {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const number = (key: "strength" | "range" | "softness", min: number, max: number): number =>
        typeof raw[key] === "number" && Number.isFinite(raw[key])
            ? Math.min(max, Math.max(min, raw[key] as number)) : DEFAULT_LUMINOUS_RADIANCE[key] ?? 0;
    // Shelved by owner decision: retain the legacy field but never restore its enabled state.
    return { enabled: raw.enabled === true, strength: number("strength", 0, 8), range: number("range", 1, 100), softness: number("softness", 0, 1), distanceSoftness: false };
}

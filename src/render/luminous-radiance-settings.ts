export type LuminousRadianceSettings = { enabled: boolean; strength: number; range: number };
export const DEFAULT_LUMINOUS_RADIANCE: Readonly<LuminousRadianceSettings> = { enabled: false, strength: 1, range: 12 };

export function normalizeLuminousRadiance(value: unknown): LuminousRadianceSettings {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const number = (key: "strength" | "range", min: number, max: number): number =>
        typeof raw[key] === "number" && Number.isFinite(raw[key])
            ? Math.min(max, Math.max(min, raw[key] as number)) : DEFAULT_LUMINOUS_RADIANCE[key];
    return { enabled: raw.enabled === true, strength: number("strength", 0, 8), range: number("range", 1, 100) };
}

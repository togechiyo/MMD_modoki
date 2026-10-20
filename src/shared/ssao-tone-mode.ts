export type SsaoToneMode = "simple" | "legacy";

/** Projects without this setting retain their previous appearance. */
export function normalizeSsaoToneMode(value: unknown): SsaoToneMode {
    return value === "simple" ? "simple" : "legacy";
}

export function getSsaoTotalStrength(strength: number, mode: SsaoToneMode): number {
    const value = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
    return mode === "simple" ? value * 2 : Math.pow(value, 1.35) * 2.2;
}

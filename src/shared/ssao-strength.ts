export function getSsaoTotalStrength(strength: number): number {
    const value = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0;
    return value * 2;
}

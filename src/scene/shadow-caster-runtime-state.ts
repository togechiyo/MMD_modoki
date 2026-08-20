export function shouldEnableShadowSampling(
    shadowEnabled: boolean,
    explicitCasterCount: number | null,
): boolean {
    if (!shadowEnabled) return false;
    if (explicitCasterCount === null) return true;
    return explicitCasterCount > 0;
}

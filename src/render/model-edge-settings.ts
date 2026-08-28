function normalizeWidth(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Resolves the Babylon MMD outline width from the project-wide edge scale.
 * In uniform mode, PMX material edge-size differences are intentionally ignored.
 */
export function resolveModelEdgeWidth(
    materialWidth: number,
    globalScale: number,
    uniformWidthEnabled: boolean,
): number {
    const normalizedScale = normalizeWidth(globalScale);
    if (uniformWidthEnabled) return normalizedScale;
    return normalizeWidth(materialWidth) * normalizedScale;
}

export function resolveVisibleBoneNames(
    pmxVisibleBoneNames: readonly string[],
    physicsBoneNames: readonly string[] | null | undefined,
    showPhysicsBones: boolean,
): Set<string> {
    const visibleBoneNames = new Set(pmxVisibleBoneNames);
    if (!showPhysicsBones) return visibleBoneNames;
    for (const boneName of physicsBoneNames ?? []) {
        visibleBoneNames.add(boneName);
    }
    return visibleBoneNames;
}

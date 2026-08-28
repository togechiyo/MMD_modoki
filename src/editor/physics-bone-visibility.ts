export function resolveVisibleBoneNames(
    pmxVisibleBoneNames: readonly string[],
    physicsBoneNames: readonly string[] | null | undefined,
    showPhysicsBones: boolean,
): Set<string> {
    const visibleBoneNames = new Set(pmxVisibleBoneNames);
    for (const boneName of physicsBoneNames ?? []) {
        if (showPhysicsBones) {
            visibleBoneNames.add(boneName);
        } else {
            visibleBoneNames.delete(boneName);
        }
    }
    return visibleBoneNames;
}

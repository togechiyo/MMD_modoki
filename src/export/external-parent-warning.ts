/** Null-only tracks are ordinary unparented keys. Retain release keys in the
 * omission count when the motion actually contains an external-parent link. */
export function externalParentOmissionCount<T>(keys: readonly T[], hasParent: (key: T) => boolean): number {
    return keys.some(hasParent) ? keys.length : 0;
}

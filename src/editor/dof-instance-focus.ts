import type { EffectValue } from "./effect-keyframe-definitions";

/** Identity resolution never edits the authored key, including missing references. */
export function resolveDofInstanceFocusTarget<T>(value: EffectValue, cameraTarget: T, modelTarget: (instanceId: string, boneName: string) => T | null, personTarget: () => T): T {
    if (value.focusMode === "person-auto") return personTarget();
    if (value.focusMode === "model-target") return modelTarget(String(value.targetModelInstanceId), String(value.targetBoneName)) ?? cameraTarget;
    return cameraTarget;
}
/** Babylon CoC uses camera-space Z; off-axis Euclidean distance moves the focal plane. */
export function dofInstanceFocusDistanceMm(value: EffectValue, viewDepth: number, minZ: number): number {
    return Math.max(minZ * 1000, Math.abs(viewDepth) * 1000 - Number(value.focusOffset));
}

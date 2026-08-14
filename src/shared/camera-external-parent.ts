import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

export type CameraExternalParentKeyframePayload = {
    modelInstanceId?: string | null;
    modelPath: string | null;
    boneName: string | null;
};

export type CameraExternalParentKeyframeLike = CameraExternalParentKeyframePayload & {
    frame: number;
};

export function normalizeCameraExternalParentPayload(
    payload: CameraExternalParentKeyframePayload,
): CameraExternalParentKeyframePayload {
    const modelInstanceId = typeof payload.modelInstanceId === "string" && payload.modelInstanceId.length > 0
        ? payload.modelInstanceId
        : null;
    const modelPath = typeof payload.modelPath === "string" && payload.modelPath.length > 0
        ? payload.modelPath
        : null;
    const boneName = (modelInstanceId || modelPath) && typeof payload.boneName === "string" && payload.boneName.length > 0
        ? payload.boneName
        : null;
    return modelInstanceId
        ? { modelInstanceId, modelPath, boneName }
        : { modelPath, boneName };
}

export function selectCameraExternalParentKeyframeAtFrame<T extends CameraExternalParentKeyframeLike>(
    keyframes: readonly T[],
    frame: number,
): T | null {
    const normalizedFrame = Math.max(0, Math.floor(frame));
    let selected: T | null = null;
    for (const entry of keyframes) {
        if (entry.frame > normalizedFrame) break;
        selected = entry;
    }
    return selected;
}

export function upsertCameraExternalParentKeyframe<T extends CameraExternalParentKeyframeLike>(
    keyframes: readonly T[],
    frame: number,
    payload: CameraExternalParentKeyframePayload,
): CameraExternalParentKeyframeLike[] {
    const normalizedFrame = Math.max(0, Math.floor(frame));
    const normalizedPayload = normalizeCameraExternalParentPayload(payload);
    return [
        ...keyframes.filter((entry) => entry.frame !== normalizedFrame),
        { frame: normalizedFrame, ...normalizedPayload },
    ].sort((a, b) => a.frame - b.frame);
}

export function removeCameraExternalParentKeyframes<T extends CameraExternalParentKeyframeLike>(
    keyframes: readonly T[],
    frames: readonly number[],
): T[] {
    const targets = new Set(frames.map((frame) => Math.max(0, Math.floor(frame))));
    return keyframes.filter((entry) => !targets.has(entry.frame));
}

export function moveCameraExternalParentKeyframe<T extends CameraExternalParentKeyframeLike>(
    keyframes: readonly T[],
    fromFrame: number,
    toFrame: number,
): CameraExternalParentKeyframeLike[] {
    const from = Math.max(0, Math.floor(fromFrame));
    const to = Math.max(0, Math.floor(toFrame));
    const source = keyframes.find((entry) => entry.frame === from);
    if (!source) return [...keyframes];

    return [
        ...keyframes.filter((entry) => entry.frame !== from && entry.frame !== to),
        { ...source, frame: to },
    ].sort((a, b) => a.frame - b.frame);
}

export function transformCameraExternalParentVectorsToRef(
    parentMatrix: Matrix,
    position: Vector3,
    target: Vector3,
    up: Vector3,
): void {
    Vector3.TransformCoordinatesToRef(position, parentMatrix, position);
    Vector3.TransformCoordinatesToRef(target, parentMatrix, target);
    Vector3.TransformNormalToRef(up, parentMatrix, up);
    up.normalize();
}

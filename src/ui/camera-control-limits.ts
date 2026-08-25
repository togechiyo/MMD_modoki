export const CAMERA_DISTANCE_MIN = 0.15;
export const CAMERA_DISTANCE_MAX = 100_000;
export const CAMERA_FOV_MIN_DEG = 1;
export const CAMERA_FOV_MAX_DEG = 120;

export function clampCameraDistance(value: number): number {
    if (!Number.isFinite(value)) return CAMERA_DISTANCE_MIN;
    return Math.max(CAMERA_DISTANCE_MIN, Math.min(CAMERA_DISTANCE_MAX, value));
}

export function clampCameraFovDegrees(value: number): number {
    if (!Number.isFinite(value)) return 30;
    return Math.max(CAMERA_FOV_MIN_DEG, Math.min(CAMERA_FOV_MAX_DEG, value));
}

export const DEFAULT_CAMERA_MIN_Z = 0.15;
export const DEFAULT_CAMERA_MAX_Z = 100_000;
export const DEFAULT_SKYDOME_FAR_PLANE_RATIO = 0.95;

export function getDefaultSkydomeDiameter(cameraMaxZ = DEFAULT_CAMERA_MAX_Z): number {
    return cameraMaxZ * DEFAULT_SKYDOME_FAR_PLANE_RATIO * 2;
}

import type { CameraTransformCommandSnapshot } from "../actions/command-types";

/** Compare runtime observations at source-animation precision; preserve the original DTO for callers. */
export function cameraRevisionValues(camera: CameraTransformCommandSnapshot): number[] {
    return [camera.target.x, camera.target.y, camera.target.z, camera.rotation.x, camera.rotation.y, camera.rotation.z,
        camera.distance, camera.fov].map(Math.fround);
}

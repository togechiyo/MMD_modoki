import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CAMERA_DISTANCE_MIN } from "../ui/camera-control-limits";

export function mmdCameraViewportTarget(eye: Vector3, pivot: Vector3, forward: Vector3, sourceDistance: number): Vector3 {
    // MMD always looks along its rotated +Z, even at or beyond the orbit pivot.
    if (sourceDistance < -CAMERA_DISTANCE_MIN) return pivot.clone();
    return eye.add(forward.scale(Math.max(CAMERA_DISTANCE_MIN, Math.abs(sourceDistance))));
}

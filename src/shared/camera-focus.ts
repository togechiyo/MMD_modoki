import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { CameraTransformCommandSnapshot } from "../actions/command-types";

/** Resolve one-shot focus without changing camera orientation, distance, or lens. */
export function cameraPoseFocusedOnPoints(
    before: CameraTransformCommandSnapshot,
    points: readonly { x: number; y: number; z: number }[],
    parentMatrix: Matrix | null = null,
): CameraTransformCommandSnapshot | null {
    if (!points.length || points.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) return null;
    const target = Vector3.Zero();
    for (const point of points) target.addInPlaceFromFloats(point.x / points.length, point.y / points.length, point.z / points.length);
    if (parentMatrix) {
        if (Math.abs(parentMatrix.determinant()) < 1e-10) return null;
        Vector3.TransformCoordinatesToRef(target, Matrix.Invert(parentMatrix), target);
        const radians = -Math.PI / 180;
        const rotation = Matrix.RotationYawPitchRoll(before.rotation.y * radians, before.rotation.x * radians, before.rotation.z * radians);
        Vector3.TransformCoordinatesToRef(target, Matrix.Invert(rotation), target);
        // In parent mode the real look-at is R * (editable XYZ + forward unit Z).
        target.z -= 1;
    }
    return { target: { x: target.x, y: target.y, z: target.z }, rotation: { ...before.rotation }, distance: before.distance, fov: before.fov };
}

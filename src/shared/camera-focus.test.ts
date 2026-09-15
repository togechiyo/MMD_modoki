import { describe, expect, it } from "vitest";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { cameraPoseFocusedOnPoints } from "./camera-focus";

const before = { target: { x: 0, y: 10, z: 0 }, rotation: { x: 15, y: 30, z: 5 }, distance: 45, fov: 30 };
describe("camera focus", () => {
    it("centers selected positions and preserves angle, distance and lens", () => {
        expect(cameraPoseFocusedOnPoints(before, [{ x: 2, y: 3, z: 4 }, { x: 6, y: 9, z: 8 }]))
            .toEqual({ ...before, target: { x: 4, y: 6, z: 6 } });
        expect(before.target).toEqual({ x: 0, y: 10, z: 0 });
    });
    it("inverts the existing rotated external-parent camera look-at", () => {
        const parent = Matrix.Compose(new Vector3(2, 2, 2), Quaternion.RotationYawPitchRoll(0.8, 0.3, 0.2), new Vector3(12, 5, -8));
        const point = { x: 30, y: 7, z: 4 };
        const after = cameraPoseFocusedOnPoints({ ...before, distance: 0 }, [point], parent);
        expect(after).not.toBeNull();
        if (!after) return;
        const rotation = Matrix.RotationYawPitchRoll(-Math.PI / 6, -Math.PI / 12, -Math.PI / 36);
        const local = new Vector3(after.target.x, after.target.y, after.target.z + 1);
        const actual = Vector3.TransformCoordinates(Vector3.TransformCoordinates(local, rotation), parent);
        expect(actual.x).toBeCloseTo(point.x, 4);
        expect(actual.y).toBeCloseTo(point.y, 4);
        expect(actual.z).toBeCloseTo(point.z, 4);
        expect(after.distance).toBe(0);
    });
    it("rejects absent or invalid positions and singular parents", () => {
        expect(cameraPoseFocusedOnPoints(before, [])).toBeNull();
        expect(cameraPoseFocusedOnPoints(before, [{ x: NaN, y: 0, z: 0 }])).toBeNull();
        expect(cameraPoseFocusedOnPoints(before, [before.target], Matrix.Scaling(0, 0, 0))).toBeNull();
    });
});

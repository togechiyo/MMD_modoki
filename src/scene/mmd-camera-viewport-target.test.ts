import { describe, expect, it } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { mmdCameraViewportTarget } from "./mmd-camera-viewport-target";

describe("MMD camera viewport look target", () => {
    const pivot = new Vector3(1, 2, 3), forward = new Vector3(0, 0, 1);
    it("retains the orbit pivot for an ordinary negative source distance", () => {
        expect(mmdCameraViewportTarget(new Vector3(1, 2, -9), pivot, forward, -12).asArray()).toEqual([1, 2, 3]);
    });
    it.each([0, 0.01, -0.01, 12])("keeps the MMD forward direction at source distance %s", distance => {
        const eye = pivot.add(forward.scale(distance));
        const target = mmdCameraViewportTarget(eye, pivot, forward, distance);
        expect(target.subtract(eye).normalize().asArray()).toEqual(forward.asArray());
        expect(Vector3.Distance(target, eye)).toBeGreaterThanOrEqual(0.1499999);
        expect(pivot.asArray()).toEqual([1, 2, 3]);
    });
});

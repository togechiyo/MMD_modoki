import { describe, expect, it } from "vitest";
import {
    CAMERA_DISTANCE_MAX,
    CAMERA_DISTANCE_MIN,
    CAMERA_FOV_MAX_DEG,
    CAMERA_FOV_MIN_DEG,
    clampCameraDistance,
    clampCameraEditingDistance,
    clampCameraFovDegrees,
} from "./camera-control-limits";

describe("camera control limits", () => {
    it("retains signed editing distance and zero without the viewport radius minimum", () => {
        for (const distance of [-30, -0.05, 0, 0.05, 30]) expect(clampCameraEditingDistance(distance)).toBe(distance);
        expect(clampCameraEditingDistance(-200000)).toBe(-CAMERA_DISTANCE_MAX);
    });
    it("allows close-up distances below the former 3-unit radius limit", () => {
        expect(clampCameraDistance(0)).toBe(CAMERA_DISTANCE_MIN);
        expect(clampCameraDistance(0.25)).toBe(0.25);
        expect(clampCameraDistance(200_000)).toBe(CAMERA_DISTANCE_MAX);
    });

    it("allows narrow MMD camera fields of view", () => {
        expect(clampCameraFovDegrees(0)).toBe(CAMERA_FOV_MIN_DEG);
        expect(clampCameraFovDegrees(5)).toBe(5);
        expect(clampCameraFovDegrees(200)).toBe(CAMERA_FOV_MAX_DEG);
    });
});

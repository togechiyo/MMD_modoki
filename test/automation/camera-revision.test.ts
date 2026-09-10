import { describe, it, expect } from "vitest";
import { cameraRevisionValues } from "../../src/automation/camera-revision";

describe("MCP camera observation revision", () => {
    const camera = { target: { x: 7, y: 10, z: 0 }, rotation: { x: 10, y: 20, z: 30 }, distance: 42.00000041671727, fov: 55 };
    it("ignores the measured viewport distance roundoff without changing the returned observation", () => {
        expect(cameraRevisionValues(camera)).toEqual(cameraRevisionValues({ ...camera, distance: 41.999999052863735 }));
        expect(camera.distance).toBe(42.00000041671727);
    });
    it("still detects edits to each camera component", () => {
        for (const changed of [{ ...camera, distance: 42.001 }, { ...camera, fov: 56 },
            ...["x", "y", "z"].flatMap(axis => [
                { ...camera, target: { ...camera.target, [axis]: 0.001 } },
                { ...camera, rotation: { ...camera.rotation, [axis]: 0.001 } },
            ])]) expect(cameraRevisionValues(changed)).not.toEqual(cameraRevisionValues(camera));
    });
});

import { describe, expect, it } from "vitest";
import {
    DEFAULT_DOF_FOCUS_MODE,
    findDofPersonFocusBoneName,
    normalizeDofFocusMode,
    selectDofPersonAutoFocusCandidate,
    type DofPersonAutoFocusCandidate,
} from "./dof-person-autofocus";

function candidate(
    modelInstanceId: string,
    screenX: number,
    screenY: number,
    depth = 0.5,
    cameraDistance = 10,
): DofPersonAutoFocusCandidate {
    return {
        modelInstanceId,
        boneName: "頭",
        screenX,
        screenY,
        depth,
        cameraDistance,
    };
}

describe("dof person autofocus", () => {
    it("recognizes character head and upper-body bones without accepting a stage center bone", () => {
        expect(findDofPersonFocusBoneName(["センター", "床", "照明"])).toBeNull();
        expect(findDofPersonFocusBoneName(["センター", "上半身", "頭"])).toBe("頭");
        expect(findDofPersonFocusBoneName(["Center", "Upper Body2"])).toBe("Upper Body2");
    });

    it("normalizes unknown runtime values to the autofocus default", () => {
        expect(normalizeDofFocusMode("person-auto")).toBe("person-auto");
        expect(normalizeDofFocusMode("model-target")).toBe("model-target");
        expect(DEFAULT_DOF_FOCUS_MODE).toBe("person-auto");
        expect(normalizeDofFocusMode("unknown")).toBe(DEFAULT_DOF_FOCUS_MODE);
        expect(normalizeDofFocusMode(undefined)).toBe(DEFAULT_DOF_FOCUS_MODE);
    });

    it("selects the visible person closest to the screen center", () => {
        const selected = selectDofPersonAutoFocusCandidate([
            candidate("left", -0.7, 0),
            candidate("center", 0.05, -0.04),
            candidate("right", 0.55, 0.1),
        ], null);

        expect(selected?.modelInstanceId).toBe("center");
    });

    it("keeps center priority stronger than camera distance", () => {
        const selected = selectDofPersonAutoFocusCandidate([
            candidate("near-edge", 0.75, 0, 0.1, 2),
            candidate("far-center", 0, 0, 0.9, 20),
        ], null);

        expect(selected?.modelInstanceId).toBe("far-center");
    });

    it("selects the nearer person when center scores are equal even with reverse depth", () => {
        const selected = selectDofPersonAutoFocusCandidate([
            candidate("far", 0, 0, 0.05, 20),
            candidate("near", 0, 0, 0.95, 5),
        ], null);

        expect(selected?.modelInstanceId).toBe("near");
    });

    it("ignores offscreen and invalid candidates", () => {
        const selected = selectDofPersonAutoFocusCandidate([
            candidate("offscreen", 1.2, 0),
            candidate("behind", 0, 0, -0.1),
            candidate("visible", 0.4, 0.2),
        ], null);

        expect(selected?.modelInstanceId).toBe("visible");
    });

    it("keeps the current person when a challenger is only slightly better", () => {
        const selected = selectDofPersonAutoFocusCandidate([
            candidate("locked", 0.25, 0),
            candidate("challenger", 0.15, 0),
        ], "locked");

        expect(selected?.modelInstanceId).toBe("locked");
    });

    it("switches when the challenger is clearly more central", () => {
        const selected = selectDofPersonAutoFocusCandidate([
            candidate("locked", 0.65, 0),
            candidate("challenger", 0.05, 0),
        ], "locked");

        expect(selected?.modelInstanceId).toBe("challenger");
    });

    it("releases a lock that is no longer visible", () => {
        const selected = selectDofPersonAutoFocusCandidate([
            candidate("visible", 0.35, 0),
        ], "missing");

        expect(selected?.modelInstanceId).toBe("visible");
    });
});

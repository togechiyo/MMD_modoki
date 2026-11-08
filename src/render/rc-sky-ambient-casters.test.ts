import { describe, expect, it } from "vitest";
import { isRcSkyAmbientStaticModel } from "./rc-sky-ambient-casters";

describe("sky ambient static model selection", () => {
    const stage = { animationCount: 0, dynamicPhysics: false, externalParent: false };
    it("accepts a stationary model even when it has bones", () => {
        expect(isRcSkyAmbientStaticModel(stage)).toBe(true);
    });
    it("excludes motion even while paused, physics and animated attachment", () => {
        expect(isRcSkyAmbientStaticModel({ ...stage, animationCount: 1 })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...stage, dynamicPhysics: true })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...stage, externalParent: true })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...stage, animationCount: Number.NaN })).toBe(false);
    });
});

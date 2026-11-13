import { describe, expect, it } from "vitest";
import { isRcSkyAmbientStaticModel } from "./rc-sky-ambient-casters";

describe("sky ambient static model selection", () => {
    const stage = { animationCount: 0, dynamicPhysics: false, externalParent: false };
    const morphOnly = { boneTracks: [], movableBoneTracks: [] };
    it("accepts a stationary model even when it has bones", () => {
        expect(isRcSkyAmbientStaticModel(stage)).toBe(true);
    });
    it("excludes motion even while paused, physics and animated attachment", () => {
        expect(isRcSkyAmbientStaticModel({ ...stage, animationCount: 1 })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...stage, dynamicPhysics: true })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...stage, externalParent: true })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...stage, animationCount: Number.NaN })).toBe(false);
    });
    it("keeps a stage as an occluder after registering or restoring morph-only animation", () => {
        const registered = { ...stage, animationCount: 1, sourceAnimation: morphOnly };
        expect(isRcSkyAmbientStaticModel(registered)).toBe(true);
        expect(isRcSkyAmbientStaticModel({ ...registered, sourceAnimation: structuredClone(morphOnly) })).toBe(true);
    });
    it("ignores empty bone tracks left by editing, but excludes real skeletal animation", () => {
        const boneKeys = new Uint32Array(0);
        const registered = { ...stage, animationCount: 1, sourceAnimation: {
            boneTracks: [{ frameNumbers: boneKeys }], movableBoneTracks: [{ frameNumbers: boneKeys }],
        } };
        expect(isRcSkyAmbientStaticModel(registered)).toBe(true);
        for (const kind of ["boneTracks", "movableBoneTracks"] as const) {
            const sourceAnimation = { ...registered.sourceAnimation, [kind]: [{ frameNumbers: new Uint32Array([0]) }] };
            expect(isRcSkyAmbientStaticModel({ ...registered, sourceAnimation })).toBe(false);
        }
    });
    it("keeps physics and external-parent exclusions even for morph-only animation", () => {
        const registered = { ...stage, animationCount: 1, sourceAnimation: morphOnly };
        expect(isRcSkyAmbientStaticModel({ ...registered, dynamicPhysics: true })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...registered, externalParent: true })).toBe(false);
    });
});

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
            const sourceAnimation = { ...registered.sourceAnimation, [kind]: [{ frameNumbers: new Uint32Array([0, 30]) }] };
            expect(isRcSkyAmbientStaticModel({ ...registered, sourceAnimation })).toBe(false);
        }
    });
    it("keeps one pose key per bone, including keys away from frame zero", () => {
        const registered = { ...stage, animationCount: 1, sourceAnimation: {
            boneTracks: [{ frameNumbers: new Uint32Array([0]) }, { frameNumbers: new Uint32Array([15]) }],
            movableBoneTracks: [{ frameNumbers: new Uint32Array([30]) }],
        } };
        expect(isRcSkyAmbientStaticModel(registered)).toBe(true);
        expect(isRcSkyAmbientStaticModel({ ...registered, sourceAnimation: structuredClone(registered.sourceAnimation) })).toBe(true);
        expect(isRcSkyAmbientStaticModel({ ...registered, dynamicPhysics: true })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...registered, externalParent: true })).toBe(false);
    });
    it("rechecks the same source after a second pose key is added or undone", () => {
        for (const kind of ["boneTracks", "movableBoneTracks"] as const) {
            const track = { frameNumbers: new Uint32Array([15]) };
            const sourceAnimation = { ...morphOnly, [kind]: [track] };
            const registered = { ...stage, animationCount: 1, sourceAnimation };
            expect(isRcSkyAmbientStaticModel(registered)).toBe(true);
            track.frameNumbers = new Uint32Array([15, 30]);
            expect(isRcSkyAmbientStaticModel(registered)).toBe(false);
            track.frameNumbers = new Uint32Array([15]);
            expect(isRcSkyAmbientStaticModel(registered)).toBe(true);
        }
    });
    it("keeps physics and external-parent exclusions even for morph-only animation", () => {
        const registered = { ...stage, animationCount: 1, sourceAnimation: morphOnly };
        expect(isRcSkyAmbientStaticModel({ ...registered, dynamicPhysics: true })).toBe(false);
        expect(isRcSkyAmbientStaticModel({ ...registered, externalParent: true })).toBe(false);
    });
});

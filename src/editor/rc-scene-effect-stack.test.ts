import { describe, expect, it } from "vitest";
import { migrateRcSceneEffectStack, withRcSceneEffectStackIndex } from "./rc-scene-effect-stack";
import { FrameGraphEffectInstances } from "./frame-graph-effect-instances";

const animations = { version: 1, tracks: [
    { effectId: "rcDiffuseGi", valueVersion: 1, base: { enabled: false, strength: 0.5 }, keys: [
        { frame: 20, value: { enabled: true, strength: 1.5 } },
    ] },
] };

describe("RC singleton scene-effect cards", () => {
    it("migrates old ON lighting and keyed OFF cards without adding untouched OFF defaults", () => {
        expect(migrateRcSceneEffectStack({ lighting: {} })).toEqual([]);
        expect(migrateRcSceneEffectStack({ stack: [{ id: "gamma", enabled: true }],
            lighting: { rcSkyOcclusion: { enabled: true }, rcDiffuseGi: { enabled: false } }, animations })).toEqual([
            { id: "gamma", enabled: true }, { id: "rcSkyOcclusion", enabled: true }, { id: "rcDiffuseGi", enabled: false },
        ]);
    });

    it("preserves current OFF cards and explicit deletion even when old lighting or keys remain", () => {
        expect(migrateRcSceneEffectStack({ rcSceneEffectsInStack: true, stack: [],
            lighting: { rcSkyOcclusion: { enabled: true } }, animations })).toEqual([]);
        expect(migrateRcSceneEffectStack({ rcSceneEffectsInStack: true,
            stack: [{ id: "rcDiffuseGi", enabled: false }, { id: "rcDiffuseGi", enabled: true }], lighting: {} })).toEqual([
            { id: "rcDiffuseGi", enabled: false },
        ]);
    });

    it("does not turn unknown future animation formats into active cards", () => {
        expect(migrateRcSceneEffectStack({ lighting: {}, animations: { ...animations, version: 99 } })).toEqual([]);
        expect(migrateRcSceneEffectStack({ lighting: {}, animations: { version: 1, tracks: [{ ...animations.tracks[0], valueVersion: 99 }] } })).toEqual([]);
    });

    it("restores a singleton between instance cards without reordering or duplicating other effects", () => {
        const original = ["fx-left", "rcDiffuseGi", "fx-right", "gamma", "rcSkyOcclusion"];
        const removed = withRcSceneEffectStackIndex(original, "rcDiffuseGi", null);
        expect(removed).toEqual(["fx-left", "fx-right", "gamma", "rcSkyOcclusion"]);
        expect(withRcSceneEffectStackIndex(removed, "rcDiffuseGi", 1)).toEqual(original);
        expect(withRcSceneEffectStackIndex(original, "rcDiffuseGi", 1)).toEqual(original);
        expect(withRcSceneEffectStackIndex(removed, "rcDiffuseGi", 100)).toEqual([...removed, "rcDiffuseGi"]);
    });

    it("retains RC singleton tokens in saved instance order without creating duplicate fields", () => {
        const store = new FrameGraphEffectInstances();
        store.add("fx-gamma");
        store.setOrder(["rcSkyOcclusion", "fx-gamma", "rcDiffuseGi"]);
        const restored = new FrameGraphEffectInstances(); restored.restore(store.serialize());
        restored.syncLegacyOrder(["rcSkyOcclusion", "rcDiffuseGi"]);
        expect(restored.order()).toEqual(["rcSkyOcclusion", "fx-gamma", "rcDiffuseGi"]);
        expect(restored.ids()).toEqual(["fx-gamma"]);
    });
});

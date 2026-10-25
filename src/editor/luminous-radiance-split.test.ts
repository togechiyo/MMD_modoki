import { describe, expect, it } from "vitest";
import { FrameGraphEffectInstances, type SerializedEffectInstances } from "./frame-graph-effect-instances";
import { splitLuminousRadianceInstances, splitLuminousRadianceStack, splitLuminousRadianceProject } from "./luminous-radiance-split";

describe("independent Luminous RC migration", () => {
    const legacy = (): SerializedEffectInstances => ({ version: 1, order: ["gamma", "fx-light"], instances: [{
        instanceId: "fx-light", type: "luminous", label: "Neon", settings: { enabled: true, intensity: 0, threshold: 0.1, radius: 48 },
        fixedSettings: { radiance: { enabled: true, strength: 2, range: 4 } },
        animation: { version: 1, tracks: [{ effectId: "luminous", valueVersion: 1, base: { enabled: false, intensity: 0 }, keys: [
            { frame: 20, value: { enabled: true, intensity: 0 } },
        ] }] },
    }] });
    it("splits before Glow, retains enabled keys and survives a second restore", () => {
        const before = legacy(), original = structuredClone(before), migrated = splitLuminousRadianceInstances(before);
        expect(before).toEqual(original);
        const store = new FrameGraphEffectInstances(); store.restore(migrated);
        const rc = store.ids().find(id => store.type(id) === "luminousRadiance");
        if (!rc) throw new Error("RC instance missing");
        expect(store.order()).toEqual(["gamma", rc, "fx-light"]);
        expect(store.fixedSettings("fx-light")).toBeUndefined();
        expect(store.fixedSettings(rc)?.radiance).toEqual({ enabled: true, strength: 2, range: 4 });
        expect(store.value(rc, 0).enabled).toBe(false); expect(store.value(rc, 20).enabled).toBe(true);
        const saved = store.serialize(); store.restore(saved); expect(store.serialize()).toEqual(saved);
    });
    it("keeps suspended effects suspended and generates a distinct ID", () => {
        const before = legacy(); before.order = []; before.instances.push({ ...structuredClone(before.instances[0]), instanceId: "fx-light-rc", fixedSettings: undefined });
        const after = splitLuminousRadianceInstances(before);
        expect(after.order).toEqual([]); expect(new Set(after.instances.map(item => item.instanceId)).size).toBe(3);
    });
    it("does not add RC for an unused default nested setting", () => {
        const before = legacy(); before.instances[0].fixedSettings = { radiance: { enabled: false, strength: 1, range: 12 } };
        expect(splitLuminousRadianceInstances(before).instances).toHaveLength(1);
    });
    it("migrates legacy singleton RC at its original position and only once", () => {
        const settings = { enabled: true, strength: 2, range: 4 };
        const before = [{ id: "gamma", enabled: true }, { id: "luminous", enabled: false }] as const;
        const after = splitLuminousRadianceStack(before, settings, true);
        expect(after).toEqual([before[0], { id: "luminousRadiance", enabled: false }, before[1]]);
        expect(splitLuminousRadianceStack(after, settings, true)).toEqual(after);
    });
    it("migrates singleton keys and combined ordering without mutating the project", () => {
        const before = { effects: { glowEnabled: true, luminousRadiance: { enabled: true, strength: 2, range: 4 }, frameGraphInstances: legacy(),
            frameGraphPostStack: [{ id: "gamma", enabled: true }, { id: "luminous", enabled: true }] as Array<{ id: "gamma" | "luminous"; enabled: boolean }> },
            keyframes: { effectAnimations: legacy().instances[0].animation } };
        const after = splitLuminousRadianceProject(before);
        expect(after.effects.frameGraphInstances.order).toEqual(["gamma", "fx-light", "luminousRadiance"]);
        expect(after.keyframes.effectAnimations.tracks).toHaveLength(2);
        expect(before.keyframes.effectAnimations.tracks).toHaveLength(1);
        expect(splitLuminousRadianceProject(after)).toBe(after);
    });
    it("does not resurrect RC removed from a new-format project", () => {
        const project = { effects: { luminousRadianceEncodingVersion: 2 as const, luminousRadiance: { enabled: true, strength: 2, range: 4 }, frameGraphPostStack: [] } };
        expect(splitLuminousRadianceProject(project)).toBe(project);
    });
    it("preserves custom singleton values while keeping disabled RC off through all old keys", () => {
        const project = { effects: { glowEnabled: true, luminousRadiance: { enabled: false, strength: 2, range: 4 } },
            keyframes: { effectAnimations: legacy().instances[0].animation } };
        const after = splitLuminousRadianceProject(project);
        expect(after.effects).toMatchObject({ frameGraphPostStack: [{ id: "luminousRadiance", enabled: false }] });
        const rc = (after.keyframes.effectAnimations.tracks[1] as { keys: Array<{ value: { enabled: boolean } }> });
        expect(rc.keys[0].value.enabled).toBe(false);
        expect(after.effects.luminousRadiance).toEqual(project.effects.luminousRadiance);
    });
});

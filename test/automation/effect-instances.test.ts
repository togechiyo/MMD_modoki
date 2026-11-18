import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAutomationEffectInstanceEdit, effectInstanceOperationSchema, inspectAutomationEffectInstance } from "../../src/automation/effect-instances";
import { applyEffectInstanceDiff, type EffectInstanceDiff } from "../../src/actions/effect-instance-command";
import { FrameGraphEffectInstances, type SerializedEffectInstances } from "../../src/editor/frame-graph-effect-instances";
import type { EffectInstanceType } from "../../src/editor/frame-graph-instance-effects";
import { AutomationError } from "../../src/automation/diagnostics";

function fixture(type: EffectInstanceType = "gamma") {
    const store = new FrameGraphEffectInstances();
    store.add("fx-a", undefined, undefined, type);
    return store;
}
function edit(state: SerializedEffectInstances, operation: unknown) {
    return buildAutomationEffectInstanceEdit(state, effectInstanceOperationSchema.parse(operation));
}
function apply(state: SerializedEffectInstances, diff: EffectInstanceDiff | null) {
    if (!diff) throw new Error("Expected a change");
    const result = applyEffectInstanceDiff(state, diff, "apply");
    if (!result) throw new Error("Expected an applicable diff");
    return result;
}

afterEach(() => vi.restoreAllMocks());

describe("MCP effect instance edit plans", () => {
    it("plans a same-type addition without changing live data and supports shared Undo", () => {
        const state = fixture().serialize(), before = structuredClone(state);
        const result = edit(state, { action: "add", effectType: "gamma" });
        expect(state).toEqual(before);
        expect(result.plan).toMatchObject({ action: "add", effectType: "gamma", changed: true });
        expect(result.plan.instanceId).toMatch(/^fx-/);
        expect(result.plan.instanceId).not.toBe("fx-a");
        const applied = apply(state, result.diff);
        expect(applied.instances.map(item => item.label)).toEqual(["Gamma", "Gamma 2"]);
        expect(result.plan.displayOrder).toEqual([result.plan.instanceId, "fx-a"]);
        if (!result.diff) throw new Error("Expected an addition diff");
        expect(applyEffectInstanceDiff(applied, result.diff, "revert")).toEqual(before);
        expect(JSON.stringify(result.plan)).not.toContain("animation");
    });

    it("duplicates authored keys and fixed settings with a new identity but without preview", () => {
        const store = fixture("bloom");
        store.setBloomColor("fx-a", { r: 0.1, g: 0.2, b: 0.3 });
        store.apply("fx-a", 10, { kind: "effect", effectId: "bloom", instanceId: "fx-a",
            value: { enabled: true, weight: 0.2, threshold: 0.9, kernel: 100 } });
        store.setValue("fx-a", { enabled: true, weight: 1.3, threshold: 0.9, kernel: 100 }, 10);
        const state = store.serialize(), original = structuredClone(state);
        const result = edit(state, { action: "duplicate", instanceId: "fx-a" });
        const copied = apply(state, result.diff).instances.find(item => item.instanceId === result.plan.instanceId);
        expect(result.plan).toMatchObject({ action: "duplicate", sourceInstanceId: "fx-a", effectType: "bloom" });
        expect(copied).toMatchObject({ bloomColor: { r: 0.1, g: 0.2, b: 0.3 } });
        expect(copied?.animation.tracks).toEqual([{ effectId: "bloom", valueVersion: 1,
            base: state.instances[0].settings, keys: [{ frame: 10, value: { enabled: true, weight: 0.2, threshold: 0.9, kernel: 100 } }] }]);
        expect(state).toEqual(original);
    });

    it("rejects generated ID collisions without changing the source instance", () => {
        const uuid = "00000000-0000-4000-8000-000000000000";
        const store = new FrameGraphEffectInstances();
        store.add(`fx-${uuid}`);
        const state = store.serialize(), before = structuredClone(state);
        vi.spyOn(crypto, "randomUUID").mockReturnValue(uuid);
        expect(() => edit(state, { action: "duplicate", instanceId: `fx-${uuid}` })).toThrow("Invalid or duplicate effect instance ID");
        expect(state).toEqual(before);
    });

    it("reorders in GUI display order while preserving singleton entries", () => {
        const store = fixture();
        store.add("fx-b"); store.setOrder(["fx-a", "rcSkyAmbient", "fx-b"]);
        const state = store.serialize();
        const result = edit(state, { action: "reorder", instanceId: "fx-a", targetId: "fx-b", placement: "before" });
        expect(result.plan.displayOrder).toEqual(["fx-a", "fx-b", "rcSkyAmbient"]);
        expect(apply(state, result.diff).order).toEqual(["rcSkyAmbient", "fx-b", "fx-a"]);
        const acrossSingleton = edit(state, { action: "reorder", instanceId: "fx-a", targetId: "rcSkyAmbient", placement: "before" });
        expect(acrossSingleton.plan.displayOrder).toEqual(["fx-b", "fx-a", "rcSkyAmbient"]);
        expect(state.order).toEqual(["fx-a", "rcSkyAmbient", "fx-b"]);
    });

    it("distinguishes suspension from deletion and restores deleted keys on Undo", () => {
        const store = fixture();
        store.apply("fx-a", 20, { kind: "effect", effectId: "gamma", instanceId: "fx-a", value: { enabled: true, gamma: 0.5 } });
        const original = store.serialize();
        const suspended = apply(original, edit(original, { action: "suspend", instanceId: "fx-a" }).diff);
        expect(suspended.order).toEqual([]);
        expect(suspended.instances).toEqual(original.instances);
        const resumed = apply(suspended, edit(suspended, { action: "resume", instanceId: "fx-a" }).diff);
        expect(resumed).toEqual(original);
        const deletion = edit(suspended, { action: "delete", instanceId: "fx-a" });
        const deleted = apply(suspended, deletion.diff);
        expect(deleted).toEqual({ version: 1, instances: [], order: [] });
        if (!deletion.diff) throw new Error("Expected a deletion diff");
        expect(applyEffectInstanceDiff(deleted, deletion.diff, "revert")).toEqual(suspended);
    });

    it("does not create commands for unchanged names, order, fixed values or presence", () => {
        const store = fixture("motionBlur"), state = store.serialize();
        for (const operation of [
            { action: "resume", instanceId: "fx-a" },
            { action: "rename", instanceId: "fx-a", label: " Motion Blur " },
            { action: "reorder", instanceId: "fx-a", targetId: "fx-a", placement: "after" },
            { action: "fixed", instanceId: "fx-a", settings: { samples: 32 } },
        ]) expect(edit(state, operation)).toMatchObject({ diff: null, plan: { instanceId: "fx-a", changed: false } });
        store.suspend("fx-a");
        expect(edit(store.serialize(), { action: "suspend", instanceId: "fx-a" }).diff).toBeNull();
    });

    it("validates both reorder memberships and missing instances before producing a diff", () => {
        const store = fixture(); store.add("fx-b"); store.suspend("fx-b");
        const state = store.serialize(), before = structuredClone(state);
        for (const operation of [
            { action: "delete", instanceId: "fx-missing" },
            { action: "fixed", instanceId: "fx-missing", settings: { samples: 16 } },
            { action: "reorder", instanceId: "fx-b", targetId: "fx-a", placement: "before" },
            { action: "reorder", instanceId: "fx-a", targetId: "fx-b", placement: "before" },
            { action: "reorder", instanceId: "fx-a", targetId: "rcSkyAmbient", placement: "before" },
        ]) expect(() => edit(state, operation)).toThrow(AutomationError);
        expect(state).toEqual(before);
    });
});

describe("MCP public fixed effect settings", () => {
    it("patches public color while preserving the effect's internal settings", () => {
        const store = fixture("offsetShadow");
        store.setFixedSettings("fx-a", { color: { r: 1, g: 1, b: 1 }, thickness: 0.4, softness: 3 });
        const state = store.serialize(), before = structuredClone(state);
        const result = edit(state, { action: "fixed", instanceId: "fx-a", settings: { color: { r: 0.2, g: 0.3, b: 0.4 } } });
        expect(apply(state, result.diff).instances[0].fixedSettings).toEqual({ color: { r: 0.2, g: 0.3, b: 0.4 }, thickness: 0.4, softness: 3 });
        expect(state).toEqual(before);
    });

    it("keeps the unedited light-shaft color and luminous RC controls", () => {
        const shafts = fixture("directionalLightShafts").serialize();
        const nextShafts = apply(shafts, edit(shafts, { action: "fixed", instanceId: "fx-a", settings: { shadowColor: { r: 0.2, g: 0.4, b: 0.6 } } }).diff);
        expect(nextShafts.instances[0].fixedSettings?.color).toEqual(shafts.instances[0].fixedSettings?.color);
        const rc = fixture("luminousRadiance");
        rc.setFixedSettings("fx-a", { radiance: { enabled: true, strength: 1, range: 45, softness: 0.6 } });
        const state = rc.serialize();
        const next = apply(state, edit(state, { action: "fixed", instanceId: "fx-a", settings: { radiance: { strength: 2 } } }).diff);
        expect(next.instances[0].fixedSettings?.radiance).toEqual({ enabled: true, strength: 2, range: 45, softness: 0.6, distanceSoftness: false });
    });

    it("sets Bloom color and built-in LUTs through their existing stores", () => {
        const bloom = fixture("bloom").serialize();
        expect(apply(bloom, edit(bloom, { action: "fixed", instanceId: "fx-a", settings: { bloomColor: { r: 0.1, g: 0.2, b: 0.3 } } }).diff)
            .instances[0].bloomColor).toEqual({ r: 0.1, g: 0.2, b: 0.3 });
        const lut = fixture("lut").serialize();
        expect(apply(lut, edit(lut, { action: "fixed", instanceId: "fx-a", settings: { lut: { kind: "builtin", preset: "sepia" } } }).diff)
            .instances[0].fixedSettings?.lut).toEqual({ kind: "builtin", preset: "sepia" });
    });

    it.each<EffectInstanceType>(["gamma", "ssao", "ssgi", "luminous"])("rejects a color field not exposed for %s", type => {
        const state = fixture(type).serialize(), before = structuredClone(state);
        expect(() => edit(state, { action: "fixed", instanceId: "fx-a", settings: { color: { r: 0, g: 0, b: 0 } } })).toThrow(AutomationError);
        expect(state).toEqual(before);
    });

    it("validates all fixed fields before allowing even a valid partial edit", () => {
        const state = fixture("bloom").serialize(), before = structuredClone(state);
        expect(() => edit(state, { action: "fixed", instanceId: "fx-a", settings: { bloomColor: { r: 0, g: 0, b: 0 }, samples: 16 } })).toThrow(AutomationError);
        expect(state).toEqual(before);
    });

    it("rejects singleton CRUD, injected fields, non-public settings and invalid ranges", () => {
        for (const operation of [
            { action: "add" }, { action: "add", effectType: "rcSkyAmbient" },
            { action: "delete", instanceId: "rcDiffuseGi" }, { action: "duplicate", instanceId: "rcSkyOcclusion" },
            { action: "rename", instanceId: "fx-a", label: "\u0000bad" },
            { action: "rename", instanceId: "fx-a", label: " ", extra: true },
            { action: "fixed", instanceId: "fx-a", settings: {} },
            { action: "fixed", instanceId: "fx-a", settings: { thickness: 0.2 } },
            { action: "fixed", instanceId: "fx-a", settings: { softness: 0.2 } },
            { action: "fixed", instanceId: "fx-a", settings: { toonInfluence: 0.5 } },
            { action: "fixed", instanceId: "fx-a", settings: { blendMode: "additive" } },
            { action: "fixed", instanceId: "fx-a", settings: { lut: { kind: "external", name: "private", runtimeText: "source" } } },
            { action: "fixed", instanceId: "fx-a", settings: { lut: { kind: "builtin", preset: "missing" } } },
            { action: "fixed", instanceId: "fx-a", settings: { radiance: {} } },
            { action: "fixed", instanceId: "fx-a", settings: { radiance: { enabled: true } } },
            { action: "fixed", instanceId: "fx-a", settings: { radiance: { distanceSoftness: true } } },
            { action: "fixed", instanceId: "fx-a", settings: { radiance: { strength: 9 } } },
            { action: "fixed", instanceId: "fx-a", settings: { radiance: { range: 0 } } },
            { action: "fixed", instanceId: "fx-a", settings: { radiance: { softness: 1.1 } } },
            { action: "fixed", instanceId: "fx-a", settings: { samples: 16.5 } },
            { action: "fixed", instanceId: "fx-a", settings: { samples: 65 } },
            { action: "fixed", instanceId: "fx-a", settings: { color: { r: -1, g: 0, b: 0 } } },
        ]) expect(effectInstanceOperationSchema.safeParse(operation).success, JSON.stringify(operation)).toBe(false);
    });
});

describe("MCP effect metadata inspection", () => {
    it("never reads animation, external LUT source or its private name", () => {
        const lut = { kind: "external" as const,
            get name(): string { throw new Error("Must not read the external LUT name"); },
            get runtimeText(): string { throw new Error("Must not read external LUT contents"); } };
        const source = { instanceId: "fx-a", type: "lut" as const, label: "LUT", suspended: true,
            value: { enabled: true, intensity: 0.5 }, fixedSettings: { lut },
            get animation(): never { throw new Error("Must not serialize animation"); } };
        expect(inspectAutomationEffectInstance(source)).toEqual({ instanceId: "fx-a", effectType: "lut", label: "LUT", suspended: true,
            value: { enabled: true, intensity: 0.5 }, fixedSettings: { lut: { kind: "external" } },
            publicFields: { value: ["enabled", "intensity"], fixed: ["lut"] } });
    });

    it("filters private fields and returns independent public color/value data", () => {
        const value = { enabled: true, strength: 0.7, radius: 1, privateValue: "hidden" };
        const inspected = inspectAutomationEffectInstance({ instanceId: "fx-a", type: "ssao", label: "SSAO", suspended: false,
            value, fixedSettings: { color: { r: 1, g: 0, b: 0 }, toonInfluence: 0.5 } });
        expect(inspected.fixedSettings).toEqual({}); expect(inspected.publicFields.fixed).toEqual([]);
        expect(inspected.value).not.toHaveProperty("privateValue");
        inspected.value.strength = 0;
        expect(value.strength).toBe(0.7);
        const bloomColor = { r: 0.1, g: 0.2, b: 0.3 };
        const bloom = inspectAutomationEffectInstance({ instanceId: "fx-b", type: "bloom", label: "Bloom", suspended: false,
            value: { enabled: true }, bloomColor });
        if (!bloom.fixedSettings.bloomColor) throw new Error("Expected public Bloom color");
        bloom.fixedSettings.bloomColor.r = 1;
        expect(bloomColor.r).toBe(0.1);
    });

    it("exposes only the three public luminous RC fixed controls", () => {
        const result = inspectAutomationEffectInstance({ instanceId: "fx-a", type: "luminousRadiance", label: "Luminous RC", suspended: false,
            value: { enabled: true }, fixedSettings: { radiance: { enabled: true, strength: 2, range: 20, distanceSoftness: false } } });
        expect(result.fixedSettings).toEqual({ radiance: { strength: 2, range: 20, softness: 0 } });
        expect(result.publicFields).toEqual({ value: ["enabled"], fixed: ["radiance"] });
    });
});

import { describe, expect, it } from "vitest";
import type { EffectInstanceDiff } from "../actions/effect-instance-command";
import type { EffectInstance } from "./frame-graph-effect-instances";
import type { InstanceFixedSettings } from "./frame-graph-instance-fixed-settings";
import { isEffectInstancePlaybackValueDiff, isRcPlaybackValuePatch } from "./effect-playback-edit";

function instance(): EffectInstance {
    return { instanceId: "fx-a", type: "gamma", label: "Gamma", settings: { enabled: true, gamma: 1 }, animation: { version: 1, tracks: [] } };
}
function changed(edit: (after: EffectInstance) => void, before = instance()): EffectInstanceDiff {
    const after = structuredClone(before);
    edit(after);
    return { type: "effect.instances", beforeOrder: ["fx-a"], afterOrder: ["fx-a"], changes: [{ instanceId: "fx-a", before, after }] };
}

describe("effect instance playback value changes", () => {
    it("allows ordinary values and Bloom color without mutating the command", () => {
        const diff = changed(after => { after.settings = { enabled: false, gamma: 2 }; after.bloomColor = { r: 1, g: 0.5, b: 0 }; });
        const snapshot = structuredClone(diff);
        expect(isEffectInstancePlaybackValueDiff(diff)).toBe(true);
        expect(diff).toEqual(snapshot);
    });

    it.each(["color", "shadowColor"] as const)("allows fixed %s changes", field => {
        expect(isEffectInstancePlaybackValueDiff(changed(after => { after.fixedSettings = { [field]: { r: 0.1, g: 0.2, b: 0.3 } }; }))).toBe(true);
    });

    it.each(["strength", "range", "softness"] as const)("allows existing RC %s changes", field => {
        const before = instance();
        before.type = "luminousRadiance";
        before.fixedSettings = { radiance: { enabled: true, strength: 1, range: 12, softness: 0, distanceSoftness: false } };
        const diff = changed(after => {
            after.fixedSettings = { radiance: { enabled: true, strength: 1, range: 12, softness: 0, distanceSoftness: false, [field]: 0.5 } };
        }, before);
        expect(isEffectInstancePlaybackValueDiff(diff)).toBe(true);
    });

    it("rejects reorder, addition, removal, and mismatched instance IDs", () => {
        const diff = changed(after => { after.settings.gamma = 2; });
        expect(isEffectInstancePlaybackValueDiff({ ...diff, afterOrder: [] })).toBe(false);
        for (const replacement of [{ before: null }, { after: null }, { instanceId: "fx-b" }]) {
            expect(isEffectInstancePlaybackValueDiff({ ...diff, changes: [{ ...diff.changes[0], ...replacement }] })).toBe(false);
        }
    });

    it.each(["instanceId", "type", "label"] as const)("rejects %s changes", field => {
        const diff = changed(after => {
            if (field === "instanceId") after.instanceId = "fx-b";
            else if (field === "type") after.type = "bloom";
            else after.label = "Renamed";
        });
        expect(isEffectInstancePlaybackValueDiff(diff)).toBe(false);
    });

    it.each([
        { effectId: "gamma", keys: [{ frame: 10, value: { enabled: true, gamma: 2 } }] },
        { effectId: "gamma", keys: [], base: { enabled: true, gamma: 2 } },
        { effectId: "gamma", keys: [], preview: { frame: 10, value: { enabled: true, gamma: 2 } } },
    ])("rejects animation changes: %j", track => {
        expect(isEffectInstancePlaybackValueDiff(changed(after => { after.animation.tracks = [track]; }))).toBe(false);
    });

    it.each<InstanceFixedSettings>([
        { samples: 64 }, { lut: { kind: "builtin", preset: "sepia" } },
        { thickness: 0.5 }, { softness: 2 }, { toonInfluence: 0.5 }, { blendMode: "additive" },
        { radiance: { enabled: true, strength: 1, range: 12 } },
    ])("rejects fixed resources and nonpublic settings: %j", fixedSettings => {
        expect(isEffectInstancePlaybackValueDiff(changed(after => { after.fixedSettings = fixedSettings; }))).toBe(false);
    });

    it("preserves unchanged resources while editing a color", () => {
        const before = instance();
        before.fixedSettings = { thickness: 1, softness: 0, color: { r: 1, g: 1, b: 1 } };
        expect(isEffectInstancePlaybackValueDiff(changed(after => {
            after.fixedSettings = { ...after.fixedSettings, color: { r: 0, g: 0, b: 0 } };
        }, before))).toBe(true);
    });

    it.each(["enabled", "distanceSoftness", "remove"] as const)("rejects RC resource mode changes: %s", field => {
        const before = instance();
        before.fixedSettings = { radiance: { enabled: true, strength: 1, range: 12, distanceSoftness: false } };
        expect(isEffectInstancePlaybackValueDiff(changed(after => {
            after.fixedSettings = field === "remove" ? {} : { radiance: { enabled: true, strength: 1, range: 12, distanceSoftness: false, [field]: field !== "enabled" } };
        }, before))).toBe(false);
    });

    it("rejects a batch containing one structural edit", () => {
        const values = changed(after => { after.settings.gamma = 2; });
        const rename = changed(after => { after.label = "Renamed"; });
        expect(isEffectInstancePlaybackValueDiff({ ...values, changes: [...values.changes, ...rename.changes] })).toBe(false);
    });
});

describe("scene RC playback value patches", () => {
    it("allows ordinary lighting values together and empty patches", () => {
        expect(isRcPlaybackValuePatch({ enabled: false, strength: 0.5, opacity: 0.5, fill: 0.1, skyBrightness: 1, minimum: 0.1 })).toBe(true);
        expect(isRcPlaybackValuePatch({})).toBe(true);
    });

    it.each(["volume", "rangeScale", "quality", "baseLight", "unknown"])("rejects %s even with an allowed value", field => {
        expect(isRcPlaybackValuePatch({ strength: 0.5, [field]: null })).toBe(false);
    });
});

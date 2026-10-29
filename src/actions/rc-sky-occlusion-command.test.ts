import { expect, it } from "vitest";
import { buildRcSkyOcclusionCommandDiff, canApplyRcSkyOcclusionEditState, type RcSkyOcclusionEditState } from "./rc-sky-occlusion-command";
import { DEFAULT_RC_SKY_OCCLUSION_SETTINGS } from "../render/rc-sky-occlusion-settings";
import { executeCommand, type CommandExecutionContext } from "./command-executor";
import { EffectSceneTrackStore } from "../editor/effect-scene-track-store";
import { makeEffectPayload } from "../editor/effect-keyframe-definitions";

it("does not record unchanged RC edits and preserves exact absence of a keyed preview", () => {
    const before: RcSkyOcclusionEditState = { settings: { ...DEFAULT_RC_SKY_OCCLUSION_SETTINGS }, track: null };
    const after: RcSkyOcclusionEditState = { settings: { ...before.settings, volume: { min: [-8, 0, -8], size: 16 } }, track: { preview: { frame: 3, value: { enabled: true, strength: 0.5 } } } };
    expect(buildRcSkyOcclusionCommandDiff(before, before)).toBeNull();
    const diff = buildRcSkyOcclusionCommandDiff(before, after);
    expect(diff?.before.track).toBeNull();
    if (after.settings.volume) after.settings.volume.min[0] = 100;
    expect(diff?.after.settings.volume?.min[0]).toBe(-8);
    expect(diff?.after.track).toEqual({ preview: { frame: 3, value: { enabled: true, strength: 0.5 } } });
});

it("routes apply and revert through the same RC settings command boundary", () => {
    const before = { settings: { ...DEFAULT_RC_SKY_OCCLUSION_SETTINGS }, track: null };
    const after = { settings: { ...before.settings, minimum: 0.4 }, track: null };
    const diff = buildRcSkyOcclusionCommandDiff(before, after);
    if (!diff) throw new Error("Expected a settings change");
    let state = before;
    const context = { applyRcSkyOcclusion: (change: typeof diff, direction: "apply" | "revert") => {
        state = change[direction === "apply" ? "after" : "before"] as typeof state;
        return true;
    } } as CommandExecutionContext;
    const command = { id: "test", label: "Sky", scope: "effect" as const, createdAtMs: 0, diff };
    expect(executeCommand(command, "apply", context)).toBe(true);
    expect(state.settings.minimum).toBe(0.4);
    expect(executeCommand(command, "revert", context)).toBe(true);
    expect(state).toEqual(before);
});

it("allows undo after seek discards preview, but rejects newer authored keys or a different live preview", () => {
    const settings = { ...DEFAULT_RC_SKY_OCCLUSION_SETTINGS };
    const store = new EffectSceneTrackStore(false, ["rcSkyOcclusion"]);
    store.apply("rcSkyOcclusion", 0, makeEffectPayload("rcSkyOcclusion", { enabled: true, strength: 0.5 }), settings);
    store.preview("rcSkyOcclusion", 10, { enabled: true, strength: 0.2 }, settings);
    const expected = { settings, track: store.snapshot("rcSkyOcclusion") };
    store.clearPreviewsOutside(11);
    expect(canApplyRcSkyOcclusionEditState({ settings, track: store.snapshot("rcSkyOcclusion") }, expected)).toBe(true);
    store.preview("rcSkyOcclusion", 10, { enabled: true, strength: 0.9 }, settings);
    expect(canApplyRcSkyOcclusionEditState({ settings, track: store.snapshot("rcSkyOcclusion") }, expected)).toBe(false);
    store.clearPreviews();
    store.apply("rcSkyOcclusion", 20, makeEffectPayload("rcSkyOcclusion", { enabled: false, strength: 0.8 }), settings);
    expect(canApplyRcSkyOcclusionEditState({ settings, track: store.snapshot("rcSkyOcclusion") }, expected)).toBe(false);
});

it("allows setting undo after undoing the first key, without treating a different base as absent", () => {
    const settings = { ...DEFAULT_RC_SKY_OCCLUSION_SETTINGS, enabled: true };
    const store = new EffectSceneTrackStore(false, ["rcSkyOcclusion"]);
    const expected = { settings, track: null };
    const base = { enabled: settings.enabled, strength: settings.strength };
    store.apply("rcSkyOcclusion", 0, makeEffectPayload("rcSkyOcclusion", base), base);
    store.apply("rcSkyOcclusion", 0, null, base);
    expect(canApplyRcSkyOcclusionEditState({ settings, track: store.snapshot("rcSkyOcclusion") }, expected)).toBe(true);
    expect(canApplyRcSkyOcclusionEditState({ settings, track: { base: { ...base, strength: 0.1 }, keys: [] } }, expected)).toBe(false);
    expect(canApplyRcSkyOcclusionEditState({ settings: { ...settings, minimum: 0.8 }, track: null }, expected)).toBe(false);
});

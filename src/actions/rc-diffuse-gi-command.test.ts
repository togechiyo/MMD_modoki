import { expect, it } from "vitest";
import { buildRcDiffuseGiCommandDiff, canApplyRcDiffuseGiEditState, type RcDiffuseGiEditState } from "./rc-diffuse-gi-command";
import { DEFAULT_RC_DIFFUSE_GI_SETTINGS } from "../render/rc-diffuse-gi-settings";
import { executeCommand, type CommandExecutionContext } from "./command-executor";
import { EffectSceneTrackStore } from "../editor/effect-scene-track-store";
import { makeEffectPayload } from "../editor/effect-keyframe-definitions";

it("does not record unchanged RC edits and preserves exact absence of a keyed preview", () => {
    const before: RcDiffuseGiEditState = { settings: { ...DEFAULT_RC_DIFFUSE_GI_SETTINGS }, track: null };
    const after: RcDiffuseGiEditState = { settings: { ...before.settings, volume: { min: [-8, 0, -8], size: 16 } }, track: { preview: { frame: 3, value: { enabled: true, strength: 0.5 } } } };
    expect(buildRcDiffuseGiCommandDiff(before, before)).toBeNull();
    const diff = buildRcDiffuseGiCommandDiff(before, after);
    expect(diff?.before.track).toBeNull();
    if (after.settings.volume) after.settings.volume.min[0] = 100;
    expect(diff?.after.settings.volume?.min[0]).toBe(-8);
    expect(diff?.after.track).toEqual({ preview: { frame: 3, value: { enabled: true, strength: 0.5 } } });
});

it("routes apply and revert through the same RC settings command boundary", () => {
    const before = { settings: { ...DEFAULT_RC_DIFFUSE_GI_SETTINGS }, track: null };
    const after = { settings: { ...before.settings, strength: 0.4 }, track: null };
    const diff = buildRcDiffuseGiCommandDiff(before, after);
    if (!diff) throw new Error("Expected a settings change");
    let state = before;
    const context = { applyRcDiffuseGi: (change: typeof diff, direction: "apply" | "revert") => {
        state = change[direction === "apply" ? "after" : "before"] as typeof state;
        return true;
    } } as CommandExecutionContext;
    const command = { id: "test", label: "GI", scope: "effect" as const, createdAtMs: 0, diff };
    expect(executeCommand(command, "apply", context)).toBe(true);
    expect(state.settings.strength).toBe(0.4);
    expect(executeCommand(command, "revert", context)).toBe(true);
    expect(state).toEqual(before);
});

it("allows undo after seek discards preview, but rejects newer authored keys or a different live preview", () => {
    const settings = { ...DEFAULT_RC_DIFFUSE_GI_SETTINGS };
    const store = new EffectSceneTrackStore(false, ["rcDiffuseGi"]);
    store.apply("rcDiffuseGi", 0, makeEffectPayload("rcDiffuseGi", { enabled: true, strength: 0.5 }), settings);
    store.preview("rcDiffuseGi", 10, { enabled: true, strength: 0.2 }, settings);
    const expected = { settings, track: store.snapshot("rcDiffuseGi") };
    store.clearPreviewsOutside(11);
    expect(canApplyRcDiffuseGiEditState({ settings, track: store.snapshot("rcDiffuseGi") }, expected)).toBe(true);
    store.preview("rcDiffuseGi", 10, { enabled: true, strength: 0.9 }, settings);
    expect(canApplyRcDiffuseGiEditState({ settings, track: store.snapshot("rcDiffuseGi") }, expected)).toBe(false);
    store.clearPreviews();
    store.apply("rcDiffuseGi", 20, makeEffectPayload("rcDiffuseGi", { enabled: false, strength: 0.8 }), settings);
    expect(canApplyRcDiffuseGiEditState({ settings, track: store.snapshot("rcDiffuseGi") }, expected)).toBe(false);
});

it("allows setting undo after undoing the first key, without treating a different base as absent", () => {
    const settings = { ...DEFAULT_RC_DIFFUSE_GI_SETTINGS, enabled: true };
    const store = new EffectSceneTrackStore(false, ["rcDiffuseGi"]);
    const expected = { settings, track: null };
    const base = { enabled: settings.enabled, strength: settings.strength };
    store.apply("rcDiffuseGi", 0, makeEffectPayload("rcDiffuseGi", base), base);
    store.apply("rcDiffuseGi", 0, null, base);
    expect(canApplyRcDiffuseGiEditState({ settings, track: store.snapshot("rcDiffuseGi") }, expected)).toBe(true);
    expect(canApplyRcDiffuseGiEditState({ settings, track: { base: { ...base, strength: 0.1 }, keys: [] } }, expected)).toBe(false);
    expect(canApplyRcDiffuseGiEditState({ settings: { ...settings, strength: 0.8 }, track: null }, expected)).toBe(false);
});

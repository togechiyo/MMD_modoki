import { describe, expect, it } from "vitest";
import type { EffectAsset } from "../external-wgsl/contract";
import { externalEffectPresetId } from "./external-wgsl-presets";

function asset(revision: string, originPath?: string): EffectAsset {
    return { revision, originPath, manifest: { apiVersion: 1, kind: "mmd-material", name: "same label", sources: ["main.wgsl"], hooks: {} }, sources: [] };
}
describe("external WGSL preset identity", () => {
    it("replaces a Windows file after editing without duplicating the list entry", () => {
        expect(externalEffectPresetId(asset("old", "C:\\Effects\\Gem.json"))).toBe(externalEffectPresetId(asset("new", "c:/effects/gem.json")));
    });
    it("keeps different files with the same label and case-sensitive paths separate", () => {
        expect(externalEffectPresetId(asset("same", "/Effects/Gem.json"))).not.toBe(externalEffectPresetId(asset("same", "/Effects/gem.json")));
    });
    it("uses the saved revision for embedded assets without a source path", () => {
        expect(externalEffectPresetId(asset("old"))).not.toBe(externalEffectPresetId(asset("new")));
    });
});

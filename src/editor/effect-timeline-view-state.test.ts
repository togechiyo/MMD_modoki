import { describe, expect, it } from "vitest";
import type { KeyframeTrack } from "../types";
import { EffectTimelineViewState } from "./effect-timeline-view-state";

const camera: KeyframeTrack = { category: "camera", name: "Camera", frames: new Uint32Array() };
const effect = (name: string, frames: number[] = []): KeyframeTrack => ({ category: "effect", name, frames: Uint32Array.from(frames) });

describe("effect timeline view state", () => {
    it("keeps normal tracks and keyed effects, hiding empty and preview-only effects", () => {
        const view = new EffectTimelineViewState(), keyed = effect("fx-keyed", [10]);
        const suspended = { ...effect("fx-suspended", [20]), effectInstance: { type: "gamma" as const, label: "Gamma", suspended: true } };
        view.setTracks([camera, effect("fx-static"), effect("fx-preview"), keyed, suspended]);
        expect(view.visibleTracks()).toEqual([camera, keyed, suspended]);
    });

    it("does not expose empty rows after repeated settings updates", () => {
        const view = new EffectTimelineViewState(), a = effect("fx-a"), b = effect("fx-b");
        view.setTracks([camera, a, b]);
        view.setTracks([camera, a, b]);
        expect(view.visibleTracks()).toEqual([camera]);
    });

    it("shows a registered row, hides the last deleted key, and restores on undo", () => {
        const view = new EffectTimelineViewState(), empty = effect("fx-a"), keyed = effect("fx-a", [0]);
        view.setTracks([camera, empty]);
        view.setTracks([camera, keyed]);
        expect(view.visibleTracks()).toEqual([camera, keyed]);
        view.setTracks([camera, empty]); expect(view.visibleTracks()).toEqual([camera]);
        view.setTracks([camera, keyed]); expect(view.visibleTracks()).toEqual([camera, keyed]);
    });

    it("reflects effect deletion and scope changes without keeping stale rows", () => {
        const view = new EffectTimelineViewState(), a = effect("fx-a", [0]);
        view.setTracks([camera, a]);
        view.setTracks([camera]);
        expect(view.visibleTracks()).toEqual([camera]);
        view.setTracks([]); expect(view.visibleTracks()).toEqual([]);
        view.setTracks([camera, effect(a.name)]);
        expect(view.visibleTracks()).toEqual([camera]);
    });
});

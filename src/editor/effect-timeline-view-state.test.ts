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

    it("temporarily shows only the effect explicitly chosen for key editing", () => {
        const view = new EffectTimelineViewState(), a = effect("fx-a"), b = effect("fx-b");
        view.setTracks([camera, a, b]);
        expect(view.beginEditing(a.name)).toBe(true);
        expect(view.visibleTracks()).toEqual([camera, a]);
        expect(view.selectTrack(a)).toBe(false);
        view.setTracks([camera, a, b]);
        expect(view.visibleTracks()).toEqual([camera, a]);
        view.beginEditing(b.name);
        expect(view.visibleTracks()).toEqual([camera, b]);
        expect(view.selectTrack(camera)).toBe(true);
        expect(view.visibleTracks()).toEqual([camera]);
    });

    it("retains registered rows after editing ends, hides the last deleted key, and restores on undo", () => {
        const view = new EffectTimelineViewState(), empty = effect("fx-a"), keyed = effect("fx-a", [0]);
        view.setTracks([camera, empty]); view.beginEditing(empty.name);
        view.setTracks([camera, keyed]); view.endEditing();
        expect(view.visibleTracks()).toEqual([camera, keyed]);
        view.setTracks([camera, empty]); expect(view.visibleTracks()).toEqual([camera]);
        view.setTracks([camera, keyed]); expect(view.visibleTracks()).toEqual([camera, keyed]);
    });

    it("drops transient editing when its effect is deleted or the scope changes", () => {
        const view = new EffectTimelineViewState(), a = effect("fx-a");
        view.setTracks([camera, a]); view.beginEditing(a.name);
        view.setTracks([camera]);
        expect(view.beginEditing("fx-missing")).toBe(false);
        view.setTracks([camera, a]); expect(view.visibleTracks()).toEqual([camera]);
        view.beginEditing(a.name); view.setTracks([]); view.setTracks([camera, a]);
        expect(view.visibleTracks()).toEqual([camera]);
    });
});

import { describe, expect, it } from "vitest";

import {
    createTimelineRangeSelection,
    createTimelineSelectionScopeKey,
    normalizeTimelineKeySelection,
    toggleTimelineKeySelection,
    updateTimelineFrameColumnSelection,
    updateTimelineRowSelection,
    type TimelineKeySelectionRef,
} from "../../src/editor/timeline-key-selection";
import type { KeyframeTrack } from "../../src/types";

function track(name: string, category: KeyframeTrack["category"], frames: number[]): KeyframeTrack {
    return { name, category, frames: new Uint32Array(frames) };
}

describe("timeline key selection", () => {
    it("normalizes frames and removes keys that no longer exist", () => {
        const tracks = [
            track("Camera", "camera", [0, 10]),
            track("Light", "light", [5]),
        ];

        expect(normalizeTimelineKeySelection([
            { trackCategory: "light", trackName: "Light", frame: 5.8 },
            { trackCategory: "camera", trackName: "Camera", frame: 10 },
            { trackCategory: "camera", trackName: "Camera", frame: 99 },
        ], tracks)).toEqual([
            { trackCategory: "camera", trackName: "Camera", frame: 10 },
            { trackCategory: "light", trackName: "Light", frame: 5 },
        ]);
    });

    it("toggles a key without changing the other edit targets", () => {
        const camera: TimelineKeySelectionRef = {
            trackCategory: "camera",
            trackName: "Camera",
            frame: 0,
        };
        const light: TimelineKeySelectionRef = {
            trackCategory: "light",
            trackName: "Light",
            frame: 5,
        };

        expect(toggleTimelineKeySelection([camera], light)).toEqual([camera, light]);
        expect(toggleTimelineKeySelection([camera, light], camera)).toEqual([light]);
    });

    it("creates a range only within the anchor track", () => {
        const cameraTrack = track("Camera", "camera", [0, 5, 10, 15]);
        const anchor: TimelineKeySelectionRef = {
            trackCategory: "camera",
            trackName: "Camera",
            frame: 5,
        };

        expect(createTimelineRangeSelection(cameraTrack, anchor, 15).map((key) => key.frame))
            .toEqual([5, 10, 15]);
        expect(createTimelineRangeSelection(cameraTrack, {
            trackCategory: "light",
            trackName: "Light",
            frame: 5,
        }, 15).map((key) => key.frame)).toEqual([15]);
    });

    it("uses model instance identity as the selection boundary", () => {
        expect(createTimelineSelectionScopeKey("camera", "model-a")).toBe("camera");
        expect(createTimelineSelectionScopeKey("model", "model-a")).toBe("model:model-a");
        expect(createTimelineSelectionScopeKey("model", "model-b")).toBe("model:model-b");
        expect(createTimelineSelectionScopeKey("accessory", "model-a", 0)).toBe("accessory:0");
        expect(createTimelineSelectionScopeKey("accessory", "model-a", 1)).toBe("accessory:1");
    });

    it("replaces, toggles, and ranges row header selection in track order", () => {
        const tracks = [
            track("Camera", "camera", []),
            track("Light", "light", []),
            track("Shadow", "shadow", []),
            track("Gravity", "gravity", []),
        ];
        const camera = { trackCategory: "camera" as const, trackName: "Camera" };
        const light = { trackCategory: "light" as const, trackName: "Light" };
        const shadow = { trackCategory: "shadow" as const, trackName: "Shadow" };
        const gravity = { trackCategory: "gravity" as const, trackName: "Gravity" };

        expect(updateTimelineRowSelection([], light, null, tracks, "replace")).toEqual([light]);
        expect(updateTimelineRowSelection([camera, shadow], light, camera, tracks, "toggle"))
            .toEqual([camera, light, shadow]);
        expect(updateTimelineRowSelection([camera], gravity, light, tracks, "range"))
            .toEqual([light, shadow, gravity]);
    });

    it("replaces, toggles, and ranges frame column selection", () => {
        expect(updateTimelineFrameColumnSelection([], 10.8, null, "replace")).toEqual([10]);
        expect(updateTimelineFrameColumnSelection([0, 10], 5, 0, "toggle")).toEqual([0, 5, 10]);
        expect(updateTimelineFrameColumnSelection([0, 5, 10], 5, 0, "toggle")).toEqual([0, 10]);
        expect(updateTimelineFrameColumnSelection([20], 13, 10, "range")).toEqual([10, 11, 12, 13]);
    });
});

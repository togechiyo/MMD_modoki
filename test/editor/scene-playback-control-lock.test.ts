import { describe, expect, it } from "vitest";

import { getScenePlaybackControlLocks } from "../../src/editor/scene-playback-control-lock";

describe("getScenePlaybackControlLocks", () => {
    it("keeps every control editable during playback when no category has keys", () => {
        expect(getScenePlaybackControlLocks(true, {
            camera: 0,
            light: 0,
            shadow: 0,
            gravity: 0,
        })).toEqual({
            camera: false,
            light: false,
            shadow: false,
            gravity: false,
        });
    });

    it("locks only categories that own playback with at least one key", () => {
        expect(getScenePlaybackControlLocks(true, {
            camera: 1,
            light: 2,
            shadow: 0,
            gravity: 3,
        })).toEqual({
            camera: true,
            light: true,
            shadow: false,
            gravity: true,
        });
    });

    it("unlocks every category while playback is stopped", () => {
        expect(getScenePlaybackControlLocks(false, {
            camera: 1,
            light: 1,
            shadow: 1,
            gravity: 1,
        })).toEqual({
            camera: false,
            light: false,
            shadow: false,
            gravity: false,
        });
    });
});

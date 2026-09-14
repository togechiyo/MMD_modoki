import { describe, expect, it } from "vitest";
import { createGammaSceneTrack, deserializeGammaSceneTrack, evaluateGammaSceneTrack, serializeGammaSceneTrack } from "./gamma-scene-track";
import { moveSceneKeyframe, removeSceneKeyframe, upsertSceneKeyframe } from "./scene-keyframe-track";

describe("gamma scene keys", () => {
    it("steps enabled at the key while interpolating the slider through an off interval", () => {
        let track = createGammaSceneTrack({ enabled: false, gamma: 1 });
        track = upsertSceneKeyframe(track, 10, { enabled: true, gamma: 0.5 });
        track = upsertSceneKeyframe(track, 30, { enabled: false, gamma: 2 });
        track = upsertSceneKeyframe(track, 50, { enabled: true, gamma: 0.5 });
        expect(evaluateGammaSceneTrack(track, 0)).toEqual({ enabled: false, gamma: 1 });
        expect(evaluateGammaSceneTrack(track, 20)).toEqual({ enabled: true, gamma: 1 });
        expect(evaluateGammaSceneTrack(track, 29).enabled).toBe(true);
        expect(evaluateGammaSceneTrack(track, 30)).toEqual({ enabled: false, gamma: 2 });
        expect(evaluateGammaSceneTrack(track, 40)).toEqual({ enabled: false, gamma: 1 });
        expect(evaluateGammaSceneTrack(track, 50)).toEqual({ enabled: true, gamma: 0.5 });
        expect(evaluateGammaSceneTrack(track, 20)).toEqual({ enabled: true, gamma: 1 });
    });

    it("round trips overwrite, move and deletion, retaining the unkeyed base value", () => {
        let track = upsertSceneKeyframe(createGammaSceneTrack({ enabled: false, gamma: 1 }), 10, { enabled: true, gamma: 2 });
        track = upsertSceneKeyframe(track, 10, { enabled: false, gamma: 0.5 });
        expect(deserializeGammaSceneTrack(serializeGammaSceneTrack(track))).toEqual(track);
        const moved = moveSceneKeyframe(track, 10, 20);
        expect(moved?.keyframes.map(key => key.frame)).toEqual([20]);
        expect(moved && removeSceneKeyframe(moved, 20)?.keyframes).toEqual([]);
        expect(track.keyframes[0].frame).toBe(10);
    });

    it("accepts old projects without keys and sanitizes malformed input", () => {
        expect(deserializeGammaSceneTrack(undefined)).toBeNull();
        const track = deserializeGammaSceneTrack({ baseValue: { enabled: false, gamma: NaN }, frameNumbers: [-1, 10, 10, 20], enabled: [true, true, false, true], gammas: [2, 99, 0, NaN] });
        expect(track?.baseValue.gamma).toBe(1);
        expect(track?.keyframes).toEqual([{ frame: 10, value: { enabled: false, gamma: 0.25 } }]);
    });
});

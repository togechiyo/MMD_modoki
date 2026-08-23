import { describe, expect, it } from "vitest";
import {
    createLightSceneTrack,
    createGravitySceneTrack,
    createShadowSceneTrack,
    deserializeLightSceneTrack,
    deserializeGravitySceneTrack,
    deserializeShadowSceneTrack,
    evaluateSceneKeyframeTrack,
    interpolateLightSceneValue,
    interpolateGravitySceneValue,
    interpolateShadowSceneValue,
    moveSceneKeyframe,
    removeSceneKeyframe,
    serializeLightSceneTrack,
    serializeGravitySceneTrack,
    serializeShadowSceneTrack,
    upsertSceneKeyframe,
} from "./scene-keyframe-track";

const base = {
    color: { r: 1, g: 1, b: 1 },
    direction: { x: 0, y: -1, z: 0 },
};

describe("scene keyframe track", () => {
    it("keeps keyframes sorted and overwrites the same frame", () => {
        let track = createLightSceneTrack(base);
        track = upsertSceneKeyframe(track, 20, { ...base, color: { r: 0, g: 0, b: 1 } });
        track = upsertSceneKeyframe(track, 10, { ...base, color: { r: 1, g: 0, b: 0 } });
        track = upsertSceneKeyframe(track, 20, { ...base, color: { r: 0, g: 1, b: 0 } });

        expect(track.keyframes.map((keyframe) => keyframe.frame)).toEqual([10, 20]);
        expect(track.keyframes[1].value.color).toEqual({ r: 0, g: 1, b: 0 });
    });

    it("evaluates the base value and linearly interpolates light values", () => {
        let track = createLightSceneTrack(base);
        track = upsertSceneKeyframe(track, 10, base);
        track = upsertSceneKeyframe(track, 20, {
            color: { r: 0, g: 0.5, b: 1 },
            direction: { x: 1, y: 0, z: 0 },
        });

        expect(evaluateSceneKeyframeTrack(track, 5, interpolateLightSceneValue)).toEqual(base);
        expect(evaluateSceneKeyframeTrack(track, 15, interpolateLightSceneValue)).toEqual({
            color: { r: 0.5, g: 0.75, b: 1 },
            direction: { x: 0.5, y: -0.5, z: 0 },
        });
    });

    it("removes and moves keys without overwriting a destination", () => {
        let track = createLightSceneTrack(base);
        track = upsertSceneKeyframe(track, 10, base);
        track = upsertSceneKeyframe(track, 20, base);

        expect(moveSceneKeyframe(track, 10, 20)).toBeNull();
        const moved = moveSceneKeyframe(track, 10, 15);
        expect(moved?.keyframes.map((keyframe) => keyframe.frame)).toEqual([15, 20]);
        expect(moved && removeSceneKeyframe(moved, 15)?.keyframes.map((keyframe) => keyframe.frame)).toEqual([20]);
    });

    it("round-trips the serialized light track", () => {
        const track = upsertSceneKeyframe(createLightSceneTrack(base), 12, {
            color: { r: 0.2, g: 0.4, b: 0.6 },
            direction: { x: 0.3, y: -0.8, z: 0.5 },
        });
        const serialized = serializeLightSceneTrack(track);

        expect(deserializeLightSceneTrack(serialized)).toEqual(track);
    });

    it("linearly interpolates the visible shadow controls", () => {
        let track = createShadowSceneTrack({
            color: { r: 0.2, g: 0.4, b: 0.6 },
            toonInfluence: 0.25,
            maxZ: 1000,
            lightIntensity: 0.5,
        });
        track = upsertSceneKeyframe(track, 10, track.baseValue);
        track = upsertSceneKeyframe(track, 20, {
            color: { r: 0.8, g: 0.6, b: 0.4 },
            toonInfluence: 0.75,
            maxZ: 5000,
            lightIntensity: 1.5,
        });

        expect(evaluateSceneKeyframeTrack(track, 15, interpolateShadowSceneValue)).toEqual({
            color: { r: 0.5, g: 0.5, b: 0.5 },
            toonInfluence: 0.5,
            maxZ: 3000,
            lightIntensity: 1,
        });
    });

    it("round-trips the serialized shadow controls track", () => {
        const track = upsertSceneKeyframe(
            createShadowSceneTrack({
                color: { r: 0.5, g: 0.5, b: 0.5 },
                toonInfluence: 1,
                maxZ: 1000,
                lightIntensity: 1,
            }),
            12,
            {
                color: { r: 0.2, g: 0.3, b: 0.4 },
                toonInfluence: 0.6,
                maxZ: 2400,
                lightIntensity: 1.4,
            },
        );
        const serialized = serializeShadowSceneTrack(track);

        expect(deserializeShadowSceneTrack(serialized)).toEqual(track);
    });

    it("linearly interpolates and round-trips the visible gravity controls", () => {
        let track = createGravitySceneTrack({
            acceleration: 98,
            direction: { x: 0, y: -100, z: 0 },
        });
        track = upsertSceneKeyframe(track, 0, track.baseValue);
        track = upsertSceneKeyframe(track, 30, {
            acceleration: 50,
            direction: { x: 100, y: 0, z: 20 },
        });

        expect(evaluateSceneKeyframeTrack(track, 15, interpolateGravitySceneValue)).toEqual({
            acceleration: 74,
            direction: { x: 50, y: -50, z: 10 },
        });
        expect(deserializeGravitySceneTrack(serializeGravitySceneTrack(track))).toEqual(track);
    });
});

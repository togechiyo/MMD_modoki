import { evaluateSceneKeyframeTrack, type SceneKeyframeTrack, upsertSceneKeyframe } from "./scene-keyframe-track";

export type GammaSceneValue = { enabled: boolean; gamma: number };
export type SerializedGammaSceneTrack = {
    baseValue: GammaSceneValue;
    frameNumbers: number[];
    enabled: boolean[];
    gammas: number[];
};

export function normalizeGammaSceneValue(value: GammaSceneValue): GammaSceneValue {
    return { enabled: value.enabled === true, gamma: Number.isFinite(value.gamma) ? Math.max(0.25, Math.min(4, value.gamma)) : 1 };
}

export function createGammaSceneTrack(value: GammaSceneValue): SceneKeyframeTrack<GammaSceneValue> {
    return { id: "scene.gamma", interpolation: "linear", baseValue: normalizeGammaSceneValue(value), keyframes: [] };
}

export function evaluateGammaSceneTrack(track: SceneKeyframeTrack<GammaSceneValue>, frame: number): GammaSceneValue {
    return evaluateSceneKeyframeTrack(track, frame, (from, to, amount) => ({
        enabled: from.enabled,
        // Interpolate the existing logarithmic slider position, retaining real gamma in projects.
        gamma: Math.exp(Math.log(from.gamma) + (Math.log(to.gamma) - Math.log(from.gamma)) * amount),
    }));
}

export function serializeGammaSceneTrack(track: SceneKeyframeTrack<GammaSceneValue> | null): SerializedGammaSceneTrack | null {
    if (!track) return null;
    return {
        baseValue: { ...track.baseValue },
        frameNumbers: track.keyframes.map(key => key.frame),
        enabled: track.keyframes.map(key => key.value.enabled),
        gammas: track.keyframes.map(key => key.value.gamma),
    };
}

export function deserializeGammaSceneTrack(data: SerializedGammaSceneTrack | null | undefined): SceneKeyframeTrack<GammaSceneValue> | null {
    if (!data || !data.baseValue || !Array.isArray(data.frameNumbers) || !Array.isArray(data.enabled) || !Array.isArray(data.gammas)) return null;
    let track = createGammaSceneTrack(data.baseValue);
    data.frameNumbers.forEach((frame, index) => {
        if (!Number.isFinite(frame) || frame < 0 || typeof data.enabled[index] !== "boolean" || !Number.isFinite(data.gammas[index])) return;
        track = upsertSceneKeyframe(track, frame, normalizeGammaSceneValue({ enabled: data.enabled[index], gamma: data.gammas[index] }));
    });
    return track;
}

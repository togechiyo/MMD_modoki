import type { ProjectSerializedAccessoryTransformTrack } from "../types";
import {
    copyProjectArrayToFloat32,
    copyProjectArrayToUint32,
    getProjectArrayLength,
    packFloat32Array,
    packFrameNumbers,
} from "../project/project-codec";
import {
    evaluateSceneKeyframeTrack,
    moveSceneKeyframe,
    removeSceneKeyframe,
    type SceneKeyframeTrack,
    upsertSceneKeyframe,
} from "./scene-keyframe-track";

export type AccessoryTransformKeyframeValue = {
    position: { x: number; y: number; z: number };
    rotationDeg: { x: number; y: number; z: number };
    scale: number;
};

export type AccessoryTransformKeyframeTrack = SceneKeyframeTrack<AccessoryTransformKeyframeValue>;

const ACCESSORY_TRANSFORM_TRACK_ID = "accessory.transform";

function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

export function cloneAccessoryTransformValue(
    value: AccessoryTransformKeyframeValue,
): AccessoryTransformKeyframeValue {
    return {
        position: {
            x: finiteOr(value.position.x, 0),
            y: finiteOr(value.position.y, 0),
            z: finiteOr(value.position.z, 0),
        },
        rotationDeg: {
            x: finiteOr(value.rotationDeg.x, 0),
            y: finiteOr(value.rotationDeg.y, 0),
            z: finiteOr(value.rotationDeg.z, 0),
        },
        scale: Math.max(0.001, finiteOr(value.scale, 1)),
    };
}

export function createAccessoryTransformKeyframeTrack(
    baseValue: AccessoryTransformKeyframeValue,
): AccessoryTransformKeyframeTrack {
    return {
        id: ACCESSORY_TRANSFORM_TRACK_ID,
        interpolation: "linear",
        baseValue: cloneAccessoryTransformValue(baseValue),
        keyframes: [],
    };
}

function lerp(from: number, to: number, amount: number): number {
    const t = Math.max(0, Math.min(1, amount));
    return from + (to - from) * t;
}

export function interpolateAccessoryTransformValue(
    from: AccessoryTransformKeyframeValue,
    to: AccessoryTransformKeyframeValue,
    amount: number,
): AccessoryTransformKeyframeValue {
    return {
        position: {
            x: lerp(from.position.x, to.position.x, amount),
            y: lerp(from.position.y, to.position.y, amount),
            z: lerp(from.position.z, to.position.z, amount),
        },
        rotationDeg: {
            x: lerp(from.rotationDeg.x, to.rotationDeg.x, amount),
            y: lerp(from.rotationDeg.y, to.rotationDeg.y, amount),
            z: lerp(from.rotationDeg.z, to.rotationDeg.z, amount),
        },
        scale: Math.max(0.001, lerp(from.scale, to.scale, amount)),
    };
}

export function upsertAccessoryTransformKeyframe(
    track: AccessoryTransformKeyframeTrack,
    frame: number,
    value: AccessoryTransformKeyframeValue,
): AccessoryTransformKeyframeTrack {
    return upsertSceneKeyframe(track, frame, cloneAccessoryTransformValue(value));
}

export function readAccessoryTransformKeyframe(
    track: AccessoryTransformKeyframeTrack,
    frame: number,
): AccessoryTransformKeyframeValue | null {
    const normalizedFrame = Math.max(0, Math.floor(frame));
    const keyframe = track.keyframes.find((candidate) => candidate.frame === normalizedFrame);
    return keyframe ? cloneAccessoryTransformValue(keyframe.value) : null;
}

export function removeAccessoryTransformKeyframe(
    track: AccessoryTransformKeyframeTrack,
    frame: number,
): AccessoryTransformKeyframeTrack | null {
    return removeSceneKeyframe(track, frame);
}

export function removeAccessoryTransformKeyframes(
    track: AccessoryTransformKeyframeTrack,
    frames: readonly number[],
): AccessoryTransformKeyframeTrack | null {
    let next = track;
    for (const frame of new Set(frames.map((value) => Math.max(0, Math.floor(value))))) {
        const removed = removeSceneKeyframe(next, frame);
        if (!removed) return null;
        next = removed;
    }
    return next;
}

export function moveAccessoryTransformKeyframe(
    track: AccessoryTransformKeyframeTrack,
    fromFrame: number,
    toFrame: number,
): AccessoryTransformKeyframeTrack | null {
    return moveSceneKeyframe(track, fromFrame, toFrame);
}

export function evaluateAccessoryTransformKeyframeTrack(
    track: AccessoryTransformKeyframeTrack,
    frame: number,
): AccessoryTransformKeyframeValue {
    return evaluateSceneKeyframeTrack(track, frame, interpolateAccessoryTransformValue);
}

export function serializeAccessoryTransformKeyframeTrack(
    track: AccessoryTransformKeyframeTrack,
): ProjectSerializedAccessoryTransformTrack {
    const frameNumbers = new Uint32Array(track.keyframes.length);
    const positions = new Float32Array(track.keyframes.length * 3);
    const rotations = new Float32Array(track.keyframes.length * 3);
    const scales = new Float32Array(track.keyframes.length);

    track.keyframes.forEach((keyframe, index) => {
        frameNumbers[index] = keyframe.frame;
        positions.set([
            keyframe.value.position.x,
            keyframe.value.position.y,
            keyframe.value.position.z,
        ], index * 3);
        rotations.set([
            keyframe.value.rotationDeg.x,
            keyframe.value.rotationDeg.y,
            keyframe.value.rotationDeg.z,
        ], index * 3);
        scales[index] = keyframe.value.scale;
    });

    return {
        frameNumbers: packFrameNumbers(frameNumbers),
        positions: packFloat32Array(positions),
        rotations: packFloat32Array(rotations),
        scales: packFloat32Array(scales),
    };
}

export function deserializeAccessoryTransformKeyframeTrack(
    data: ProjectSerializedAccessoryTransformTrack | null | undefined,
    baseValue: AccessoryTransformKeyframeValue,
): AccessoryTransformKeyframeTrack {
    let track = createAccessoryTransformKeyframeTrack(baseValue);
    if (!data) return track;

    const frameCount = Math.max(0, getProjectArrayLength(data.frameNumbers));
    const frameNumbers = new Uint32Array(frameCount);
    const positions = new Float32Array(frameCount * 3);
    const rotations = new Float32Array(frameCount * 3);
    const scales = new Float32Array(frameCount);
    copyProjectArrayToUint32(data.frameNumbers, frameNumbers);
    copyProjectArrayToFloat32(data.positions, positions);
    copyProjectArrayToFloat32(data.rotations, rotations);
    copyProjectArrayToFloat32(data.scales, scales);

    for (let index = 0; index < frameCount; index += 1) {
        track = upsertAccessoryTransformKeyframe(track, frameNumbers[index], {
            position: {
                x: positions[index * 3],
                y: positions[index * 3 + 1],
                z: positions[index * 3 + 2],
            },
            rotationDeg: {
                x: rotations[index * 3],
                y: rotations[index * 3 + 1],
                z: rotations[index * 3 + 2],
            },
            scale: scales[index],
        });
    }
    return track;
}

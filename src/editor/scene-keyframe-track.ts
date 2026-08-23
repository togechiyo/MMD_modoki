export type SceneVector3 = {
    x: number;
    y: number;
    z: number;
};

export type SceneRgbColor = {
    r: number;
    g: number;
    b: number;
};

export type LightSceneKeyframeValue = {
    color: SceneRgbColor;
    direction: SceneVector3;
};

export type ShadowSceneKeyframeValue = {
    color: SceneRgbColor;
    toonInfluence: number;
    maxZ: number;
    lightIntensity: number;
};

export type GravitySceneKeyframeValue = {
    acceleration: number;
    direction: SceneVector3;
};

export type SceneKeyframe<TValue> = {
    frame: number;
    value: TValue;
};

export type SceneKeyframeTrack<TValue> = {
    id: string;
    interpolation: "linear" | "step";
    baseValue: TValue;
    keyframes: SceneKeyframe<TValue>[];
};

export type SerializedLightSceneTrack = {
    baseColor: SceneRgbColor;
    baseDirection: SceneVector3;
    frameNumbers: number[];
    colors: number[];
    directions: number[];
};

export type SerializedShadowSceneTrack = {
    baseColor: SceneRgbColor;
    baseToonInfluence: number;
    baseMaxZ: number;
    baseLightIntensity: number;
    frameNumbers: number[];
    colors: number[];
    toonInfluences: number[];
    maxZs: number[];
    lightIntensities: number[];
};

export type SerializedGravitySceneTrack = {
    baseAcceleration: number;
    baseDirection: SceneVector3;
    frameNumbers: number[];
    accelerations: number[];
    directions: number[];
};

const LIGHT_TRACK_ID = "scene.light";
const SHADOW_TRACK_ID = "scene.shadow";
const GRAVITY_TRACK_ID = "scene.gravity";

function normalizeFrame(frame: number): number {
    return Math.max(0, Math.floor(Number.isFinite(frame) ? frame : 0));
}

function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

function cloneLightValue(value: LightSceneKeyframeValue): LightSceneKeyframeValue {
    return {
        color: {
            r: finiteOr(value.color.r, 1),
            g: finiteOr(value.color.g, 1),
            b: finiteOr(value.color.b, 1),
        },
        direction: {
            x: finiteOr(value.direction.x, 0),
            y: finiteOr(value.direction.y, -1),
            z: finiteOr(value.direction.z, 0),
        },
    };
}

function cloneShadowValue(value: ShadowSceneKeyframeValue): ShadowSceneKeyframeValue {
    return {
        color: {
            r: finiteOr(value.color.r, 0.5),
            g: finiteOr(value.color.g, 0.5),
            b: finiteOr(value.color.b, 0.5),
        },
        toonInfluence: Math.max(0, Math.min(1, finiteOr(value.toonInfluence, 1))),
        maxZ: Math.max(0, finiteOr(value.maxZ, 1000)),
        lightIntensity: Math.max(0, finiteOr(value.lightIntensity, 1)),
    };
}

function cloneGravityValue(value: GravitySceneKeyframeValue): GravitySceneKeyframeValue {
    return {
        acceleration: Math.max(0, Math.min(200, finiteOr(value.acceleration, 98))),
        direction: {
            x: Math.max(-100, Math.min(100, finiteOr(value.direction.x, 0))),
            y: Math.max(-100, Math.min(100, finiteOr(value.direction.y, -100))),
            z: Math.max(-100, Math.min(100, finiteOr(value.direction.z, 0))),
        },
    };
}

export function createLightSceneTrack(baseValue: LightSceneKeyframeValue): SceneKeyframeTrack<LightSceneKeyframeValue> {
    return {
        id: LIGHT_TRACK_ID,
        interpolation: "linear",
        baseValue: cloneLightValue(baseValue),
        keyframes: [],
    };
}

export function createShadowSceneTrack(
    baseValue: ShadowSceneKeyframeValue,
): SceneKeyframeTrack<ShadowSceneKeyframeValue> {
    return {
        id: SHADOW_TRACK_ID,
        interpolation: "linear",
        baseValue: cloneShadowValue(baseValue),
        keyframes: [],
    };
}

export function createGravitySceneTrack(
    baseValue: GravitySceneKeyframeValue,
): SceneKeyframeTrack<GravitySceneKeyframeValue> {
    return {
        id: GRAVITY_TRACK_ID,
        interpolation: "linear",
        baseValue: cloneGravityValue(baseValue),
        keyframes: [],
    };
}

export function upsertSceneKeyframe<TValue>(
    track: SceneKeyframeTrack<TValue>,
    frame: number,
    value: TValue,
): SceneKeyframeTrack<TValue> {
    const normalizedFrame = normalizeFrame(frame);
    const keyframes = track.keyframes.slice();
    const index = keyframes.findIndex((keyframe) => keyframe.frame >= normalizedFrame);
    const next = { frame: normalizedFrame, value };
    if (index >= 0 && keyframes[index].frame === normalizedFrame) {
        keyframes[index] = next;
    } else if (index >= 0) {
        keyframes.splice(index, 0, next);
    } else {
        keyframes.push(next);
    }
    return { ...track, keyframes };
}

export function removeSceneKeyframe<TValue>(
    track: SceneKeyframeTrack<TValue>,
    frame: number,
): SceneKeyframeTrack<TValue> | null {
    const normalizedFrame = normalizeFrame(frame);
    const index = track.keyframes.findIndex((keyframe) => keyframe.frame === normalizedFrame);
    if (index < 0) return null;
    const keyframes = track.keyframes.slice();
    keyframes.splice(index, 1);
    return { ...track, keyframes };
}

export function moveSceneKeyframe<TValue>(
    track: SceneKeyframeTrack<TValue>,
    fromFrame: number,
    toFrame: number,
): SceneKeyframeTrack<TValue> | null {
    const normalizedFrom = normalizeFrame(fromFrame);
    const normalizedTo = normalizeFrame(toFrame);
    const source = track.keyframes.find((keyframe) => keyframe.frame === normalizedFrom);
    if (!source || normalizedFrom === normalizedTo) return null;
    if (track.keyframes.some((keyframe) => keyframe.frame === normalizedTo)) return null;
    const removed = removeSceneKeyframe(track, normalizedFrom);
    return removed ? upsertSceneKeyframe(removed, normalizedTo, source.value) : null;
}

export function evaluateSceneKeyframeTrack<TValue>(
    track: SceneKeyframeTrack<TValue>,
    frame: number,
    interpolate: (from: TValue, to: TValue, amount: number) => TValue,
): TValue {
    const normalizedFrame = normalizeFrame(frame);
    if (track.keyframes.length === 0 || normalizedFrame < track.keyframes[0].frame) {
        return track.baseValue;
    }

    let previous = track.keyframes[0];
    for (let index = 1; index < track.keyframes.length; index += 1) {
        const next = track.keyframes[index];
        if (normalizedFrame < next.frame) {
            if (track.interpolation === "step") return previous.value;
            const span = Math.max(1, next.frame - previous.frame);
            return interpolate(previous.value, next.value, (normalizedFrame - previous.frame) / span);
        }
        previous = next;
    }
    return previous.value;
}

function lerp(from: number, to: number, amount: number): number {
    return from + (to - from) * Math.max(0, Math.min(1, amount));
}

export function interpolateLightSceneValue(
    from: LightSceneKeyframeValue,
    to: LightSceneKeyframeValue,
    amount: number,
): LightSceneKeyframeValue {
    const direction = {
        x: lerp(from.direction.x, to.direction.x, amount),
        y: lerp(from.direction.y, to.direction.y, amount),
        z: lerp(from.direction.z, to.direction.z, amount),
    };
    if (direction.x * direction.x + direction.y * direction.y + direction.z * direction.z < 1e-8) {
        const fallback = amount < 0.5 ? from.direction : to.direction;
        direction.x = fallback.x;
        direction.y = fallback.y;
        direction.z = fallback.z;
    }
    return {
        color: {
            r: lerp(from.color.r, to.color.r, amount),
            g: lerp(from.color.g, to.color.g, amount),
            b: lerp(from.color.b, to.color.b, amount),
        },
        direction,
    };
}

export function interpolateShadowSceneValue(
    from: ShadowSceneKeyframeValue,
    to: ShadowSceneKeyframeValue,
    amount: number,
): ShadowSceneKeyframeValue {
    return {
        color: {
            r: lerp(from.color.r, to.color.r, amount),
            g: lerp(from.color.g, to.color.g, amount),
            b: lerp(from.color.b, to.color.b, amount),
        },
        toonInfluence: lerp(from.toonInfluence, to.toonInfluence, amount),
        maxZ: Math.max(0, lerp(from.maxZ, to.maxZ, amount)),
        lightIntensity: Math.max(0, lerp(from.lightIntensity, to.lightIntensity, amount)),
    };
}

export function interpolateGravitySceneValue(
    from: GravitySceneKeyframeValue,
    to: GravitySceneKeyframeValue,
    amount: number,
): GravitySceneKeyframeValue {
    return cloneGravityValue({
        acceleration: lerp(from.acceleration, to.acceleration, amount),
        direction: {
            x: lerp(from.direction.x, to.direction.x, amount),
            y: lerp(from.direction.y, to.direction.y, amount),
            z: lerp(from.direction.z, to.direction.z, amount),
        },
    });
}

export function serializeLightSceneTrack(
    track: SceneKeyframeTrack<LightSceneKeyframeValue> | null,
): SerializedLightSceneTrack | null {
    if (!track) return null;
    return {
        baseColor: { ...track.baseValue.color },
        baseDirection: { ...track.baseValue.direction },
        frameNumbers: track.keyframes.map((keyframe) => keyframe.frame),
        colors: track.keyframes.flatMap((keyframe) => [keyframe.value.color.r, keyframe.value.color.g, keyframe.value.color.b]),
        directions: track.keyframes.flatMap((keyframe) => [keyframe.value.direction.x, keyframe.value.direction.y, keyframe.value.direction.z]),
    };
}

export function deserializeLightSceneTrack(data: SerializedLightSceneTrack | null | undefined): SceneKeyframeTrack<LightSceneKeyframeValue> | null {
    if (!data || !Array.isArray(data.frameNumbers) || !Array.isArray(data.colors) || !Array.isArray(data.directions)) {
        return null;
    }
    if (data.colors.length !== data.frameNumbers.length * 3 || data.directions.length !== data.frameNumbers.length * 3) {
        return null;
    }

    let track = createLightSceneTrack({
        color: data.baseColor,
        direction: data.baseDirection,
    });
    for (let index = 0; index < data.frameNumbers.length; index += 1) {
        const offset = index * 3;
        track = upsertSceneKeyframe(track, data.frameNumbers[index], cloneLightValue({
            color: {
                r: data.colors[offset],
                g: data.colors[offset + 1],
                b: data.colors[offset + 2],
            },
            direction: {
                x: data.directions[offset],
                y: data.directions[offset + 1],
                z: data.directions[offset + 2],
            },
        }));
    }
    return track;
}

export function serializeShadowSceneTrack(
    track: SceneKeyframeTrack<ShadowSceneKeyframeValue> | null,
): SerializedShadowSceneTrack | null {
    if (!track) return null;
    return {
        baseColor: { ...track.baseValue.color },
        baseToonInfluence: track.baseValue.toonInfluence,
        baseMaxZ: track.baseValue.maxZ,
        baseLightIntensity: track.baseValue.lightIntensity,
        frameNumbers: track.keyframes.map((keyframe) => keyframe.frame),
        colors: track.keyframes.flatMap((keyframe) => [keyframe.value.color.r, keyframe.value.color.g, keyframe.value.color.b]),
        toonInfluences: track.keyframes.map((keyframe) => keyframe.value.toonInfluence),
        maxZs: track.keyframes.map((keyframe) => keyframe.value.maxZ),
        lightIntensities: track.keyframes.map((keyframe) => keyframe.value.lightIntensity),
    };
}

export function deserializeShadowSceneTrack(
    data: SerializedShadowSceneTrack | null | undefined,
): SceneKeyframeTrack<ShadowSceneKeyframeValue> | null {
    if (!data || !Array.isArray(data.frameNumbers) || !Array.isArray(data.colors) ||
        !Array.isArray(data.toonInfluences) || !Array.isArray(data.maxZs) || !Array.isArray(data.lightIntensities)) {
        return null;
    }
    if (data.colors.length !== data.frameNumbers.length * 3 ||
        data.toonInfluences.length !== data.frameNumbers.length ||
        data.maxZs.length !== data.frameNumbers.length ||
        data.lightIntensities.length !== data.frameNumbers.length) {
        return null;
    }

    let track = createShadowSceneTrack({
        color: data.baseColor,
        toonInfluence: data.baseToonInfluence,
        maxZ: data.baseMaxZ,
        lightIntensity: data.baseLightIntensity,
    });
    for (let index = 0; index < data.frameNumbers.length; index += 1) {
        const offset = index * 3;
        track = upsertSceneKeyframe(track, data.frameNumbers[index], cloneShadowValue({
            color: {
                r: data.colors[offset],
                g: data.colors[offset + 1],
                b: data.colors[offset + 2],
            },
            toonInfluence: data.toonInfluences[index],
            maxZ: data.maxZs[index],
            lightIntensity: data.lightIntensities[index],
        }));
    }
    return track;
}

export function serializeGravitySceneTrack(
    track: SceneKeyframeTrack<GravitySceneKeyframeValue> | null,
): SerializedGravitySceneTrack | null {
    if (!track) return null;
    return {
        baseAcceleration: track.baseValue.acceleration,
        baseDirection: { ...track.baseValue.direction },
        frameNumbers: track.keyframes.map((keyframe) => keyframe.frame),
        accelerations: track.keyframes.map((keyframe) => keyframe.value.acceleration),
        directions: track.keyframes.flatMap((keyframe) => [
            keyframe.value.direction.x,
            keyframe.value.direction.y,
            keyframe.value.direction.z,
        ]),
    };
}

export function deserializeGravitySceneTrack(
    data: SerializedGravitySceneTrack | null | undefined,
): SceneKeyframeTrack<GravitySceneKeyframeValue> | null {
    if (!data || !Array.isArray(data.frameNumbers) || !Array.isArray(data.accelerations) ||
        !Array.isArray(data.directions)) {
        return null;
    }
    if (data.accelerations.length !== data.frameNumbers.length ||
        data.directions.length !== data.frameNumbers.length * 3) {
        return null;
    }

    let track = createGravitySceneTrack({
        acceleration: data.baseAcceleration,
        direction: data.baseDirection,
    });
    for (let index = 0; index < data.frameNumbers.length; index += 1) {
        const offset = index * 3;
        track = upsertSceneKeyframe(track, data.frameNumbers[index], cloneGravityValue({
            acceleration: data.accelerations[index],
            direction: {
                x: data.directions[offset],
                y: data.directions[offset + 1],
                z: data.directions[offset + 2],
            },
        }));
    }
    return track;
}

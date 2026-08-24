import type {
    CameraKeyframePayload,
    MorphKeyframePayload,
    MovableBoneKeyframePayload,
    TimelineKeyframePayload,
} from "./timeline-edit-service";

export type ScalarKeyframeCorrection = {
    multiply: number;
    add: number;
};

export type Vector3KeyframeCorrection = {
    x: ScalarKeyframeCorrection;
    y: ScalarKeyframeCorrection;
    z: ScalarKeyframeCorrection;
};

export type KeyframeValueCorrection =
    | {
        kind: "bone";
        position: Vector3KeyframeCorrection;
        rotation: Vector3KeyframeCorrection;
    }
    | {
        kind: "camera";
        center: Vector3KeyframeCorrection;
        rotation: Vector3KeyframeCorrection;
        distance: ScalarKeyframeCorrection;
        fov: ScalarKeyframeCorrection;
    }
    | {
        kind: "morph";
        weight: ScalarKeyframeCorrection;
    };

export type KeyframeValueCorrectionKind = KeyframeValueCorrection["kind"];

export type KeyframeValueCorrectionPreview = {
    compatibleKeyCount: number;
    changedKeyCount: number;
    beforeMin: number | null;
    beforeMax: number | null;
    afterMin: number | null;
    afterMax: number | null;
    valid: boolean;
};

const identityScalar = (): ScalarKeyframeCorrection => ({ multiply: 1, add: 0 });

export function createIdentityKeyframeValueCorrection(kind: KeyframeValueCorrectionKind): KeyframeValueCorrection {
    switch (kind) {
        case "bone":
            return {
                kind,
                position: { x: identityScalar(), y: identityScalar(), z: identityScalar() },
                rotation: { x: identityScalar(), y: identityScalar(), z: identityScalar() },
            };
        case "camera":
            return {
                kind,
                center: { x: identityScalar(), y: identityScalar(), z: identityScalar() },
                rotation: { x: identityScalar(), y: identityScalar(), z: identityScalar() },
                distance: identityScalar(),
                fov: identityScalar(),
            };
        case "morph":
            return { kind, weight: identityScalar() };
    }
}

function applyScalar(value: number, correction: ScalarKeyframeCorrection): number {
    return value * correction.multiply + correction.add;
}

function isScalarCorrectionValid(correction: ScalarKeyframeCorrection): boolean {
    return Number.isFinite(correction.multiply) && Number.isFinite(correction.add);
}

function isScalarCorrectionIdentity(correction: ScalarKeyframeCorrection): boolean {
    return correction.multiply === 1 && correction.add === 0;
}

function isVectorCorrectionValid(correction: Vector3KeyframeCorrection): boolean {
    return isScalarCorrectionValid(correction.x)
        && isScalarCorrectionValid(correction.y)
        && isScalarCorrectionValid(correction.z);
}

function isVectorCorrectionIdentity(correction: Vector3KeyframeCorrection): boolean {
    return isScalarCorrectionIdentity(correction.x)
        && isScalarCorrectionIdentity(correction.y)
        && isScalarCorrectionIdentity(correction.z);
}

function applyVector3(values: readonly number[], correction: Vector3KeyframeCorrection): number[] {
    return [
        applyScalar(values[0] ?? 0, correction.x),
        applyScalar(values[1] ?? 0, correction.y),
        applyScalar(values[2] ?? 0, correction.z),
    ];
}

function areFinite(values: readonly number[]): boolean {
    return values.every(Number.isFinite);
}

function normalizeQuaternion(values: readonly number[]): [number, number, number, number] | null {
    const x = values[0] ?? Number.NaN;
    const y = values[1] ?? Number.NaN;
    const z = values[2] ?? Number.NaN;
    const w = values[3] ?? Number.NaN;
    if (![x, y, z, w].every(Number.isFinite)) return null;
    const length = Math.hypot(x, y, z, w);
    if (!Number.isFinite(length) || length <= 1e-12) return null;
    return [x / length, y / length, z / length, w / length];
}

/** Matches Babylon.js 9.2 Quaternion.toEulerAngles() (Y-X-Z orientation). */
function quaternionToEulerDegrees(values: readonly number[]): number[] | null {
    const normalized = normalizeQuaternion(values);
    if (!normalized) return null;
    const [qx, qy, qz, qw] = normalized;
    const zAxisY = qy * qz - qx * qw;
    const limit = 0.4999999;
    let x: number;
    let y: number;
    let z: number;
    if (zAxisY < -limit) {
        y = 2 * Math.atan2(qy, qw);
        x = Math.PI / 2;
        z = 0;
    } else if (zAxisY > limit) {
        y = 2 * Math.atan2(qy, qw);
        x = -Math.PI / 2;
        z = 0;
    } else {
        const sqw = qw * qw;
        const sqz = qz * qz;
        const sqx = qx * qx;
        const sqy = qy * qy;
        z = Math.atan2(2 * (qx * qy + qz * qw), -sqz - sqx + sqy + sqw);
        x = Math.asin(-2 * zAxisY);
        y = Math.atan2(2 * (qz * qx + qy * qw), sqz - sqx - sqy + sqw);
    }
    const toDeg = 180 / Math.PI;
    return [x * toDeg, y * toDeg, z * toDeg];
}

/** Matches Babylon.js 9.2 Quaternion.RotationYawPitchRoll(y, x, z). */
function eulerDegreesToQuaternion(
    values: readonly number[],
    sourceQuaternion: readonly number[],
): number[] | null {
    if (!areFinite(values)) return null;
    const toRad = Math.PI / 180;
    const halfPitch = (values[0] ?? 0) * toRad * 0.5;
    const halfYaw = (values[1] ?? 0) * toRad * 0.5;
    const halfRoll = (values[2] ?? 0) * toRad * 0.5;
    const sinPitch = Math.sin(halfPitch);
    const cosPitch = Math.cos(halfPitch);
    const sinYaw = Math.sin(halfYaw);
    const cosYaw = Math.cos(halfYaw);
    const sinRoll = Math.sin(halfRoll);
    const cosRoll = Math.cos(halfRoll);
    const result = normalizeQuaternion([
        cosYaw * sinPitch * cosRoll + sinYaw * cosPitch * sinRoll,
        sinYaw * cosPitch * cosRoll - cosYaw * sinPitch * sinRoll,
        cosYaw * cosPitch * sinRoll - sinYaw * sinPitch * cosRoll,
        cosYaw * cosPitch * cosRoll + sinYaw * sinPitch * sinRoll,
    ]);
    const source = normalizeQuaternion(sourceQuaternion);
    if (!result || !source) return null;
    const dot = result.reduce((sum, value, index) => sum + value * source[index], 0);
    return dot < 0 ? result.map((value) => -value) : result;
}

function applyQuaternionRotation(
    values: readonly number[],
    correction: Vector3KeyframeCorrection,
): number[] | null {
    const eulerDegrees = quaternionToEulerDegrees(values);
    if (!eulerDegrees) return null;
    return eulerDegreesToQuaternion(applyVector3(eulerDegrees, correction), values);
}

function applyCameraEulerRotation(
    values: readonly number[],
    correction: Vector3KeyframeCorrection,
): number[] {
    const toRad = Math.PI / 180;
    const applyRadians = (value: number, channel: ScalarKeyframeCorrection): number => (
        value * channel.multiply + channel.add * toRad
    );
    return [
        applyRadians(values[0] ?? 0, correction.x),
        applyRadians(values[1] ?? 0, correction.y),
        applyRadians(values[2] ?? 0, correction.z),
    ];
}

function isCompatiblePayload(payload: TimelineKeyframePayload, kind: KeyframeValueCorrectionKind): boolean {
    switch (kind) {
        case "bone":
            return payload.kind === "bone" || payload.kind === "movableBone";
        case "camera":
            return payload.kind === "camera";
        case "morph":
            return payload.kind === "morph";
    }
}

function getSourceValues(payload: TimelineKeyframePayload, kind: KeyframeValueCorrectionKind): number[] | null {
    switch (kind) {
        case "bone": {
            if (payload.kind !== "bone" && payload.kind !== "movableBone") return null;
            const rotation = quaternionToEulerDegrees(payload.rotations);
            if (!rotation) return null;
            return payload.kind === "movableBone"
                ? [...payload.positions.slice(0, 3), ...rotation]
                : rotation;
        }
        case "camera":
            return payload.kind === "camera"
                ? [
                    ...payload.positions.slice(0, 3),
                    ...payload.rotations.slice(0, 3).map((value) => value * 180 / Math.PI),
                    payload.distances[0] ?? 0,
                    payload.fovs[0] ?? 0,
                ]
                : null;
        case "morph":
            return payload.kind === "morph" ? payload.weights.slice(0, 1) : null;
    }
}

export function isKeyframeValueCorrectionValid(correction: KeyframeValueCorrection): boolean {
    switch (correction.kind) {
        case "bone":
            return isVectorCorrectionValid(correction.position)
                && isVectorCorrectionValid(correction.rotation);
        case "camera":
            return isVectorCorrectionValid(correction.center)
                && isVectorCorrectionValid(correction.rotation)
                && isScalarCorrectionValid(correction.distance)
                && isScalarCorrectionValid(correction.fov);
        case "morph":
            return isScalarCorrectionValid(correction.weight);
    }
}

export function isKeyframeValueCorrectionIdentity(correction: KeyframeValueCorrection): boolean {
    switch (correction.kind) {
        case "bone":
            return isVectorCorrectionIdentity(correction.position)
                && isVectorCorrectionIdentity(correction.rotation);
        case "camera":
            return isVectorCorrectionIdentity(correction.center)
                && isVectorCorrectionIdentity(correction.rotation)
                && isScalarCorrectionIdentity(correction.distance)
                && isScalarCorrectionIdentity(correction.fov);
        case "morph":
            return isScalarCorrectionIdentity(correction.weight);
    }
}

export function applyKeyframeValueCorrection(
    payload: TimelineKeyframePayload,
    correction: KeyframeValueCorrection,
): TimelineKeyframePayload | null {
    if (!isKeyframeValueCorrectionValid(correction) || !isCompatiblePayload(payload, correction.kind)) return null;
    switch (correction.kind) {
        case "bone": {
            if (payload.kind !== "bone" && payload.kind !== "movableBone") return null;
            const rotations = isVectorCorrectionIdentity(correction.rotation)
                ? payload.rotations
                : applyQuaternionRotation(payload.rotations, correction.rotation);
            if (!rotations) return null;
            if (payload.kind === "bone") return { ...payload, rotations };
            const movable = payload as MovableBoneKeyframePayload;
            const positions = isVectorCorrectionIdentity(correction.position)
                ? movable.positions
                : applyVector3(movable.positions, correction.position);
            if (!areFinite(positions)) return null;
            return { ...movable, positions, rotations };
        }
        case "camera": {
            if (payload.kind !== "camera") return null;
            const camera = payload as CameraKeyframePayload;
            const positions = applyVector3(camera.positions, correction.center);
            const rotations = applyCameraEulerRotation(camera.rotations, correction.rotation);
            const distance = applyScalar(camera.distances[0] ?? 0, correction.distance);
            const fov = applyScalar(camera.fovs[0] ?? 0, correction.fov);
            if (!areFinite([...positions, ...rotations, distance, fov])) return null;
            return {
                ...camera,
                positions,
                rotations,
                distances: [distance],
                fovs: [fov],
            };
        }
        case "morph": {
            if (payload.kind !== "morph") return null;
            const morph = payload as MorphKeyframePayload;
            const weight = applyScalar(morph.weights[0] ?? 0, correction.weight);
            return Number.isFinite(weight) ? { ...morph, weights: [weight] } : null;
        }
    }
}

export function createKeyframeValueCorrectionPreview(
    payloads: readonly TimelineKeyframePayload[],
    correction: KeyframeValueCorrection,
): KeyframeValueCorrectionPreview {
    const beforeValues: number[] = [];
    const afterValues: number[] = [];
    let compatibleKeyCount = 0;
    let changedKeyCount = 0;
    let valid = isKeyframeValueCorrectionValid(correction);

    for (const payload of payloads) {
        if (!isCompatiblePayload(payload, correction.kind)) continue;
        compatibleKeyCount += 1;
        const before = getSourceValues(payload, correction.kind);
        if (!before) {
            valid = false;
            continue;
        }
        const corrected = valid ? applyKeyframeValueCorrection(payload, correction) : null;
        const after = corrected ? getSourceValues(corrected, correction.kind) : null;
        if (!after || !areFinite(before) || !areFinite(after)) {
            valid = false;
            continue;
        }
        beforeValues.push(...before);
        afterValues.push(...after);
        if (before.some((value, index) => Math.abs(value - (after[index] ?? value)) > 1e-9)) changedKeyCount += 1;
    }

    return {
        compatibleKeyCount,
        changedKeyCount,
        beforeMin: beforeValues.length > 0 ? Math.min(...beforeValues) : null,
        beforeMax: beforeValues.length > 0 ? Math.max(...beforeValues) : null,
        afterMin: afterValues.length > 0 ? Math.min(...afterValues) : null,
        afterMax: afterValues.length > 0 ? Math.max(...afterValues) : null,
        valid,
    };
}

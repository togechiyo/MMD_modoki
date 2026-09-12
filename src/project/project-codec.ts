import type {
    ProjectNumberArray,
    ProjectPackedArray,
    ProjectSerializedBoneTrack,
    ProjectSerializedCameraTrack,
    ProjectSerializedModelAnimation,
    ProjectSerializedMorphTrack,
    ProjectSerializedMovableBoneTrack,
    ProjectSerializedPropertyTrack,
} from "../types";
import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import { normalizeModelBoneTracks } from "../editor/model-bone-track-normalization";
import { MmdBoneAnimationTrack, MmdCameraAnimationTrack, MmdMorphAnimationTrack, MmdMovableBoneAnimationTrack, MmdPropertyAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";

export function isPackedProjectArray(value: unknown): value is ProjectPackedArray {
    if (!value || typeof value !== "object") return false;
    const packed = value as Partial<ProjectPackedArray>;
    if (typeof packed.data !== "string") return false;
    if (typeof packed.length !== "number" || !Number.isFinite(packed.length) || packed.length < 0) return false;
    return packed.encoding === "u8-b64" || packed.encoding === "f32-b64" || packed.encoding === "u32-delta-varint-b64";
}

export function encodeUint8ToBase64(bytes: Uint8Array): string {
    if (bytes.length === 0) return "";
    const chunkSize = 0x8000;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        let binary = "";
        for (let j = 0; j < chunk.length; j += 1) {
            binary += String.fromCharCode(chunk[j]);
        }
        parts.push(binary);
    }
    return btoa(parts.join(""));
}

export function decodeBase64ToUint8(value: string): Uint8Array {
    if (value.length === 0) return new Uint8Array(0);
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i) & 0xff;
        }
        return bytes;
    } catch {
        return new Uint8Array(0);
    }
}

export function getProjectArrayLength(source: ProjectNumberArray | null | undefined): number {
    if (Array.isArray(source)) return source.length;
    if (!isPackedProjectArray(source)) return 0;
    return Math.max(0, Math.floor(source.length));
}

export function packUint8Array(source: Uint8Array): ProjectNumberArray {
    return {
        encoding: "u8-b64",
        length: source.length,
        data: encodeUint8ToBase64(source),
    };
}

export function packFloat32Array(source: Float32Array): ProjectNumberArray {
    const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    return {
        encoding: "f32-b64",
        length: source.length,
        data: encodeUint8ToBase64(bytes),
    };
}

export function packFrameNumbers(source: Uint32Array): ProjectNumberArray {
    if (source.length === 0) {
        return {
            encoding: "u32-delta-varint-b64",
            length: 0,
            data: "",
        };
    }

    const encoded: number[] = [];
    let previous = 0;
    for (let i = 0; i < source.length; i += 1) {
        const current = source[i];
        if (i > 0 && current < previous) return Array.from(source);
        let delta = i === 0 ? current : current - previous;
        previous = current;

        while (delta >= 0x80) {
            encoded.push((delta & 0x7f) | 0x80);
            delta = Math.floor(delta / 128);
        }
        encoded.push(delta & 0x7f);
    }

    return {
        encoding: "u32-delta-varint-b64",
        length: source.length,
        data: encodeUint8ToBase64(Uint8Array.from(encoded)),
    };
}

export function copyProjectArrayToFloat32(source: ProjectNumberArray | null | undefined, destination: Float32Array): void {
    if (Array.isArray(source)) {
        const count = Math.min(source.length, destination.length);
        for (let i = 0; i < count; i += 1) {
            const value = source[i];
            destination[i] = Number.isFinite(value) ? value : 0;
        }
        return;
    }
    if (!isPackedProjectArray(source) || source.encoding !== "f32-b64") return;

    const bytes = decodeBase64ToUint8(source.data);
    const available = Math.floor(bytes.length / 4);
    const count = Math.min(destination.length, getProjectArrayLength(source), available);
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < count; i += 1) {
        destination[i] = dataView.getFloat32(i * 4, true);
    }
}

export function copyProjectArrayToUint8(source: ProjectNumberArray | null | undefined, destination: Uint8Array): void {
    if (Array.isArray(source)) {
        const count = Math.min(source.length, destination.length);
        for (let i = 0; i < count; i += 1) {
            const value = source[i];
            const normalized = Number.isFinite(value) ? Math.round(value) : 0;
            destination[i] = Math.max(0, Math.min(255, normalized));
        }
        return;
    }
    if (!isPackedProjectArray(source) || source.encoding !== "u8-b64") return;

    const bytes = decodeBase64ToUint8(source.data);
    const count = Math.min(destination.length, getProjectArrayLength(source), bytes.length);
    for (let i = 0; i < count; i += 1) {
        destination[i] = bytes[i];
    }
}

export function copyProjectArrayToUint32(source: ProjectNumberArray | null | undefined, destination: Uint32Array): void {
    if (Array.isArray(source)) {
        const count = Math.min(source.length, destination.length);
        for (let i = 0; i < count; i += 1) {
            const value = source[i];
            destination[i] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        }
        return;
    }
    if (!isPackedProjectArray(source) || source.encoding !== "u32-delta-varint-b64") return;

    const bytes = decodeBase64ToUint8(source.data);
    const targetCount = Math.min(destination.length, getProjectArrayLength(source));
    let byteOffset = 0;
    let previous = 0;

    for (let i = 0; i < targetCount; i += 1) {
        let delta = 0;
        let base = 1;
        let completed = false;
        while (byteOffset < bytes.length) {
            const byteValue = bytes[byteOffset++];
            delta += (byteValue & 0x7f) * base;
            if ((byteValue & 0x80) === 0) {
                completed = true;
                break;
            }
            base *= 128;
        }
        if (!completed) break;

        const frame = i === 0 ? delta : previous + delta;
        const normalized = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
        destination[i] = normalized;
        previous = normalized;
    }
}

export function serializePropertyTrack(track: MmdPropertyAnimationTrack): ProjectSerializedPropertyTrack {
    const ikStates: ProjectNumberArray[] = [];
    for (let i = 0; i < track.ikBoneNames.length; i += 1) {
        ikStates.push(packUint8Array(track.getIkState(i)));
    }

    return {
        frameNumbers: packFrameNumbers(track.frameNumbers),
        visibles: packUint8Array(track.visibles),
        ikBoneNames: [...track.ikBoneNames],
        ikStates,
    };
}

export function serializeCameraTrack(track: MmdCameraAnimationTrack | null | undefined): ProjectSerializedCameraTrack | null {
    if (!track || track.frameNumbers.length === 0) return null;

    return {
        frameNumbers: packFrameNumbers(track.frameNumbers),
        positions: packFloat32Array(track.positions),
        positionInterpolations: packUint8Array(track.positionInterpolations),
        rotations: packFloat32Array(track.rotations),
        rotationInterpolations: packUint8Array(track.rotationInterpolations),
        distances: packFloat32Array(track.distances),
        distanceInterpolations: packUint8Array(track.distanceInterpolations),
        fovs: packFloat32Array(track.fovs),
        fovInterpolations: packUint8Array(track.fovInterpolations),
    };
}

export function serializeModelAnimation(animation: MmdAnimation | undefined): ProjectSerializedModelAnimation | null {
    if (!animation) return null;

    const boneTracks: ProjectSerializedBoneTrack[] = animation.boneTracks.map((track) => ({
        name: track.name,
        frameNumbers: packFrameNumbers(track.frameNumbers),
        rotations: packFloat32Array(track.rotations),
        rotationInterpolations: packUint8Array(track.rotationInterpolations),
        physicsToggles: packUint8Array(track.physicsToggles),
    }));

    const movableBoneTracks: ProjectSerializedMovableBoneTrack[] = animation.movableBoneTracks.map((track) => ({
        name: track.name,
        frameNumbers: packFrameNumbers(track.frameNumbers),
        positions: packFloat32Array(track.positions),
        positionInterpolations: packUint8Array(track.positionInterpolations),
        rotations: packFloat32Array(track.rotations),
        rotationInterpolations: packUint8Array(track.rotationInterpolations),
        physicsToggles: packUint8Array(track.physicsToggles),
    }));

    const morphTracks: ProjectSerializedMorphTrack[] = animation.morphTracks.map((track) => ({
        name: track.name,
        frameNumbers: packFrameNumbers(track.frameNumbers),
        weights: packFloat32Array(track.weights),
    }));

    return {
        name: animation.name,
        boneTracks,
        movableBoneTracks,
        morphTracks,
        propertyTrack: serializePropertyTrack(animation.propertyTrack),
    };
}

export function deserializePropertyTrack(data: ProjectSerializedPropertyTrack | null | undefined): MmdPropertyAnimationTrack {
    const frameCount = getProjectArrayLength(data?.frameNumbers);
    const ikBoneNames = Array.isArray(data?.ikBoneNames)
        ? data.ikBoneNames.filter((name): name is string => typeof name === "string")
        : [];
    const ikStates = Array.isArray(data?.ikStates) ? data.ikStates : [];

    const track = new MmdPropertyAnimationTrack(frameCount, ikBoneNames);
    copyProjectArrayToUint32(data?.frameNumbers, track.frameNumbers);
    copyProjectArrayToUint8(data?.visibles, track.visibles);
    for (let i = 0; i < ikBoneNames.length; i += 1) {
        copyProjectArrayToUint8(ikStates[i], track.getIkState(i));
    }
    return track;
}

export function deserializeCameraTrack(data: ProjectSerializedCameraTrack | null | undefined): MmdCameraAnimationTrack {
    const frameCount = getProjectArrayLength(data?.frameNumbers);
    const track = new MmdCameraAnimationTrack(frameCount);

    copyProjectArrayToUint32(data?.frameNumbers, track.frameNumbers);
    copyProjectArrayToFloat32(data?.positions, track.positions);
    copyProjectArrayToUint8(data?.positionInterpolations, track.positionInterpolations);
    copyProjectArrayToFloat32(data?.rotations, track.rotations);
    copyProjectArrayToUint8(data?.rotationInterpolations, track.rotationInterpolations);
    copyProjectArrayToFloat32(data?.distances, track.distances);
    copyProjectArrayToUint8(data?.distanceInterpolations, track.distanceInterpolations);
    copyProjectArrayToFloat32(data?.fovs, track.fovs);
    copyProjectArrayToUint8(data?.fovInterpolations, track.fovInterpolations);

    return track;
}

export function deserializeModelAnimation(data: ProjectSerializedModelAnimation | null | undefined, fallbackName: string): MmdAnimation | null {
    if (!data || typeof data !== "object") return null;

    const boneTracks: MmdBoneAnimationTrack[] = [];
    for (const sourceTrack of Array.isArray(data.boneTracks) ? data.boneTracks : []) {
        if (!sourceTrack || typeof sourceTrack.name !== "string") continue;
        const track = new MmdBoneAnimationTrack(sourceTrack.name, getProjectArrayLength(sourceTrack.frameNumbers));
        copyProjectArrayToUint32(sourceTrack.frameNumbers, track.frameNumbers);
        copyProjectArrayToFloat32(sourceTrack.rotations, track.rotations);
        copyProjectArrayToUint8(sourceTrack.rotationInterpolations, track.rotationInterpolations);
        copyProjectArrayToUint8(sourceTrack.physicsToggles, track.physicsToggles);
        boneTracks.push(track);
    }

    const movableBoneTracks: MmdMovableBoneAnimationTrack[] = [];
    for (const sourceTrack of Array.isArray(data.movableBoneTracks) ? data.movableBoneTracks : []) {
        if (!sourceTrack || typeof sourceTrack.name !== "string") continue;
        const track = new MmdMovableBoneAnimationTrack(sourceTrack.name, getProjectArrayLength(sourceTrack.frameNumbers));
        copyProjectArrayToUint32(sourceTrack.frameNumbers, track.frameNumbers);
        copyProjectArrayToFloat32(sourceTrack.positions, track.positions);
        copyProjectArrayToUint8(sourceTrack.positionInterpolations, track.positionInterpolations);
        copyProjectArrayToFloat32(sourceTrack.rotations, track.rotations);
        copyProjectArrayToUint8(sourceTrack.rotationInterpolations, track.rotationInterpolations);
        copyProjectArrayToUint8(sourceTrack.physicsToggles, track.physicsToggles);
        movableBoneTracks.push(track);
    }

    const morphTracks: MmdMorphAnimationTrack[] = [];
    for (const sourceTrack of Array.isArray(data.morphTracks) ? data.morphTracks : []) {
        if (!sourceTrack || typeof sourceTrack.name !== "string") continue;
        const track = new MmdMorphAnimationTrack(sourceTrack.name, getProjectArrayLength(sourceTrack.frameNumbers));
        copyProjectArrayToUint32(sourceTrack.frameNumbers, track.frameNumbers);
        copyProjectArrayToFloat32(sourceTrack.weights, track.weights);
        morphTracks.push(track);
    }

    const propertyTrack = deserializePropertyTrack(data.propertyTrack);
    const cameraTrack = new MmdCameraAnimationTrack(0);
    const animationName = typeof data.name === "string" && data.name.length > 0 ? data.name : fallbackName;

    const normalized = normalizeModelBoneTracks(boneTracks, movableBoneTracks);
    return new MmdAnimation(animationName, normalized.boneTracks, normalized.movableBoneTracks, morphTracks, propertyTrack, cameraTrack);
}

export function createCameraAnimationFromTrack(cameraTrack: MmdCameraAnimationTrack, name: string): MmdAnimation {
    const propertyTrack = new MmdPropertyAnimationTrack(0, []);
    return new MmdAnimation(name, [], [], [], propertyTrack, cameraTrack);
}

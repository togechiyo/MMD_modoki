import type { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import type { MmdCameraAnimationTrack } from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";

import {
    VMD_LINEAR_BEZIER,
    type VmdBezier,
    type VmdBoneKey,
    type VmdCameraKey,
    type VmdExportDocument,
    type VmdMorphKey,
} from "./vmd-export-document";

const bezierAt = (values: Uint8Array, offset: number): VmdBezier => [
    values[offset] ?? 0,
    values[offset + 1] ?? 0,
    values[offset + 2] ?? 0,
    values[offset + 3] ?? 0,
];

export class VmdExportAdapterError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "VmdExportAdapterError";
    }
}

function assertLength(label: string, actual: number, expected: number): void {
    if (actual !== expected) {
        throw new VmdExportAdapterError(`${label} length ${actual} does not match expected length ${expected}`);
    }
}

function assertBinaryValues(label: string, values: Uint8Array): void {
    for (const value of values) {
        if (value !== 0 && value !== 1) {
            throw new VmdExportAdapterError(`${label} contains a value other than 0 or 1: ${value}`);
        }
    }
}

export function createModelVmdExportDocument(
    animation: MmdAnimation,
    modelName: string,
    unsupportedExternalParentKeyCount: number,
): VmdExportDocument {
    const boneEntries: { key: VmdBoneKey; trackOrder: number; keyOrder: number }[] = [];
    let trackOrder = 0;
    for (const track of animation.boneTracks) {
        const frameCount = track.frameNumbers.length;
        assertLength(`${track.name}.rotations`, track.rotations.length, frameCount * 4);
        assertLength(`${track.name}.rotationInterpolations`, track.rotationInterpolations.length, frameCount * 4);
        assertLength(`${track.name}.physicsToggles`, track.physicsToggles.length, frameCount);
        assertBinaryValues(`${track.name}.physicsToggles`, track.physicsToggles);
        for (let index = 0; index < track.frameNumbers.length; index += 1) {
            boneEntries.push({
                trackOrder,
                keyOrder: index,
                key: {
                    boneName: track.name,
                    frame: track.frameNumbers[index] ?? 0,
                    position: [0, 0, 0],
                    rotation: [
                        track.rotations[index * 4] ?? 0,
                        track.rotations[index * 4 + 1] ?? 0,
                        track.rotations[index * 4 + 2] ?? 0,
                        track.rotations[index * 4 + 3] ?? 1,
                    ],
                    positionInterpolations: [VMD_LINEAR_BEZIER, VMD_LINEAR_BEZIER, VMD_LINEAR_BEZIER],
                    rotationInterpolation: bezierAt(track.rotationInterpolations, index * 4),
                    physicsEnabled: track.physicsToggles[index] === 1,
                },
            });
        }
        trackOrder += 1;
    }
    for (const track of animation.movableBoneTracks) {
        const frameCount = track.frameNumbers.length;
        assertLength(`${track.name}.positions`, track.positions.length, frameCount * 3);
        assertLength(`${track.name}.positionInterpolations`, track.positionInterpolations.length, frameCount * 12);
        assertLength(`${track.name}.rotations`, track.rotations.length, frameCount * 4);
        assertLength(`${track.name}.rotationInterpolations`, track.rotationInterpolations.length, frameCount * 4);
        assertLength(`${track.name}.physicsToggles`, track.physicsToggles.length, frameCount);
        assertBinaryValues(`${track.name}.physicsToggles`, track.physicsToggles);
        for (let index = 0; index < track.frameNumbers.length; index += 1) {
            const interpolationOffset = index * 12;
            boneEntries.push({
                trackOrder,
                keyOrder: index,
                key: {
                    boneName: track.name,
                    frame: track.frameNumbers[index] ?? 0,
                    position: [
                        track.positions[index * 3] ?? 0,
                        track.positions[index * 3 + 1] ?? 0,
                        track.positions[index * 3 + 2] ?? 0,
                    ],
                    rotation: [
                        track.rotations[index * 4] ?? 0,
                        track.rotations[index * 4 + 1] ?? 0,
                        track.rotations[index * 4 + 2] ?? 0,
                        track.rotations[index * 4 + 3] ?? 1,
                    ],
                    positionInterpolations: [
                        bezierAt(track.positionInterpolations, interpolationOffset),
                        bezierAt(track.positionInterpolations, interpolationOffset + 4),
                        bezierAt(track.positionInterpolations, interpolationOffset + 8),
                    ],
                    rotationInterpolation: bezierAt(track.rotationInterpolations, index * 4),
                    physicsEnabled: track.physicsToggles[index] === 1,
                },
            });
        }
        trackOrder += 1;
    }
    boneEntries.sort((left, right) => left.key.frame - right.key.frame || left.trackOrder - right.trackOrder || left.keyOrder - right.keyOrder);

    const morphEntries: { key: VmdMorphKey; trackOrder: number; keyOrder: number }[] = [];
    animation.morphTracks.forEach((track, morphTrackOrder) => {
        assertLength(`${track.name}.weights`, track.weights.length, track.frameNumbers.length);
        for (let index = 0; index < track.frameNumbers.length; index += 1) {
            morphEntries.push({
                trackOrder: morphTrackOrder,
                keyOrder: index,
                key: {
                    morphName: track.name,
                    frame: track.frameNumbers[index] ?? 0,
                    weight: track.weights[index] ?? 0,
                },
            });
        }
    });
    morphEntries.sort((left, right) => left.key.frame - right.key.frame || left.trackOrder - right.trackOrder || left.keyOrder - right.keyOrder);

    const propertyTrack = animation.propertyTrack;
    assertLength("property.visibles", propertyTrack.visibles.length, propertyTrack.frameNumbers.length);
    assertBinaryValues("property.visibles", propertyTrack.visibles);
    propertyTrack.ikBoneNames.forEach((boneName, ikIndex) => {
        const states = propertyTrack.getIkState(ikIndex);
        assertLength(`property.${boneName}`, states.length, propertyTrack.frameNumbers.length);
        assertBinaryValues(`property.${boneName}`, states);
    });
    const propertyKeys = Array.from(propertyTrack.frameNumbers, (frame, frameIndex) => ({
        frame,
        visible: propertyTrack.visibles[frameIndex] === 1,
        ikStates: propertyTrack.ikBoneNames.map((boneName, ikIndex) => ({
            boneName,
            enabled: propertyTrack.getIkState(ikIndex)[frameIndex] === 1,
        })),
    })).sort((left, right) => left.frame - right.frame);

    return {
        kind: "model",
        modelName,
        boneKeys: boneEntries.map((entry) => entry.key),
        morphKeys: morphEntries.map((entry) => entry.key),
        propertyKeys,
        unsupportedExternalParentKeyCount,
    };
}

export function createCameraVmdExportDocument(
    track: MmdCameraAnimationTrack,
    unsupportedExternalParentKeyCount: number,
): VmdExportDocument {
    const frameCount = track.frameNumbers.length;
    assertLength("camera.positions", track.positions.length, frameCount * 3);
    assertLength("camera.positionInterpolations", track.positionInterpolations.length, frameCount * 12);
    assertLength("camera.rotations", track.rotations.length, frameCount * 3);
    assertLength("camera.rotationInterpolations", track.rotationInterpolations.length, frameCount * 4);
    assertLength("camera.distances", track.distances.length, frameCount);
    assertLength("camera.distanceInterpolations", track.distanceInterpolations.length, frameCount * 4);
    assertLength("camera.fovs", track.fovs.length, frameCount);
    assertLength("camera.fovInterpolations", track.fovInterpolations.length, frameCount * 4);
    const keys: VmdCameraKey[] = Array.from(track.frameNumbers, (frame, index) => ({
        frame,
        distance: track.distances[index] ?? 0,
        position: [
            track.positions[index * 3] ?? 0,
            track.positions[index * 3 + 1] ?? 0,
            track.positions[index * 3 + 2] ?? 0,
        ],
        rotation: [
            track.rotations[index * 3] ?? 0,
            track.rotations[index * 3 + 1] ?? 0,
            track.rotations[index * 3 + 2] ?? 0,
        ],
        positionInterpolations: [
            bezierAt(track.positionInterpolations, index * 12),
            bezierAt(track.positionInterpolations, index * 12 + 4),
            bezierAt(track.positionInterpolations, index * 12 + 8),
        ],
        rotationInterpolation: bezierAt(track.rotationInterpolations, index * 4),
        distanceInterpolation: bezierAt(track.distanceInterpolations, index * 4),
        fov: track.fovs[index] ?? 0,
        fovInterpolation: bezierAt(track.fovInterpolations, index * 4),
    }));
    keys.sort((left, right) => left.frame - right.frame);
    return { kind: "camera", cameraKeys: keys, unsupportedExternalParentKeyCount };
}

import { MmdAnimation } from "babylon-mmd/esm/Loader/Animation/mmdAnimation";
import {
    MmdCameraAnimationTrack,
    MmdPropertyAnimationTrack,
} from "babylon-mmd/esm/Loader/Animation/mmdAnimationTrack";
import { BvmdConverter } from "babylon-mmd/esm/Loader/Optimized/bvmdConverter";

export class BvmdExportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BvmdExportError";
    }
}

function hasModelKeyframes(animation: MmdAnimation): boolean {
    return animation.boneTracks.some((track) => track.frameNumbers.length > 0)
        || animation.movableBoneTracks.some((track) => track.frameNumbers.length > 0)
        || animation.morphTracks.some((track) => track.frameNumbers.length > 0)
        || animation.propertyTrack.frameNumbers.length > 0;
}

function convertValidatedAnimation(animation: MmdAnimation): Uint8Array {
    if (!animation.validate()) {
        throw new BvmdExportError("BVMD source tracks must have valid, sorted frame data");
    }
    return new Uint8Array(BvmdConverter.Convert(animation));
}

export function serializeModelBvmd(animation: MmdAnimation): Uint8Array {
    if (!hasModelKeyframes(animation)) {
        throw new BvmdExportError("There are no model keyframes to export");
    }

    return convertValidatedAnimation(new MmdAnimation(
        animation.name,
        animation.boneTracks,
        animation.movableBoneTracks,
        animation.morphTracks,
        animation.propertyTrack,
        new MmdCameraAnimationTrack(0),
    ));
}

export function serializeCameraBvmd(animation: MmdAnimation): Uint8Array {
    if (animation.cameraTrack.frameNumbers.length === 0) {
        throw new BvmdExportError("There are no camera keyframes to export");
    }

    return convertValidatedAnimation(new MmdAnimation(
        animation.name,
        [],
        [],
        [],
        new MmdPropertyAnimationTrack(0, []),
        animation.cameraTrack,
    ));
}

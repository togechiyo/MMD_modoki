import type { TrackCategory } from "../types";
import type { TimelineKeyframePayload } from "../editor/timeline-edit-service";
import type { KeyframeTransaction } from "./keyframe-transaction";
import type { ObjectStateEdit } from "../editor/object-state-edit";
import type { BonePoseBatch } from "../editor/bone-pose-batch";
import type { MorphWeightBatch } from "../editor/morph-weight-batch";
import type { ModelMotionClearDiff } from "../editor/model-motion-state";

export type CommandScope =
    | "keyframe"
    | "interpolation"
    | "edit"
    | "effect"
    | "project";

export type CommandDirection = "apply" | "revert";

export type CommandTrackRef = {
    category: TrackCategory;
    name: string;
};

export type KeyframeCommandDiff =
    | KeyframeTransaction
    | {
        type: "keyframe.add";
        track: CommandTrackRef;
        frame: number;
        beforeFrames: number[];
        afterFrames: number[];
    }
    | {
        type: "keyframe.delete";
        track: CommandTrackRef;
        frame: number;
        beforeFrames: number[];
        afterFrames: number[];
    }
    | {
        type: "keyframe.move";
        track: CommandTrackRef;
        fromFrame: number;
        toFrame: number;
        beforeFrames: number[];
        afterFrames: number[];
    }
    | {
        type: "keyframe.paste";
        track: CommandTrackRef;
        frame: number;
        before: TimelineKeyframePayload | null;
        after: TimelineKeyframePayload;
    }
    | {
        type: "keyframe.batchDelete";
        items: {
            track: CommandTrackRef;
            frame: number;
            before: TimelineKeyframePayload;
        }[];
    }
    | {
        type: "keyframe.batchMove";
        deltaFrames: -1 | 1;
        items: {
            track: CommandTrackRef;
            fromFrame: number;
            toFrame: number;
            before: TimelineKeyframePayload;
            overwritten: TimelineKeyframePayload | null;
        }[];
    }
    | {
        type: "keyframe.batchPaste";
        pasteBaseFrame: number;
        items: {
            track: CommandTrackRef;
            sourceFrame: number;
            targetFrame: number;
            before: TimelineKeyframePayload | null;
            after: TimelineKeyframePayload;
        }[];
    }
    | {
        type: "keyframe.batchCorrect";
        correctionKind: "bone" | "camera" | "morph";
        items: {
            track: CommandTrackRef;
            frame: number;
            before: TimelineKeyframePayload;
            after: TimelineKeyframePayload;
        }[];
    }
    | {
        type: "keyframe.frameColumnEdit";
        mode: "insert" | "delete";
        anchorFrame: number;
        before: {
            track: CommandTrackRef;
            frame: number;
            payload: TimelineKeyframePayload;
        }[];
        after: {
            track: CommandTrackRef;
            frame: number;
            payload: TimelineKeyframePayload;
        }[];
    };

export type BoneTransformCommandSnapshot = {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
};

export type CameraTransformCommandSnapshot = {
    target: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    distance: number;
    fov: number;
};

export type EditCommandDiff =
    | ModelMotionClearDiff
    | MorphWeightBatch
    | BonePoseBatch
    | ObjectStateEdit
    | {
        type: "edit.morphWeight";
        modelInstanceId: string;
        morphName: string;
        frame: number;
        before: number;
        after: number;
    }
    | {
        type: "edit.boneTransform";
        modelInstanceId: string;
        boneName: string;
        frame: number;
        before: BoneTransformCommandSnapshot;
        after: BoneTransformCommandSnapshot;
    }
    | {
        type: "edit.cameraTransform";
        frame: number;
        before: CameraTransformCommandSnapshot;
        after: CameraTransformCommandSnapshot;
    };

export type CommandDiff = KeyframeCommandDiff | EditCommandDiff | { type: "effect.externalWgsl"; changes: import("../external-wgsl/contract").EffectChange[] };

export type BuiltCommand = {
    id: string;
    label: string;
    scope: CommandScope;
    diff: CommandDiff;
    mergeKey?: string;
    createdAtMs: number;
};

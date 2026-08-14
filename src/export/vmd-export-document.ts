export type VmdVector3 = readonly [number, number, number];
export type VmdQuaternion = readonly [number, number, number, number];
export type VmdBezier = readonly [number, number, number, number];

export type VmdBoneKey = {
    boneName: string;
    frame: number;
    position: VmdVector3;
    rotation: VmdQuaternion;
    positionInterpolations: readonly [VmdBezier, VmdBezier, VmdBezier];
    rotationInterpolation: VmdBezier;
    physicsEnabled: boolean;
};

export type VmdMorphKey = {
    morphName: string;
    frame: number;
    weight: number;
};

export type VmdPropertyKey = {
    frame: number;
    visible: boolean;
    ikStates: readonly { boneName: string; enabled: boolean }[];
};

export type VmdCameraKey = {
    frame: number;
    distance: number;
    position: VmdVector3;
    rotation: VmdVector3;
    positionInterpolations: readonly [VmdBezier, VmdBezier, VmdBezier];
    rotationInterpolation: VmdBezier;
    distanceInterpolation: VmdBezier;
    fov: number;
    fovInterpolation: VmdBezier;
};

export type VmdExportDocument =
    | {
        kind: "model";
        modelName: string;
        boneKeys: readonly VmdBoneKey[];
        morphKeys: readonly VmdMorphKey[];
        propertyKeys: readonly VmdPropertyKey[];
        unsupportedExternalParentKeyCount: number;
      }
    | {
        kind: "camera";
        cameraKeys: readonly VmdCameraKey[];
        unsupportedExternalParentKeyCount: number;
      };

export type VmdExportIssueCode =
    | "empty_motion"
    | "invalid_document"
    | "invalid_frame"
    | "invalid_fov"
    | "duplicate_key"
    | "invalid_track_length"
    | "non_finite_value"
    | "invalid_interpolation"
    | "invalid_count"
    | "file_too_large"
    | "unencodable_name"
    | "name_too_long"
    | "encoded_name_collision"
    | "model_name_truncated"
    | "model_name_fallback"
    | "camera_fov_rounded"
    | "unusual_morph_weight"
    | "unsupported_external_parent";

export type VmdExportIssue = {
    severity: "error" | "warning";
    code: VmdExportIssueCode;
    section?: "header" | "bone" | "morph" | "camera" | "property";
    trackName?: string;
    frame?: number;
    message: string;
};

export type VmdSaveResult =
    | { status: "saved"; filePath: string; byteLength: number; warnings: VmdExportIssue[] }
    | { status: "cancelled" }
    | { status: "invalid"; errors: VmdExportIssue[]; warnings: VmdExportIssue[] }
    | { status: "failed"; message: string };

export const VMD_LINEAR_BEZIER: VmdBezier = [20, 107, 20, 107];
export const VMD_CAMERA_MODEL_NAME = "カメラ・照明";

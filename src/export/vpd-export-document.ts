export type VpdVector3 = readonly [number, number, number];
export type VpdQuaternion = readonly [number, number, number, number];

export type VpdBonePose = {
    boneName: string;
    position: VpdVector3;
    rotation: VpdQuaternion;
};

export type VpdExportDocument = {
    modelName: string;
    bones: readonly VpdBonePose[];
    unsupportedExternalParentBoneCount: number;
};

export type VpdExportIssueCode =
    | "empty_pose"
    | "invalid_document"
    | "duplicate_bone"
    | "non_finite_value"
    | "invalid_rotation"
    | "invalid_name"
    | "unencodable_name"
    | "encoded_name_collision"
    | "model_name_fallback"
    | "unsupported_external_parent";

export type VpdExportIssue = {
    severity: "error" | "warning";
    code: VpdExportIssueCode;
    boneName?: string;
    message: string;
};

export type VpdSaveResult =
    | { status: "saved"; filePath: string; byteLength: number; warnings: VpdExportIssue[] }
    | { status: "cancelled" }
    | { status: "invalid"; errors: VpdExportIssue[]; warnings: VpdExportIssue[] }
    | { status: "failed"; message: string };

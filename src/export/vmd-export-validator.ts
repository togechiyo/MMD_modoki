import {
    type VmdBezier,
    type VmdBoneKey,
    type VmdCameraKey,
    type VmdExportIssue,
    type VmdMorphKey,
    type VmdPropertyKey,
} from "./vmd-export-document";
import { encodeShiftJisFixedString, fixedStringByteKey } from "./shift-jis-fixed-string";

const UINT32_MAX = 0xffffffff;

const issue = (
    severity: VmdExportIssue["severity"],
    code: VmdExportIssue["code"],
    message: string,
    details: Partial<Omit<VmdExportIssue, "severity" | "code" | "message">> = {},
): VmdExportIssue => ({ severity, code, message, ...details });

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const isFrame = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;

const isFiniteNumberArray = (value: unknown, length: number): value is readonly number[] =>
    Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));

const isBezier = (value: unknown): value is VmdBezier =>
    Array.isArray(value)
    && value.length === 4
    && value.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 127);

function validateBezier(
    value: unknown,
    issues: VmdExportIssue[],
    section: VmdExportIssue["section"],
    frame: number | undefined,
    label: string,
): void {
    if (!isBezier(value)) {
        issues.push(issue("error", "invalid_interpolation", `${label} must contain four integer values in 0..127`, { section, frame }));
    }
}

function validateBindingNames(
    entries: readonly { name: unknown; frame?: number }[],
    fieldLength: number,
    section: "bone" | "morph" | "property",
    issues: VmdExportIssue[],
): void {
    const sourceByBytes = new Map<string, string>();
    for (const entry of entries) {
        if (typeof entry.name !== "string" || entry.name.length === 0) {
            issues.push(issue("error", "invalid_document", `${section} binding name must not be empty`, { section, frame: entry.frame }));
            continue;
        }
        const encoded = encodeShiftJisFixedString(entry.name, fieldLength, false);
        if ("reason" in encoded) {
            issues.push(issue(
                "error",
                encoded.reason === "unencodable" ? "unencodable_name" : "name_too_long",
                encoded.reason === "unencodable"
                    ? `${section} name contains a character that cannot be encoded as Shift-JIS: ${entry.name}`
                    : `${section} name exceeds ${fieldLength} Shift-JIS bytes: ${entry.name}`,
                { section, frame: entry.frame, trackName: entry.name },
            ));
            continue;
        }
        const byteKey = fixedStringByteKey(encoded.bytes);
        const previous = sourceByBytes.get(byteKey);
        if (previous !== undefined && previous !== entry.name) {
            issues.push(issue("error", "encoded_name_collision", `${section} names encode to the same fixed bytes: ${previous} / ${entry.name}`, {
                section,
                frame: entry.frame,
                trackName: entry.name,
            }));
        } else {
            sourceByBytes.set(byteKey, entry.name);
        }
    }
}

function validateBoneKey(value: unknown, issues: VmdExportIssue[]): value is VmdBoneKey {
    if (!isRecord(value)) {
        issues.push(issue("error", "invalid_document", "Bone key must be an object", { section: "bone" }));
        return false;
    }
    const frame = isFrame(value.frame) ? value.frame : undefined;
    if (frame === undefined) issues.push(issue("error", "invalid_frame", "Bone frame must be an unsigned 32-bit integer", { section: "bone" }));
    if (!isFiniteNumberArray(value.position, 3) || !isFiniteNumberArray(value.rotation, 4)) {
        issues.push(issue("error", "non_finite_value", "Bone position and rotation must contain finite values", { section: "bone", frame }));
    }
    if (!Array.isArray(value.positionInterpolations) || value.positionInterpolations.length !== 3) {
        issues.push(issue("error", "invalid_track_length", "Bone position interpolation must contain X/Y/Z curves", { section: "bone", frame }));
    } else {
        value.positionInterpolations.forEach((curve, index) => validateBezier(curve, issues, "bone", frame, `Bone position interpolation ${index}`));
    }
    validateBezier(value.rotationInterpolation, issues, "bone", frame, "Bone rotation interpolation");
    if (typeof value.physicsEnabled !== "boolean") {
        issues.push(issue("error", "invalid_document", "Bone physicsEnabled must be boolean", { section: "bone", frame }));
    }
    return true;
}

function validateMorphKey(value: unknown, issues: VmdExportIssue[]): value is VmdMorphKey {
    if (!isRecord(value)) {
        issues.push(issue("error", "invalid_document", "Morph key must be an object", { section: "morph" }));
        return false;
    }
    const frame = isFrame(value.frame) ? value.frame : undefined;
    if (frame === undefined) issues.push(issue("error", "invalid_frame", "Morph frame must be an unsigned 32-bit integer", { section: "morph" }));
    if (typeof value.weight !== "number" || !Number.isFinite(value.weight)) {
        issues.push(issue("error", "non_finite_value", "Morph weight must be finite", { section: "morph", frame }));
    } else if (value.weight < 0 || value.weight > 1) {
        issues.push(issue("warning", "unusual_morph_weight", `Morph weight is outside 0..1: ${value.weight}`, { section: "morph", frame }));
    }
    return true;
}

function validatePropertyKey(value: unknown, issues: VmdExportIssue[]): value is VmdPropertyKey {
    if (!isRecord(value)) {
        issues.push(issue("error", "invalid_document", "Property key must be an object", { section: "property" }));
        return false;
    }
    const frame = isFrame(value.frame) ? value.frame : undefined;
    if (frame === undefined) issues.push(issue("error", "invalid_frame", "Property frame must be an unsigned 32-bit integer", { section: "property" }));
    if (typeof value.visible !== "boolean" || !Array.isArray(value.ikStates)) {
        issues.push(issue("error", "invalid_document", "Property visible and ikStates are invalid", { section: "property", frame }));
        return false;
    }
    if (value.ikStates.length > UINT32_MAX) {
        issues.push(issue("error", "invalid_count", "Property IK count exceeds uint32", { section: "property", frame }));
    }
    const seenNames = new Set<string>();
    for (const state of value.ikStates) {
        if (!isRecord(state) || typeof state.boneName !== "string" || typeof state.enabled !== "boolean") {
            issues.push(issue("error", "invalid_document", "Property IK state is invalid", { section: "property", frame }));
            continue;
        }
        if (seenNames.has(state.boneName)) {
            issues.push(issue("error", "duplicate_key", `Duplicate IK state name at frame ${String(frame)}: ${state.boneName}`, {
                section: "property",
                frame,
                trackName: state.boneName,
            }));
        }
        seenNames.add(state.boneName);
    }
    return true;
}

function validateCameraKey(value: unknown, issues: VmdExportIssue[]): value is VmdCameraKey {
    if (!isRecord(value)) {
        issues.push(issue("error", "invalid_document", "Camera key must be an object", { section: "camera" }));
        return false;
    }
    const frame = isFrame(value.frame) ? value.frame : undefined;
    if (frame === undefined) issues.push(issue("error", "invalid_frame", "Camera frame must be an unsigned 32-bit integer", { section: "camera" }));
    if (!isFiniteNumberArray(value.position, 3)
        || !isFiniteNumberArray(value.rotation, 3)
        || typeof value.distance !== "number"
        || !Number.isFinite(value.distance)
        || typeof value.fov !== "number"
        || !Number.isFinite(value.fov)) {
        issues.push(issue("error", "non_finite_value", "Camera values must be finite", { section: "camera", frame }));
    }
    if (typeof value.fov === "number" && Number.isFinite(value.fov)) {
        const roundedFov = Math.round(value.fov);
        if (roundedFov < 0 || roundedFov > UINT32_MAX) {
            issues.push(issue("error", "invalid_fov", "Rounded camera FOV must fit uint32", { section: "camera", frame }));
        } else if (roundedFov !== value.fov) {
            issues.push(issue("warning", "camera_fov_rounded", `Camera FOV is rounded from ${value.fov} to ${roundedFov}`, { section: "camera", frame }));
        }
    }
    if (!Array.isArray(value.positionInterpolations) || value.positionInterpolations.length !== 3) {
        issues.push(issue("error", "invalid_track_length", "Camera position interpolation must contain X/Y/Z curves", { section: "camera", frame }));
    } else {
        value.positionInterpolations.forEach((curve, index) => validateBezier(curve, issues, "camera", frame, `Camera position interpolation ${index}`));
    }
    validateBezier(value.rotationInterpolation, issues, "camera", frame, "Camera rotation interpolation");
    validateBezier(value.distanceInterpolation, issues, "camera", frame, "Camera distance interpolation");
    validateBezier(value.fovInterpolation, issues, "camera", frame, "Camera FOV interpolation");
    return true;
}

function validateUniqueFrames(
    entries: readonly unknown[],
    section: "property" | "camera",
    issues: VmdExportIssue[],
): void {
    const frames = new Set<number>();
    for (const entry of entries) {
        if (!isRecord(entry) || !isFrame(entry.frame)) continue;
        if (frames.has(entry.frame)) issues.push(issue("error", "duplicate_key", `Duplicate ${section} frame: ${entry.frame}`, { section, frame: entry.frame }));
        frames.add(entry.frame);
    }
}

export function validateVmdExportDocument(value: unknown): VmdExportIssue[] {
    const issues: VmdExportIssue[] = [];
    if (!isRecord(value) || (value.kind !== "model" && value.kind !== "camera")) {
        return [issue("error", "invalid_document", "VMD export document is invalid")];
    }
    if (!Number.isInteger(value.unsupportedExternalParentKeyCount)
        || (value.unsupportedExternalParentKeyCount as number) < 0) {
        issues.push(issue("error", "invalid_count", "External parent key count must be a non-negative integer"));
    } else if ((value.unsupportedExternalParentKeyCount as number) > 0) {
        issues.push(issue("warning", "unsupported_external_parent", `${value.unsupportedExternalParentKeyCount as number} external-parent keys are not represented in VMD`));
    }

    if (value.kind === "model") {
        if (!Array.isArray(value.boneKeys) || !Array.isArray(value.morphKeys) || !Array.isArray(value.propertyKeys)) {
            issues.push(issue("error", "invalid_document", "Model VMD sections must be arrays"));
            return issues;
        }
        if (value.boneKeys.length + value.morphKeys.length + value.propertyKeys.length === 0) {
            issues.push(issue("error", "empty_motion", "Model motion contains no exportable keys"));
        }
        if (typeof value.modelName !== "string") {
            issues.push(issue("error", "invalid_document", "Model name must be a string", { section: "header" }));
        } else {
            const header = encodeShiftJisFixedString(value.modelName, 20, true);
            if (!header.ok) {
                issues.push(issue("error", "unencodable_name", "Model name contains a character that cannot be encoded as Shift-JIS", { section: "header" }));
            } else if (header.truncated) {
                issues.push(issue("warning", "model_name_truncated", "Model name is truncated to 20 Shift-JIS bytes", { section: "header" }));
            }
        }
        value.boneKeys.forEach((key) => validateBoneKey(key, issues));
        value.morphKeys.forEach((key) => validateMorphKey(key, issues));
        value.propertyKeys.forEach((key) => validatePropertyKey(key, issues));
        validateBindingNames(value.boneKeys.map((key) => ({ name: isRecord(key) ? key.boneName : undefined, frame: isRecord(key) && isFrame(key.frame) ? key.frame : undefined })), 15, "bone", issues);
        validateBindingNames(value.morphKeys.map((key) => ({ name: isRecord(key) ? key.morphName : undefined, frame: isRecord(key) && isFrame(key.frame) ? key.frame : undefined })), 15, "morph", issues);
        const ikNames = value.propertyKeys.flatMap((key) => isRecord(key) && Array.isArray(key.ikStates)
            ? key.ikStates.map((state) => ({ name: isRecord(state) ? state.boneName : undefined, frame: isFrame(key.frame) ? key.frame : undefined }))
            : []);
        validateBindingNames(ikNames, 20, "property", issues);
        const boneBindings = new Set<string>();
        for (const key of value.boneKeys) {
            if (!isRecord(key) || typeof key.boneName !== "string" || !isFrame(key.frame)) continue;
            const binding = `${key.boneName}\u0000${key.frame}`;
            if (boneBindings.has(binding)) issues.push(issue("error", "duplicate_key", `Duplicate bone key: ${key.boneName} at ${key.frame}`, { section: "bone", frame: key.frame, trackName: key.boneName }));
            boneBindings.add(binding);
        }
        const morphBindings = new Set<string>();
        for (const key of value.morphKeys) {
            if (!isRecord(key) || typeof key.morphName !== "string" || !isFrame(key.frame)) continue;
            const binding = `${key.morphName}\u0000${key.frame}`;
            if (morphBindings.has(binding)) issues.push(issue("error", "duplicate_key", `Duplicate morph key: ${key.morphName} at ${key.frame}`, { section: "morph", frame: key.frame, trackName: key.morphName }));
            morphBindings.add(binding);
        }
        validateUniqueFrames(value.propertyKeys, "property", issues);
    } else {
        if (!Array.isArray(value.cameraKeys)) {
            issues.push(issue("error", "invalid_document", "Camera keys must be an array", { section: "camera" }));
            return issues;
        }
        if (value.cameraKeys.length === 0) issues.push(issue("error", "empty_motion", "Camera motion contains no keys", { section: "camera" }));
        value.cameraKeys.forEach((key) => validateCameraKey(key, issues));
        validateUniqueFrames(value.cameraKeys, "camera", issues);
    }
    return issues;
}

import type { VpdExportIssue } from "./vpd-export-document";
import { encodeShiftJisString, fixedStringByteKey } from "./shift-jis-fixed-string";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const isFiniteTuple = (value: unknown, length: number): value is readonly number[] =>
    Array.isArray(value)
    && value.length === length
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));

const issue = (
    severity: VpdExportIssue["severity"],
    code: VpdExportIssue["code"],
    message: string,
    boneName?: string,
): VpdExportIssue => ({ severity, code, message, ...(boneName ? { boneName } : {}) });

function validateGrammarName(
    value: unknown,
    label: string,
    issues: VpdExportIssue[],
    boneName?: string,
): value is string {
    if (typeof value !== "string" || value.length === 0) {
        issues.push(issue("error", "invalid_name", `${label} must not be empty`, boneName));
        return false;
    }
    const hasControlCharacter = Array.from(value).some((character) => (character.codePointAt(0) ?? 0) <= 0x1f);
    if (hasControlCharacter || value.includes("{") || value.includes("}") || value.includes(";") || value.includes("//")) {
        issues.push(issue("error", "invalid_name", `${label} contains a VPD syntax delimiter or control character`, boneName));
        return false;
    }
    const encoded = encodeShiftJisString(value);
    if ("reason" in encoded) {
        issues.push(issue("error", "unencodable_name", `${label} contains a character that cannot be encoded as Shift-JIS: ${encoded.codePoint}`, boneName));
        return false;
    }
    return true;
}

function validateBone(value: unknown, issues: VpdExportIssue[]): void {
    if (!isRecord(value)) {
        issues.push(issue("error", "invalid_document", "VPD bone pose must be an object"));
        return;
    }
    const boneName = typeof value.boneName === "string" ? value.boneName : undefined;
    validateGrammarName(value.boneName, "Bone name", issues, boneName);
    if (!isFiniteTuple(value.position, 3) || !isFiniteTuple(value.rotation, 4)) {
        issues.push(issue("error", "non_finite_value", "VPD position and rotation must contain finite values", boneName));
        return;
    }
    const [x, y, z, w] = value.rotation;
    const norm = Math.hypot(x, y, z, w);
    if (norm < 1e-8 || Math.abs(norm - 1) > 1e-3) {
        issues.push(issue("error", "invalid_rotation", `VPD rotation quaternion must be normalized: ${norm}`, boneName));
    }
}

export function validateVpdExportDocument(value: unknown): VpdExportIssue[] {
    const issues: VpdExportIssue[] = [];
    if (!isRecord(value) || !Array.isArray(value.bones)) {
        return [issue("error", "invalid_document", "VPD export document is invalid")];
    }

    validateGrammarName(value.modelName, "Model name", issues);
    if (value.bones.length === 0) {
        issues.push(issue("error", "empty_pose", "VPD pose contains no selected bones"));
    }
    if (!Number.isInteger(value.unsupportedExternalParentBoneCount)
        || (value.unsupportedExternalParentBoneCount as number) < 0) {
        issues.push(issue("error", "invalid_document", "External-parent bone count must be a non-negative integer"));
    } else if ((value.unsupportedExternalParentBoneCount as number) > 0) {
        issues.push(issue(
            "warning",
            "unsupported_external_parent",
            `${value.unsupportedExternalParentBoneCount as number} selected bones are affected by an external parent that VPD cannot represent`,
        ));
    }

    const sourceNameByBytes = new Map<string, string>();
    const seenNames = new Set<string>();
    for (const bone of value.bones) {
        validateBone(bone, issues);
        if (!isRecord(bone) || typeof bone.boneName !== "string") continue;
        if (seenNames.has(bone.boneName)) {
            issues.push(issue("error", "duplicate_bone", `Duplicate VPD bone pose: ${bone.boneName}`, bone.boneName));
        }
        seenNames.add(bone.boneName);

        const encoded = encodeShiftJisString(bone.boneName);
        if (!encoded.ok) continue;
        const byteKey = fixedStringByteKey(encoded.bytes);
        const previous = sourceNameByBytes.get(byteKey);
        if (previous !== undefined && previous !== bone.boneName) {
            issues.push(issue(
                "error",
                "encoded_name_collision",
                `Bone names encode to the same Shift-JIS bytes: ${previous} / ${bone.boneName}`,
                bone.boneName,
            ));
        } else {
            sourceNameByBytes.set(byteKey, bone.boneName);
        }
    }
    return issues;
}

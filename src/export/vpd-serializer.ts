import type { VpdExportDocument, VpdExportIssue } from "./vpd-export-document";
import { encodeShiftJisString } from "./shift-jis-fixed-string";
import { validateVpdExportDocument } from "./vpd-export-validator";

export type VpdSerializationResult =
    | { ok: true; bytes: Uint8Array; warnings: VpdExportIssue[] }
    | { ok: false; errors: VpdExportIssue[]; warnings: VpdExportIssue[] };

function formatNumber(value: number): string {
    const normalized = Math.abs(value) < 0.0000005 ? 0 : value;
    return normalized.toFixed(6);
}

const formatTuple = (values: readonly number[]): string => values.map(formatNumber).join(",");

export function serializeVpd(value: unknown): VpdSerializationResult {
    const issues = validateVpdExportDocument(value);
    const errors = issues.filter((entry) => entry.severity === "error");
    const warnings = issues.filter((entry) => entry.severity === "warning");
    if (errors.length > 0) return { ok: false, errors, warnings };

    const document = value as VpdExportDocument;
    const lines: string[] = [
        "Vocaloid Pose Data file",
        "",
        `${document.modelName}.osm; // parent model`,
        `${document.bones.length}; // bone pose count`,
        "",
    ];
    document.bones.forEach((bone, index) => {
        lines.push(
            `Bone${index}{${bone.boneName}`,
            `  ${formatTuple(bone.position)}; // trans x,y,z`,
            `  ${formatTuple(bone.rotation)}; // Quaternion x,y,z,w`,
            "}",
            "",
        );
    });

    const encoded = encodeShiftJisString(lines.join("\r\n"));
    if ("reason" in encoded) {
        return {
            ok: false,
            errors: [issueForUnexpectedEncoding(encoded.codePoint)],
            warnings,
        };
    }
    return { ok: true, bytes: encoded.bytes, warnings };
}

function issueForUnexpectedEncoding(codePoint: string): VpdExportIssue {
    return {
        severity: "error",
        code: "unencodable_name",
        message: `Validated VPD text contains an unencodable character: ${codePoint}`,
    };
}

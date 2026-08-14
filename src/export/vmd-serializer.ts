import {
    VMD_CAMERA_MODEL_NAME,
    type VmdBezier,
    type VmdBoneKey,
    type VmdExportDocument,
    type VmdExportIssue,
} from "./vmd-export-document";
import { encodeShiftJisFixedString } from "./shift-jis-fixed-string";
import { validateVmdExportDocument } from "./vmd-export-validator";

const SIGNATURE = Uint8Array.from([
    0x56, 0x6f, 0x63, 0x61, 0x6c, 0x6f, 0x69, 0x64, 0x20, 0x4d,
    0x6f, 0x74, 0x69, 0x6f, 0x6e, 0x20, 0x44, 0x61, 0x74, 0x61,
    0x20, 0x30, 0x30, 0x30, 0x32, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

export type VmdSerializationResult =
    | { ok: true; bytes: Uint8Array; warnings: VmdExportIssue[] }
    | { ok: false; errors: VmdExportIssue[]; warnings: VmdExportIssue[] };

class VmdBinaryWriter {
    readonly bytes: Uint8Array;
    private readonly view: DataView;
    offset = 0;

    constructor(length: number) {
        this.bytes = new Uint8Array(length);
        this.view = new DataView(this.bytes.buffer);
    }

    writeUint8(value: number): void {
        this.view.setUint8(this.offset, value);
        this.offset += 1;
    }

    writeUint32(value: number): void {
        this.view.setUint32(this.offset, value, true);
        this.offset += 4;
    }

    writeFloat32(value: number): void {
        this.view.setFloat32(this.offset, value, true);
        this.offset += 4;
    }

    writeBytes(value: Uint8Array): void {
        this.bytes.set(value, this.offset);
        this.offset += value.byteLength;
    }
}

function writeVector(writer: VmdBinaryWriter, values: readonly number[]): void {
    values.forEach((value) => writer.writeFloat32(value));
}

export function createBoneInterpolationBytes(key: VmdBoneKey): Uint8Array {
    const [x, y, z] = key.positionInterpolations;
    const r = key.rotationInterpolation;
    const rows = [
        [x[0], y[0], key.physicsEnabled ? 0 : 0x63, key.physicsEnabled ? 0 : 0x0f, x[2], y[2], z[2], r[2], x[1], y[1], z[1], r[1], x[3], y[3], z[3], r[3]],
        [y[0], z[0], r[0], x[2], y[2], z[2], r[2], x[1], y[1], z[1], r[1], x[3], y[3], z[3], r[3], 0],
        [z[0], r[0], x[2], y[2], z[2], r[2], x[1], y[1], z[1], r[1], x[3], y[3], z[3], r[3], 0, 0],
        [r[0], x[2], y[2], z[2], r[2], x[1], y[1], z[1], r[1], x[3], y[3], z[3], r[3], 0, 0, 0],
    ];
    return Uint8Array.from(rows.flat());
}

function encodeRequired(value: string, length: number, allowTruncate: boolean): Uint8Array {
    const encoded = encodeShiftJisFixedString(value, length, allowTruncate);
    if (!encoded.ok) throw new Error(`Validated Shift-JIS string could not be encoded: ${value}`);
    return encoded.bytes;
}

function writeBezier(writer: VmdBinaryWriter, bezier: VmdBezier): void {
    bezier.forEach((value) => writer.writeUint8(value));
}

function calculateByteLength(document: VmdExportDocument): number {
    if (document.kind === "camera") return 74 + document.cameraKeys.length * 61;
    return 74
        + document.boneKeys.length * 111
        + document.morphKeys.length * 23
        + document.propertyKeys.reduce((total, key) => total + 9 + key.ikStates.length * 21, 0);
}

export function serializeVmd(value: unknown): VmdSerializationResult {
    const issues = validateVmdExportDocument(value);
    const errors = issues.filter((entry) => entry.severity === "error");
    const warnings = issues.filter((entry) => entry.severity === "warning");
    if (errors.length > 0) return { ok: false, errors, warnings };

    const document = value as VmdExportDocument;
    const byteLength = calculateByteLength(document);
    if (!Number.isSafeInteger(byteLength)) {
        return {
            ok: false,
            errors: [{ severity: "error", code: "file_too_large", message: "VMD file length exceeds the safe integer range" }],
            warnings,
        };
    }

    let writer: VmdBinaryWriter;
    try {
        writer = new VmdBinaryWriter(byteLength);
    } catch {
        return {
            ok: false,
            errors: [{ severity: "error", code: "file_too_large", message: "VMD output buffer could not be allocated" }],
            warnings,
        };
    }

    writer.writeBytes(SIGNATURE);
    writer.writeBytes(encodeRequired(document.kind === "model" ? document.modelName : VMD_CAMERA_MODEL_NAME, 20, true));

    if (document.kind === "model") {
        writer.writeUint32(document.boneKeys.length);
        for (const key of document.boneKeys) {
            writer.writeBytes(encodeRequired(key.boneName, 15, false));
            writer.writeUint32(key.frame);
            writeVector(writer, key.position);
            writeVector(writer, key.rotation);
            writer.writeBytes(createBoneInterpolationBytes(key));
        }
        writer.writeUint32(document.morphKeys.length);
        for (const key of document.morphKeys) {
            writer.writeBytes(encodeRequired(key.morphName, 15, false));
            writer.writeUint32(key.frame);
            writer.writeFloat32(key.weight);
        }
        writer.writeUint32(0);
    } else {
        writer.writeUint32(0);
        writer.writeUint32(0);
        writer.writeUint32(document.cameraKeys.length);
        for (const key of document.cameraKeys) {
            writer.writeUint32(key.frame);
            writer.writeFloat32(key.distance);
            writeVector(writer, key.position);
            writeVector(writer, key.rotation);
            key.positionInterpolations.forEach((bezier) => writeBezier(writer, bezier));
            writeBezier(writer, key.rotationInterpolation);
            writeBezier(writer, key.distanceInterpolation);
            writeBezier(writer, key.fovInterpolation);
            writer.writeUint32(Math.round(key.fov));
            writer.writeUint8(0);
        }
    }

    writer.writeUint32(0);
    writer.writeUint32(0);

    if (document.kind === "model") {
        writer.writeUint32(document.propertyKeys.length);
        for (const key of document.propertyKeys) {
            writer.writeUint32(key.frame);
            writer.writeUint8(key.visible ? 1 : 0);
            writer.writeUint32(key.ikStates.length);
            for (const state of key.ikStates) {
                writer.writeBytes(encodeRequired(state.boneName, 20, false));
                writer.writeUint8(state.enabled ? 1 : 0);
            }
        }
    } else {
        writer.writeUint32(0);
    }

    if (writer.offset !== byteLength) throw new Error(`VMD writer length mismatch: ${writer.offset} !== ${byteLength}`);
    return { ok: true, bytes: writer.bytes, warnings };
}

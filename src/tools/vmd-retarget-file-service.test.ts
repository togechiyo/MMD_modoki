import { describe, expect, it } from "vitest";

import type { VmdExportDocument } from "../export/vmd-export-document";
import { serializeVmd } from "../export/vmd-serializer";
import { parseVmdModelDocument } from "./vmd-retarget-file-service";

function serialize(document: VmdExportDocument): Uint8Array {
    const result = serializeVmd(document);
    if ("errors" in result) throw new Error(result.errors.map((entry) => entry.message).join("\n"));
    return result.bytes;
}

describe("VMD retarget file service", () => {
    it("preserves model interpolation, physics and property keys while parsing", () => {
        const bytes = serialize({
            kind: "model",
            modelName: "元モデル",
            boneKeys: [{
                boneName: "センター",
                frame: 12,
                position: [1, 2, 3],
                rotation: [0, 0.5, 0, 0.8660254],
                positionInterpolations: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
                rotationInterpolation: [13, 14, 15, 16],
                physicsEnabled: false,
            }],
            morphKeys: [{ morphName: "笑い", frame: 8, weight: 0.5 }],
            propertyKeys: [{
                frame: 4,
                visible: false,
                ikStates: [{ boneName: "左足ＩＫ", enabled: true }],
            }],
            unsupportedExternalParentKeyCount: 0,
        });

        const parsed = parseVmdModelDocument(bytes);
        expect(parsed.kind).toBe("model");
        if (parsed.kind !== "model") return;
        expect(parsed.boneKeys[0]).toMatchObject({
            boneName: "センター",
            frame: 12,
            positionInterpolations: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
            rotationInterpolation: [13, 14, 15, 16],
            physicsEnabled: false,
        });
        expect(parsed.morphKeys).toEqual([{ morphName: "笑い", frame: 8, weight: 0.5 }]);
        expect(parsed.propertyKeys).toEqual([{
            frame: 4,
            visible: false,
            ikStates: [{ boneName: "左足ＩＫ", enabled: true }],
        }]);
    });

    it("rejects camera VMD input", () => {
        const bytes = serialize({
            kind: "camera",
            cameraKeys: [{
                frame: 0,
                distance: -30,
                position: [0, 10, 0],
                rotation: [0, 0, 0],
                positionInterpolations: [[20, 107, 20, 107], [20, 107, 20, 107], [20, 107, 20, 107]],
                rotationInterpolation: [20, 107, 20, 107],
                distanceInterpolation: [20, 107, 20, 107],
                fov: 45,
                fovInterpolation: [20, 107, 20, 107],
            }],
            unsupportedExternalParentKeyCount: 0,
        });
        expect(() => parseVmdModelDocument(bytes)).toThrow(/model motion/);
    });
});

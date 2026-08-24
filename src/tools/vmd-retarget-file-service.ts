import { PmxObject } from "babylon-mmd/esm/Loader/Parser/pmxObject";
import { PmxReader } from "babylon-mmd/esm/Loader/Parser/pmxReader";
import { VmdObject } from "babylon-mmd/esm/Loader/Parser/vmdObject";

import type {
    VmdBezier,
    VmdBoneKey,
    VmdExportDocument,
    VmdMorphKey,
    VmdPropertyKey,
} from "../export/vmd-export-document";
import {
    retargetVmdDocument,
    type VmdRetargetModel,
    type VmdRetargetOptions,
    type VmdRetargetResult,
} from "./vmd-retarget-converter";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bezierAt(interpolation: Uint8Array, axis: number): VmdBezier {
    const offset = axis * 16;
    return [
        interpolation[offset] ?? 20,
        interpolation[offset + 8] ?? 107,
        interpolation[offset + 4] ?? 20,
        interpolation[offset + 12] ?? 107,
    ];
}

export async function parsePmxRetargetModel(bytes: Uint8Array): Promise<VmdRetargetModel> {
    const pmx = await PmxReader.ParseAsync(toArrayBuffer(bytes));
    return {
        modelName: pmx.header.modelName,
        bones: pmx.bones.map((bone) => ({
            name: bone.name,
            englishName: bone.englishName,
            position: [bone.position[0], bone.position[1], bone.position[2]],
            parentBoneIndex: bone.parentBoneIndex,
            tailPosition: typeof bone.tailPosition === "number"
                ? bone.tailPosition
                : [bone.tailPosition[0], bone.tailPosition[1], bone.tailPosition[2]],
            rotatable: (bone.flag & PmxObject.Bone.Flag.IsRotatable) !== 0,
        })),
        morphs: pmx.morphs.map((morph) => ({
            name: morph.name,
            englishName: morph.englishName,
        })),
    };
}

export function parseVmdModelDocument(bytes: Uint8Array): VmdExportDocument {
    const vmd = VmdObject.ParseFromBuffer(toArrayBuffer(bytes));
    if (vmd.cameraKeyFrames.length > 0 || vmd.lightKeyFrames.length > 0 || vmd.selfShadowKeyFrames.length > 0) {
        throw new Error("VMD retargeting requires a model motion, not a camera or scene motion");
    }
    const boneKeys: VmdBoneKey[] = [];
    for (let index = 0; index < vmd.boneKeyFrames.length; index += 1) {
        const key = vmd.boneKeyFrames.get(index);
        const physicsInfo = ((key.interpolation[2] ?? 0) << 8) | (key.interpolation[3] ?? 0);
        boneKeys.push({
            boneName: key.boneName,
            frame: key.frameNumber,
            position: [key.position[0], key.position[1], key.position[2]],
            rotation: [key.rotation[0], key.rotation[1], key.rotation[2], key.rotation[3]],
            positionInterpolations: [
                bezierAt(key.interpolation, 0),
                bezierAt(key.interpolation, 1),
                bezierAt(key.interpolation, 2),
            ],
            rotationInterpolation: bezierAt(key.interpolation, 3),
            physicsEnabled: physicsInfo === VmdObject.BoneKeyFramePhysicsInfoKind.On,
        });
    }

    const morphKeys: VmdMorphKey[] = [];
    for (let index = 0; index < vmd.morphKeyFrames.length; index += 1) {
        const key = vmd.morphKeyFrames.get(index);
        morphKeys.push({
            morphName: key.morphName,
            frame: key.frameNumber,
            weight: key.weight,
        });
    }

    const propertyKeys: VmdPropertyKey[] = vmd.propertyKeyFrames.map((key) => ({
        frame: key.frameNumber,
        visible: key.visible,
        ikStates: key.ikStates.map(([boneName, enabled]) => ({ boneName, enabled })),
    }));

    return {
        kind: "model",
        modelName: "VMD source",
        boneKeys,
        morphKeys,
        propertyKeys,
        unsupportedExternalParentKeyCount: 0,
    };
}

export async function convertVmdForPmxModels(
    sourcePmxBytes: Uint8Array,
    sourceVmdBytes: Uint8Array,
    targetPmxBytes: Uint8Array,
    options: VmdRetargetOptions,
): Promise<VmdRetargetResult> {
    const [sourceModel, targetModel] = await Promise.all([
        parsePmxRetargetModel(sourcePmxBytes),
        parsePmxRetargetModel(targetPmxBytes),
    ]);
    const sourceDocument = parseVmdModelDocument(sourceVmdBytes);
    return retargetVmdDocument(sourceModel, targetModel, sourceDocument, options);
}

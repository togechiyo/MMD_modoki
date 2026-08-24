import { describe, expect, it } from "vitest";

import type { VmdExportDocument } from "../export/vmd-export-document";
import {
    retargetVmdDocument,
    type VmdRetargetBone,
    type VmdRetargetModel,
} from "./vmd-retarget-converter";

const linear = [20, 107, 20, 107] as const;

function bone(
    name: string,
    englishName: string,
    position: readonly [number, number, number],
    parentBoneIndex: number,
    tailPosition: number | readonly [number, number, number],
): VmdRetargetBone {
    return { name, englishName, position, parentBoneIndex, tailPosition, rotatable: true };
}

function createModel(scale: number, english = false): VmdRetargetModel {
    const names = english
        ? ["Center", "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "LeftLegIK", "LeftUpperArm", "LeftLowerArm", "LeftHand"]
        : ["センター", "左足", "左ひざ", "左足首", "左足ＩＫ", "左腕", "左ひじ", "左手首"];
    const japanese = ["センター", "左足", "左ひざ", "左足首", "左足ＩＫ", "左腕", "左ひじ", "左手首"];
    return {
        modelName: english ? "Target" : "Source",
        bones: [
            bone(names[0], japanese[0], [0, 10 * scale, 0], -1, 1),
            bone(names[1], japanese[1], [0, 10 * scale, 0], 0, 2),
            bone(names[2], japanese[2], [0, 5 * scale, 0], 1, 3),
            bone(names[3], japanese[3], [0, 0, 0], 2, [0, 0, -scale]),
            bone(names[4], japanese[4], [0, 0, 0], 0, 3),
            bone(names[5], japanese[5], [2 * scale, 15 * scale, 0], 0, 6),
            bone(names[6], japanese[6], [6 * scale, 15 * scale, 0], 5, 7),
            bone(names[7], japanese[7], [9 * scale, 15 * scale, 0], 6, [scale, 0, 0]),
        ],
        morphs: [{ name: english ? "Blink" : "まばたき", englishName: english ? "まばたき" : "Blink" }],
    };
}

function createMotion(): VmdExportDocument {
    return {
        kind: "model",
        modelName: "Source",
        boneKeys: [
            {
                boneName: "センター",
                frame: 0,
                position: [1, 2, 3],
                rotation: [0, 0, 0, 1],
                positionInterpolations: [linear, linear, linear],
                rotationInterpolation: linear,
                physicsEnabled: true,
            },
            {
                boneName: "左足ＩＫ",
                frame: 10,
                position: [2, 4, 6],
                rotation: [0, 0, 0, 1],
                positionInterpolations: [linear, linear, linear],
                rotationInterpolation: linear,
                physicsEnabled: false,
            },
        ],
        morphKeys: [{ morphName: "まばたき", frame: 3, weight: 0.5 }],
        propertyKeys: [{ frame: 0, visible: true, ikStates: [{ boneName: "左足ＩＫ", enabled: true }] }],
        unsupportedExternalParentKeyCount: 0,
    };
}

describe("VMD retarget converter", () => {
    it("標準名をtarget名へ変換し、rootと足IKの位置を体格比で補正する", () => {
        const result = retargetVmdDocument(createModel(1), createModel(2, true), createMotion(), {
            retargetRotations: false,
            correctRootPosition: true,
            correctFootIkPosition: true,
        });
        if (result.document.kind !== "model") throw new Error("expected model VMD");

        expect(result.document.modelName).toBe("Target");
        expect(result.document.boneKeys.map((key) => [key.boneName, key.position])).toEqual([
            ["Center", [2, 4, 6]],
            ["LeftLegIK", [4, 8, 12]],
        ]);
        expect(result.document.morphKeys).toEqual([{ morphName: "Blink", frame: 3, weight: 0.5 }]);
        expect(result.document.propertyKeys[0].ikStates).toEqual([{ boneName: "LeftLegIK", enabled: true }]);
        expect(result.report.positionKeyCount).toBe(2);
        expect(result.report.omittedBoneTracks).toEqual([]);
    });

    it("bone方向差を使って回転軸をsourceからtargetへ写す", () => {
        const source: VmdRetargetModel = {
            modelName: "Source",
            bones: [bone("左腕", "LeftArm", [0, 0, 0], -1, [1, 0, 0])],
            morphs: [],
        };
        const target: VmdRetargetModel = {
            modelName: "Target",
            bones: [bone("LeftArm", "左腕", [0, 0, 0], -1, [0, 1, 0])],
            morphs: [],
        };
        const motion: VmdExportDocument = {
            kind: "model",
            modelName: "Source",
            boneKeys: [{
                boneName: "左腕",
                frame: 0,
                position: [0, 0, 0],
                rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
                positionInterpolations: [linear, linear, linear],
                rotationInterpolation: linear,
                physicsEnabled: true,
            }],
            morphKeys: [],
            propertyKeys: [],
            unsupportedExternalParentKeyCount: 0,
        };

        const result = retargetVmdDocument(source, target, motion, {
            retargetRotations: true,
            correctRootPosition: false,
            correctFootIkPosition: false,
        });
        if (result.document.kind !== "model") throw new Error("expected model VMD");
        const rotation = result.document.boneKeys[0].rotation;
        expect(rotation[0]).toBeCloseTo(0, 6);
        expect(Math.abs(rotation[1])).toBeCloseTo(Math.SQRT1_2, 6);
        expect(rotation[2]).toBeCloseTo(0, 6);
        expect(Math.abs(rotation[3])).toBeCloseTo(Math.SQRT1_2, 6);
        expect(result.report.rotationKeyCount).toBe(1);
    });

    it("targetに存在しないboneとmorphを除外して報告する", () => {
        const motion = createMotion();
        if (motion.kind !== "model") throw new Error("expected model VMD");
        motion.boneKeys = [...motion.boneKeys, { ...motion.boneKeys[0], boneName: "追加ボーン" }];
        motion.morphKeys = [...motion.morphKeys, { morphName: "追加モーフ", frame: 4, weight: 1 }];

        const result = retargetVmdDocument(createModel(1), createModel(1, true), motion, {
            retargetRotations: false,
            correctRootPosition: false,
            correctFootIkPosition: false,
        });

        expect(result.report.omittedBoneTracks).toEqual(["追加ボーン"]);
        expect(result.report.omittedMorphTracks).toEqual(["追加モーフ"]);
    });
});

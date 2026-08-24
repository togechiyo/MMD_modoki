import { describe, expect, it } from "vitest";
import type { MovableBoneKeyframePayload } from "./timeline-edit-service";
import {
    applyModelBodyMotionCorrection,
    createModelBodyCorrectionPlan,
    createModelBodyProfile,
    type ModelRestBone,
} from "./model-body-motion-correction";

function createBody(scale = 1): ModelRestBone[] {
    const point = (name: string, x: number, y: number, z = 0): ModelRestBone => ({
        name,
        position: [x * scale, y * scale, z * scale],
    });
    return [
        point("センター", 0, 10),
        point("左足", 2, 10),
        point("左ひざ", 2, 5),
        point("左足首", 2, 0),
        point("左つま先", 2, 0, -2),
        point("右足", -2, 10),
        point("右ひざ", -2, 5),
        point("右足首", -2, 0),
        point("右つま先", -2, 0, -2),
        point("左腕", 3, 15),
        point("左ひじ", 7, 15),
        point("左手首", 10, 15),
        point("右腕", -3, 15),
        point("右ひじ", -7, 15),
        point("右手首", -10, 15),
    ];
}

function movablePayload(position: readonly [number, number, number]): MovableBoneKeyframePayload {
    return {
        kind: "movableBone",
        positions: [...position],
        positionInterpolations: [20, 107, 20, 107, 20, 107, 20, 107, 20, 107, 20, 107],
        rotations: [0, 0, 0, 1],
        rotationInterpolations: [20, 107, 20, 107],
        physicsToggles: [1],
    };
}

describe("model body motion correction", () => {
    it("PMX標準ボーンの基準位置から腰高・脚長・腕長を計測する", () => {
        const profile = createModelBodyProfile(createBody(2));

        expect(profile.valid).toBe(true);
        expect(profile.centerHeight).toBeCloseTo(20);
        expect(profile.leftLegLength).toBeCloseTo(20);
        expect(profile.rightLegLength).toBeCloseTo(20);
        expect(profile.leftArmLength).toBeCloseTo(14);
        expect(profile.rightArmLength).toBeCloseTo(14);
    });

    it("補正元と適用先の体格比を部位別に算出する", () => {
        const plan = createModelBodyCorrectionPlan(
            createModelBodyProfile(createBody(1)),
            createModelBodyProfile(createBody(1.5)),
        );

        expect(plan.valid).toBe(true);
        expect(plan.globalScale).toBeCloseTo(1.5);
        expect(plan.leftLegScale).toBeCloseTo(1.5);
        expect(plan.rightLegScale).toBeCloseTo(1.5);
    });

    it("基本的な英語ボーン名でも体格を計測する", () => {
        const englishBones = createBody(1).map((bone) => ({
            ...bone,
            name: ({
                "センター": "Center",
                "左足": "LeftUpperLeg",
                "左ひざ": "LeftLowerLeg",
                "左足首": "LeftFoot",
                "右足": "RightUpperLeg",
                "右ひざ": "RightLowerLeg",
                "右足首": "RightFoot",
                "左腕": "LeftUpperArm",
                "左ひじ": "LeftLowerArm",
                "左手首": "LeftHand",
                "右腕": "RightUpperArm",
                "右ひじ": "RightLowerArm",
                "右手首": "RightHand",
            } as Record<string, string>)[bone.name] ?? bone.name,
        }));

        const profile = createModelBodyProfile(englishBones);
        expect(profile.valid).toBe(true);
        expect(profile.centerHeight).toBeCloseTo(10);
        expect(profile.leftLegLength).toBeCloseTo(10);
        expect(profile.rightArmLength).toBeCloseTo(7);
    });

    it("センター移動を全身体格比で補正し、回転と補間を保持する", () => {
        const plan = createModelBodyCorrectionPlan(
            createModelBodyProfile(createBody(1)),
            createModelBodyProfile(createBody(2)),
        );
        const before = movablePayload([1, 2, 3]);
        const after = applyModelBodyMotionCorrection("センター", before, plan);

        expect(after?.positions).toEqual([2, 4, 6]);
        expect(after?.rotations).toBe(before.rotations);
        expect(after?.positionInterpolations).toBe(before.positionInterpolations);
        expect(after?.physicsToggles).toBe(before.physicsToggles);
    });

    it("足IKは対応する脚長比を使い、全角半角のIK表記を吸収する", () => {
        const target = createBody(1);
        const leftKnee = target.find((bone) => bone.name === "左ひざ");
        const leftAnkle = target.find((bone) => bone.name === "左足首");
        if (!leftKnee || !leftAnkle) throw new Error("test body is missing left leg bones");
        leftKnee.position = [2, 7.5, 0];
        leftAnkle.position = [2, 5, 0];
        const plan = createModelBodyCorrectionPlan(
            createModelBodyProfile(createBody(1)),
            createModelBodyProfile(target),
        );

        expect(plan.leftLegScale).toBeCloseTo(0.5);
        expect(applyModelBodyMotionCorrection("左足ＩＫ", movablePayload([2, 4, 6]), plan)?.positions)
            .toEqual([1, 2, 3]);
        expect(applyModelBodyMotionCorrection("左足IK", movablePayload([2, 4, 6]), plan)?.positions)
            .toEqual([1, 2, 3]);
    });

    it("対象外ボーンと計測不能なモデルは補正しない", () => {
        const invalidPlan = createModelBodyCorrectionPlan(
            createModelBodyProfile([]),
            createModelBodyProfile(createBody(1)),
        );
        expect(invalidPlan.valid).toBe(false);
        expect(applyModelBodyMotionCorrection("センター", movablePayload([1, 2, 3]), invalidPlan)).toBeNull();

        const validPlan = createModelBodyCorrectionPlan(
            createModelBodyProfile(createBody(1)),
            createModelBodyProfile(createBody(2)),
        );
        expect(applyModelBodyMotionCorrection("左手首", movablePayload([1, 2, 3]), validPlan)).toBeNull();
    });
});

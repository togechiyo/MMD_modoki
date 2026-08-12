import { describe, expect, it } from "vitest";

import { collectModelBoneInfo } from "../../src/assets/model-bone-metadata";

const VISIBLE_ROTATABLE_MOVABLE_CONTROLLABLE = 0x001e;

describe("collectModelBoneInfo", () => {
    it("keeps a PMX-visible dynamic physics bone in the normal editing list", () => {
        const result = collectModelBoneInfo(
            [
                { name: "a遅延0", flag: VISIBLE_ROTATABLE_MOVABLE_CONTROLLABLE },
                { name: "a遅延1", flag: VISIBLE_ROTATABLE_MOVABLE_CONTROLLABLE },
            ],
            [
                { boneIndex: 0, physicsMode: 0 },
                { boneIndex: 1, physicsMode: 1 },
            ],
        );

        expect(result.boneNames).toEqual(["a遅延0", "a遅延1"]);
        expect(result.physicsBoneNames).toEqual(["a遅延1"]);
        expect(result.boneControlInfos.map((info) => info.name)).toEqual(["a遅延0", "a遅延1"]);
    });

    it("keeps a hidden dynamic bone physics-only for the explicit display toggle", () => {
        const result = collectModelBoneInfo(
            [{ name: "スカート内部", flag: 0x0006 }],
            [{ boneIndex: 0, physicsMode: 1 }],
        );

        expect(result.boneNames).toEqual([]);
        expect(result.physicsBoneNames).toEqual(["スカート内部"]);
        expect(result.boneControlInfos).toEqual([{
            name: "スカート内部",
            movable: true,
            rotatable: true,
            isIk: false,
            isIkAffected: false,
        }]);
    });
});

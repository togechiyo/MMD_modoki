import { describe, expect, it } from "vitest";

import { resolveVisibleBoneNames } from "../../src/editor/physics-bone-visibility";

describe("physics bone viewport visibility", () => {
    it("follows PMX editor visibility while physics bone display is OFF", () => {
        expect([...resolveVisibleBoneNames(
            ["センター", "visible-physics"],
            ["visible-physics", "hidden-physics"],
            false,
        )]).toEqual(["センター", "visible-physics"]);
    });

    it("adds every physics bone while physics bone display is ON", () => {
        expect([...resolveVisibleBoneNames(
            ["センター", "visible-physics"],
            ["visible-physics", "hidden-physics"],
            true,
        )]).toEqual(["センター", "visible-physics", "hidden-physics"]);
    });
});

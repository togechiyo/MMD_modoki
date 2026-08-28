import { describe, expect, it } from "vitest";

import { resolveVisibleBoneNames } from "../../src/editor/physics-bone-visibility";

describe("physics bone viewport visibility", () => {
    it("hides physics bones from the viewport while physics bone display is OFF", () => {
        expect([...resolveVisibleBoneNames(
            ["センター", "visible-physics"],
            ["visible-physics", "hidden-physics"],
            false,
        )]).toEqual(["センター"]);
    });

    it("adds every physics bone while physics bone display is ON", () => {
        expect([...resolveVisibleBoneNames(
            ["センター", "visible-physics"],
            ["visible-physics", "hidden-physics"],
            true,
        )]).toEqual(["センター", "visible-physics", "hidden-physics"]);
    });
});

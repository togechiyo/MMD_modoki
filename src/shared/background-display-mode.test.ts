import { describe, expect, it } from "vitest";
import { normalizeBackgroundDisplayMode } from "./background-display-mode";

describe("normalizeBackgroundDisplayMode", () => {
    it.each(["default", "white", "black", "checker"] as const)("keeps %s", (mode) => {
        expect(normalizeBackgroundDisplayMode(mode)).toBe(mode);
    });

    it("uses the legacy black flag when the mode is missing", () => {
        expect(normalizeBackgroundDisplayMode(undefined, true)).toBe("black");
        expect(normalizeBackgroundDisplayMode(undefined, false)).toBe("default");
    });
});

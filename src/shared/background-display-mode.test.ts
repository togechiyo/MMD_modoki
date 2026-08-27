import { describe, expect, it } from "vitest";
import { normalizeBackgroundDisplayMode } from "./background-display-mode";

describe("normalizeBackgroundDisplayMode", () => {
    it.each(["white", "black", "checker"] as const)("keeps %s", (mode) => {
        expect(normalizeBackgroundDisplayMode(mode)).toBe(mode);
    });

    it("maps the retired default mode to white", () => {
        expect(normalizeBackgroundDisplayMode("default")).toBe("white");
    });

    it("uses the legacy black flag when the mode is missing", () => {
        expect(normalizeBackgroundDisplayMode(undefined, true)).toBe("black");
        expect(normalizeBackgroundDisplayMode(undefined, false)).toBe("white");
    });
});

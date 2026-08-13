import { describe, expect, it } from "vitest";

import {
    DEFAULT_UI_SCALE_PERCENTAGE,
    parseUiScalePercentage,
    uiScalePercentageToZoomFactor,
} from "../../src/shared/ui-scale";

describe("UI scale", () => {
    it("accepts only the UI scale values exposed by the menu", () => {
        expect(parseUiScalePercentage("75")).toBe(75);
        expect(parseUiScalePercentage(100)).toBe(100);
        expect(parseUiScalePercentage("125")).toBe(125);
        expect(parseUiScalePercentage(150)).toBe(150);
    });

    it("falls back to 100% for missing or unsupported persisted values", () => {
        expect(parseUiScalePercentage(null)).toBe(DEFAULT_UI_SCALE_PERCENTAGE);
        expect(parseUiScalePercentage("125.5")).toBe(DEFAULT_UI_SCALE_PERCENTAGE);
        expect(parseUiScalePercentage("200")).toBe(DEFAULT_UI_SCALE_PERCENTAGE);
        expect(parseUiScalePercentage("invalid")).toBe(DEFAULT_UI_SCALE_PERCENTAGE);
    });

    it("converts menu percentages to Electron zoom factors", () => {
        expect(uiScalePercentageToZoomFactor(75)).toBe(0.75);
        expect(uiScalePercentageToZoomFactor(100)).toBe(1);
        expect(uiScalePercentageToZoomFactor(125)).toBe(1.25);
        expect(uiScalePercentageToZoomFactor(150)).toBe(1.5);
    });
});

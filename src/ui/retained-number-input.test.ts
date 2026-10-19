import { describe, expect, it } from "vitest";
import { resolveRetainedNumberInput } from "./retained-number-input";

describe("resolveRetainedNumberInput", () => {
    it("keeps source precision when Enter commits the unchanged displayed number", () => {
        expect(resolveRetainedNumberInput("2.35", "2.35", 2.345678)).toBe(2.345678);
        expect(resolveRetainedNumberInput("0.1", "0.1", 0.15)).toBe(0.15);
    });
    it("keeps the source for numerically equivalent formatting", () => {
        expect(resolveRetainedNumberInput("2.350", "2.35", 2.345678)).toBe(2.345678);
    });
    it("uses a newly entered number without rounding it to the display precision", () => {
        expect(resolveRetainedNumberInput("1234.56789", "2.35", 2.345678)).toBe(1234.56789);
        expect(resolveRetainedNumberInput("-0.125", "30.0", 30)).toBe(-0.125);
    });
});

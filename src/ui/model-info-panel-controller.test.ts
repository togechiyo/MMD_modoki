import { describe, expect, it } from "vitest";
import {
    createModelInfoAccessorySelectValue,
    parseModelInfoAccessorySelectValue,
} from "./model-info-panel-controller";

describe("model info accessory target values", () => {
    it("round-trips an accessory index", () => {
        const value = createModelInfoAccessorySelectValue(12);

        expect(value).toBe("__accessory__:12");
        expect(parseModelInfoAccessorySelectValue(value)).toBe(12);
    });

    it("does not treat camera and model values as accessories", () => {
        expect(parseModelInfoAccessorySelectValue("__camera__")).toBeNull();
        expect(parseModelInfoAccessorySelectValue("0")).toBeNull();
        expect(parseModelInfoAccessorySelectValue("__accessory__:invalid")).toBeNull();
    });
});

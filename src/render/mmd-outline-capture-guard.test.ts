import { describe, expect, it } from "vitest";
import { withoutMmdOutlines } from "./mmd-outline-capture-guard";

describe("MMD outline capture guard", () => {
    it("suppresses enabled outlines only and restores them after a nested capture", () => {
        const enabled = { renderOutline: true, outlineWidth: 0.8 };
        const disabled = { renderOutline: false };
        const ordinary = {};
        const materials = [enabled, disabled, ordinary, enabled];
        expect(withoutMmdOutlines(materials, () => {
            expect(enabled.renderOutline).toBe(false);
            withoutMmdOutlines(materials, () => expect(enabled.renderOutline).toBe(false));
            expect(enabled.renderOutline).toBe(false);
            return 42;
        })).toBe(42);
        expect(enabled).toEqual({ renderOutline: true, outlineWidth: 0.8 });
        expect(disabled.renderOutline).toBe(false);
        expect(ordinary).toEqual({});
    });

    it("restores outlines when rendering throws and preserves the error", () => {
        const material = { renderOutline: true };
        const error = new Error("capture failed");
        expect(() => withoutMmdOutlines([material], () => { throw error; })).toThrow(error);
        expect(material.renderOutline).toBe(true);
    });
});

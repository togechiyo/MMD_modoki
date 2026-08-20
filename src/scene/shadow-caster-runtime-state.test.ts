import { describe, expect, it } from "vitest";
import { shouldEnableShadowSampling } from "./shadow-caster-runtime-state";

describe("shadow caster runtime state", () => {
    it("stops sampling a stale shadow map when the explicit caster list is empty", () => {
        expect(shouldEnableShadowSampling(true, 0)).toBe(false);
    });

    it("restores sampling when an explicit caster is added", () => {
        expect(shouldEnableShadowSampling(true, 1)).toBe(true);
    });

    it("preserves scene-managed shadow maps without an explicit caster list", () => {
        expect(shouldEnableShadowSampling(true, null)).toBe(true);
    });

    it("keeps sampling disabled when shadows are globally disabled", () => {
        expect(shouldEnableShadowSampling(false, 3)).toBe(false);
    });
});

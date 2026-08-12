import { describe, expect, it } from "vitest";
import {
    DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_PHASE_G,
    DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_LIGHT_COLOR,
    DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_SHADOW_COLOR,
    DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_STRENGTH,
    resolveDirectionalLightShaftsSettings,
} from "./directional-light-shafts-settings";

describe("resolveDirectionalLightShaftsSettings", () => {
    it("keeps values in the supported runtime range", () => {
        expect(resolveDirectionalLightShaftsSettings({
            strength: 0.025,
            phaseG: 0.6,
            lightColor: { r: 0.9, g: 0.7, b: 0.5 },
            shadowColor: { r: 0.4, g: 0.5, b: 0.7 },
        })).toEqual({
            strength: 0.025,
            phaseG: 0.6,
            lightColor: { r: 0.9, g: 0.7, b: 0.5 },
            shadowColor: { r: 0.4, g: 0.5, b: 0.7 },
        });
    });

    it("clamps extreme values", () => {
        expect(resolveDirectionalLightShaftsSettings({
            strength: 2,
            phaseG: -2,
            lightColor: { r: 2, g: -1, b: 0.5 },
            shadowColor: { r: -2, g: 0.5, b: 4 },
        })).toEqual({
            strength: 0.16,
            phaseG: -0.9,
            lightColor: { r: 1, g: 0, b: 0.5 },
            shadowColor: { r: 0, g: 0.5, b: 1 },
        });
    });

    it("falls back for non-finite values", () => {
        expect(resolveDirectionalLightShaftsSettings({
            strength: Number.NaN,
            phaseG: Number.POSITIVE_INFINITY,
            lightColor: { r: Number.NaN, g: Number.NaN, b: Number.NaN },
            shadowColor: { r: Number.NaN, g: Number.NaN, b: Number.NaN },
        }))
            .toEqual({
                strength: DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_STRENGTH,
                phaseG: DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_PHASE_G,
                lightColor: DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_LIGHT_COLOR,
                shadowColor: DEFAULT_DIRECTIONAL_LIGHT_SHAFTS_SHADOW_COLOR,
            });
    });
});

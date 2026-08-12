import { describe, expect, it } from "vitest";
import {
    buildFrameGraphResourcePlan,
    type FrameGraphResourcePlanSettings,
} from "./frame-graph-resource-plan";

function createSettings(
    overrides: Partial<FrameGraphResourcePlanSettings> = {},
): FrameGraphResourcePlanSettings {
    return {
        imageProcessingEnabled: false,
        dofEnabled: false,
        luminousEnabled: false,
        luminousIntensity: 0.5,
        bloomEnabled: false,
        lutEnabled: false,
        motionBlurEnabled: false,
        motionBlurStrength: 0.5,
        sharpenEdge: 0,
        grainIntensity: 0,
        chromaticAberration: 0,
        vignetteEnabled: false,
        vignetteWeight: 0,
        edgeBlurStrength: 0,
        lensDistortionEnabled: false,
        lensDistortion: 0,
        ssaoEnabled: false,
        ssaoStrength: 1,
        offsetShadowEnabled: false,
        offsetShadowStrength: 0.35,
        offsetHighlightEnabled: false,
        offsetHighlightStrength: 0.55,
        ssrEnabled: false,
        ssrStrength: 0.3,
        ssgiEnabled: false,
        ssgiStrength: 0.3,
        ssgiSampleRadius: 64,
        oceanEnabled: false,
        aerialPerspectiveEnabled: false,
        antialiasEnabled: true,
        ...overrides,
    };
}

describe("buildFrameGraphResourcePlan", () => {
    it("keeps color-only effects on scene color without geometry resources", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            luminousEnabled: true,
            bloomEnabled: true,
            lutEnabled: true,
        }), ["luminous", "bloom", "lut"]);

        expect(plan.activeEffects).toEqual(["luminous", "bloom", "lut"]);
        expect(plan.requirementKeys).toEqual(["sceneColor", "luminousMask"]);
        expect(plan.needsGeometryRenderer).toBe(false);
        expect(plan.needsDepthRenderer).toBe(false);
        expect(plan.needsLuminousMask).toBe(true);
        expect(plan.requirements).toContainEqual({
            key: "luminousMask",
            consumers: ["luminous"],
            producer: "luminousMask",
            resolution: "full",
        });
    });

    it("uses one geometry plan for SSR and SSAO", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            ssrEnabled: true,
            ssaoEnabled: true,
        }), ["ssao", "ssr"]);

        expect(plan.activeEffects).toEqual(["ssr", "ssao"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.needsDepthRenderer).toBe(false);
        expect(plan.requirements).toContainEqual({
            key: "viewDepth",
            consumers: ["ssr", "ssao"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirements).toContainEqual({
            key: "viewNormal",
            consumers: ["ssr", "ssao"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirements).toContainEqual({
            key: "reflectivity",
            consumers: ["ssr"],
            producer: "geometryRenderer",
            resolution: "full",
        });
    });

    it("uses scene color, view depth, and view normal for single-frame SSGI even at zero strength", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            ssgiEnabled: true,
            ssgiStrength: 0,
        }), ["ssgi"]);

        expect(plan.activeEffects).toEqual(["ssgi"]);
        expect(plan.requirementKeys).toEqual(["sceneColor", "viewDepth", "viewNormal"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.requirements).toContainEqual({
            key: "viewDepth",
            consumers: ["ssgi"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirements).toContainEqual({
            key: "viewNormal",
            consumers: ["ssgi"],
            producer: "geometryRenderer",
            resolution: "full",
        });
    });

    it("shares geometry resources between SSGI, SSAO, and SSR", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            ssgiEnabled: true,
            ssaoEnabled: true,
            ssrEnabled: true,
        }), ["ssao", "ssgi", "ssr"]);

        expect(plan.activeEffects).toEqual(["ssr", "ssgi", "ssao"]);
        expect(plan.requirements).toContainEqual({
            key: "viewDepth",
            consumers: ["ssr", "ssgi", "ssao"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirements).toContainEqual({
            key: "viewNormal",
            consumers: ["ssr", "ssgi", "ssao"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirements).toContainEqual({
            key: "reflectivity",
            consumers: ["ssr"],
            producer: "geometryRenderer",
            resolution: "full",
        });
    });

    it("does not allocate resources for the retired ocean pass", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            oceanEnabled: true,
        }), ["ocean"]);

        expect(plan.activeEffects).toEqual([]);
        expect(plan.requirementKeys).toEqual([]);
        expect(plan.needsGeometryRenderer).toBe(false);
    });

    it("does not request SSGI resources when the stack entry is disabled", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            ssgiEnabled: false,
            ssgiStrength: 0.3,
        }), ["ssgi"]);

        expect(plan.activeEffects).toEqual([]);
        expect(plan.requirementKeys).toEqual([]);
        expect(plan.needsGeometryRenderer).toBe(false);
    });

    it("uses geometry depth for Offset Shadow", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            offsetShadowEnabled: true,
            offsetShadowStrength: 0.55,
        }), ["offsetShadow"]);

        expect(plan.activeEffects).toEqual(["offsetShadow"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.requirements).toContainEqual({
            key: "viewDepth",
            consumers: ["offsetShadow"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirementKeys).not.toContain("viewNormal");
    });

    it("uses geometry depth for Offset Rim", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            offsetHighlightEnabled: true,
            offsetHighlightStrength: 0.55,
        }), ["offsetHighlight"]);

        expect(plan.activeEffects).toEqual(["offsetHighlight"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.requirements).toContainEqual({
            key: "viewDepth",
            consumers: ["offsetHighlight"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirementKeys).not.toContain("viewNormal");
    });

    it("keeps DoF scene depth separate from geometry view depth", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            dofEnabled: true,
            ssaoEnabled: true,
        }), ["dof", "ssao"]);

        expect(plan.needsDepthRenderer).toBe(true);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.requirementKeys).toEqual(["sceneColor", "viewDepth", "viewNormal", "depthScene"]);
        expect(plan.requirements).toContainEqual({
            key: "depthScene",
            consumers: ["dof"],
            producer: "depthRenderer",
            resolution: "full",
        });
    });

    it("uses only scene color and view depth for aerial perspective", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            aerialPerspectiveEnabled: true,
        }), ["aerialPerspective"]);

        expect(plan.activeEffects).toEqual(["aerialPerspective"]);
        expect(plan.requirementKeys).toEqual(["sceneColor", "viewDepth"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.requirementKeys).not.toContain("viewNormal");
    });

    it("uses geometry velocity for object-based Motion Blur", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            motionBlurEnabled: true,
            motionBlurStrength: 0.75,
        }), ["motionBlur"]);

        expect(plan.activeEffects).toEqual(["motionBlur"]);
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(plan.needsDepthRenderer).toBe(false);
        expect(plan.requirements).toContainEqual({
            key: "velocity",
            consumers: ["motionBlur"],
            producer: "geometryRenderer",
            resolution: "full",
        });
        expect(plan.requirementKeys).not.toContain("viewDepth");
    });

    it("ignores zero-strength effects and appends active effects to the runtime order", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            luminousEnabled: true,
            luminousIntensity: 0,
            ssrEnabled: true,
            ssrStrength: 0,
            grainIntensity: 12,
        }), ["lut"]);

        expect(plan.activeEffects).toEqual(["grain"]);
        expect(plan.effectOrder).toEqual(["lut", "grain"]);
        expect(plan.requirementKeys).toEqual(["sceneColor"]);
    });
});

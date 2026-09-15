import { describe, expect, it } from "vitest";
import {
    buildFrameGraphResourcePlan,
    canReuseFrameGraphForActivation,
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
        gammaEnabled: false,
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
        directionalLightShaftsEnabled: false,
        antialiasEnabled: true,
        ...overrides,
    };
}

describe("buildFrameGraphResourcePlan", () => {
    it.each(["offsetShadow", "offsetHighlight"] as const)("prepares %s depth before its first visible key", id => {
        const neutral = createSettings({ [id + "Enabled"]: true, [id + "Prepared"]: true, [id + "Strength"]: 0 });
        const plan = buildFrameGraphResourcePlan(neutral);
        expect(plan.requirementKeys).toContain("viewDepth");
        expect(canReuseFrameGraphForActivation(plan, buildFrameGraphResourcePlan({ ...neutral, [id + "Strength"]: 1 }), [id])).toBe(true);
        expect(buildFrameGraphResourcePlan({ ...neutral, [id + "Prepared"]: false }).activeEffects).not.toContain(id);
        expect(buildFrameGraphResourcePlan({ ...neutral, [id + "Enabled"]: false }).activeEffects).not.toContain(id);
    });
    it("retains aerial view depth when a prepared keyed effect is neutralized", () => {
        // The manager keeps enabled true for a prepared track and changes strength only.
        const neutral = { ...createSettings({ aerialPerspectiveEnabled: true }), aerialPerspectiveStrength: 0 };
        const visible = { ...neutral, aerialPerspectiveStrength: 0.6 };
        const plan = buildFrameGraphResourcePlan(neutral);
        expect(plan.requirementKeys).toContain("viewDepth");
        expect(plan.needsGeometryRenderer).toBe(true);
        expect(canReuseFrameGraphForActivation(plan, buildFrameGraphResourcePlan(visible), ["aerialPerspective"])).toBe(true);
    });
    it("allocates the luminous mask even when the initial keyed intensity is zero", () => {
        const off = buildFrameGraphResourcePlan(createSettings({ luminousEnabled: true, luminousPrepared: true, luminousIntensity: 0 }));
        const on = buildFrameGraphResourcePlan(createSettings({ luminousEnabled: true, luminousPrepared: true, luminousIntensity: 2 }));
        expect(off.needsLuminousMask).toBe(true);
        expect(canReuseFrameGraphForActivation(off, on, ["luminous"])).toBe(true);
        expect(buildFrameGraphResourcePlan(createSettings({ luminousEnabled: true, luminousIntensity: 0 })).needsLuminousMask).toBe(false);
        expect(buildFrameGraphResourcePlan(createSettings({ luminousEnabled: false, luminousPrepared: true })).needsLuminousMask).toBe(false);
    });
    it("reuses recorded passes for OFF and re-ON but requires missing tasks and resources", () => {
        const on = buildFrameGraphResourcePlan(createSettings({ ssaoEnabled: true }));
        const off = buildFrameGraphResourcePlan(createSettings());
        expect(canReuseFrameGraphForActivation(on, off, ["ssao"])).toBe(true);
        expect(canReuseFrameGraphForActivation(on, on, ["ssao"])).toBe(true);
        expect(canReuseFrameGraphForActivation(off, on, ["ssao"])).toBe(false);
        expect(canReuseFrameGraphForActivation(on, on, [])).toBe(false);
        const ssr = buildFrameGraphResourcePlan(createSettings({ ssrEnabled: true }));
        expect(canReuseFrameGraphForActivation(on, ssr, ["ssao", "ssr"])).toBe(false);
    });

    it("recognizes the shared vignette / edge blur pass", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({ edgeBlurStrength: 1 }));
        expect(canReuseFrameGraphForActivation(plan, plan, ["vignette"])).toBe(true);
    });
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

    it("allocates geometry resources for the hybrid ocean media pass", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            oceanEnabled: true,
        }), ["ocean"]);

        expect(plan.activeEffects).toEqual(["ocean"]);
        expect(plan.requirementKeys).toEqual(["sceneColor", "viewDepth", "viewNormal"]);
        expect(plan.needsGeometryRenderer).toBe(true);
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

    it("uses scene color and geometry depth for directional light shafts", () => {
        const plan = buildFrameGraphResourcePlan(createSettings({
            directionalLightShaftsEnabled: true,
        }), ["directionalLightShafts"]);

        expect(plan.activeEffects).toEqual(["directionalLightShafts"]);
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

    it.each(["ssao", "ssr"] as const)("prepares %s geometry at an initial OFF key without reallocating on seek", id => {
        const off = createSettings({ [id + "Enabled"]: true, [id + "Prepared"]: true, [id + "Strength"]: 0 });
        const plan = buildFrameGraphResourcePlan(off, [id]);
        expect(plan.activeEffects).toEqual([id]);
        expect(plan.requirementKeys).toContain("viewDepth");
        expect(plan.requirementKeys).toContain("viewNormal");
        const on = buildFrameGraphResourcePlan({ ...off, [id + "Strength"]: 1 }, [id]);
        expect(on.requirementKeys).toEqual(plan.requirementKeys);
        expect(canReuseFrameGraphForActivation(plan, on, [id])).toBe(true);
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

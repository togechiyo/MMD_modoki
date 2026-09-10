import { z } from "zod";
import type { MmdManager } from "../mmd-manager";
import type { SceneEnvironmentUiController } from "../ui/scene-environment-ui-controller";
import type { RuntimeFeatureUiController } from "../ui/runtime-feature-ui-controller";
import type { ColorPostFxController } from "../ui/color-postfx-controller";

const flag = <T extends string>(id: T) => z.object({ id: z.literal(id), value: z.boolean() }).strict();
const numeric = <T extends string>(id: T, min: number, max: number) => z.object({ id: z.literal(id), value: z.number().finite().min(min).max(max) }).strict();
export const automationSettingSchema = z.discriminatedUnion("id", [
    flag("viewport.ground"), flag("viewport.skydome"), flag("viewport.backgroundMedia"),
    flag("runtime.antialias"), flag("runtime.physics"), flag("runtime.shadow"), flag("runtime.rigidBodies"),
    numeric("effect.contrastPercent", -100, 200), numeric("effect.gammaPercent", -100, 100),
    numeric("effect.exposure", 0, 8), numeric("effect.dithering", 0, 1), numeric("effect.vignette", 0, 4),
    numeric("effect.grain", 0, 100), numeric("effect.sharpenPercent", 0, 400), numeric("effect.saturation", -100, 100),
]);
export type AutomationSetting = z.infer<typeof automationSettingSchema>;

export function getAutomationSettings(manager: MmdManager): Record<AutomationSetting["id"], { value: number | boolean; available: boolean }> {
    const entry = (value: number | boolean, available = true) => ({ value, available });
    return {
        "viewport.ground": entry(manager.isGroundVisible()),
        "viewport.skydome": entry(manager.isSkydomeVisible()),
        "viewport.backgroundMedia": entry(manager.isBackgroundMediaVisible(), Boolean(manager.getBackgroundImagePath() || manager.getBackgroundVideoPath())),
        "runtime.antialias": entry(manager.antialiasEnabled),
        "runtime.physics": entry(manager.getPhysicsEnabled(), manager.isPhysicsAvailable()),
        "runtime.shadow": entry(manager.getShadowEnabled()),
        "runtime.rigidBodies": entry(manager.isRigidBodyVisualizerEnabled(), manager.isRigidBodyVisualizerAvailable()),
        "effect.contrastPercent": entry((manager.postEffectContrast - 1) * 100),
        "effect.gammaPercent": entry(-Math.log2(manager.postEffectGamma) * 100),
        "effect.exposure": entry(manager.postEffectExposure),
        "effect.dithering": entry(manager.postEffectDitheringIntensity),
        "effect.vignette": entry(manager.postEffectVignetteWeight),
        "effect.grain": entry(manager.postEffectGrainIntensity),
        "effect.sharpenPercent": entry(manager.postEffectSharpenEdge * 100),
        "effect.saturation": entry(manager.postEffectColorCurvesSaturation),
    };
}

/** Reuse GUI setters, including their dependent flags and control refresh, without DOM events. */
export function applyAutomationSetting(setting: AutomationSetting, controllers: {
    scene: SceneEnvironmentUiController; runtime: RuntimeFeatureUiController; color: ColorPostFxController;
}): void {
    switch (setting.id) {
        case "viewport.ground": controllers.scene.toggleGround(); break;
        case "viewport.skydome": controllers.scene.toggleSkydome(); break;
        case "viewport.backgroundMedia": controllers.scene.toggleBackgroundMedia(); break;
        case "runtime.antialias": controllers.runtime.toggleAntialias(); break;
        case "runtime.physics": controllers.runtime.togglePhysics(); break;
        case "runtime.shadow": controllers.runtime.toggleShadow(); break;
        case "runtime.rigidBodies": controllers.runtime.toggleRigidBodies(); break;
        case "effect.contrastPercent": controllers.color.setContrastOffsetPercent(setting.value); break;
        case "effect.gammaPercent": controllers.color.setGammaOffsetPercent(setting.value); break;
        case "effect.exposure": controllers.color.setExposure(setting.value); break;
        case "effect.dithering": controllers.color.setDitheringIntensity(setting.value); break;
        case "effect.vignette": controllers.color.setVignetteWeight(setting.value); break;
        case "effect.grain": controllers.color.setGrainIntensity(setting.value); break;
        case "effect.sharpenPercent": controllers.color.setSharpenEdgePercent(setting.value); break;
        case "effect.saturation": controllers.color.setColorCurvesSaturation(setting.value); break;
    }
}

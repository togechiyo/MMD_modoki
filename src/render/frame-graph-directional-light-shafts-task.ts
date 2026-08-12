import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphRenderPass } from "@babylonjs/core/FrameGraph/Passes/renderPass";
import type { FrameGraphRenderContext } from "@babylonjs/core/FrameGraph/frameGraphRenderContext";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import type { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
    resolveDirectionalLightShaftsSettings,
    type DirectionalLightShaftsSettings,
} from "./directional-light-shafts-settings";

export class FrameGraphDirectionalLightShaftsTask extends FrameGraphPostProcessTask {
    depthTexture?: FrameGraphTextureHandle;
    private readonly inverseProjection = Matrix.Identity();
    private readonly lightViewDirection = Vector3.Zero();

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly camera: Camera,
        readonly light: DirectionalLight,
        private readonly getSettings: () => DirectionalLightShaftsSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphDirectionalLightShaftsTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        if (this.depthTexture === undefined) {
            throw new Error(`${this.name}: view depth texture is required.`);
        }
        const depthTexture = this.depthTexture;
        const pass = super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = resolveDirectionalLightShaftsSettings(this.getSettings());
                const effect = this.postProcess.effect;
                this.camera.getProjectionMatrix().invertToRef(this.inverseProjection);
                Vector3.TransformNormalToRef(
                    this.light.direction,
                    this.camera.getViewMatrix(),
                    this.lightViewDirection,
                );
                this.lightViewDirection.normalize();
                effect.setMatrix("inverseProjection", this.inverseProjection);
                effect.setFloat3(
                    "lightViewDirection",
                    this.lightViewDirection.x,
                    this.lightViewDirection.y,
                    this.lightViewDirection.z,
                );
                effect.setFloat3("lightColor", this.light.diffuse.r, this.light.diffuse.g, this.light.diffuse.b);
                effect.setFloat("lightIntensity", Math.max(0, this.light.intensity));
                effect.setFloat("strength", settings.strength);
                effect.setFloat("phaseG", settings.phaseG);
                effect.setFloat3("flareLightColor", settings.lightColor.r, settings.lightColor.g, settings.lightColor.b);
                effect.setFloat3("flareShadowColor", settings.shadowColor.r, settings.shadowColor.g, settings.shadowColor.b);
                context.bindTextureHandle(effect, "viewDepthTexture", depthTexture);
                additionalBindings?.(context);
            },
        );
        pass.addDependencies(depthTexture);
        return pass;
    }
}

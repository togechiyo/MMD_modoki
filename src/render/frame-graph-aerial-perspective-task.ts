import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphRenderPass } from "@babylonjs/core/FrameGraph/Passes/renderPass";
import type { FrameGraphRenderContext } from "@babylonjs/core/FrameGraph/frameGraphRenderContext";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import type { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import {
    resolveAerialPerspectiveSettings,
    type AerialPerspectiveSettings,
} from "./aerial-perspective-settings";

export class FrameGraphAerialPerspectiveTask extends FrameGraphPostProcessTask {
    depthTexture?: FrameGraphTextureHandle;
    private readonly inverseProjection = Matrix.Identity();

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly camera: Camera,
        private readonly getSettings: () => AerialPerspectiveSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphAerialPerspectiveTask";
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
                const settings = resolveAerialPerspectiveSettings(this.getSettings());
                const effect = this.postProcess.effect;
                this.camera.getProjectionMatrix().invertToRef(this.inverseProjection);
                effect.setMatrix("inverseProjection", this.inverseProjection);
                effect.setFloat("strength", settings.strength);
                effect.setFloat("startDistance", settings.startDistance);
                effect.setFloat("transitionRange", settings.transitionRange);
                effect.setFloat3("atmosphereColor", settings.color.r, settings.color.g, settings.color.b);
                effect.setFloat3("lightColor", settings.lightColor.r, settings.lightColor.g, settings.lightColor.b);
                effect.setFloat("lightIntensity", settings.lightIntensity);
                context.bindTextureHandle(effect, "viewDepthTexture", depthTexture);
                additionalBindings?.(context);
            },
        );
        pass.addDependencies(depthTexture);
        return pass;
    }
}

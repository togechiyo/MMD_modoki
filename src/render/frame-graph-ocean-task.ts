import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphRenderPass } from "@babylonjs/core/FrameGraph/Passes/renderPass";
import type { FrameGraphRenderContext } from "@babylonjs/core/FrameGraph/frameGraphRenderContext";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { FrameGraphPostProcessTask } from "@babylonjs/core/FrameGraph/Tasks/PostProcesses/postProcessTask";
import type { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { Matrix } from "@babylonjs/core/Maths/math.vector";

export type FrameGraphOceanRuntimeSettings = {
    waterHeight: number;
    waveStrength: number;
    clarity: number;
    causticsStrength: number;
    timeSeconds: number;
};

export class FrameGraphPostEffectsOceanTask extends FrameGraphPostProcessTask {
    depthTexture?: FrameGraphTextureHandle;
    normalTexture?: FrameGraphTextureHandle;

    private readonly inverseProjection = Matrix.Identity();
    private readonly inverseView = Matrix.Identity();

    constructor(
        name: string,
        frameGraph: FrameGraph,
        postProcess: EffectWrapper,
        private readonly camera: Camera,
        private readonly getSettings: () => FrameGraphOceanRuntimeSettings,
    ) {
        super(name, frameGraph, postProcess);
    }

    override getClassName(): string {
        return "FrameGraphPostEffectsOceanTask";
    }

    override record(
        skipCreationOfDisabledPasses = false,
        additionalExecute?: (context: FrameGraphRenderContext) => void,
        additionalBindings?: (context: FrameGraphRenderContext) => void,
    ): FrameGraphRenderPass {
        if (this.depthTexture === undefined || this.normalTexture === undefined) {
            throw new Error(`${this.name}: view depth and view normal are required.`);
        }
        const depthTexture = this.depthTexture;
        const normalTexture = this.normalTexture;
        const pass = super.record(
            skipCreationOfDisabledPasses,
            additionalExecute,
            (context) => {
                const settings = this.getSettings();
                const effect = this.postProcess.effect;
                this.camera.getProjectionMatrix().invertToRef(this.inverseProjection);
                this.camera.getViewMatrix().invertToRef(this.inverseView);
                effect.setMatrix("inverseProjection", this.inverseProjection);
                effect.setMatrix("inverseView", this.inverseView);
                effect.setVector3("cameraPosition", this.camera.globalPosition);
                effect.setFloat("waterHeight", settings.waterHeight);
                effect.setFloat("timeSeconds", settings.timeSeconds);
                effect.setFloat("waveStrength", Math.max(0, Math.min(2, settings.waveStrength)));
                effect.setFloat("clarity", Math.max(0, Math.min(4, settings.clarity)));
                effect.setFloat("causticsStrength", Math.max(0, Math.min(2, settings.causticsStrength)));
                context.bindTextureHandle(effect, "viewDepthTexture", depthTexture);
                context.bindTextureHandle(effect, "viewNormalTexture", normalTexture);
                additionalBindings?.(context);
            },
        );
        pass.addDependencies(this.depthTexture);
        pass.addDependencies(this.normalTexture);
        return pass;
    }
}

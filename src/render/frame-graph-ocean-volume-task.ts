import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphContext } from "@babylonjs/core/FrameGraph/frameGraphContext";
import type { FrameGraphPass } from "@babylonjs/core/FrameGraph/Passes/pass";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FRAME_GRAPH_OCEAN_VOLUME_COMPUTE_WGSL } from "./frame-graph-ocean-volume-shaders";

export type OceanVolumeRuntimeSettings = {
    waterHeight: number;
    volumeStrength: number;
    lightDirection: { x: number; y: number; z: number };
    lightColor: { r: number; g: number; b: number };
    lightIntensity: number;
};

export function resolveOceanVolumeResolution(
    fullWidth: number,
    fullHeight: number,
): { inputWidth: number; inputHeight: number; outputWidth: number; outputHeight: number } {
    const inputWidth = Math.max(1, Math.round(fullWidth));
    const inputHeight = Math.max(1, Math.round(fullHeight));
    return {
        inputWidth,
        inputHeight,
        outputWidth: Math.max(1, Math.ceil(inputWidth / 2)),
        outputHeight: Math.max(1, Math.ceil(inputHeight / 2)),
    };
}

export class FrameGraphOceanVolumeTask extends FrameGraphComputeShaderTask {
    depthTexture?: FrameGraphTextureHandle;
    broadWaveTexture?: FrameGraphTextureHandle;
    mediumWaveTexture?: FrameGraphTextureHandle;
    fineWaveTexture?: FrameGraphTextureHandle;
    readonly outputTexture: FrameGraphTextureHandle;
    readonly outputWidth: number;
    readonly outputHeight: number;

    private readonly paramsBuffer: UniformBuffer;
    private readonly projection = Matrix.Identity();
    private readonly view = Matrix.Identity();
    private readonly inverseProjection = Matrix.Identity();
    private readonly inverseView = Matrix.Identity();
    private readonly inputWidth: number;
    private readonly inputHeight: number;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        fullWidth: number,
        fullHeight: number,
        private readonly camera: Camera,
        private readonly getSettings: () => OceanVolumeRuntimeSettings,
    ) {
        super(
            name,
            frameGraph,
            { computeSource: FRAME_GRAPH_OCEAN_VOLUME_COMPUTE_WGSL },
            {
                bindingsMapping: {
                    viewDepth: { group: 0, binding: 0 },
                    broadWave: { group: 0, binding: 1 },
                    mediumWave: { group: 0, binding: 2 },
                    fineWave: { group: 0, binding: 3 },
                    outputVolume: { group: 0, binding: 4 },
                    params: { group: 0, binding: 5 },
                },
            },
        );

        const resolution = resolveOceanVolumeResolution(fullWidth, fullHeight);
        this.inputWidth = resolution.inputWidth;
        this.inputHeight = resolution.inputHeight;
        this.outputWidth = resolution.outputWidth;
        this.outputHeight = resolution.outputHeight;
        this.outputTexture = frameGraph.textureManager.createRenderTargetTexture(
            `${name} half resolution`,
            {
                size: { width: this.outputWidth, height: this.outputHeight },
                sizeIsPercentage: false,
                options: {
                    createMipMaps: false,
                    types: [Constants.TEXTURETYPE_HALF_FLOAT],
                    formats: [Constants.TEXTUREFORMAT_RGBA],
                    samples: 1,
                    useSRGBBuffers: [false],
                    creationFlags: [Constants.TEXTURE_CREATIONFLAG_STORAGE],
                    labels: ["oceanVolumeRadiance"],
                },
            },
        );
        this.dispatchSize = new Vector3(
            Math.ceil(this.outputWidth / 8),
            Math.ceil(this.outputHeight / 8),
            1,
        );
        this.paramsBuffer = this.createUniformBuffer("params", {
            projection: 16,
            view: 16,
            inverseProjection: 16,
            inverseView: 16,
            cameraPosition: 3,
            waterHeight: 1,
            lightDirection: 3,
            lightIntensity: 1,
            lightColor: 3,
            volumeStrength: 1,
            inputSize: 2,
            outputSize: 2,
        });

        this.onTexturesAllocatedObservable.add((context) => {
            const depth = this.depthTexture === undefined
                ? null
                : context.getTextureFromHandle(this.depthTexture);
            const broad = this.broadWaveTexture === undefined
                ? null
                : context.getTextureFromHandle(this.broadWaveTexture);
            const medium = this.mediumWaveTexture === undefined
                ? null
                : context.getTextureFromHandle(this.mediumWaveTexture);
            const fine = this.fineWaveTexture === undefined
                ? null
                : context.getTextureFromHandle(this.fineWaveTexture);
            const output = context.getTextureFromHandle(this.outputTexture);
            if (depth && broad && medium && fine && output) {
                this.setInternalTexture("viewDepth", depth);
                this.setInternalTexture("broadWave", broad);
                this.setInternalTexture("mediumWave", medium);
                this.setInternalTexture("fineWave", fine);
                this.setInternalTexture("outputVolume", output);
            }
        });

        this.execute = () => {
            const settings = this.getSettings();
            this.projection.copyFrom(this.camera.getProjectionMatrix());
            this.view.copyFrom(this.camera.getViewMatrix());
            this.projection.invertToRef(this.inverseProjection);
            this.view.invertToRef(this.inverseView);
            this.paramsBuffer.updateMatrix("projection", this.projection);
            this.paramsBuffer.updateMatrix("view", this.view);
            this.paramsBuffer.updateMatrix("inverseProjection", this.inverseProjection);
            this.paramsBuffer.updateMatrix("inverseView", this.inverseView);
            this.paramsBuffer.updateFloat3(
                "cameraPosition",
                this.camera.globalPosition.x,
                this.camera.globalPosition.y,
                this.camera.globalPosition.z,
            );
            this.paramsBuffer.updateFloat("waterHeight", settings.waterHeight);
            this.paramsBuffer.updateFloat3(
                "lightDirection",
                settings.lightDirection.x,
                settings.lightDirection.y,
                settings.lightDirection.z,
            );
            this.paramsBuffer.updateFloat("lightIntensity", Math.max(0, Math.min(4, settings.lightIntensity)));
            this.paramsBuffer.updateFloat3(
                "lightColor",
                settings.lightColor.r,
                settings.lightColor.g,
                settings.lightColor.b,
            );
            this.paramsBuffer.updateFloat("volumeStrength", Math.max(0, Math.min(2, settings.volumeStrength)));
            this.paramsBuffer.updateFloat2("inputSize", this.inputWidth, this.inputHeight);
            this.paramsBuffer.updateFloat2("outputSize", this.outputWidth, this.outputHeight);
        };
    }

    override getClassName(): string {
        return "FrameGraphOceanVolumeTask";
    }

    override record(skipCreationOfDisabledPasses = false): FrameGraphPass<FrameGraphContext> {
        if (
            this.depthTexture === undefined
            || this.broadWaveTexture === undefined
            || this.mediumWaveTexture === undefined
            || this.fineWaveTexture === undefined
        ) {
            throw new Error(`${this.name}: depth and all wave-field textures are required.`);
        }
        this.dependencies = new Set([
            this.depthTexture,
            this.broadWaveTexture,
            this.mediumWaveTexture,
            this.fineWaveTexture,
            this.outputTexture,
        ]);
        return super.record(skipCreationOfDisabledPasses);
    }
}

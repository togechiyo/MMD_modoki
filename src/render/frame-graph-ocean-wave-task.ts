import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphContext } from "@babylonjs/core/FrameGraph/frameGraphContext";
import type { FrameGraphPass } from "@babylonjs/core/FrameGraph/Passes/pass";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FRAME_GRAPH_OCEAN_WAVE_COMPUTE_WGSL } from "./frame-graph-ocean-wave-shaders";

export type OceanWaveBand = "broad" | "medium" | "fine";

export type OceanWaveBandConfig = {
    band: OceanWaveBand;
    tileSize: number;
    amplitude: number;
    speedScale: number;
    directionRotation: number;
    seed: number;
};

export type OceanWaveFieldRuntimeSettings = {
    timeSeconds: number;
    waveStrength: number;
};

const TEXTURE_SIZE = 256;

export const OCEAN_WAVE_BAND_CONFIGS: readonly OceanWaveBandConfig[] = [
    {
        band: "broad",
        tileSize: 512,
        amplitude: 0.85,
        speedScale: 0.72,
        directionRotation: 0.17,
        seed: 3,
    },
    {
        band: "medium",
        tileSize: 64,
        amplitude: 0.42,
        speedScale: 0.94,
        directionRotation: 1.09,
        seed: 11,
    },
    {
        band: "fine",
        tileSize: 8,
        amplitude: 0.018,
        speedScale: 1.18,
        directionRotation: 2.31,
        seed: 23,
    },
] as const;

export class FrameGraphOceanWaveFieldTask extends FrameGraphComputeShaderTask {
    readonly outputTexture: FrameGraphTextureHandle;
    readonly textureSize = TEXTURE_SIZE;

    private readonly paramsBuffer: UniformBuffer;

    constructor(
        name: string,
        frameGraph: FrameGraph,
        readonly config: OceanWaveBandConfig,
        private readonly getSettings: () => OceanWaveFieldRuntimeSettings,
    ) {
        super(
            name,
            frameGraph,
            { computeSource: FRAME_GRAPH_OCEAN_WAVE_COMPUTE_WGSL },
            {
                bindingsMapping: {
                    outputWave: { group: 0, binding: 0 },
                    params: { group: 0, binding: 1 },
                },
            },
        );

        this.outputTexture = frameGraph.textureManager.createRenderTargetTexture(
            `${name} ${config.band} wave field`,
            {
                size: { width: TEXTURE_SIZE, height: TEXTURE_SIZE },
                sizeIsPercentage: false,
                options: {
                    createMipMaps: false,
                    types: [Constants.TEXTURETYPE_HALF_FLOAT],
                    formats: [Constants.TEXTUREFORMAT_RGBA],
                    samples: 1,
                    useSRGBBuffers: [false],
                    creationFlags: [Constants.TEXTURE_CREATIONFLAG_STORAGE],
                    labels: [`oceanWaveField-${config.band}`],
                },
            },
        );
        this.dispatchSize = new Vector3(
            Math.ceil(TEXTURE_SIZE / 8),
            Math.ceil(TEXTURE_SIZE / 8),
            1,
        );
        this.paramsBuffer = this.createUniformBuffer("params", {
            timeSeconds: 1,
            tileSize: 1,
            amplitude: 1,
            speedScale: 1,
            outputSize: 2,
            directionRotation: 1,
            bandSeed: 1,
        });

        this.onTexturesAllocatedObservable.add((context) => {
            const output = context.getTextureFromHandle(this.outputTexture);
            if (output) {
                this.setInternalTexture("outputWave", output);
            }
        });

        this.execute = () => {
            const settings = this.getSettings();
            const strength = Math.max(0, Math.min(2, settings.waveStrength));
            this.paramsBuffer.updateFloat("timeSeconds", settings.timeSeconds);
            this.paramsBuffer.updateFloat("tileSize", config.tileSize);
            this.paramsBuffer.updateFloat("amplitude", config.amplitude * strength);
            this.paramsBuffer.updateFloat("speedScale", config.speedScale);
            this.paramsBuffer.updateFloat2("outputSize", TEXTURE_SIZE, TEXTURE_SIZE);
            this.paramsBuffer.updateFloat("directionRotation", config.directionRotation);
            this.paramsBuffer.updateFloat("bandSeed", config.seed);
        };
    }

    override getClassName(): string {
        return "FrameGraphOceanWaveFieldTask";
    }

    override record(skipCreationOfDisabledPasses = false): FrameGraphPass<FrameGraphContext> {
        this.dependencies = new Set([this.outputTexture]);
        return super.record(skipCreationOfDisabledPasses);
    }
}

import { BufferUsage, MapMode, ShaderStage, TextureUsage } from "@babylonjs/core/Engines/WebGPU/webgpuConstants";
import {
    createRadianceCascadeLayouts, getRadianceLabUniforms, normalizeRadianceLabSettings,
    type RadianceLabSettings,
} from "./radiance-cascade-lab-model";
import {
    RADIANCE_CASCADE_LAB_COMPUTE_WGSL, RADIANCE_CASCADE_LAB_PRESENT_WGSL,
    RADIANCE_CASCADE_LAB_RENDER_WGSL,
} from "./radiance-cascade-lab-shaders";

export type RadianceLabReport = {
    status: "ready" | "error";
    revision: number;
    fieldRevision: number;
    giMilliseconds: number | null;
    renderMilliseconds: number | null;
    message?: string;
};

const WIDTH = 560;
const HEIGHT = 315;

function transportKey(settings: RadianceLabSettings): string {
    return JSON.stringify([settings.emitterColor, settings.emissionGain, settings.emitterEnabled,
        settings.blockerEnabled, settings.blockerX]);
}

export class RadianceCascadeLabRenderer {
    private readonly textures: GPUTexture[] = [];
    private readonly buffers: GPUBuffer[] = [];
    private readonly layouts = createRadianceCascadeLayouts();
    private readonly cascadeGroups: GPUBindGroup[] = [];
    private readonly sceneBuffer: GPUBuffer;
    private computePipeline: GPUComputePipeline | null = null;
    private renderPipeline: GPURenderPipeline | null = null;
    private presentPipeline: GPURenderPipeline | null = null;
    private renderGroup: GPUBindGroup | null = null;
    private presentGroup: GPUBindGroup | null = null;
    private colorTarget: GPUTexture | null = null;
    private glowTarget: GPUTexture | null = null;
    private querySet: GPUQuerySet | null = null;
    private queryResolve: GPUBuffer | null = null;
    private queryReadback: GPUBuffer | null = null;
    private settings: RadianceLabSettings;
    private requested = 1;
    private rendered = 0;
    private fieldRevision = 0;
    private lastTransportKey = "";
    private giMilliseconds: number | null = null;
    private running = false;
    private disposed = false;
    private failed = false;

    private constructor(
        private readonly device: GPUDevice,
        private readonly context: GPUCanvasContext,
        settings: RadianceLabSettings,
        private readonly report: (report: RadianceLabReport) => void,
    ) {
        this.settings = normalizeRadianceLabSettings(settings);
        this.sceneBuffer = this.buffer(112, BufferUsage.Uniform | BufferUsage.CopyDst);
        device.addEventListener("uncapturederror", this.onGpuError);
        void device.lost.then(info => {
            if (!this.disposed) this.fail(`WebGPU device lost: ${info.message}`);
        });
    }

    public static async create(
        canvas: HTMLCanvasElement,
        settings: RadianceLabSettings,
        report: (report: RadianceLabReport) => void,
    ): Promise<RadianceCascadeLabRenderer> {
        if (!navigator.gpu) throw new Error("WebGPU is unavailable");
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) throw new Error("No WebGPU adapter is available");
        const timing = adapter.features.has("timestamp-query");
        const device = await adapter.requestDevice({ requiredFeatures: timing ? ["timestamp-query"] : [] });
        // Babylon's ambient WebGPU types do not augment the HTMLCanvasElement overload.
        const context = canvas.getContext("webgpu") as unknown as GPUCanvasContext | null;
        if (!context) { device.destroy(); throw new Error("WebGPU canvas is unavailable"); }
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: "opaque" });
        const renderer = new RadianceCascadeLabRenderer(device, context, settings, report);
        try {
            await renderer.initialize(format, timing);
            void renderer.pump();
            return renderer;
        } catch (error) {
            renderer.dispose();
            throw error;
        }
    }

    public update(settings: RadianceLabSettings): void {
        if (this.disposed || this.failed) return;
        this.settings = normalizeRadianceLabSettings(settings);
        this.requested++;
        void this.pump();
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.device.removeEventListener("uncapturederror", this.onGpuError);
        this.context.unconfigure();
        this.querySet?.destroy();
        this.textures.forEach(texture => texture.destroy());
        this.buffers.forEach(buffer => buffer.destroy());
        this.device.destroy();
    }

    private readonly onGpuError = (event: GPUUncapturedErrorEvent): void => {
        this.fail(event.error.message);
    };

    private fail(message: string): void {
        if (this.disposed || this.failed) return;
        this.failed = true;
        this.report({ status: "error", revision: this.rendered, fieldRevision: this.fieldRevision,
            giMilliseconds: null, renderMilliseconds: null, message });
    }

    private buffer(size: number, usage: GPUBufferUsageFlags): GPUBuffer {
        const buffer = this.device.createBuffer({ size, usage });
        this.buffers.push(buffer);
        return buffer;
    }

    private texture(width: number, height: number, storage = false): GPUTexture {
        const texture = this.device.createTexture({ size: { width, height, depthOrArrayLayers: 1 }, format: "rgba16float",
            usage: TextureUsage.TextureBinding | (storage ? TextureUsage.StorageBinding : TextureUsage.RenderAttachment) });
        this.textures.push(texture);
        return texture;
    }

    private async module(code: string): Promise<GPUShaderModule> {
        const module = this.device.createShaderModule({ code });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(message => message.type === "error");
        if (errors.length) throw new Error(errors.map(error => `${error.lineNum}: ${error.message}`).join("\n"));
        return module;
    }

    private async initialize(format: GPUTextureFormat, timing: boolean): Promise<void> {
        const computeModule = await this.module(RADIANCE_CASCADE_LAB_COMPUTE_WGSL);
        const renderModule = await this.module(RADIANCE_CASCADE_LAB_RENDER_WGSL);
        const presentModule = await this.module(RADIANCE_CASCADE_LAB_PRESENT_WGSL);
        const computeLayout = this.device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: ShaderStage.Compute, buffer: { type: "uniform" } },
            { binding: 1, visibility: ShaderStage.Compute, buffer: { type: "uniform" } },
            { binding: 2, visibility: ShaderStage.Compute, texture: { sampleType: "unfilterable-float" } },
            { binding: 3, visibility: ShaderStage.Compute, storageTexture: { access: "write-only", format: "rgba16float" } },
        ] });
        this.computePipeline = await this.device.createComputePipelineAsync({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [computeLayout] }),
            compute: { module: computeModule, entryPoint: "main" },
        });
        const fields = this.layouts.map(layout => this.texture(layout.width, layout.height, true));
        const empty = this.texture(1, 1, true);
        for (let index = 0; index < this.layouts.length; index++) {
            const layout = this.layouts[index];
            const params = this.buffer(32, BufferUsage.Uniform | BufferUsage.CopyDst);
            const data = new ArrayBuffer(32);
            new Uint32Array(data, 0, 4).set([layout.grid, layout.directionsX, layout.directionsY, index < fields.length - 1 ? 1 : 0]);
            new Float32Array(data, 16, 4).set([layout.start, layout.end, 0, 0]);
            this.device.queue.writeBuffer(params, 0, data);
            this.cascadeGroups.push(this.device.createBindGroup({ layout: computeLayout, entries: [
                { binding: 0, resource: { buffer: this.sceneBuffer } },
                { binding: 1, resource: { buffer: params } },
                { binding: 2, resource: (fields[index + 1] ?? empty).createView() },
                { binding: 3, resource: fields[index].createView() },
            ] }));
        }
        this.renderPipeline = await this.device.createRenderPipelineAsync({ layout: "auto",
            vertex: { module: renderModule, entryPoint: "vertexMain" },
            fragment: { module: renderModule, entryPoint: "fragmentMain", targets: [{ format: "rgba16float" }, { format: "rgba16float" }] },
            primitive: { topology: "triangle-list" },
        });
        this.renderGroup = this.device.createBindGroup({ layout: this.renderPipeline.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: this.sceneBuffer } }, { binding: 1, resource: fields[0].createView() },
        ] });
        this.colorTarget = this.texture(WIDTH, HEIGHT);
        this.glowTarget = this.texture(WIDTH, HEIGHT);
        this.presentPipeline = await this.device.createRenderPipelineAsync({ layout: "auto",
            vertex: { module: presentModule, entryPoint: "vertexMain" },
            fragment: { module: presentModule, entryPoint: "fragmentMain", targets: [{ format }] },
            primitive: { topology: "triangle-list" },
        });
        this.presentGroup = this.device.createBindGroup({ layout: this.presentPipeline.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: this.sceneBuffer } },
            { binding: 1, resource: this.colorTarget.createView() },
            { binding: 2, resource: this.glowTarget.createView() },
            { binding: 3, resource: this.device.createSampler({ minFilter: "linear", magFilter: "linear" }) },
        ] });
        if (timing) {
            this.querySet = this.device.createQuerySet({ type: "timestamp", count: 4 });
            this.queryResolve = this.buffer(32, BufferUsage.QueryResolve | BufferUsage.CopySrc);
            this.queryReadback = this.buffer(32, BufferUsage.CopyDst | BufferUsage.MapRead);
        }
    }

    private async pump(): Promise<void> {
        if (this.running || this.disposed || this.failed) return;
        this.running = true;
        try {
            while (this.rendered < this.requested && !this.disposed && !this.failed) {
                await this.draw(this.requested, this.settings);
            }
        } catch (error) {
            this.fail(error instanceof Error ? error.message : String(error));
        } finally {
            this.running = false;
        }
    }

    private async draw(revision: number, settings: RadianceLabSettings): Promise<void> {
        if (!this.computePipeline || !this.renderPipeline || !this.presentPipeline
            || !this.renderGroup || !this.presentGroup || !this.colorTarget || !this.glowTarget) return;
        const key = transportKey(settings);
        const rebuild = key !== this.lastTransportKey;
        this.device.queue.writeBuffer(this.sceneBuffer, 0, getRadianceLabUniforms(settings, WIDTH, HEIGHT));
        const encoder = this.device.createCommandEncoder();
        if (rebuild) {
            for (let index = this.layouts.length - 1; index >= 0; index--) {
                const timestamps: GPUComputePassTimestampWrites | undefined = this.querySet ? { querySet: this.querySet,
                    ...(index === this.layouts.length - 1 ? { beginningOfPassWriteIndex: 0 } : {}),
                    ...(index === 0 ? { endOfPassWriteIndex: 1 } : {}),
                } : undefined;
                const pass = encoder.beginComputePass({ timestampWrites: index === 0 || index === this.layouts.length - 1 ? timestamps : undefined });
                pass.setPipeline(this.computePipeline);
                pass.setBindGroup(0, this.cascadeGroups[index]);
                pass.dispatchWorkgroups(Math.ceil(this.layouts[index].width / 8), Math.ceil(this.layouts[index].height / 8));
                pass.end();
            }
        }
        const render = encoder.beginRenderPass({ colorAttachments: [this.colorTarget, this.glowTarget].map(texture => ({
            view: texture.createView(), loadOp: "clear" as const, storeOp: "store" as const, clearValue: [0, 0, 0, 1],
        })), timestampWrites: this.querySet ? { querySet: this.querySet, beginningOfPassWriteIndex: 2 } : undefined });
        render.setPipeline(this.renderPipeline);
        render.setBindGroup(0, this.renderGroup);
        render.draw(3);
        render.end();
        const present = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(),
            loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }],
            timestampWrites: this.querySet ? { querySet: this.querySet, endOfPassWriteIndex: 3 } : undefined });
        present.setPipeline(this.presentPipeline);
        present.setBindGroup(0, this.presentGroup);
        present.draw(3);
        present.end();
        if (this.querySet && this.queryResolve && this.queryReadback) {
            encoder.resolveQuerySet(this.querySet, 0, 4, this.queryResolve, 0);
            encoder.copyBufferToBuffer(this.queryResolve, 0, this.queryReadback, 0, 32);
        }
        this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
        if (this.disposed || this.failed) return;
        let renderMilliseconds: number | null = null;
        if (this.queryReadback) {
            await this.queryReadback.mapAsync(MapMode.Read);
            if (this.disposed) return;
            const times = new BigUint64Array(this.queryReadback.getMappedRange());
            if (rebuild) this.giMilliseconds = Number(times[1] - times[0]) / 1e6;
            renderMilliseconds = Number(times[3] - times[2]) / 1e6;
            this.queryReadback.unmap();
        }
        this.rendered = revision;
        this.lastTransportKey = key;
        if (rebuild) this.fieldRevision++;
        // A newer edit may arrive while the GPU is running. Keep the UI loading until it is drawn.
        if (revision === this.requested) {
            this.report({ status: "ready", revision, fieldRevision: this.fieldRevision,
                giMilliseconds: this.giMilliseconds, renderMilliseconds });
        }
    }
}

import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import { Constants } from "@babylonjs/core/Engines/constants";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { LuminousRadianceSceneSource } from "./luminous-radiance-scene";
import { createRadianceCascadeLayouts } from "./radiance-cascade-lab-model";
import { SKY_VISIBILITY_CASCADE_WGSL, SKY_VISIBILITY_DIAGNOSTIC_WGSL } from "./radiance-sky-visibility-shaders";
import { DEFAULT_SKY_RECONSTRUCTION, type SkyVisibilityReconstruction } from "./radiance-sky-reconstruction";

export const SKY_VISIBILITY_VOLUME = { min: [-8, 0, -8] as const, size: 16, planeY: 0.05, resolution: 64 };
const DISPLAY_WGSL = `
@group(0) @binding(0) var<uniform> mode: vec4f;
@group(0) @binding(1) var diagnosticValues: texture_2d<f32>;
@group(0) @binding(2) var display: texture_storage_2d<rgba8unorm, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
    if (any(id.xy >= textureDimensions(display))) { return; }
    let sample = textureLoad(diagnosticValues, vec2i(id.xy), 0);
    var color = vec3f(0.3, 0.15, 0.3);
    if (sample.a > 0.5) { color = vec3f(clamp(sample[u32(mode.x)], 0.0, 1.0)); }
    textureStore(display, vec2i(id.xy), vec4f(color, 1.0));
}`;

/** Experimental, emission-independent field. No receiver/temporal history is shared with Luminous. */
export class RadianceSkyVisibilityField {
    public readonly graph: FrameGraph;
    public readonly source: LuminousRadianceSceneSource;
    public readonly output: RawTexture;
    public readonly display: RawTexture;
    private readonly tasks: FrameGraphComputeShaderTask[] = [];
    private readonly textures: RawTexture[] = [];
    private displayMode = 0;
    private reconstruction = DEFAULT_SKY_RECONSTRUCTION;
    private disposed = false;

    constructor(scene: Scene) {
        this.graph = new FrameGraph(scene);
        this.graph.name = "radianceSkyVisibility";
        this.source = new LuminousRadianceSceneSource(scene, () => null);
        const allocate = (name: string, width: number, height: number, type: number) => {
            const texture = new RawTexture(null, width, height, Constants.TEXTUREFORMAT_RGBA, scene,
                false, false, Texture.NEAREST_SAMPLINGMODE, type, Constants.TEXTURE_CREATIONFLAG_STORAGE);
            this.textures.push(texture);
            texture.name = name;
            const internal = texture.getInternalTexture();
            if (!internal) throw new Error("Sky visibility storage texture allocation failed");
            return { texture, internal, handle: this.graph.textureManager.importTexture(name, internal) };
        };
        try {
            const layouts = createRadianceCascadeLayouts();
            const fields = layouts.map((layout, i) => allocate(`skyVisibility${i}`, layout.width, layout.height, Constants.TEXTURETYPE_HALF_FLOAT));
            const dummy = allocate("skyVisibilityBoundary", 1, 1, Constants.TEXTURETYPE_HALF_FLOAT);
            const output = allocate("skyVisibilityDiagnostic", SKY_VISIBILITY_VOLUME.resolution, SKY_VISIBILITY_VOLUME.resolution, Constants.TEXTURETYPE_FLOAT);
            this.output = output.texture;
            const volume = SKY_VISIBILITY_VOLUME;
            const addTask = (name: string, shader: string, inputName: string, outputName: string,
                input: typeof dummy, destination: typeof dummy, shape: number[], interval: number[]) => {
                const task = new FrameGraphComputeShaderTask(name, this.graph, { computeSource: shader }, { bindingsMapping: {
                    params: { group: 0, binding: 0 }, triangles: { group: 0, binding: 1 }, nodes: { group: 0, binding: 2 },
                    [inputName]: { group: 0, binding: 3 }, [outputName]: { group: 0, binding: 4 },
                } });
                this.tasks.push(task);
                this.graph.addTask(task);
                const params = task.createUniformBuffer("params", { volumeMin: 4, volumeSize: 4, shape: 4, interval: 4, reconstruction: 4 });
                const size = destination.texture.getSize();
                task.dispatchSize = new Vector3(Math.ceil(size.width / 8), Math.ceil(size.height / 8), 1);
                task.dependencies = new Set([input.handle, destination.handle]);
                const bind = () => {
                    task.setStorageBuffer("triangles", this.source.triangleBuffer);
                    task.setStorageBuffer("nodes", this.source.nodeBuffer);
                    task.setInternalTexture(inputName, input.internal);
                    task.setInternalTexture(outputName, destination.internal);
                };
                task.onTexturesAllocatedObservable.add(bind);
                task.execute = () => {
                    bind();
                    params.updateFloat4("volumeMin", ...volume.min, 0);
                    params.updateFloat4("volumeSize", volume.size, volume.size, volume.size, 0);
                    params.updateFloat4("shape", shape[0], shape[1], shape[2], this.source.bvh.triangleCount);
                    params.updateFloat4("interval", interval[0], interval[1], interval[2], 0);
                    params.updateFloat4("reconstruction", this.reconstruction.nearDistance, this.reconstruction.rejectOccludedProbes ? 1 : 0, this.reconstruction.sampleAtRayEnd ? 1 : 0, 0);
                };
            };
            for (let i = layouts.length - 1; i >= 0; i--) {
                const layout = layouts[i], parent = fields[i + 1];
                addTask(`skyVisibilityCascade${i}`, SKY_VISIBILITY_CASCADE_WGSL, "parentField", "outputField", parent ?? dummy, fields[i],
                    [layout.grid, layout.directionsX, layout.directionsY], [layout.start * volume.size / 9, layout.end * volume.size / 9, parent ? 1 : 0]);
            }
            addTask("skyVisibilityDiagnostic", SKY_VISIBILITY_DIAGNOSTIC_WGSL, "baseField", "output", fields[0], output,
                [16, 8, 4], [volume.planeY, volume.resolution, volume.resolution]);
            // StandardMaterial can participate in geometry MRT passes; give it a display texture
            // instead of using a color-only ShaderMaterial that would invalidate those passes.
            const display = allocate("skyVisibilityDisplay", volume.resolution, volume.resolution, Constants.TEXTURETYPE_UNSIGNED_BYTE);
            this.display = display.texture;
            const task = new FrameGraphComputeShaderTask("skyVisibilityDisplay", this.graph, { computeSource: DISPLAY_WGSL }, { bindingsMapping: {
                mode: { group: 0, binding: 0 }, diagnosticValues: { group: 0, binding: 1 }, display: { group: 0, binding: 2 },
            } });
            this.tasks.push(task); this.graph.addTask(task);
            const params = task.createUniformBuffer("mode", { mode: 4 });
            task.dispatchSize = new Vector3(Math.ceil(volume.resolution / 8), Math.ceil(volume.resolution / 8), 1);
            task.dependencies = new Set([output.handle, display.handle]);
            task.onTexturesAllocatedObservable.add(() => {
                task.setInternalTexture("diagnosticValues", output.internal); task.setInternalTexture("display", display.internal);
            });
            task.execute = () => params.updateFloat4("mode", this.displayMode, 0, 0, 0);
        } catch (error) { this.dispose(); throw error; }
    }

    public execute(mode: number, updateField: boolean, reconstruction: SkyVisibilityReconstruction = DEFAULT_SKY_RECONSTRUCTION): number {
        this.displayMode = mode;
        this.reconstruction = reconstruction;
        for (let i = 0; i < this.tasks.length - 1; i++) this.tasks[i].disabled = !updateField;
        this.graph.execute();
        return updateField ? this.tasks.length : 1;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        // FrameGraph.dispose releases graph textures, but does not dispose task UBOs.
        for (const task of this.tasks) task.dispose();
        this.graph.dispose();
        for (const texture of this.textures) texture.dispose();
        this.source.dispose();
    }
}

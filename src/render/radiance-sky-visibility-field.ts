import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import { Constants } from "@babylonjs/core/Engines/constants";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { LuminousRadianceSceneSource } from "./luminous-radiance-scene";
import { createSkyVisibilityCascadeLayouts, getSkyVisibilityProbeGrid, type SkyVisibilityQuality } from "./radiance-sky-quality";
import { SKY_VISIBILITY_CASCADE_WGSL, SKY_VISIBILITY_DIAGNOSTIC_WGSL } from "./radiance-sky-visibility-shaders";
import { DEFAULT_SKY_RECONSTRUCTION, type SkyVisibilityReconstruction } from "./radiance-sky-reconstruction";
import { SKY_IRRADIANCE_INTEGRATE_WGSL } from "./radiance-sky-irradiance-shaders";
import { RadianceNearestSurfaceTask } from "./radiance-nearest-surface-task";

export const SKY_VISIBILITY_VOLUME = { min: [-8, 0, -8] as const, size: 16, planeY: 0.05, resolution: 64 };
export type SkyVisibilityBounds = { min: readonly [number, number, number]; size: number };
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
    public readonly baseField: RawTexture;
    public readonly irradianceField: RawTexture | null = null;
    public readonly nearestSurfaceField: RawTexture | null = null;
    public readonly quality: SkyVisibilityQuality;
    public readonly probeGrid: number;
    private readonly tasks: FrameGraphComputeShaderTask[] = [];
    private readonly textures: RawTexture[] = [];
    private readonly nearestTasks: RadianceNearestSurfaceTask[] = [];
    private displayMode = 0;
    private reconstruction = DEFAULT_SKY_RECONSTRUCTION;
    private disposed = false;
    private volumes: readonly SkyVisibilityBounds[];
    public readonly volumeCount: number;
    private readonly diagnostic: boolean;

    constructor(scene: Scene, options: { volume?: SkyVisibilityBounds; diagnostic?: boolean; opaqueOccludersOnly?: boolean;
        materialIrradiance?: boolean; acceptsMesh?: (mesh: Mesh) => boolean; quality?: SkyVisibilityQuality;
        volumes?: readonly SkyVisibilityBounds[] } = {}) {
        this.volumes = options.volumes ?? [options.volume ?? SKY_VISIBILITY_VOLUME];
        this.volumeCount = this.volumes.length;
        if (!this.volumeCount) throw new Error("Sky visibility needs a spatial volume");
        this.quality = options.quality ?? "standard";
        this.probeGrid = getSkyVisibilityProbeGrid(this.quality);
        this.diagnostic = options.diagnostic ?? true;
        this.graph = new FrameGraph(scene);
        this.graph.name = "radianceSkyVisibility";
        this.source = new LuminousRadianceSceneSource(scene, () => null, options.opaqueOccludersOnly
            ? material => !material.needAlphaTesting() && !material.needAlphaBlending()
            : undefined, undefined, options.acceptsMesh);
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
            const layouts = createSkyVisibilityCascadeLayouts(this.quality);
            const levelName = (name: string, level: number) => this.volumeCount === 1 ? name : `${name}Level${level}`;
            const levels = this.volumes.map((_, level) => layouts.map((layout, i) =>
                allocate(levelName(`skyVisibility${i}`, level), layout.width, layout.height, Constants.TEXTURETYPE_HALF_FLOAT)));
            this.baseField = levels[0][0].texture;
            const dummy = allocate("skyVisibilityBoundary", 1, 1, Constants.TEXTURETYPE_HALF_FLOAT);
            const diagnosticSize = this.diagnostic ? SKY_VISIBILITY_VOLUME.resolution : 1;
            const output = allocate("skyVisibilityDiagnostic", diagnosticSize, diagnosticSize, Constants.TEXTURETYPE_FLOAT);
            this.output = output.texture;
            const grid = this.probeGrid;
            const irradiance = options.materialIrradiance
                ? allocate("skyVisibilityIrradiance", grid * 2, grid * grid * this.volumeCount, Constants.TEXTURETYPE_HALF_FLOAT) : null;
            const nearest = options.materialIrradiance
                ? allocate("skyVisibilityNearestSurface", grid, grid * grid * this.volumeCount, Constants.TEXTURETYPE_FLOAT) : null;
            this.irradianceField = irradiance?.texture ?? null;
            this.nearestSurfaceField = nearest?.texture ?? null;
            const addTask = (name: string, shader: string, inputName: string, outputName: string,
                input: typeof dummy, destination: typeof dummy, shape: number[], interval: number[], scaleInterval = true, level = 0) => {
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
                    const volume = this.volumes[level], scale = scaleInterval ? volume.size / 9 : 1;
                    params.updateFloat4("volumeMin", ...volume.min, 0);
                    params.updateFloat4("volumeSize", volume.size, volume.size, volume.size, 0);
                    params.updateFloat4("shape", shape[0], shape[1], shape[2], this.source.bvh.triangleCount);
                    params.updateFloat4("interval", interval[0] * scale, interval[1] * scale, interval[2], 0);
                    params.updateFloat4("reconstruction", this.reconstruction.nearDistance * volume.size / this.volumes[0].size,
                        this.reconstruction.rejectOccludedProbes ? 1 : 0, this.reconstruction.sampleAtRayEnd ? 1 : 0, 0);
                };
            };
            for (let level = 0; level < this.volumeCount; level++) {
                const fields = levels[level];
                for (let i = layouts.length - 1; i >= 0; i--) {
                    const layout = layouts[i], parent = fields[i + 1];
                    addTask(levelName(`skyVisibilityCascade${i}`, level), SKY_VISIBILITY_CASCADE_WGSL, "parentField", "outputField", parent ?? dummy, fields[i],
                        [layout.grid, layout.directionsX, layout.directionsY], [layout.start, layout.end, parent ? 1 : 0], true, level);
                }
                if (irradiance && nearest) {
                    const integrate = new FrameGraphComputeShaderTask(levelName("skyVisibilityIrradiance", level), this.graph,
                        { computeSource: SKY_IRRADIANCE_INTEGRATE_WGSL }, { bindingsMapping: {
                            directionalField: { group: 0, binding: 0 }, irradiance: { group: 0, binding: 1 }, atlas: { group: 0, binding: 2 },
                        } });
                    const atlas = integrate.createUniformBuffer("atlas", { offset: 4 });
                    integrate.execute = () => atlas.updateFloat4("offset", level * grid * grid, 0, 0, 0);
                    this.tasks.push(integrate); this.graph.addTask(integrate);
                    integrate.dispatchSize = new Vector3(Math.ceil(grid / 4), Math.ceil(grid / 4), Math.ceil(grid / 4));
                    integrate.dependencies = new Set([fields[0].handle, irradiance.handle]);
                    integrate.onTexturesAllocatedObservable.add(() => {
                        integrate.setInternalTexture("directionalField", fields[0].internal);
                        integrate.setInternalTexture("irradiance", irradiance.internal);
                    });
                    const guard = new RadianceNearestSurfaceTask(levelName("skyVisibilityNearestSurface", level), this.graph,
                        this.source, grid, nearest, level * grid * grid);
                    this.nearestTasks.push(guard);
                    this.tasks.push(guard); this.graph.addTask(guard);
                }
            }
            if (this.diagnostic) addTask("skyVisibilityDiagnostic", SKY_VISIBILITY_DIAGNOSTIC_WGSL, "baseField", "output", levels[0][0], output,
                [this.probeGrid, 8, 4], [SKY_VISIBILITY_VOLUME.planeY, diagnosticSize, diagnosticSize], false);
            // StandardMaterial can participate in geometry MRT passes; give it a display texture
            // instead of using a color-only ShaderMaterial that would invalidate those passes.
            const display = allocate("skyVisibilityDisplay", diagnosticSize, diagnosticSize, Constants.TEXTURETYPE_UNSIGNED_BYTE);
            this.display = display.texture;
            if (!this.diagnostic) return;
            const task = new FrameGraphComputeShaderTask("skyVisibilityDisplay", this.graph, { computeSource: DISPLAY_WGSL }, { bindingsMapping: {
                mode: { group: 0, binding: 0 }, diagnosticValues: { group: 0, binding: 1 }, display: { group: 0, binding: 2 },
            } });
            this.tasks.push(task); this.graph.addTask(task);
            const params = task.createUniformBuffer("mode", { mode: 4 });
            task.dispatchSize = new Vector3(Math.ceil(diagnosticSize / 8), Math.ceil(diagnosticSize / 8), 1);
            task.dependencies = new Set([output.handle, display.handle]);
            task.onTexturesAllocatedObservable.add(() => {
                task.setInternalTexture("diagnosticValues", output.internal); task.setInternalTexture("display", display.internal);
            });
            task.execute = () => params.updateFloat4("mode", this.displayMode, 0, 0, 0);
        } catch (error) { this.dispose(); throw error; }
    }

    /** Volume changes invalidate content at the owner; texture dimensions and graph stay fixed. */
    public setVolume(volume: SkyVisibilityBounds): void { this.setVolumes([volume]); }

    public setVolumes(volumes: readonly SkyVisibilityBounds[]): void {
        if (volumes.length !== this.volumeCount) throw new Error("Sky spatial atlas size cannot change after allocation");
        this.volumes = volumes;
    }

    public execute(mode: number, updateField: boolean, reconstruction: SkyVisibilityReconstruction = DEFAULT_SKY_RECONSTRUCTION): number {
        this.displayMode = mode;
        this.reconstruction = reconstruction;
        if (!this.diagnostic && !updateField) return 0;
        const fieldTasks = this.diagnostic ? this.tasks.length - 1 : this.tasks.length;
        for (let i = 0; i < fieldTasks; i++) this.tasks[i].disabled = !updateField;
        if (updateField) this.nearestTasks.forEach((task, level) => task.prepareVolume(this.volumes[level]));
        this.graph.execute();
        if (updateField) for (const task of this.nearestTasks) task.markSubmitted();
        return updateField ? this.tasks.length - this.nearestTasks.filter(task => task.disabled).length : 1;
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

import "@babylonjs/core/Engines/WebGPU/Extensions/engine.computeShader";
import { Constants } from "@babylonjs/core/Engines/constants";
import { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import type { Material } from "@babylonjs/core/Materials/material";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { LuminousRadianceSceneSource } from "./luminous-radiance-scene";
import { createRadianceCascadeLayouts } from "./radiance-cascade-lab-model";
import { RadianceNearestSurfaceTask } from "./radiance-nearest-surface-task";
import { RC_DIFFUSE_GI_CASCADE_WGSL } from "./rc-diffuse-gi-shaders";
import { RC_DIFFUSE_GI_GRID, RC_DIFFUSE_GI_IRRADIANCE_WGSL } from "./rc-diffuse-gi-irradiance";
import { createRcDiffuseGiIntervals } from "./rc-diffuse-gi-intervals";
import { readRcDiffuseGiReflectance } from "./rc-diffuse-gi-source";
import type { RcDiffuseGiLight } from "./rc-diffuse-gi-light";

type Volume = { min: readonly [number, number, number]; size: number };

/** One-bounce directional-light source, independent of emission and sky visibility. */
export class RcDiffuseGiField {
    public readonly graph: FrameGraph;
    public readonly source: LuminousRadianceSceneSource;
    public readonly baseField: RawTexture;
    public readonly irradianceField: RawTexture;
    public readonly nearestSurfaceField: RawTexture;
    public readonly volumeCount: number;
    private readonly tasks: FrameGraphComputeShaderTask[] = [];
    private readonly textures: RawTexture[] = [];
    private volumes: readonly Volume[];
    private intervals: Array<ReturnType<typeof createRcDiffuseGiIntervals>>;
    private light: RcDiffuseGiLight = { directionToLight: [0, 1, 0], color: [0, 0, 0] };
    private readonly nearestTasks: RadianceNearestSurfaceTask[] = [];
    private disposed = false;

    constructor(scene: Scene, options: { volume?: Volume; volumes?: readonly Volume[]; acceptsMaterial?: (material: Material) => boolean }) {
        this.volumes = [...(options.volumes ?? (options.volume ? [options.volume] : []))];
        this.volumeCount = this.volumes.length;
        if (!this.volumeCount) throw new Error("RC GI requires at least one volume");
        this.intervals = this.volumes.map(volume => createRcDiffuseGiIntervals(volume.size));
        this.graph = new FrameGraph(scene); this.graph.name = "rcDiffuseGi";
        this.source = new LuminousRadianceSceneSource(scene, () => null,
            material => !material.needAlphaTesting() && !material.needAlphaBlending(),
            (mesh, material) => options.acceptsMaterial && !options.acceptsMaterial(material)
                ? null : readRcDiffuseGiReflectance(mesh, material));
        const allocate = (name: string, width: number, height: number, type: number) => {
            const texture = new RawTexture(null, width, height, Constants.TEXTUREFORMAT_RGBA, scene,
                false, false, Texture.NEAREST_SAMPLINGMODE, type, Constants.TEXTURE_CREATIONFLAG_STORAGE);
            this.textures.push(texture); texture.name = name;
            const internal = texture.getInternalTexture();
            if (!internal) throw new Error("RC GI storage texture allocation failed");
            return { texture, internal, handle: this.graph.textureManager.importTexture(name, internal) };
        };
        try {
            const layouts = createRadianceCascadeLayouts();
            const grid = RC_DIFFUSE_GI_GRID, atlasHeight = grid * grid * this.volumeCount;
            const irradiance = allocate("rcDiffuseGiIrradiance", grid * 6, atlasHeight, Constants.TEXTURETYPE_HALF_FLOAT);
            this.irradianceField = irradiance.texture;
            const nearest = allocate("rcDiffuseGiNearestSurface", grid, atlasHeight, Constants.TEXTURETYPE_FLOAT);
            this.nearestSurfaceField = nearest.texture;
            const boundary = allocate("rcDiffuseGiBoundary", 1, 1, Constants.TEXTURETYPE_HALF_FLOAT);
            const levelName = (level: number) => this.volumeCount === 1 ? "rcDiffuseGi" : `rcDiffuseGiLevel${level}`;
            const fieldsByLevel = this.volumes.map((_volume, level) => layouts.map((layout, i) =>
                allocate(`${levelName(level)}Cascade${i}`, layout.width, layout.height, Constants.TEXTURETYPE_HALF_FLOAT)));
            this.baseField = fieldsByLevel[0][0].texture;
            for (let level = 0; level < this.volumeCount; level++) {
                const prefix = levelName(level);
                const fields = fieldsByLevel[level];
                for (let i = layouts.length - 1; i >= 0; i--) {
                    const layout = layouts[i], destination = fields[i], parent = fields[i + 1] ?? boundary;
                    const task = new FrameGraphComputeShaderTask(`${prefix}Cascade${i}`, this.graph,
                        { computeSource: RC_DIFFUSE_GI_CASCADE_WGSL }, { bindingsMapping: {
                            params: { group: 0, binding: 0 }, triangles: { group: 0, binding: 1 }, nodes: { group: 0, binding: 2 },
                            parentField: { group: 0, binding: 3 }, outputField: { group: 0, binding: 4 }, albedoPixels: { group: 0, binding: 5 },
                        } });
                    this.tasks.push(task); this.graph.addTask(task);
                    const params = task.createUniformBuffer("params", {
                        volumeMin: 4, volumeSize: 4, shape: 4, interval: 4, lightDirection: 4, lightColor: 4,
                    });
                    task.dispatchSize = new Vector3(Math.ceil(layout.width / 8), Math.ceil(layout.height / 8), 1);
                    task.dependencies = new Set([parent.handle, destination.handle]);
                    const bind = () => {
                        task.setStorageBuffer("triangles", this.source.triangleBuffer);
                        task.setStorageBuffer("nodes", this.source.nodeBuffer);
                        task.setStorageBuffer("albedoPixels", this.source.emissionBuffer);
                        task.setInternalTexture("parentField", parent.internal);
                        task.setInternalTexture("outputField", destination.internal);
                    };
                    task.onTexturesAllocatedObservable.add(bind);
                    task.execute = () => {
                        bind();
                        const volume = this.volumes[level], interval = this.intervals[level][i];
                        params.updateFloat4("volumeMin", ...volume.min, 0);
                        params.updateFloat4("volumeSize", volume.size, volume.size, volume.size, 0);
                        params.updateFloat4("shape", layout.grid, layout.directionsX, layout.directionsY, this.source.bvh.triangleCount);
                        params.updateFloat4("interval", interval.start, interval.end, i < layouts.length - 1 ? 1 : 0, 0);
                        params.updateFloat4("lightDirection", ...this.light.directionToLight, 0);
                        params.updateFloat4("lightColor", ...this.light.color, 0);
                    };
                }
                const integrate = new FrameGraphComputeShaderTask(`${prefix}Irradiance`, this.graph,
                    { computeSource: RC_DIFFUSE_GI_IRRADIANCE_WGSL }, { bindingsMapping: {
                        directionalField: { group: 0, binding: 0 }, irradiance: { group: 0, binding: 1 },
                        atlasOffset: { group: 0, binding: 2 },
                    } });
                this.tasks.push(integrate); this.graph.addTask(integrate);
                const atlasOffset = integrate.createUniformBuffer("atlasOffset", { offset: 4 });
                integrate.execute = () => atlasOffset.updateFloat4("offset", 0, level * grid * grid, 0, 0);
                integrate.dispatchSize = new Vector3(Math.ceil(grid / 4), Math.ceil(grid / 4), Math.ceil(grid / 4));
                integrate.dependencies = new Set([fields[0].handle, irradiance.handle]);
                integrate.onTexturesAllocatedObservable.add(() => {
                    integrate.setInternalTexture("directionalField", fields[0].internal); integrate.setInternalTexture("irradiance", irradiance.internal);
                });
                const guard = new RadianceNearestSurfaceTask(`${prefix}NearestSurface`, this.graph, this.source, grid, nearest, level * grid * grid);
                this.nearestTasks.push(guard);
                this.tasks.push(guard); this.graph.addTask(guard);
            }
        } catch (error) { this.dispose(); throw error; }
    }

    public setVolume(volume: Volume): void {
        this.setVolumes([volume]);
    }

    public setVolumes(volumes: readonly Volume[]): void {
        if (volumes.length !== this.volumeCount) throw new Error("RC GI volume count requires a new field allocation");
        this.volumes = [...volumes];
        this.intervals = volumes.map(volume => createRcDiffuseGiIntervals(volume.size));
    }

    public execute(light: RcDiffuseGiLight, updateField = true): number {
        if (!updateField || this.disposed) return 0;
        this.nearestTasks.forEach((task, level) => task.prepareVolume(this.volumes[level]));
        this.light = light; this.graph.execute();
        for (const task of this.nearestTasks) task.markSubmitted();
        return this.tasks.length - this.nearestTasks.filter(task => task.disabled).length;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const task of this.tasks) task.dispose();
        this.graph.dispose();
        for (const texture of this.textures) texture.dispose();
        this.source.dispose();
    }
}

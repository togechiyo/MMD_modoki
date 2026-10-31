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
import { SKY_NEAREST_SURFACE_WGSL } from "./radiance-sky-nearest-surface-shaders";
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
    private readonly tasks: FrameGraphComputeShaderTask[] = [];
    private readonly textures: RawTexture[] = [];
    private volume: Volume;
    private intervals: ReturnType<typeof createRcDiffuseGiIntervals>;
    private light: RcDiffuseGiLight = { directionToLight: [0, 1, 0], color: [0, 0, 0] };
    private nearestTask: FrameGraphComputeShaderTask;
    private nearestGeometryRevision = -1;
    private nearestVolumeKey = "";
    private disposed = false;

    constructor(scene: Scene, options: { volume: Volume; acceptsMaterial?: (material: Material) => boolean }) {
        this.volume = options.volume;
        this.intervals = createRcDiffuseGiIntervals(options.volume.size);
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
            const fields = layouts.map((layout, i) => allocate(`rcDiffuseGi${i}`, layout.width, layout.height, Constants.TEXTURETYPE_HALF_FLOAT));
            this.baseField = fields[0].texture;
            const boundary = allocate("rcDiffuseGiBoundary", 1, 1, Constants.TEXTURETYPE_HALF_FLOAT);
            for (let i = layouts.length - 1; i >= 0; i--) {
                const layout = layouts[i], destination = fields[i], parent = fields[i + 1] ?? boundary;
                const task = new FrameGraphComputeShaderTask(`rcDiffuseGiCascade${i}`, this.graph,
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
                    const volume = this.volume, interval = this.intervals[i];
                    params.updateFloat4("volumeMin", ...volume.min, 0);
                    params.updateFloat4("volumeSize", volume.size, volume.size, volume.size, 0);
                    params.updateFloat4("shape", layout.grid, layout.directionsX, layout.directionsY, this.source.bvh.triangleCount);
                    params.updateFloat4("interval", interval.start, interval.end, i < layouts.length - 1 ? 1 : 0, 0);
                    params.updateFloat4("lightDirection", ...this.light.directionToLight, 0);
                    params.updateFloat4("lightColor", ...this.light.color, 0);
                };
            }
            const grid = RC_DIFFUSE_GI_GRID;
            const irradiance = allocate("rcDiffuseGiIrradiance", grid * 6, grid * grid, Constants.TEXTURETYPE_HALF_FLOAT);
            this.irradianceField = irradiance.texture;
            const integrate = new FrameGraphComputeShaderTask("rcDiffuseGiIrradiance", this.graph,
                { computeSource: RC_DIFFUSE_GI_IRRADIANCE_WGSL }, { bindingsMapping: {
                    directionalField: { group: 0, binding: 0 }, irradiance: { group: 0, binding: 1 },
                } });
            this.tasks.push(integrate); this.graph.addTask(integrate);
            integrate.dispatchSize = new Vector3(Math.ceil(grid / 4), Math.ceil(grid / 4), Math.ceil(grid / 4));
            integrate.dependencies = new Set([fields[0].handle, irradiance.handle]);
            integrate.onTexturesAllocatedObservable.add(() => {
                integrate.setInternalTexture("directionalField", fields[0].internal); integrate.setInternalTexture("irradiance", irradiance.internal);
            });
            const nearest = allocate("rcDiffuseGiNearestSurface", grid, grid * grid, Constants.TEXTURETYPE_FLOAT);
            this.nearestSurfaceField = nearest.texture;
            const guard = new FrameGraphComputeShaderTask("rcDiffuseGiNearestSurface", this.graph,
                { computeSource: SKY_NEAREST_SURFACE_WGSL }, { bindingsMapping: {
                    params: { group: 0, binding: 0 }, triangles: { group: 0, binding: 1 },
                    nodes: { group: 0, binding: 2 }, nearestSurface: { group: 0, binding: 3 },
                } });
            this.nearestTask = guard;
            this.tasks.push(guard); this.graph.addTask(guard);
            const params = guard.createUniformBuffer("params", { volumeMin: 4, volumeSize: 4, shape: 4 });
            guard.dispatchSize = new Vector3(Math.ceil(grid / 4), Math.ceil(grid / 4), Math.ceil(grid / 4));
            guard.dependencies = new Set([nearest.handle]);
            const bind = () => {
                guard.setStorageBuffer("triangles", this.source.triangleBuffer); guard.setStorageBuffer("nodes", this.source.nodeBuffer);
                guard.setInternalTexture("nearestSurface", nearest.internal);
            };
            guard.onTexturesAllocatedObservable.add(bind);
            guard.execute = () => {
                bind();
                const volume = this.volume;
                params.updateFloat4("volumeMin", ...volume.min, 0);
                params.updateFloat4("volumeSize", volume.size, volume.size, volume.size, 0);
                params.updateFloat4("shape", grid, 0, 0, this.source.bvh.triangleCount);
            };
        } catch (error) { this.dispose(); throw error; }
    }

    public setVolume(volume: Volume): void {
        this.volume = volume;
        this.intervals = createRcDiffuseGiIntervals(volume.size);
    }

    public execute(light: RcDiffuseGiLight, updateField = true): number {
        if (!updateField || this.disposed) return 0;
        const volumeKey = `${this.volume.min.join(",")}:${this.volume.size}`;
        const updateNearest = this.nearestGeometryRevision !== this.source.geometryRevision || this.nearestVolumeKey !== volumeKey;
        // The disabled compute pass is a no-op. Its imported RawTexture remains owned
        // by this field, so light/albedo edits can reuse the same triangle candidates.
        this.nearestTask.disabled = !updateNearest;
        this.light = light; this.graph.execute();
        if (updateNearest) {
            this.nearestGeometryRevision = this.source.geometryRevision;
            this.nearestVolumeKey = volumeKey;
        }
        return this.tasks.length - (updateNearest ? 0 : 1);
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

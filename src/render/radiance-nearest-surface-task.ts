import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { FrameGraph } from "@babylonjs/core/FrameGraph/frameGraph";
import type { FrameGraphTextureHandle } from "@babylonjs/core/FrameGraph/frameGraphTypes";
import { FrameGraphComputeShaderTask } from "@babylonjs/core/FrameGraph/Tasks/Misc/computeShaderTask";
import type { InternalTexture } from "@babylonjs/core/Materials/Textures/internalTexture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { LuminousRadianceSceneSource } from "./luminous-radiance-scene";
import { SKY_NEAREST_FOUR_SURFACES_WGSL, SKY_NEAREST_SURFACE_WGSL } from "./radiance-sky-nearest-surface-shaders";

type Volume = { min: readonly [number, number, number]; size: number };
type AtlasState = { volumeKey: string; layout: number; geometry: number; updates: number };

export function nearestSurfaceUpdate(previous: AtlasState | null, next: AtlasState, low: number[], high: number[]): "reuse" | "partial" | "full" {
    if (!previous || previous.volumeKey !== next.volumeKey || previous.layout !== next.layout) return "full";
    if (previous.geometry === next.geometry) return "reuse";
    // The bounds contain the old and new positions, but only for the latest source update.
    if (next.updates !== previous.updates + 1 || !low.every((v, i) => Number.isFinite(v) && Number.isFinite(high[i]) && v <= high[i])) return "full";
    return "partial";
}

/** An unchanged probe keeps its triangle IDs in this field's persistent storage texture. */
export class RadianceNearestSurfaceTask extends FrameGraphComputeShaderTask {
    private completed: AtlasState | null = null;
    private pending: AtlasState | null = null;
    private readonly params: UniformBuffer;
    private readonly candidates: StorageBuffer;

    constructor(name: string, graph: FrameGraph, private readonly source: LuminousRadianceSceneSource,
        private readonly grid: number, output: { handle: FrameGraphTextureHandle; internal: InternalTexture },
        private readonly atlasOffsetY = 0, candidateCount: 2 | 4 = 2) {
        super(name, graph, { computeSource: candidateCount === 4 ? SKY_NEAREST_FOUR_SURFACES_WGSL : SKY_NEAREST_SURFACE_WGSL }, { bindingsMapping: {
            params: { group: 0, binding: 0 }, triangles: { group: 0, binding: 1 },
            nodes: { group: 0, binding: 2 }, nearestSurface: { group: 0, binding: 3 }, candidates: { group: 0, binding: 4 },
        } });
        this.dependencies = new Set([output.handle]);
        const groups = Math.ceil(grid / 4);
        this.dispatchSize = new Vector3(groups, groups, groups);
        this.params = this.createUniformBuffer("params", { volumeMin: 4, volumeSize: 4, shape: 4, dirtyMin: 4, dirtyMax: 4 });
        this.candidates = new StorageBuffer(graph.engine as WebGPUEngine, grid * grid * grid * candidateCount * Uint32Array.BYTES_PER_ELEMENT);
        const bind = () => {
            this.setStorageBuffer("triangles", source.triangleBuffer);
            this.setStorageBuffer("nodes", source.nodeBuffer);
            this.setInternalTexture("nearestSurface", output.internal);
            this.setStorageBuffer("candidates", this.candidates);
        };
        this.onTexturesAllocatedObservable.add(() => { this.completed = null; bind(); });
        this.execute = bind;
    }

    public prepareVolume(volume: Volume): void {
        const source = this.source, bvh = source.bvh;
        const next = { volumeKey: `${volume.min.join(",")}:${volume.size}`, layout: bvh.layoutRevision,
            geometry: source.geometryRevision, updates: source.updates };
        const low = bvh.changedMin, high = bvh.changedMax;
        const mode = nearestSurfaceUpdate(this.completed, next, low, high);
        this.disabled = mode === "reuse";
        this.pending = next;
        if (this.disabled) return;

        this.completed = null; // A failed graph submission must retry with a full atlas.
        this.params.updateFloat4("volumeMin", ...volume.min, 0);
        this.params.updateFloat4("volumeSize", volume.size, volume.size, volume.size, 0);
        this.params.updateFloat4("shape", this.grid, this.atlasOffsetY, 0, bvh.triangleCount);
        this.params.updateFloat4("dirtyMin", low[0], low[1], low[2], mode === "partial" ? 1 : 0);
        this.params.updateFloat4("dirtyMax", high[0], high[1], high[2], 0);
    }

    public markSubmitted(): void {
        this.completed = this.pending;
        this.pending = null;
    }

    public override dispose(): void {
        this.candidates.dispose();
        super.dispose();
    }
}

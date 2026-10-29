import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { LuminousRadianceSettings } from "./luminous-radiance-settings";
import { radianceTriangleBudget, RADIANCE_TRIANGLE_STRIDE } from "./triangle-radiance-bvh";
import { MeshRadianceBvh } from "./mesh-radiance-bvh";
import { LuminousRadianceTextures } from "./luminous-radiance-textures";
import { RadianceInputSnapshot } from "./luminous-radiance-input-cache";
import { LuminousRadiancePoseCache } from "./luminous-radiance-pose-cache";
import { logWarn } from "../app-logger";
import { isRadianceDiagnosticMesh } from "./radiance-diagnostic-mesh";

export type RadianceEmissionReader = (mesh: Mesh, material: Material) => { r: number; g: number; b: number; texture?: Texture | null } | null;
type MeshInput = { key: Mesh; snapshot: RadianceInputSnapshot; emissionSnapshot: RadianceInputSnapshot;
    geometryVersion: object; triangles: Float32Array; emitters: number; low: number[]; high: number[] };

// Range-independent scene input. One owner may serve several RC volumes in the same graph.
export class LuminousRadianceSceneSource {
    public readonly bvh = new MeshRadianceBvh();
    public triangleBuffer: StorageBuffer;
    public nodeBuffer: StorageBuffer;
    public emissionBuffer: StorageBuffer;
    public updates = 0;
    public revision = 0;
    public emitterTriangles = 0;
    public error: string | null = null;
    private readonly meshInputs = new WeakMap<Mesh, MeshInput>();
    private readonly poses = new LuminousRadiancePoseCache();
    private chunks: MeshInput[] = [];
    private triangleCapacity = RADIANCE_TRIANGLE_STRIDE * 4;
    private nodeCapacity = 48;
    private emissionCapacity = 16;
    private textureRevision = -1;
    private readonly textures = new LuminousRadianceTextures();
    private readonly triangleBudget: number;
    private emitterLow = [Infinity, Infinity, Infinity];
    private emitterHigh = [-Infinity, -Infinity, -Infinity];

    constructor(private readonly scene: Scene, private readonly readEmission: RadianceEmissionReader) {
        const engine = scene.getEngine() as WebGPUEngine;
        this.triangleBudget = radianceTriangleBudget(engine.currentLimits.maxStorageBufferBindingSize, engine.currentLimits.maxBufferSize);
        this.triangleBuffer = new StorageBuffer(engine, this.triangleCapacity);
        this.nodeBuffer = new StorageBuffer(engine, this.nodeCapacity);
        this.emissionBuffer = new StorageBuffer(engine, this.emissionCapacity);
    }

    public get ready(): boolean { return this.textures.ready; }
    public get emissionTextureRevision(): number { return this.textureRevision; }

    public getVolume(range: number): { min: number[]; size: number } {
        const size = this.emitterTriangles ? Math.max(...this.emitterHigh.map((value, axis) => value - this.emitterLow[axis])) + range * 2 : range * 2;
        return { size, min: this.emitterLow.map((value, axis) => this.emitterTriangles ? (value + this.emitterHigh[axis] - size) / 2 : -range) };
    }

    public update(): void {
        const chunks: MeshInput[] = [];
        const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
        let emitters = 0;
        try {
            // Count eligible surfaces before skinning or packing. A rejected scene must not allocate
            // oversized geometry again each frame, or warm emission textures it cannot use.
            const meshes = this.scene.meshes.flatMap(mesh => {
                if (!(mesh instanceof Mesh) || isRadianceDiagnosticMesh(mesh) || !mesh.isVisible || !mesh.isEnabled() || mesh.visibility <= 0
                    || mesh.getClassName() === "LinesMesh" || !mesh.material || mesh.material.getClassName() === "BackgroundMaterial") return [];
                const indices = mesh.getIndices();
                if (!indices?.length) return [];
                const surfaces = mesh.subMeshes.flatMap(subMesh => {
                    const material = subMesh.getMaterial();
                    return material && material.alpha >= 0.99
                        ? [{ indexStart: subMesh.indexStart, indexCount: subMesh.indexCount, material }] : [];
                });
                return [{ mesh, indices, surfaces }];
            });
            const triangleCount = meshes.reduce((total, entry) => total + entry.surfaces.reduce((count, surface) => count + surface.indexCount / 3, 0), 0);
            if (triangleCount > this.triangleBudget) {
                throw new Error(`3D RC triangle budget exceeded (${triangleCount} opaque triangles; limit ${this.triangleBudget})`);
            }
            for (const { mesh, indices, surfaces: opaqueSurfaces } of meshes) {
                const pose = this.poses.read(mesh), positions = pose.positions;
                if (!positions) continue;
                const world = mesh.computeWorldMatrix();
                const surfaces = opaqueSurfaces.map(({ indexStart, indexCount, material }) => {
                    const emission = this.readEmission(mesh, material), texture = emission?.texture;
                    const uvs = texture ? mesh.getVerticesData(texture.coordinatesIndex === 1 ? VertexBuffer.UV2Kind : VertexBuffer.UVKind) : null;
                    return { indexStart, indexCount, emission, uvs,
                        textureSource: texture ? this.textures.source(texture) : -1, matrix: texture?.getTextureMatrix().m,
                        wrap: texture ? texture.wrapU + texture.wrapV * 4 : 0 };
                });
                const metadata = surfaces.flatMap(surface => [surface.indexStart, surface.indexCount,
                    surface.emission ? 1 : 0,
                    surface.textureSource, surface.wrap, ...(surface.matrix ?? [])]);
                const emissionValues = surfaces.flatMap(surface => [surface.emission?.r ?? 0, surface.emission?.g ?? 0, surface.emission?.b ?? 0]);
                if (!emissionValues.every(Number.isFinite)) throw new Error("3D RC emission contains invalid colors");
                const parts: ArrayLike<number>[] = [pose.signature, indices, world.m, metadata, ...surfaces.map(surface => surface.uvs ?? [])];
                const previous = this.meshInputs.get(mesh);
                if (previous?.snapshot.matches(parts)) {
                    if (previous.emissionSnapshot.matches([emissionValues])) { chunks.push(previous); continue; }
                    // The geometry signature includes source selection, texture state/matrix and UV values.
                    // Copy only RGB into the unchanged source-order records; no vertex transform/BLAS refit.
                    const values = previous.triangles.slice();
                    let offset = 12;
                    for (const [index, surface] of surfaces.entries()) {
                        const end = offset + surface.indexCount / 3 * RADIANCE_TRIANGLE_STRIDE;
                        const r = emissionValues[index * 3] * 8, g = emissionValues[index * 3 + 1] * 8, b = emissionValues[index * 3 + 2] * 8;
                        for (; offset < end; offset += RADIANCE_TRIANGLE_STRIDE) {
                            values[offset] = r; values[offset + 1] = g; values[offset + 2] = b;
                        }
                    }
                    const chunk = { ...previous, emissionSnapshot: new RadianceInputSnapshot([emissionValues]), triangles: values };
                    this.meshInputs.set(mesh, chunk); chunks.push(chunk); continue;
                }
                const values = new Float32Array(surfaces.reduce((count, surface) => count + surface.indexCount / 3, 0) * RADIANCE_TRIANGLE_STRIDE);
                const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
                let emitters = 0, writeOffset = 0;
                const transformed = new Float32Array(positions.length);
                const point = Vector3.Zero();
                for (let vertex = 0; vertex < positions.length; vertex += 3) {
                    Vector3.TransformCoordinatesFromFloatsToRef(positions[vertex], positions[vertex + 1], positions[vertex + 2], world, point);
                    transformed.set([point.x, point.y, point.z], vertex);
                }
                for (const surface of surfaces) {
                    const { emission, uvs, textureSource, wrap, matrix: textureMatrix } = surface;
                    for (let index = surface.indexStart; index < surface.indexStart + surface.indexCount; index += 3) {
                        for (let corner = 0; corner < 3; corner++) {
                            const vertex = indices[index + corner], offset = vertex * 3;
                            for (let axis = 0; axis < 3; axis++) {
                                const value = transformed[offset + axis];
                                if (!Number.isFinite(value)) throw new Error("3D RC geometry contains invalid vertices");
                                values[writeOffset++] = value;
                                if (emission) { low[axis] = Math.min(low[axis], value); high[axis] = Math.max(high[axis], value); }
                            }
                            values[writeOffset++] = 0;
                        }
                        values.set([(emission?.r ?? 0) * 8, (emission?.g ?? 0) * 8, (emission?.b ?? 0) * 8, 0], writeOffset); writeOffset += 4;
                        if (textureMatrix) {
                            for (let corner = 0; corner < 3; corner++) {
                                const vertex = indices[index + corner];
                                const u = uvs?.[vertex * 2] ?? 0, v = uvs?.[vertex * 2 + 1] ?? 0;
                                // Babylon multiplies vec4(uv, 1, 0); missing UV attributes default to zero.
                                const tu = u * textureMatrix[0] + v * textureMatrix[4] + textureMatrix[8];
                                const tv = u * textureMatrix[1] + v * textureMatrix[5] + textureMatrix[9];
                                if (!Number.isFinite(tu) || !Number.isFinite(tv)) throw new Error("3D RC geometry contains invalid UVs");
                                values[writeOffset++] = tu; values[writeOffset++] = tv;
                            }
                        } else writeOffset += 6;
                        values[writeOffset++] = textureSource; values[writeOffset++] = wrap;
                        if (emission) emitters++;
                    }
                }
                const chunk = { key: mesh, snapshot: new RadianceInputSnapshot(parts), emissionSnapshot: new RadianceInputSnapshot([emissionValues]),
                    geometryVersion: {}, triangles: values, emitters, low, high };
                this.meshInputs.set(mesh, chunk); chunks.push(chunk);
            }
            for (const chunk of chunks) {
                emitters += chunk.emitters;
                for (let axis = 0; axis < 3; axis++) { low[axis] = Math.min(low[axis], chunk.low[axis]); high[axis] = Math.max(high[axis], chunk.high[axis]); }
            }
            this.error = null;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (this.error !== message) logWarn("render", "luminous radiance geometry rejected; illumination cleared", { message });
            this.error = message;
            chunks.length = 0; emitters = 0;
        }
        this.emitterTriangles = emitters;
        this.emitterLow = low; this.emitterHigh = high;
        if (this.textureRevision !== this.textures.revision) {
            if (this.textures.pixels.byteLength > this.emissionCapacity) {
                this.emissionBuffer.dispose(); this.emissionCapacity = this.textures.pixels.byteLength;
                this.emissionBuffer = new StorageBuffer(this.scene.getEngine() as WebGPUEngine, this.emissionCapacity);
            }
            this.emissionBuffer.update(this.textures.pixels); this.textureRevision = this.textures.revision; this.revision++;
        }
        if (chunks.length === this.chunks.length && chunks.every((chunk, index) => chunk === this.chunks[index]) && this.updates) return;
        this.chunks = chunks;
        const changes = this.bvh.update(chunks);
        if (this.bvh.triangles.byteLength > this.triangleCapacity) {
            this.triangleBuffer.dispose(); this.triangleCapacity = this.bvh.triangles.byteLength;
            this.triangleBuffer = new StorageBuffer(this.scene.getEngine() as WebGPUEngine, this.triangleCapacity);
        }
        if (this.bvh.nodes.byteLength > this.nodeCapacity) {
            this.nodeBuffer.dispose(); this.nodeCapacity = this.bvh.nodes.byteLength;
            this.nodeBuffer = new StorageBuffer(this.scene.getEngine() as WebGPUEngine, this.nodeCapacity);
        }
        for (const range of changes.triangles) this.triangleBuffer.update(range.data, range.byteOffset);
        for (const range of changes.nodes) this.nodeBuffer.update(range.data, range.byteOffset);
        this.updates++; this.revision++;
    }

    public dispose(): void { this.triangleBuffer.dispose(); this.nodeBuffer.dispose(); this.emissionBuffer.dispose(); this.textures.dispose(); }
}

export interface LuminousRadianceSceneLease {
    readonly source: LuminousRadianceSceneSource;
    update(): void;
    release(): void;
}

// Consumer-local volume and lifetime. Getters follow shared GPU buffer reallocations.
export class LuminousRadianceScene {
    public volumeMin = [-12, -12, -12];
    public volumeSize = 24;
    private readonly source: LuminousRadianceSceneSource;
    private disposed = false;

    constructor(scene: Scene, readEmission: RadianceEmissionReader, private readonly lease?: LuminousRadianceSceneLease) {
        this.source = lease?.source ?? new LuminousRadianceSceneSource(scene, readEmission);
    }

    public get bvh(): MeshRadianceBvh { return this.source.bvh; }
    public get triangleBuffer(): StorageBuffer { return this.source.triangleBuffer; }
    public get nodeBuffer(): StorageBuffer { return this.source.nodeBuffer; }
    public get emissionBuffer(): StorageBuffer { return this.source.emissionBuffer; }
    public get updates(): number { return this.source.updates; }
    public get revision(): number { return this.source.revision; }
    public get emitterTriangles(): number { return this.source.emitterTriangles; }
    public get error(): string | null { return this.source.error; }
    public get ready(): boolean { return this.source.ready; }
    public get emissionTextureRevision(): number { return this.source.emissionTextureRevision; }

    public update(settings: LuminousRadianceSettings): void {
        if (this.disposed) return;
        if (this.lease) this.lease.update(); else this.source.update();
        const volume = this.source.getVolume(settings.range);
        this.volumeMin = volume.min; this.volumeSize = volume.size;
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        if (this.lease) this.lease.release(); else this.source.dispose();
    }
}

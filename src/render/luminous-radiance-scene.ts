import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { FloatArray } from "@babylonjs/core/types";
import type { LuminousRadianceSettings } from "./luminous-radiance-settings";
import { radianceTriangleBudget, RADIANCE_TRIANGLE_STRIDE, createRadianceIndexedPositions,
    type RadianceIndexedPositions } from "./triangle-radiance-bvh";
import { MeshRadianceBvh } from "./mesh-radiance-bvh";
import { LuminousRadianceTextures } from "./luminous-radiance-textures";
import { RadianceInputSnapshot } from "./luminous-radiance-input-cache";
import { acquireRadianceGeometry, type RadianceGeometryLease } from "./radiance-geometry-cache";
import { logWarn } from "../app-logger";
import { isRadianceDiagnosticMesh } from "./radiance-diagnostic-mesh";

export type RadianceEmissionReader = (mesh: Mesh, material: Material) => { r: number; g: number; b: number; texture?: Texture | null } | null;
type Bounds = { low: number[]; high: number[] };
type MeshInput = { key: Mesh; poseSnapshot: RadianceInputSnapshot; surfaceSnapshot: RadianceInputSnapshot;
    emissionSnapshot: RadianceInputSnapshot; geometryVersion: object; attributesVersion: object;
    triangles: Float32Array; vertexIndices: Uint32Array; indexedPositions?: RadianceIndexedPositions;
    emitters: number; emitterRanges: Array<[number, number]>; emitterBounds?: Bounds };

function emptyBounds(): Bounds { return { low: [Infinity, Infinity, Infinity], high: [-Infinity, -Infinity, -Infinity] }; }

function measureEmitterBounds(chunk: MeshInput): Bounds {
    const bounds = emptyBounds();
    for (const [start, end] of chunk.emitterRanges) {
        for (let tri = start; tri < end; tri += RADIANCE_TRIANGLE_STRIDE) {
            for (let axis = 0; axis < 3; axis++) {
                const offset = tri + axis;
                const indexed = chunk.indexedPositions, vertex = tri / RADIANCE_TRIANGLE_STRIDE * 3;
                const a = indexed ? indexed.positions[indexed.indices[vertex] * 3 + axis] : chunk.triangles[offset];
                const b = indexed ? indexed.positions[indexed.indices[vertex + 1] * 3 + axis] : chunk.triangles[offset + 4];
                const c = indexed ? indexed.positions[indexed.indices[vertex + 2] * 3 + axis] : chunk.triangles[offset + 8];
                bounds.low[axis] = Math.min(bounds.low[axis], a, b, c);
                bounds.high[axis] = Math.max(bounds.high[axis], a, b, c);
            }
        }
    }
    return bounds;
}

// Range-independent scene input. One owner may serve several RC volumes in the same graph.
export class LuminousRadianceSceneSource {
    public readonly bvh = new MeshRadianceBvh();
    public triangleBuffer: StorageBuffer;
    public nodeBuffer: StorageBuffer;
    public emissionBuffer: StorageBuffer;
    public updates = 0;
    public revision = 0;
    /** Packed geometry/triangle IDs only; source RGB and texture pixels do not invalidate nearest surfaces. */
    public geometryRevision = 0;
    public emitterTriangles = 0;
    public error: string | null = null;
    private readonly meshInputs = new WeakMap<Mesh, MeshInput>();
    private readonly geometry: RadianceGeometryLease;
    private chunks: MeshInput[] = [];
    private triangleCapacity = RADIANCE_TRIANGLE_STRIDE * 4;
    private nodeCapacity = 48;
    private emissionCapacity = 16;
    private textureRevision = -1;
    private readonly textures = new LuminousRadianceTextures();
    private readonly triangleBudget: number;
    private emitterBounds?: Bounds;

    constructor(private readonly scene: Scene, private readonly readEmission: RadianceEmissionReader,
        private readonly acceptsOccluder: (material: Material) => boolean = () => true,
        private readonly readReflectance?: RadianceEmissionReader,
        private readonly acceptsMesh?: (mesh: Mesh) => boolean) {
        const engine = scene.getEngine() as WebGPUEngine;
        this.triangleBudget = radianceTriangleBudget(engine.currentLimits.maxStorageBufferBindingSize, engine.currentLimits.maxBufferSize);
        this.triangleBuffer = new StorageBuffer(engine, this.triangleCapacity);
        this.nodeBuffer = new StorageBuffer(engine, this.nodeCapacity);
        this.emissionBuffer = new StorageBuffer(engine, this.emissionCapacity);
        this.geometry = acquireRadianceGeometry(scene);
    }

    public get ready(): boolean { return this.textures.ready; }
    public get emissionTextureRevision(): number { return this.textureRevision; }

    public getVolume(range: number): { min: number[]; size: number } {
        if (!this.emitterTriangles) return { size: range * 2, min: [-range, -range, -range] };
        // Only Luminous requests an emitter-centered volume. GI and sky already own their bounds.
        if (!this.emitterBounds) {
            const bounds = emptyBounds();
            for (const chunk of this.chunks) {
                if (!chunk.emitters) continue;
                const part = chunk.emitterBounds ??= measureEmitterBounds(chunk);
                for (let axis = 0; axis < 3; axis++) {
                    bounds.low[axis] = Math.min(bounds.low[axis], part.low[axis]);
                    bounds.high[axis] = Math.max(bounds.high[axis], part.high[axis]);
                }
            }
            this.emitterBounds = bounds;
        }
        const { low, high } = this.emitterBounds;
        const size = Math.max(...high.map((value, axis) => value - low[axis])) + range * 2;
        return { size, min: low.map((value, axis) => (value + high[axis] - size) / 2) };
    }

    public update(): void {
        // GI owns a separate source: the same packed color/UV slots carry reflectance,
        // without the historical Luminous gain. Existing consumers keep their encoding.
        const readColor = this.readReflectance ?? this.readEmission;
        const colorScale = this.readReflectance ? 1 : 8;
        const chunks: MeshInput[] = [];
        try {
            // Count eligible surfaces before skinning or packing. A rejected scene must not allocate
            // oversized geometry again each frame, or warm emission textures it cannot use.
            const meshes = this.scene.meshes.flatMap(mesh => {
                if (!(mesh instanceof Mesh) || this.acceptsMesh?.(mesh) === false
                    || isRadianceDiagnosticMesh(mesh) || !mesh.isVisible || !mesh.isEnabled() || mesh.visibility <= 0
                    || mesh.getClassName() === "LinesMesh" || !mesh.material || mesh.material.getClassName() === "BackgroundMaterial") return [];
                const indices = mesh.getIndices();
                if (!indices?.length) return [];
                const surfaces = mesh.subMeshes.flatMap(subMesh => {
                    if (subMesh.indexCount === 0) return [];
                    const material = subMesh.getMaterial();
                    return material && material.alpha >= 0.99 && this.acceptsOccluder(material)
                        ? [{ indexStart: subMesh.indexStart, indexCount: subMesh.indexCount, material }] : [];
                });
                // Re-evaluate eligibility every update, but never deform or snapshot a mesh
                // whose surfaces contribute no geometry to this consumer's BVH.
                return surfaces.length ? [{ mesh, indices, surfaces }] : [];
            });
            const triangleCount = meshes.reduce((total, entry) => total + entry.surfaces.reduce((count, surface) => count + surface.indexCount / 3, 0), 0);
            if (triangleCount > this.triangleBudget) {
                throw new Error(`3D RC triangle budget exceeded (${triangleCount} opaque triangles; limit ${this.triangleBudget})`);
            }
            for (const { mesh, indices, surfaces: opaqueSurfaces } of meshes) {
                const pose = this.geometry.readPose(mesh), positions = pose.positions;
                if (!positions) continue;
                const world = mesh.computeWorldMatrix();
                // Multiple PMX materials on this mesh can sample the same complete UV stream.
                const uvChannels: Array<FloatArray | null | undefined> = [];
                const surfaces = opaqueSurfaces.map(({ indexStart, indexCount, material }) => {
                    const emission = readColor(mesh, material), texture = emission?.texture;
                    const uvChannel = texture ? (texture.coordinatesIndex === 1 ? 1 : 0) : -1;
                    if (uvChannel >= 0 && uvChannels[uvChannel] === undefined) {
                        uvChannels[uvChannel] = mesh.getVerticesData(uvChannel === 1 ? VertexBuffer.UV2Kind : VertexBuffer.UVKind);
                    }
                    return { indexStart, indexCount, emission, uvChannel, uvs: uvChannels[uvChannel],
                        textureSource: texture ? this.textures.source(texture) : -1, matrix: texture?.getTextureMatrix().m,
                        wrap: texture ? texture.wrapU + texture.wrapV * 4 : 0 };
                });
                const metadata = surfaces.flatMap(surface => [surface.indexStart, surface.indexCount,
                    surface.emission ? 1 : 0,
                    surface.textureSource, surface.wrap, surface.uvChannel, ...(surface.matrix ?? [])]);
                const emissionValues = surfaces.flatMap(surface => [surface.emission?.r ?? 0, surface.emission?.g ?? 0, surface.emission?.b ?? 0]);
                if (!emissionValues.every(Number.isFinite)) throw new Error("3D RC emission contains invalid colors");
                const poseParts = [pose.signature, world.m];
                const surfaceParts = [indices, metadata, uvChannels[0] ?? [], uvChannels[1] ?? []];
                const previous = this.meshInputs.get(mesh);
                const sameSurfaces = previous?.surfaceSnapshot.matches(surfaceParts);
                const sameAttributes = sameSurfaces && previous?.emissionSnapshot.matches([emissionValues]);
                if (previous && sameSurfaces && previous.poseSnapshot.matches(poseParts)) {
                    if (sameAttributes) { chunks.push(previous); continue; }
                    // Copy only RGB into the unchanged source-order records; no vertex transform/BLAS refit.
                    const values = previous.triangles.slice();
                    let offset = 12;
                    for (const [index, surface] of surfaces.entries()) {
                        const end = offset + surface.indexCount / 3 * RADIANCE_TRIANGLE_STRIDE;
                        const r = emissionValues[index * 3] * colorScale, g = emissionValues[index * 3 + 1] * colorScale, b = emissionValues[index * 3 + 2] * colorScale;
                        for (; offset < end; offset += RADIANCE_TRIANGLE_STRIDE) {
                            values[offset] = r; values[offset + 1] = g; values[offset + 2] = b;
                        }
                    }
                    const chunk = { ...previous, emissionSnapshot: new RadianceInputSnapshot([emissionValues]),
                        attributesVersion: {}, triangles: values };
                    this.meshInputs.set(mesh, chunk); chunks.push(chunk); continue;
                }
                // Keep immutable attributes and topology through a dance. A validated position
                // override goes straight into sorted BVH records instead of copying/packing 24 floats per face.
                const poseOnly = sameAttributes ? previous : undefined;
                const transformed = this.geometry.readWorldPositions(mesh, pose, world);
                if (!transformed) continue;
                if (poseOnly) {
                    const chunk: MeshInput = { ...poseOnly, poseSnapshot: new RadianceInputSnapshot(poseParts),
                        geometryVersion: {}, indexedPositions: createRadianceIndexedPositions(transformed, poseOnly.vertexIndices),
                        emitterBounds: undefined };
                    this.meshInputs.set(mesh, chunk); chunks.push(chunk); continue;
                }
                const vertexIndices = new Uint32Array(surfaces.reduce((count, surface) => count + surface.indexCount, 0));
                const values = new Float32Array(vertexIndices.length / 3 * RADIANCE_TRIANGLE_STRIDE);
                const emitterRanges: Array<[number, number]> = [];
                let emitters = 0, writeOffset = 0, vertexOffset = 0;
                for (const surface of surfaces) {
                    const surfaceStart = writeOffset;
                    const { emission, uvs, textureSource, wrap, matrix: textureMatrix } = surface;
                    const r = (emission?.r ?? 0) * colorScale, g = (emission?.g ?? 0) * colorScale, b = (emission?.b ?? 0) * colorScale;
                    for (let index = surface.indexStart; index < surface.indexStart + surface.indexCount; index += 3) {
                        for (let corner = 0; corner < 3; corner++) {
                            const vertex = indices[index + corner], offset = vertex * 3;
                            const x = transformed[offset], y = transformed[offset + 1], z = transformed[offset + 2];
                            if (!Number.isInteger(vertex) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) throw new Error("3D RC geometry contains invalid vertices");
                            vertexIndices[vertexOffset++] = vertex;
                            values[writeOffset] = x; values[writeOffset + 1] = y; values[writeOffset + 2] = z;
                            writeOffset += 4; // Padding is zero in both the new and copied records.
                        }
                        values[writeOffset++] = r; values[writeOffset++] = g; values[writeOffset++] = b; values[writeOffset++] = 0;
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
                    }
                    if (emission) {
                        emitterRanges.push([surfaceStart, writeOffset]);
                        emitters += (writeOffset - surfaceStart) / RADIANCE_TRIANGLE_STRIDE;
                    }
                }
                const chunk = { key: mesh, poseSnapshot: new RadianceInputSnapshot(poseParts),
                    surfaceSnapshot: sameSurfaces && previous ? previous.surfaceSnapshot : new RadianceInputSnapshot(surfaceParts),
                    emissionSnapshot: new RadianceInputSnapshot([emissionValues]),
                    geometryVersion: {}, attributesVersion: {}, triangles: values, vertexIndices, emitters, emitterRanges };
                this.meshInputs.set(mesh, chunk); chunks.push(chunk);
            }
            this.error = null;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (this.error !== message) logWarn("render", "luminous radiance geometry rejected; illumination cleared", { message });
            this.error = message;
            chunks.length = 0;
        }
        if (this.textureRevision !== this.textures.revision) {
            if (this.textures.pixels.byteLength > this.emissionCapacity) {
                this.emissionBuffer.dispose(); this.emissionCapacity = this.textures.pixels.byteLength;
                this.emissionBuffer = new StorageBuffer(this.scene.getEngine() as WebGPUEngine, this.emissionCapacity);
            }
            this.emissionBuffer.update(this.textures.pixels); this.textureRevision = this.textures.revision; this.revision++;
        }
        if (chunks.length === this.chunks.length && chunks.every((chunk, index) => chunk === this.chunks[index]) && this.updates) return;
        this.chunks = chunks;
        this.emitterTriangles = chunks.reduce((count, chunk) => count + chunk.emitters, 0);
        this.emitterBounds = undefined;
        const changes = this.bvh.update(chunks);
        if (changes.nodes.length > 0) this.geometryRevision++;
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

    public dispose(): void { this.triangleBuffer.dispose(); this.nodeBuffer.dispose(); this.emissionBuffer.dispose(); this.textures.dispose(); this.geometry.release(); }
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

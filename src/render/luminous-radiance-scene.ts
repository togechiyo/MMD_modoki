import { StorageBuffer } from "@babylonjs/core/Buffers/storageBuffer";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { LuminousRadianceSettings } from "./luminous-radiance-settings";
import { MAX_RADIANCE_TRIANGLES, RADIANCE_TRIANGLE_STRIDE, TriangleRadianceBvh } from "./triangle-radiance-bvh";
import { LuminousRadianceTextures } from "./luminous-radiance-textures";
import { logWarn } from "../app-logger";

export type RadianceEmissionReader = (mesh: Mesh, material: Material) => { r: number; g: number; b: number; texture?: Texture | null } | null;

export class LuminousRadianceScene {
    public readonly bvh = new TriangleRadianceBvh();
    public triangleBuffer: StorageBuffer;
    public nodeBuffer: StorageBuffer;
    public emissionBuffer: StorageBuffer;
    public volumeMin = [-12, -12, -12];
    public volumeSize = 24;
    public updates = 0;
    public emitterTriangles = 0;
    public error: string | null = null;
    private input = new Float32Array(0);
    private triangleCapacity = RADIANCE_TRIANGLE_STRIDE * 4;
    private nodeCapacity = 48;
    private emissionCapacity = 16;
    private textureRevision = -1;
    private readonly textures = new LuminousRadianceTextures();

    constructor(private readonly scene: Scene, private readonly readEmission: RadianceEmissionReader) {
        this.triangleBuffer = new StorageBuffer(scene.getEngine() as WebGPUEngine, this.triangleCapacity);
        this.nodeBuffer = new StorageBuffer(scene.getEngine() as WebGPUEngine, this.nodeCapacity);
        this.emissionBuffer = new StorageBuffer(scene.getEngine() as WebGPUEngine, this.emissionCapacity);
    }

    public get ready(): boolean { return this.textures.ready; }

    public update(settings: LuminousRadianceSettings): void {
        const values: number[] = [];
        const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
        let emitters = 0;
        try {
            for (const mesh of this.scene.meshes) {
                if (!(mesh instanceof Mesh) || !mesh.isVisible || !mesh.isEnabled() || mesh.visibility <= 0
                    || mesh.getClassName() === "LinesMesh" || !mesh.material || mesh.material.getClassName() === "BackgroundMaterial") continue;
                const indices = mesh.getIndices();
                if (!indices?.length) continue;
                // Babylon's public API applies current skeleton and morph weights before the world transform.
                const positions = mesh.getPositionData(true, true);
                if (!positions) continue;
                const world = mesh.computeWorldMatrix(true);
                const transformed = new Float32Array(positions.length);
                const point = Vector3.Zero();
                for (let vertex = 0; vertex < positions.length; vertex += 3) {
                    Vector3.TransformCoordinatesFromFloatsToRef(positions[vertex], positions[vertex + 1], positions[vertex + 2], world, point);
                    transformed.set([point.x, point.y, point.z], vertex);
                }
                for (const subMesh of mesh.subMeshes) {
                    const material = subMesh.getMaterial();
                    if (!material || material.alpha < 0.99) continue;
                    const emission = this.readEmission(mesh, material);
                    const texture = emission?.texture;
                    const uvs = texture ? mesh.getVerticesData(texture.coordinatesIndex === 1 ? VertexBuffer.UV2Kind : VertexBuffer.UVKind) : null;
                    const textureSource = texture ? this.textures.source(texture) : -1;
                    const textureMatrix = texture?.getTextureMatrix().m;
                    const wrap = texture ? texture.wrapU + texture.wrapV * 4 : 0;
                    if (emission && ![emission.r, emission.g, emission.b].every(Number.isFinite)) throw new Error("3D RC emission contains invalid colors");
                    for (let index = subMesh.indexStart; index < subMesh.indexStart + subMesh.indexCount; index += 3) {
                        if (values.length / RADIANCE_TRIANGLE_STRIDE >= MAX_RADIANCE_TRIANGLES) throw new Error(`3D RC supports at most ${MAX_RADIANCE_TRIANGLES} opaque triangles`);
                        for (let corner = 0; corner < 3; corner++) {
                            const vertex = indices[index + corner], offset = vertex * 3;
                            for (let axis = 0; axis < 3; axis++) {
                                const value = transformed[offset + axis];
                                if (!Number.isFinite(value)) throw new Error("3D RC geometry contains invalid vertices");
                                values.push(value);
                                if (emission) { low[axis] = Math.min(low[axis], value); high[axis] = Math.max(high[axis], value); }
                            }
                            values.push(0);
                        }
                        values.push((emission?.r ?? 0) * 8, (emission?.g ?? 0) * 8, (emission?.b ?? 0) * 8, 0);
                        if (textureMatrix) {
                            for (let corner = 0; corner < 3; corner++) {
                                const vertex = indices[index + corner];
                                const u = uvs?.[vertex * 2] ?? 0, v = uvs?.[vertex * 2 + 1] ?? 0;
                                // Babylon multiplies vec4(uv, 1, 0); missing UV attributes default to zero.
                                const tu = u * textureMatrix[0] + v * textureMatrix[4] + textureMatrix[8];
                                const tv = u * textureMatrix[1] + v * textureMatrix[5] + textureMatrix[9];
                                if (!Number.isFinite(tu) || !Number.isFinite(tv)) throw new Error("3D RC geometry contains invalid UVs");
                                values.push(tu, tv);
                            }
                        } else values.push(0, 0, 0, 0, 0, 0);
                        values.push(textureSource, wrap);
                        if (emission) emitters++;
                    }
                }
            }
            this.error = null;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (this.error !== message) logWarn("render", "luminous radiance geometry rejected; illumination cleared", { message });
            this.error = message;
            values.length = 0; emitters = 0;
        }
        this.emitterTriangles = emitters;
        this.volumeSize = emitters ? Math.max(...high.map((value, axis) => value - low[axis])) + settings.range * 2 : settings.range * 2;
        this.volumeMin = low.map((value, axis) => emitters ? (value + high[axis] - this.volumeSize) / 2 : -settings.range);
        if (this.textureRevision !== this.textures.revision) {
            if (this.textures.pixels.byteLength > this.emissionCapacity) {
                this.emissionBuffer.dispose(); this.emissionCapacity = this.textures.pixels.byteLength;
                this.emissionBuffer = new StorageBuffer(this.scene.getEngine() as WebGPUEngine, this.emissionCapacity);
            }
            this.emissionBuffer.update(this.textures.pixels); this.textureRevision = this.textures.revision;
        }
        const next = new Float32Array(values);
        if (next.length === this.input.length && next.every((value, index) => value === this.input[index]) && this.updates) return;
        this.input = next;
        this.bvh.update(next);
        if (this.bvh.triangles.byteLength > this.triangleCapacity) {
            this.triangleBuffer.dispose(); this.triangleCapacity = this.bvh.triangles.byteLength;
            this.triangleBuffer = new StorageBuffer(this.scene.getEngine() as WebGPUEngine, this.triangleCapacity);
        }
        if (this.bvh.nodes.byteLength > this.nodeCapacity) {
            this.nodeBuffer.dispose(); this.nodeCapacity = this.bvh.nodes.byteLength;
            this.nodeBuffer = new StorageBuffer(this.scene.getEngine() as WebGPUEngine, this.nodeCapacity);
        }
        this.triangleBuffer.update(this.bvh.triangles); this.nodeBuffer.update(this.bvh.nodes); this.updates++;
    }

    public dispose(): void { this.triangleBuffer.dispose(); this.nodeBuffer.dispose(); this.emissionBuffer.dispose(); this.textures.dispose(); }
}

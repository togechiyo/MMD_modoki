import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { STLFileLoader } from "@babylonjs/loaders/STL/stlFileLoader.js";
import { parsePlyData } from "../shared/ply-mesh";

export type StaticAccessoryKind = "ply" | "stl";

const pointCloudMeshes = new WeakSet<AbstractMesh>();
export function isStaticPointCloudMesh(mesh: AbstractMesh): boolean {
    return pointCloudMeshes.has(mesh);
}

function stlInput(data: ArrayBuffer): ArrayBuffer | string {
    if (data.byteLength > 256 * 1024 * 1024) throw new Error("STL file exceeds 256 MiB");
    if (data.byteLength >= 84) {
        const faces = new DataView(data).getUint32(80, true);
        if (faces > 0 && faces <= 5_000_000 && 84 + faces * 50 === data.byteLength) return data;
    }
    const text = new TextDecoder().decode(data);
    if (!/^solid\s/.test(text)) throw new Error("Invalid or truncated binary STL file");
    return text;
}

/** Parse local bytes only; failures dispose every mesh created by this import. */
export function loadStaticAccessoryMeshes(scene: Scene, kind: StaticAccessoryKind, data: ArrayBuffer): Mesh[] {
    const existingMeshes = new Set(scene.meshes);
    const meshes: Mesh[] = [];
    try {
        if (kind === "ply") {
            const parsed = parsePlyData(data);
            const pointCloud = parsed.kind === "point-cloud";
            const mesh = new Mesh(pointCloud ? "PLYPointCloud" : "PLYMesh", scene);
            const vertices = new VertexData();
            vertices.positions = parsed.positions;
            vertices.indices = pointCloud ? Array.from({ length: parsed.positions.length / 3 }, (_, i) => i) : parsed.indices;
            vertices.normals = pointCloud ? null : parsed.normals;
            vertices.colors = parsed.colors;
            vertices.applyToMesh(mesh);
            // Alpha is preserved in the vertex buffer but does not opt the whole
            // accessory into transparent rendering in this initial mesh path.
            mesh.hasVertexAlpha = false;
            if (pointCloud) {
                const material = new StandardMaterial("PLY point cloud", scene);
                material.pointsCloud = true;
                material.pointSize = 1;
                material.disableLighting = true;
                material.emissiveColor = parsed.colors ? Color3.White() : new Color3(0.25, 0.3, 0.35);
                mesh.material = material;
                mesh.receiveShadows = false;
                // Triangle ray picking would interpret adjacent point indices as surfaces.
                mesh.isPickable = false;
                pointCloudMeshes.add(mesh);
            }
            meshes.push(mesh);
        } else {
            const input = stlInput(data);
            const previous = STLFileLoader.DO_NOT_ALTER_FILE_COORDINATES;
            try {
                // The parser is synchronous; restore this global option before returning.
                STLFileLoader.DO_NOT_ALTER_FILE_COORDINATES = true;
                if (!new STLFileLoader().importMesh(null, scene, input, "", meshes)) throw new Error("Invalid STL mesh");
            } finally {
                STLFileLoader.DO_NOT_ALTER_FILE_COORDINATES = previous;
            }
        }
        if (!meshes.length) throw new Error(`No triangle mesh data found in ${kind.toUpperCase()} file`);
        for (const mesh of meshes) {
            const pointCloud = isStaticPointCloudMesh(mesh);
            const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
            const indices = mesh.getIndices();
            if (!positions?.length || positions.length % 3 || !indices?.length || (!pointCloud && indices.length % 3)
                || !Array.from(positions).every(Number.isFinite)
                || !Array.from(indices).every(i => Number.isInteger(i) && i >= 0 && i < positions.length / 3)) {
                throw new Error(`Invalid ${kind.toUpperCase()} triangle geometry`);
            }
            if (pointCloud) continue;
            const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
            if (!normals || normals.length !== positions.length || !Array.from(normals).every(Number.isFinite)
                || Array.from(normals).every(n => n === 0)) {
                const computed: number[] = [];
                VertexData.ComputeNormals(positions, indices, computed);
                mesh.setVerticesData(VertexBuffer.NormalKind, computed);
            }
        }
        return meshes;
    } catch (error) {
        for (const mesh of [...scene.meshes]) {
            if (!existingMeshes.has(mesh)) mesh.dispose(false, true);
        }
        throw error;
    }
}

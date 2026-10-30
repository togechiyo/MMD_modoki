import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { LuminousRadiancePoseCache } from "./luminous-radiance-pose-cache";
import { readRcDiffuseGiReflectance } from "./rc-diffuse-gi-source";
import type { RcDiffuseGiVolume } from "./rc-diffuse-gi-settings";

function receivesDiffuseBounce(mesh: Mesh, material: Material | null, acceptsMaterial: (material: Material) => boolean): material is Material {
    if (!material || !acceptsMaterial(material)) return false;
    const reflectance = readRcDiffuseGiReflectance(mesh, material);
    // A black surface still participates in scene occlusion, but cannot
    // receive a visible diffuse bounce and need not dilute the probe grid.
    return !reflectance || reflectance.r > 0 || reflectance.g > 0 || reflectance.b > 0;
}

/** Track changes to receiving surfaces without reading vertices or following every pose. */
export function getRcDiffuseGiVolumeMembership(meshes: readonly Mesh[], acceptsMaterial: (material: Material) => boolean): string {
    return meshes.map(mesh => {
        const surfaces = (mesh.subMeshes ?? []).flatMap(sub => {
            const material = sub.getMaterial();
            return receivesDiffuseBounce(mesh, material, acceptsMaterial)
                ? [`${material.uniqueId}:${sub.indexStart}:${sub.indexCount}`] : [];
        });
        return `${mesh.uniqueId}:${mesh.geometry?.uniqueId}[${surfaces.join(",")}]`;
    }).join(";");
}

/** Fit actual receiving vertices, not the loader's deliberately inflated culling bounds. */
export function fitRcDiffuseGiVolume(meshes: readonly Mesh[], acceptsMaterial: (material: Material) => boolean): RcDiffuseGiVolume | null {
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    const poses = new LuminousRadiancePoseCache();
    for (const mesh of meshes) {
        const indices = mesh.getIndices();
        if (!indices?.length) continue;
        const surfaces = (mesh.subMeshes ?? []).filter(sub => receivesDiffuseBounce(mesh, sub.getMaterial(), acceptsMaterial));
        if (!surfaces.length) continue;
        mesh.skeleton?.prepare(true);
        const positions = poses.read(mesh).positions;
        if (!positions) continue;
        const world = mesh.computeWorldMatrix(true).m;
        const visited = new Uint8Array(Math.floor(positions.length / 3));
        for (const surface of surfaces) {
            const end = Math.min(indices.length, surface.indexStart + surface.indexCount);
            for (let i = surface.indexStart; i < end; i++) {
                const vertex = indices[i];
                if (vertex < 0 || vertex >= visited.length || visited[vertex]) continue;
                visited[vertex] = 1;
                const offset = vertex * 3, x = positions[offset], y = positions[offset + 1], z = positions[offset + 2];
                const point = [x * world[0] + y * world[4] + z * world[8] + world[12],
                    x * world[1] + y * world[5] + z * world[9] + world[13],
                    x * world[2] + y * world[6] + z * world[10] + world[14]];
                if (!point.every(Number.isFinite)) continue;
                for (let axis = 0; axis < 3; axis++) {
                    low[axis] = Math.min(low[axis], point[axis]); high[axis] = Math.max(high[axis], point[axis]);
                }
            }
        }
    }
    if (!low.every(Number.isFinite)) return null;
    const size = Math.max(1, ...high.map((value, axis) => value - low[axis])) * 1.2;
    if (size > 100000) return null;
    return { min: low.map((value, axis) => (value + high[axis] - size) / 2) as [number, number, number], size };
}

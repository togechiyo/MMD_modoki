import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3, type Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { RadianceInputSnapshot } from "./luminous-radiance-input-cache";
import { LuminousRadiancePoseCache } from "./luminous-radiance-pose-cache";

type Pose = ReturnType<LuminousRadiancePoseCache["read"]>;
type WorldPositions = { positions: Float32Array; snapshot: RadianceInputSnapshot };

class RadianceGeometryCache {
    readonly poses = new LuminousRadiancePoseCache();
    // Neither cache retains mesh keys. Removing a mesh does not require a scene scan.
    private readonly worlds = new WeakMap<Mesh, WorldPositions>();

    readWorldPositions(mesh: Mesh, pose: Pose, world: Matrix): Float32Array | null {
        if (!pose.positions) { this.worlds.delete(mesh); return null; }
        const parts = [pose.signature, world.m];
        const previous = this.worlds.get(mesh);
        if (previous?.snapshot.matches(parts)) return previous.positions;
        const positions = new Float32Array(pose.positions.length), point = Vector3.Zero();
        for (let vertex = 0; vertex < pose.positions.length; vertex += 3) {
            Vector3.TransformCoordinatesFromFloatsToRef(pose.positions[vertex], pose.positions[vertex + 1],
                pose.positions[vertex + 2], world, point);
            positions[vertex] = point.x; positions[vertex + 1] = point.y; positions[vertex + 2] = point.z;
        }
        this.worlds.set(mesh, { positions, snapshot: new RadianceInputSnapshot(parts) });
        return positions;
    }
}

export type RadianceGeometryLease = {
    /** Always compares current numeric inputs; a frame number alone cannot certify an unchanged pose. */
    readPose(mesh: Mesh): Pose;
    /** Treat the shared result as immutable. Material packing and BVHs remain consumer-owned. */
    readWorldPositions(mesh: Mesh, pose: Pose, world: Matrix): Float32Array | null;
    release(): void;
};

type Entry = { cache: RadianceGeometryCache; consumers: number };
const scenes = new WeakMap<Scene, Entry>();

/** Share CPU deformation/transforms only, independent of RC field, material source and graph lifetime. */
export function acquireRadianceGeometry(scene: Scene): RadianceGeometryLease {
    let entry = scenes.get(scene);
    if (!entry) { entry = { cache: new RadianceGeometryCache(), consumers: 0 }; scenes.set(scene, entry); }
    entry.consumers++;
    let owned: Entry | null = entry;
    const active = (): RadianceGeometryCache => {
        if (!owned) throw new Error("Cannot read released RC geometry");
        return owned.cache;
    };
    return {
        readPose: mesh => active().poses.read(mesh),
        readWorldPositions: (mesh, pose, world) => active().readWorldPositions(mesh, pose, world),
        release: () => {
            if (!owned) return;
            if (--owned.consumers === 0) scenes.delete(scene);
            owned = null;
        },
    };
}
